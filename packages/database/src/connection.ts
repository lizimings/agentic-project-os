import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DatabaseSchema } from "./types.js";

export interface DatabaseOptions {
  filename: string;
}

export function createDatabase(options: DatabaseOptions) {
  if (options.filename !== ":memory:") {
    fs.mkdirSync(path.dirname(options.filename), { recursive: true });
  }
  const sqlite = new BetterSqlite3(options.filename);
  sqlite.pragma("foreign_keys = ON");
  if (options.filename !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
  }
  sqlite.pragma("busy_timeout = 5000");

  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
}
