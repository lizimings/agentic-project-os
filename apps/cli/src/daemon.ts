import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DaemonClient } from "@pcc/mcp";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

async function isDaemonHealthy(client: DaemonClient) {
  try {
    const health = await client.health();
    return health.status === "ok" && health.service === "projectd";
  } catch {
    return false;
  }
}

function findDaemonLaunch() {
  if (process.env.PCC_DAEMON_ENTRY) {
    if (!process.env.PCC_DAEMON_ENTRY.endsWith(".ts")) {
      return { command: process.execPath, args: [process.env.PCC_DAEMON_ENTRY] };
    }
    if (process.env.npm_execpath) {
      return { command: process.execPath, args: [process.env.npm_execpath, "--filter", "@pcc/daemon", "exec", "tsx", process.env.PCC_DAEMON_ENTRY] };
    }
  }

  const distCandidates = [
    path.resolve(currentDirectory, "../../daemon/dist/index.js"),
    path.resolve(currentDirectory, "../../../apps/daemon/dist/index.js"),
  ];
  const dist = distCandidates.find((candidate) => fs.existsSync(candidate));
  if (dist) return { command: process.execPath, args: [dist] };

  const sourceCandidates = [
    path.resolve(currentDirectory, "../../daemon/src/index.ts"),
    path.resolve(currentDirectory, "../../../apps/daemon/src/index.ts"),
  ];
  const source = sourceCandidates.find((candidate) => fs.existsSync(candidate));
  if (source && process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath, "--filter", "@pcc/daemon", "exec", "tsx", source] };
  }

  throw new Error("没有找到 projectd 入口；请先运行 pnpm build 或设置 PCC_DAEMON_ENTRY");
}

export async function ensureDaemon(client = new DaemonClient(), timeoutMs = 12_000) {
  if (await isDaemonHealthy(client)) return { started: false, client };

  const launch = findDaemonLaunch();
  const child = spawn(launch.command, launch.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    cwd: path.resolve(currentDirectory, "../../.."),
    env: { ...process.env },
  });
  child.unref();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (await isDaemonHealthy(client)) return { started: true, client };
  }
  throw new Error(`projectd 在 ${timeoutMs}ms 内没有就绪`);
}
