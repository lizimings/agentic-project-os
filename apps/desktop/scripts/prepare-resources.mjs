import { cp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDirectory = path.resolve(desktopDirectory, "../..");
const resourcesDirectory = path.join(desktopDirectory, "resources");

await rm(resourcesDirectory, { recursive: true, force: true });
await mkdir(resourcesDirectory, { recursive: true });
await cp(path.join(rootDirectory, "prototype", "dist", "client"), path.join(resourcesDirectory, "web"), { recursive: true });
await cp(path.join(rootDirectory, "apps", "daemon", "dist"), path.join(resourcesDirectory, "daemon"), { recursive: true });
await writeFile(path.join(resourcesDirectory, "daemon", "package.json"), JSON.stringify({ private: true, type: "commonjs" }, null, 2));

const daemonModules = path.join(resourcesDirectory, "daemon", "node_modules");
await mkdir(daemonModules, { recursive: true });
for (const dependency of ["better-sqlite3", "node-addon-api"]) {
  const source = await realpath(path.join(rootDirectory, "node_modules", dependency));
  await cp(source, path.join(daemonModules, dependency), { recursive: true });
}
