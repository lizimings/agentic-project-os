import fs from "node:fs";
import BetterSqlite3 from "better-sqlite3";

export interface DatabaseFileInspection {
  integrity: "ok" | "failed";
  schemaVersion: string;
  bytes: number;
}

export async function backupDatabaseFile(sourceFilename: string, destinationFilename: string) {
  const database = new BetterSqlite3(sourceFilename, { readonly: true, fileMustExist: true });
  try {
    await database.backup(destinationFilename);
  } finally {
    database.close();
  }
  return inspectDatabaseFile(destinationFilename);
}

export function inspectDatabaseFile(filename: string): DatabaseFileInspection {
  const database = new BetterSqlite3(filename, { readonly: true, fileMustExist: true });
  try {
    const integrityResult = database.pragma("integrity_check", { simple: true });
    let schemaVersion = "000_unversioned";
    const migrationTable = database.prepare("select name from sqlite_master where type = 'table' and name = 'kysely_migration'").get();
    if (migrationTable) {
      const row = database.prepare("select name from kysely_migration order by timestamp desc, name desc limit 1").get() as { name?: string } | undefined;
      if (row?.name) schemaVersion = row.name;
    }
    return {
      integrity: integrityResult === "ok" ? "ok" : "failed",
      schemaVersion,
      bytes: fs.statSync(filename).size,
    };
  } finally {
    database.close();
  }
}
