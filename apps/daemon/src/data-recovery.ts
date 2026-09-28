import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { backupDatabaseFile, inspectDatabaseFile } from "@pcc/database";
import {
  BACKUP_DATABASE_FILENAME,
  BACKUP_SECRET_FILENAME,
  LAST_RESTORE_FILENAME,
  PENDING_RESTORE_FILENAME,
  PendingRestoreSchema,
  sha256File,
  verifyBackupDirectory,
} from "./backup-service.js";

async function exists(filename: string) {
  try { await stat(filename); return true; } catch { return false; }
}

export async function applyPendingRestore(databaseFilename: string) {
  if (databaseFilename === ":memory:") return null;
  const database = path.resolve(databaseFilename);
  const dataDirectory = path.dirname(database);
  const markerFilename = path.join(dataDirectory, PENDING_RESTORE_FILENAME);
  if (!await exists(markerFilename)) return null;
  const pending = PendingRestoreSchema.parse(JSON.parse(await readFile(markerFilename, "utf8")));
  const backupDirectory = path.resolve(dataDirectory, "backups", pending.backupId);
  if (path.dirname(backupDirectory) !== path.resolve(dataDirectory, "backups")) throw new Error("待恢复备份路径越界");
  const manifest = await verifyBackupDirectory(backupDirectory);
  if (manifest.databaseSha256 !== pending.databaseSha256) throw new Error("待恢复备份与计划校验和不一致");

  const rollbackDirectory = path.join(dataDirectory, ".restore-rollback");
  const rollbackDatabase = path.join(rollbackDirectory, "database.sqlite");
  const rollbackSecret = path.join(rollbackDirectory, BACKUP_SECRET_FILENAME);
  const currentSecret = path.join(dataDirectory, BACKUP_SECRET_FILENAME);
  const temporaryDatabase = `${database}.restoring`;
  await rm(rollbackDirectory, { recursive: true, force: true });
  await mkdir(rollbackDirectory, { recursive: true });

  if (await exists(database)) await backupDatabaseFile(database, rollbackDatabase);
  if (await exists(currentSecret)) await copyFile(currentSecret, rollbackSecret);
  await copyFile(path.join(backupDirectory, BACKUP_DATABASE_FILENAME), temporaryDatabase);
  if (inspectDatabaseFile(temporaryDatabase).integrity !== "ok" || await sha256File(temporaryDatabase) !== manifest.databaseSha256) {
    await rm(temporaryDatabase, { force: true });
    throw new Error("待恢复数据库的最终校验失败");
  }

  try {
    await rm(`${database}-wal`, { force: true });
    await rm(`${database}-shm`, { force: true });
    await rm(database, { force: true });
    await rename(temporaryDatabase, database);
    await rm(currentSecret, { force: true });
    if (manifest.includesSecrets) await copyFile(path.join(backupDirectory, BACKUP_SECRET_FILENAME), currentSecret);
    const result = { status: "applied", backupId: pending.backupId, recoveryBackupId: pending.recoveryBackupId, restoredAt: new Date().toISOString(), schemaVersion: manifest.schemaVersion };
    await writeFile(path.join(dataDirectory, LAST_RESTORE_FILENAME), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await rm(markerFilename, { force: true });
    return result;
  } catch (error) {
    await rm(temporaryDatabase, { force: true });
    if (await exists(rollbackDatabase)) await copyFile(rollbackDatabase, database);
    await rm(currentSecret, { force: true });
    if (await exists(rollbackSecret)) await copyFile(rollbackSecret, currentSecret);
    throw error;
  }
}
