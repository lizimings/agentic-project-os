#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DaemonClient, searchProjectData, serveProjectMcpStdio } from "@pcc/mcp";
import { ensureDaemon } from "./daemon.js";

const [command = "help", ...args] = process.argv.slice(2);

async function main() {
  const client = new DaemonClient({ actorId: command === "mcp" ? "codex-mcp" : "projectctl" });

  if (command === "mcp") {
    await ensureDaemon(client);
    serveProjectMcpStdio(client);
    return;
  }

  if (command === "start") {
    const result = await ensureDaemon(client);
    console.log(result.started ? `projectd 已启动：${client.baseUrl}` : `projectd 已在运行：${client.baseUrl}`);
    return;
  }

  if (command === "status") {
    const health = await client.health();
    console.log(JSON.stringify(health, null, 2));
    return;
  }

  if (command === "inbox" && args[0] === "add") {
    const title = args.slice(1).join(" ").trim();
    if (!title) throw new Error("用法：projectctl inbox add <内容>");
    await ensureDaemon(client);
    const item = await client.captureInbox({ title, note: "来自 projectctl", source: "CLI", project: "未归类", kind: "想法" });
    console.log(`已保存到 Inbox：${item.id}`);
    return;
  }

  if (command === "projects") {
    await ensureDaemon(client);
    console.log(JSON.stringify(await client.listProjects(), null, 2));
    return;
  }

  if (command === "project" && args[0] === "snapshot") {
    const projectId = args[1]?.trim();
    if (!projectId) throw new Error("用法：projectctl project snapshot <project-id>");
    await ensureDaemon(client);
    console.log(JSON.stringify(await client.getProjectSnapshot(projectId), null, 2));
    return;
  }

  if (command === "search") {
    const projectFlag = args.indexOf("--project");
    const projectId = projectFlag >= 0 ? args[projectFlag + 1] : undefined;
    const words = args.filter((_value, index) => index !== projectFlag && index !== projectFlag + 1);
    const query = words.join(" ").trim();
    if (!query) throw new Error("用法：projectctl search <关键词> [--project <project-id>]");
    await ensureDaemon(client);
    console.log(JSON.stringify(await searchProjectData(client, query, projectId, 50), null, 2));
    return;
  }

  if (command === "idea" && args[0] === "add") {
    const projectArgument = args[1];
    const title = args.slice(2).join(" ").trim();
    if (!projectArgument || !title) throw new Error("用法：projectctl idea add <project-id|-> <内容>");
    const projectId = projectArgument === "-" ? null : projectArgument;
    await ensureDaemon(client);
    const idea = await client.createIdea({ projectId, title, body: "来自 projectctl", status: "draft", sourceType: "manual", sourceId: null });
    console.log(`已保存到想法库：${idea.id}`);
    return;
  }

  if (command === "proposal" && args[0] === "submit") {
    const filename = args[1]?.trim();
    if (!filename) throw new Error("用法：projectctl proposal submit <proposal.json>");
    const input = JSON.parse(await readFile(filename, "utf8"));
    await ensureDaemon(client);
    const proposal = await client.createProposal(input);
    console.log(`已提交到待决策中心：${proposal.id}`);
    return;
  }

  if (command === "integrate" && args[0] === "codex") {
    const entry = fileURLToPath(import.meta.url);
    const result = spawnSync("codex", ["mcp", "add", "project-manager", "--", process.execPath, entry, "mcp"], { stdio: "inherit", shell: process.platform === "win32" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`codex mcp add 退出码：${result.status}`);
    return;
  }

  console.log(`Agentic Project OS CLI

用法：
  projectctl start
  projectctl status
  projectctl projects
  projectctl project snapshot <project-id>
  projectctl search <关键词> [--project <project-id>]
  projectctl inbox add <内容>
  projectctl idea add <project-id|-> <内容>
  projectctl proposal submit <proposal.json>
  projectctl integrate codex
  projectctl mcp`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
