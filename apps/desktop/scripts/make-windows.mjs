import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import forge from "@electron-forge/core";

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryOut = path.join(os.tmpdir(), "pcc-forge-out");
const temporaryVendor = path.join(os.tmpdir(), "pcc-winstaller-vendor");
const destination = path.join(desktopDirectory, "out", "make");
const require = createRequire(import.meta.url);
const sourceVendor = path.join(path.dirname(require.resolve("electron-winstaller/package.json")), "vendor");

await rm(temporaryOut, { recursive: true, force: true });
await rm(temporaryVendor, { recursive: true, force: true });
await cp(sourceVendor, temporaryVendor, { recursive: true });
// electron-winstaller's postinstall selects the host 7-Zip binary in its pnpm
// store path. The hoisted package directory can still contain only the
// architecture-specific files, so make the selection explicit in our ASCII
// vendor staging directory before the legacy Squirrel tools start.
const hostArch = os.arch() === "arm64" ? "arm64" : "x64";
await copyFile(path.join(temporaryVendor, `7z-${hostArch}.exe`), path.join(temporaryVendor, "7z.exe"));
await copyFile(path.join(temporaryVendor, `7z-${hostArch}.dll`), path.join(temporaryVendor, "7z.dll"));
try {
  await forge.api.make({
    dir: desktopDirectory,
    outDir: temporaryOut,
    interactive: false,
    platform: "win32",
    arch: "x64",
  });
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(temporaryOut, "make"), destination, { recursive: true });
} finally {
  await rm(temporaryOut, { recursive: true, force: true });
  await rm(temporaryVendor, { recursive: true, force: true });
}
