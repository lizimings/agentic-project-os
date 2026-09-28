import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, "../../..");
const daemonEntry = path.join(repositoryRoot, "apps/daemon/src/index.ts");
const cliEntry = path.join(repositoryRoot, "apps/cli/src/index.ts");
const daemonTsx = pathToFileURL(createRequire(path.join(repositoryRoot, "apps/daemon/package.json")).resolve("tsx")).href;
const cliTsx = pathToFileURL(createRequire(path.join(repositoryRoot, "apps/cli/package.json")).resolve("tsx")).href;

async function reservePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitForHealth(baseUrl: string) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // projectd is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("测试 projectd 没有按时就绪");
}

describe("projectctl MCP stdio", () => {
  let daemon: ChildProcess;
  let dataDirectory: string;
  let baseUrl: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    const port = await reservePort();
    baseUrl = `http://127.0.0.1:${port}`;
    dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pcc-mcp-test-"));
    daemon = spawn(process.execPath, ["--import", daemonTsx, daemonEntry], {
      cwd: repositoryRoot,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      env: { ...process.env, PCC_PORT: String(port), PCC_DATA_DIR: dataDirectory },
    });
    await waitForHealth(baseUrl);

    transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", cliTsx, cliEntry, "mcp"],
      cwd: repositoryRoot,
      stderr: "pipe",
      env: { ...process.env, PCC_DAEMON_URL: baseUrl },
    });
    client = new Client({ name: "pcc-e2e", version: "0.1.0" });
    await client.connect(transport);
  }, 20_000);

  afterAll(async () => {
    await transport?.close();
    if (daemon && daemon.exitCode === null) {
      const exited = new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
      daemon.kill();
      await exited;
    }
    await fs.rm(dataDirectory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }, 20_000);

  it("lists tools and captures a durable inbox item", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "project_inbox_capture",
      "project_list",
      "project_snapshot_read",
      "project_worktree_list",
      "project_search",
      "project_idea_capture",
      "project_proposal_submit",
    ]));

    const capture = await client.callTool({
      name: "project_inbox_capture",
      arguments: { title: "MCP 端到端捕获", source: "MCP", project: "PixelMind", kind: "需求" },
    });
    expect(capture.isError).not.toBe(true);

    const list = await client.callTool({
      name: "project_inbox_list",
      arguments: { project: "PixelMind" },
    });
    const structured = list.structuredContent as { items: Array<{ title: string }> };
    expect(structured.items.some((item) => item.title === "MCP 端到端捕获")).toBe(true);

    const projects = await client.callTool({ name: "project_list", arguments: {} });
    expect((projects.structuredContent as { items: Array<{ id: string }> }).items.some((project) => project.id === "pixelmind")).toBe(true);

    const snapshot = await client.callTool({ name: "project_snapshot_read", arguments: { projectId: "pixelmind" } });
    const snapshotContent = snapshot.structuredContent as { project: { id: string }; tasks: Array<{ title: string }>; workspace: null | object };
    expect(snapshotContent.project.id).toBe("pixelmind");
    expect(snapshotContent.tasks.length).toBeGreaterThan(0);
    expect(snapshotContent.workspace).toBeNull();

    const search = await client.callTool({ name: "project_search", arguments: { query: "画布", projectId: "pixelmind" } });
    const searchContent = search.structuredContent as { items: Array<{ entityType: string; title: string }> };
    expect(searchContent.items.some((item) => item.entityType === "task" && item.title.includes("画布"))).toBe(true);

    const idea = await client.callTool({ name: "project_idea_capture", arguments: { projectId: "pixelmind", title: "MCP 记录的项目想法", body: "来自端到端测试", sourceType: "agent", sourceId: null } });
    expect((idea.structuredContent as { title: string }).title).toBe("MCP 记录的项目想法");

    const proposal = await client.callTool({
      name: "project_proposal_submit",
      arguments: {
        projectId: "pixelmind",
        title: "MCP 提交结构化建议",
        summary: "只进入待决策中心，不直接修改任务层级。",
        kind: "organize",
        risk: "low",
        evidence: ["project_snapshot_read 中发现一个待整理想法"],
        changes: [{ entityType: "task", entityId: null, action: "create", summary: "建议创建一个验证任务" }],
        createdBy: "mcp-e2e",
      },
    });
    expect((proposal.structuredContent as { status: string }).status).toBe("pending");
    const proposals = await client.callTool({ name: "project_proposal_list", arguments: { projectId: "pixelmind", status: "pending" } });
    expect((proposals.structuredContent as { items: Array<{ title: string }> }).items.some((item) => item.title === "MCP 提交结构化建议")).toBe(true);
  });

  it("exposes the same project reads and controlled writes through projectctl", async () => {
    const run = (...arguments_: string[]) => spawnSync(process.execPath, ["--import", cliTsx, cliEntry, ...arguments_], {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PCC_DAEMON_URL: baseUrl },
    });
    const projects = run("projects");
    expect(projects.status, projects.stderr).toBe(0);
    expect(JSON.parse(projects.stdout).items.some((project: { id: string }) => project.id === "pixelmind")).toBe(true);

    const snapshot = run("project", "snapshot", "pixelmind");
    expect(snapshot.status, snapshot.stderr).toBe(0);
    expect(JSON.parse(snapshot.stdout).project.id).toBe("pixelmind");

    const search = run("search", "画布", "--project", "pixelmind");
    expect(search.status, search.stderr).toBe(0);
    expect(JSON.parse(search.stdout).items.some((item: { entityType: string }) => item.entityType === "task")).toBe(true);

    const idea = run("idea", "add", "pixelmind", "CLI 记录的项目想法");
    expect(idea.status, idea.stderr).toBe(0);
    expect(idea.stdout).toContain("已保存到想法库");

    const proposalFile = path.join(dataDirectory, "proposal.json");
    await fs.writeFile(proposalFile, JSON.stringify({
      projectId: "pixelmind",
      title: "CLI 提交的结构化建议",
      summary: "从 JSON 文件提交。",
      kind: "organize",
      risk: "low",
      evidence: ["CLI e2e"],
      changes: [{ entityType: "task", entityId: null, action: "create", summary: "建议建立验收任务" }],
      createdBy: "cli-e2e",
    }));
    const proposal = run("proposal", "submit", proposalFile);
    expect(proposal.status, proposal.stderr).toBe(0);
    expect(proposal.stdout).toContain("已提交到待决策中心");
  }, 20_000);
});
