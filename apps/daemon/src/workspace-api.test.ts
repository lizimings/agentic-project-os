import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("等待工作区监听结果超时");
}

describe("workspace Git API", () => {
  let directory: string;
  let repositoryPath: string;
  let worktreePath: string;
  let app: Awaited<ReturnType<typeof buildServer>>["app"];
  let database: Awaited<ReturnType<typeof buildServer>>["database"];

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "pcc-workspace-"));
    repositoryPath = path.join(directory, "repo");
    worktreePath = path.join(directory, "feature-worktree");
    await mkdir(repositoryPath);
    git(repositoryPath, ["init", "-b", "main"]);
    git(repositoryPath, ["config", "user.name", "PCC Test"]);
    git(repositoryPath, ["config", "user.email", "pcc@example.test"]);
    await writeFile(path.join(repositoryPath, "README.md"), "# Workspace fixture\n", "utf8");
    git(repositoryPath, ["add", "README.md"]);
    git(repositoryPath, ["commit", "-m", "initial"]);
    git(repositoryPath, ["worktree", "add", "-b", "feature/test", worktreePath]);
    await writeFile(path.join(repositoryPath, "dirty.txt"), "uncommitted\n", "utf8");
    ({ app, database } = await buildServer({ databaseFilename: path.join(directory, "test.sqlite"), logger: false, workspaceWatchingEnabled: false }));
  });

  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("binds, scans, persists and removes a real Git workspace", async () => {
    const bound = await app.inject({
      method: "PUT",
      url: "/api/projects/pixelmind/workspace",
      payload: { path: repositoryPath, watchEnabled: true },
    });
    expect(bound.statusCode).toBe(200);
    expect(bound.json()).toMatchObject({ projectId: "pixelmind", status: "ready", branch: "main", dirtyFiles: 1 });
    expect(bound.json().head).toMatch(/^[0-9a-f]{7,12}$/);
    expect(bound.json().worktrees).toHaveLength(2);
    expect(bound.json().worktrees.some((worktree: { branch: string }) => worktree.branch === "feature/test")).toBe(true);
    expect(bound.json().commits).toHaveLength(2);
    expect(bound.json().worktrees).toEqual(expect.arrayContaining([expect.objectContaining({ lastCommit: expect.objectContaining({ subject: "initial" }) })]));
    expect(bound.json().worktrees.find((worktree: { isCurrent: boolean }) => worktree.isCurrent)).toMatchObject({ dirtyFiles: 1, changedFiles: ["dirty.txt"] });
    const worktreeIds = bound.json().worktrees.map((worktree: { id: string }) => worktree.id).sort();
    const linkedWorktree = bound.json().worktrees[0];
    const association = await app.inject({ method: "POST", url: "/api/entity-links", payload: { sourceType: "worktree", sourceId: linkedWorktree.id, targetType: "task", targetId: "30000000-0000-4000-8000-000000000001", relation: "implements", label: "worktree:task" } });
    expect(association.statusCode, association.body).toBe(201);

    const persisted = await app.inject({ method: "GET", url: "/api/projects/pixelmind/workspace" });
    expect(persisted.statusCode).toBe(200);
    expect(persisted.json().worktrees).toHaveLength(2);

    await writeFile(path.join(repositoryPath, "second-dirty.txt"), "another change\n", "utf8");
    const rescanned = await app.inject({ method: "POST", url: "/api/projects/pixelmind/workspace/scan" });
    expect(rescanned.statusCode).toBe(200);
    expect(rescanned.json().dirtyFiles).toBe(2);
    expect(rescanned.json().worktrees.map((worktree: { id: string }) => worktree.id).sort()).toEqual(worktreeIds);
    const associations = (await app.inject({ method: "GET", url: `/api/entity-links?entityType=worktree&entityId=${linkedWorktree.id}` })).json();
    expect(associations.items).toContainEqual(expect.objectContaining({ targetType: "task", label: "worktree:task" }));

    const commitSearch = await app.inject({ method: "GET", url: "/api/search?q=initial&types=commit" });
    expect(commitSearch.statusCode, commitSearch.body).toBe(200);
    expect(commitSearch.json().items).toContainEqual(expect.objectContaining({ entityType: "commit", projectId: "pixelmind" }));
    const graph = (await app.inject({ method: "GET", url: "/api/knowledge-graph?projectId=pixelmind" })).json();
    expect(graph.nodes).toContainEqual(expect.objectContaining({ type: "commit", label: expect.stringContaining("initial") }));
    expect(graph.links).toContainEqual(expect.objectContaining({ relation: "HEAD", kind: "workspace" }));

    const events = await database.selectFrom("event_log").select(["type"]).where("entity_id", "=", "pixelmind").where("entity_type", "=", "workspace").orderBy("sequence", "asc").execute();
    expect(events.map((event) => event.type)).toEqual(["workspace.bound", "workspace.scanned", "workspace.scanned"]);

    const confirmedPath = path.join(directory, "confirmed-worktree");
    const preflight = await app.inject({ method: "POST", url: "/api/projects/pixelmind/worktrees/preflight", payload: { targetPath: confirmedPath, branch: "feature/confirmed", baseRef: "main" } });
    expect(preflight.statusCode, preflight.body).toBe(200);
    expect(preflight.json()).toMatchObject({ projectId: "pixelmind", targetPath: confirmedPath, branch: "feature/confirmed", branchExists: false, command: ["git", "worktree", "add", "-b", "feature/confirmed", confirmedPath, "main"] });
    expect(await access(confirmedPath).then(() => true).catch(() => false)).toBe(false);
    const invalidConfirmation = await app.inject({ method: "POST", url: "/api/projects/pixelmind/worktrees", payload: { confirmationToken: "00000000-0000-4000-8000-000000000099" } });
    expect(invalidConfirmation.statusCode).toBe(409);
    const created = await app.inject({ method: "POST", url: "/api/projects/pixelmind/worktrees", payload: { confirmationToken: preflight.json().confirmationToken } });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().worktree).toMatchObject({ branch: "feature/confirmed", lastCommit: expect.objectContaining({ subject: "initial" }) });
    expect(path.resolve(created.json().worktree.path)).toBe(path.resolve(confirmedPath));
    expect(created.json().binding.worktrees).toHaveLength(3);
    const createdEvent = await database.selectFrom("event_log").select(["type", "project_id"]).where("entity_id", "=", created.json().worktree.id).executeTakeFirstOrThrow();
    expect(createdEvent).toEqual({ type: "worktree.created", project_id: "pixelmind" });

    const removed = await app.inject({ method: "DELETE", url: "/api/projects/pixelmind/workspace" });
    expect(removed.statusCode).toBe(204);
    const absent = await app.inject({ method: "GET", url: "/api/projects/pixelmind/workspace" });
    expect(absent.statusCode).toBe(200);
    expect(absent.json()).toBeNull();
  });

  it("returns an explainable status for non-Git and missing directories", async () => {
    const nonGit = await app.inject({ method: "PUT", url: "/api/projects/edgemind/workspace", payload: { path: directory } });
    expect(nonGit.statusCode).toBe(200);
    expect(nonGit.json()).toMatchObject({ status: "not_git", lastError: "目录不是 Git 仓库" });

    const missing = await app.inject({ method: "PUT", url: "/api/projects/content-studio/workspace", payload: { path: path.join(directory, "missing") } });
    expect(missing.statusCode).toBe(200);
    expect(missing.json().status).toBe("missing");

    const relative = await app.inject({ method: "PUT", url: "/api/projects/protocol-runtime/workspace", payload: { path: "relative/path" } });
    expect(relative.statusCode).toBe(400);
    expect(relative.json().error).toBe("INVALID_WORKSPACE_PATH");
  });

  it("rescans automatically after a debounced filesystem event", async () => {
    await app.close();
    ({ app, database } = await buildServer({ databaseFilename: path.join(directory, "watch.sqlite"), logger: false, workspaceWatchingEnabled: true, workspaceWatchDebounceMs: 50 }));
    const bound = await app.inject({ method: "PUT", url: "/api/projects/pixelmind/workspace", payload: { path: repositoryPath, watchEnabled: true } });
    expect(bound.statusCode, bound.body).toBe(200);
    expect(bound.json().dirtyFiles).toBe(1);
    await writeFile(path.join(repositoryPath, "watched-change.txt"), "watch me\n", "utf8");
    await waitFor(async () => (await app.inject({ method: "GET", url: "/api/projects/pixelmind/workspace" })).json().dirtyFiles === 2);
    const latest = await database.selectFrom("event_log").select(["actor_type", "actor_id", "type"]).where("entity_type", "=", "workspace").orderBy("sequence", "desc").executeTakeFirstOrThrow();
    expect(latest).toEqual({ actor_type: "system", actor_id: "workspace-watcher", type: "workspace.scanned" });
  });
});
