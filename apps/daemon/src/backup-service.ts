import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { BackupRecordSchema, type BackupKind, type BackupRecord } from "@pcc/contracts";
import { backupDatabaseFile, inspectDatabaseFile } from "@pcc/database";
import { z } from "zod";

export const CURRENT_DATABASE_MIGRATION = "019_settings";
export const BACKUP_DATABASE_FILENAME = "database.sqlite";
export const BACKUP_SECRET_FILENAME = "secret.key";
export const BACKUP_MANIFEST_FILENAME = "manifest.json";
export const PENDING_RESTORE_FILENAME = "pending-restore.json";
export const LAST_RESTORE_FILENAME = "last-restore.json";

const BackupManifestSchema = BackupRecordSchema.extend({
  formatVersion: z.literal(1),
  secretSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});

export const PendingRestoreSchema = z.object({
  backupId: z.string(),
  scheduledAt: z.string().datetime(),
  recoveryBackupId: z.string(),
  databaseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  includesSecrets: z.boolean(),
});

export type BackupManifest = z.infer<typeof BackupManifestSchema>;
export type PendingRestore = z.infer<typeof PendingRestoreSchema>;

export class BackupServiceError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code = "BACKUP_ERROR") {
    super(message);
  }
}

function backupsRoot(databaseFilename: string) {
  return path.join(path.dirname(path.resolve(databaseFilename)), "backups");
}

function managedBackupDirectory(databaseFilename: string, backupId: string) {
  if (!/^backup-[a-zA-Z0-9._-]+$/.test(backupId)) throw new BackupServiceError("备份 ID 格式不正确", 400, "INVALID_BACKUP_ID");
  const root = backupsRoot(databaseFilename);
  const candidate = path.resolve(root, backupId);
  if (path.dirname(candidate) !== path.resolve(root)) throw new BackupServiceError("备份路径越界", 400, "INVALID_BACKUP_PATH");
  return candidate;
}

async function fileExists(filename: string) {
  try { await stat(filename); return true; } catch { return false; }
}

export async function sha256File(filename: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function writeJsonAtomically(filename: string, value: unknown) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filename);
}

export async function verifyBackupDirectory(directory: string): Promise<BackupManifest> {
  let manifest: BackupManifest;
  try {
    manifest = BackupManifestSchema.parse(JSON.parse(await readFile(path.join(directory, BACKUP_MANIFEST_FILENAME), "utf8")));
  } catch {
    throw new BackupServiceError("备份清单缺失或格式不正确", 400, "INVALID_BACKUP_MANIFEST");
  }
  const database = path.join(directory, BACKUP_DATABASE_FILENAME);
  if (!await fileExists(database)) throw new BackupServiceError("备份数据库文件缺失", 400, "BACKUP_DATABASE_MISSING");
  if (await sha256File(database) !== manifest.databaseSha256) throw new BackupServiceError("备份数据库校验和不匹配", 409, "BACKUP_CHECKSUM_MISMATCH");
  const inspection = inspectDatabaseFile(database);
  if (inspection.integrity !== "ok") throw new BackupServiceError("备份数据库完整性检查失败", 409, "BACKUP_INTEGRITY_FAILED");
  if (inspection.schemaVersion !== manifest.schemaVersion) throw new BackupServiceError("备份 Schema 与清单不一致", 409, "BACKUP_SCHEMA_MISMATCH");
  const secret = path.join(directory, BACKUP_SECRET_FILENAME);
  if (manifest.includesSecrets) {
    if (!manifest.secretSha256 || !await fileExists(secret) || await sha256File(secret) !== manifest.secretSha256) {
      throw new BackupServiceError("备份加密密钥校验失败", 409, "BACKUP_SECRET_MISMATCH");
    }
  }
  return manifest;
}

function makeBackupId(now = new Date()) {
  return `backup-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}-${randomUUID().slice(0, 8)}`;
}

export class BackupService {
  private readonly confirmations = new Map<string, { backupId: string; expiresAt: number }>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly databaseFilename: string) {}

  private ensureAvailable() {
    if (this.databaseFilename === ":memory:") throw new BackupServiceError("内存数据库运行模式不提供持久化备份", 409, "BACKUP_UNAVAILABLE");
  }

  private exclusive<T>(operation: () => Promise<T>) {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async list() {
    this.ensureAvailable();
    const root = backupsRoot(this.databaseFilename);
    await mkdir(root, { recursive: true });
    const entries = await readdir(root, { withFileTypes: true });
    const items: BackupRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("backup-")) continue;
      try {
        const parsed = BackupManifestSchema.parse(JSON.parse(await readFile(path.join(root, entry.name, BACKUP_MANIFEST_FILENAME), "utf8")));
        items.push(BackupRecordSchema.parse(parsed));
      } catch { /* Corrupt folders are ignored here and rejected if explicitly imported/restored. */ }
    }
    items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const pendingRestore = await this.readPendingRestore();
    let lastRestore: unknown = null;
    try { lastRestore = JSON.parse(await readFile(path.join(path.dirname(path.resolve(this.databaseFilename)), LAST_RESTORE_FILENAME), "utf8")); } catch { /* not restored yet */ }
    return { items, pendingRestore, lastRestore };
  }

  async create(label?: string, kind: BackupKind = "manual") {
    this.ensureAvailable();
    return this.exclusive(() => this.createUnlocked(label, kind));
  }

  private async createUnlocked(label?: string, kind: BackupKind = "manual") {
    const now = new Date();
    const id = makeBackupId(now);
    const root = backupsRoot(this.databaseFilename);
    const temporary = path.join(root, `.creating-${randomUUID()}`);
    const destination = managedBackupDirectory(this.databaseFilename, id);
    await mkdir(temporary, { recursive: true });
    try {
      const database = path.join(temporary, BACKUP_DATABASE_FILENAME);
      const inspection = await backupDatabaseFile(path.resolve(this.databaseFilename), database);
      if (inspection.integrity !== "ok") throw new BackupServiceError("在线备份完整性检查失败", 500, "BACKUP_INTEGRITY_FAILED");
      const sourceSecret = path.join(path.dirname(path.resolve(this.databaseFilename)), BACKUP_SECRET_FILENAME);
      const includesSecrets = await fileExists(sourceSecret);
      if (includesSecrets) await copyFile(sourceSecret, path.join(temporary, BACKUP_SECRET_FILENAME));
      const manifest: BackupManifest = {
        formatVersion: 1,
        id,
        label: label?.trim() || (kind === "pre_restore" ? "恢复前自动保护点" : "手动备份"),
        kind,
        createdAt: now.toISOString(),
        schemaVersion: inspection.schemaVersion,
        sizeBytes: inspection.bytes,
        databaseSha256: await sha256File(database),
        includesSecrets,
        secretSha256: includesSecrets ? await sha256File(path.join(temporary, BACKUP_SECRET_FILENAME)) : null,
        sourceAppVersion: "0.1.0",
      };
      await writeFile(path.join(temporary, BACKUP_MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      await mkdir(root, { recursive: true });
      await rename(temporary, destination);
      return BackupRecordSchema.parse(manifest);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  async import(directory: string) {
    this.ensureAvailable();
    if (!path.isAbsolute(directory)) throw new BackupServiceError("导入目录必须是绝对路径", 400, "INVALID_BACKUP_PATH");
    return this.exclusive(async () => {
      const source = path.resolve(directory);
      const original = await verifyBackupDirectory(source);
      if (original.schemaVersion > CURRENT_DATABASE_MIGRATION) throw new BackupServiceError("该备份来自更高版本的应用，请先升级 Agentic Project OS", 409, "BACKUP_VERSION_TOO_NEW");
      const now = new Date();
      const id = makeBackupId(now);
      const destination = managedBackupDirectory(this.databaseFilename, id);
      await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
      const imported: BackupManifest = { ...original, id, label: `导入 · ${original.label}`, kind: "imported", createdAt: now.toISOString() };
      await writeFile(path.join(destination, BACKUP_MANIFEST_FILENAME), `${JSON.stringify(imported, null, 2)}\n`, "utf8");
      return BackupRecordSchema.parse(imported);
    });
  }

  async export(backupId: string, directory: string) {
    this.ensureAvailable();
    if (!path.isAbsolute(directory)) throw new BackupServiceError("导出目录必须是绝对路径", 400, "INVALID_BACKUP_PATH");
    const source = managedBackupDirectory(this.databaseFilename, backupId);
    const manifest = await verifyBackupDirectory(source);
    const destination = path.join(path.resolve(directory), `PCC-${manifest.id}`);
    await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
    return { backup: BackupRecordSchema.parse(manifest), directory: destination };
  }

  async preflightRestore(backupId: string) {
    this.ensureAvailable();
    const manifest = await verifyBackupDirectory(managedBackupDirectory(this.databaseFilename, backupId));
    if (manifest.schemaVersion > CURRENT_DATABASE_MIGRATION) throw new BackupServiceError("该备份来自更高版本的应用，请先升级 Agentic Project OS", 409, "BACKUP_VERSION_TOO_NEW");
    const confirmationToken = randomUUID();
    this.confirmations.set(confirmationToken, { backupId, expiresAt: Date.now() + 10 * 60_000 });
    return {
      backup: BackupRecordSchema.parse(manifest),
      confirmationToken,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      restartRequired: true,
      warnings: [
        "当前数据库会先生成自动保护点，然后在下次启动时替换。",
        manifest.schemaVersion < CURRENT_DATABASE_MIGRATION ? `备份将从 ${manifest.schemaVersion} 自动迁移到 ${CURRENT_DATABASE_MIGRATION}。` : "备份 Schema 与当前版本一致。",
        manifest.includesSecrets ? "备份包含本机加密密钥，集成凭据会与数据一同恢复。" : "备份不含加密密钥。",
      ],
    };
  }

  async scheduleRestore(backupId: string, confirmationToken: string) {
    this.ensureAvailable();
    return this.exclusive(async () => {
      const confirmation = this.confirmations.get(confirmationToken);
      this.confirmations.delete(confirmationToken);
      if (!confirmation || confirmation.backupId !== backupId || confirmation.expiresAt < Date.now()) {
        throw new BackupServiceError("恢复确认已过期，请重新执行预检", 409, "RESTORE_CONFIRMATION_EXPIRED");
      }
      const manifest = await verifyBackupDirectory(managedBackupDirectory(this.databaseFilename, backupId));
      const recovery = await this.createUnlocked(`恢复 ${manifest.label} 前的自动保护点`, "pre_restore");
      const pending: PendingRestore = {
        backupId,
        scheduledAt: new Date().toISOString(),
        recoveryBackupId: recovery.id,
        databaseSha256: manifest.databaseSha256,
        includesSecrets: manifest.includesSecrets,
      };
      await writeJsonAtomically(path.join(path.dirname(path.resolve(this.databaseFilename)), PENDING_RESTORE_FILENAME), pending);
      return { scheduled: true, restartRequired: true, pendingRestore: pending, recoveryBackup: recovery };
    });
  }

  async delete(backupId: string) {
    this.ensureAvailable();
    const pending = await this.readPendingRestore();
    if (pending?.backupId === backupId || pending?.recoveryBackupId === backupId) throw new BackupServiceError("该备份属于待执行恢复流程，重启完成前不可删除", 409, "BACKUP_IN_USE");
    const directory = managedBackupDirectory(this.databaseFilename, backupId);
    await verifyBackupDirectory(directory);
    await rm(directory, { recursive: true, force: false });
  }

  private async readPendingRestore() {
    try {
      return PendingRestoreSchema.parse(JSON.parse(await readFile(path.join(path.dirname(path.resolve(this.databaseFilename)), PENDING_RESTORE_FILENAME), "utf8")));
    } catch { return null; }
  }
}
