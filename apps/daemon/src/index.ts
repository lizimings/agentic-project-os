import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildServer } from "./server.js";
import { applyPendingRestore } from "./data-recovery.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDirectory = path.resolve(currentDirectory, "../../../.data");
const dataDirectory = path.resolve(process.env.PCC_DATA_DIR || defaultDataDirectory);
const databaseFilename = process.env.PCC_DATABASE || path.join(dataDirectory, "project-command-center.sqlite");
const port = Number(process.env.PCC_PORT || 4317);
const host = process.env.PCC_HOST || "127.0.0.1";

await applyPendingRestore(databaseFilename);
const { app } = await buildServer({ databaseFilename, logger: true, host, port });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "projectd is shutting down");
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host, port });
