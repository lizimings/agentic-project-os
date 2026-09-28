import path from "node:path";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { watch, type FSWatcher } from "chokidar";
import type { BindWorkspaceInput, EventEnvelope, PrepareWorktreeInput, WorktreeCreationPreflight } from "@pcc/contracts";
import { CoreRepository, WorkspaceRepository } from "@pcc/database";
import { createCoreEvent, type CoreActor } from "@pcc/domain";
import { CoreService } from "./core-service.js";
import { EventBroker } from "./event-broker.js";
import { EntityNotFoundError } from "./inbox-service.js";
import { createGitWorktree, prepareGitWorktree, scanGitWorkspace } from "./git-scanner.js";

export class InvalidWorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkspacePathError";
  }
}

export class WorktreeCommandError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message);
    this.name = "WorktreeCommandError";
  }
}

function canonicalForCompare(value: string) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export class WorkspaceService {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly watcherTargets = new Map<string, string>();
  private readonly watchTimers = new Map<string, NodeJS.Timeout>();
  private readonly watchScanning = new Set<string>();
  private readonly watchDirty = new Set<string>();
  private readonly pendingCreations = new Map<string, {
    projectId: string; targetPath: string; branch: string; baseRef: string; branchExists: boolean;
    args: string[]; expectedHead: string | null; expiresAt: number;
  }>();

  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly coreRepository: CoreRepository,
    private readonly core: CoreService,
    private readonly events: EventBroker,
    private readonly options: { watchingEnabled?: boolean; debounceMs?: number } = {},
  ) {}

  async start() {
    if (this.options.watchingEnabled === false) return;
    const bindings = await this.repository.listWatched();
    await Promise.all(bindings.map((binding) => this.ensureWatcher(binding.projectId, [binding.path, ...binding.worktrees.map((tree) => tree.path)], true)));
  }

  async stop() {
    this.watchTimers.forEach((timer) => clearTimeout(timer));
    this.watchTimers.clear();
    await Promise.all([...this.watchers.values()].map((watcher) => watcher.close()));
    this.watchers.clear();
    this.watcherTargets.clear();
  }

  private async ensureWatcher(projectId: string, workspacePaths: string[], enabled: boolean) {
    const existing = this.watchers.get(projectId);
    if (!enabled || this.options.watchingEnabled === false) {
      if (existing) await existing.close();
      this.watchers.delete(projectId);
      this.watcherTargets.delete(projectId);
      return;
    }
    const targets = [...new Set(workspacePaths.map((value) => path.resolve(value)))].sort();
    const signature = targets.map(canonicalForCompare).join("\0");
    if (existing && this.watcherTargets.get(projectId) === signature) return;
    if (existing) await existing.close();
    const ignored = (candidate: string) => {
      const normalized = candidate.replaceAll("\\", "/");
      return /\/(node_modules|\.pnpm|dist|build|coverage|\.cache)(\/|$)/.test(normalized)
        || /\/\.git\/(objects|logs|hooks)(\/|$)/.test(normalized);
    };
    const watcher = watch(targets, {
      ignoreInitial: true,
      ignored,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 80 },
    });
    const schedule = () => this.scheduleWatchedScan(projectId);
    watcher.on("add", schedule).on("change", schedule).on("unlink", schedule).on("addDir", schedule).on("unlinkDir", schedule);
    this.watchers.set(projectId, watcher);
    this.watcherTargets.set(projectId, signature);
    await new Promise<void>((resolve) => {
      watcher.once("ready", resolve);
      watcher.once("error", () => resolve());
    });
  }

  private scheduleWatchedScan(projectId: string) {
    const current = this.watchTimers.get(projectId);
    if (current) clearTimeout(current);
    this.watchTimers.set(projectId, setTimeout(() => {
      this.watchTimers.delete(projectId);
      void this.runWatchedScan(projectId);
    }, this.options.debounceMs ?? 900));
  }

  private async runWatchedScan(projectId: string) {
    if (this.watchScanning.has(projectId)) { this.watchDirty.add(projectId); return; }
    this.watchScanning.add(projectId);
    try {
      await this.scan(projectId, { type: "system", id: "workspace-watcher" }, randomUUID());
    } catch {
      // A later filesystem event or explicit scan retries. Scan failures are persisted in workspace state.
    } finally {
      this.watchScanning.delete(projectId);
      if (this.watchDirty.delete(projectId)) this.scheduleWatchedScan(projectId);
    }
  }

  get(projectId: string) {
    return this.repository.get(projectId);
  }

  private publish(events: EventEnvelope[]) {
    events.forEach((event) => this.events.publish(event));
  }

  async bind(projectId: string, input: BindWorkspaceInput, actor: CoreActor, correlationId: string) {
    await this.core.getProject(projectId);
    if (!path.isAbsolute(input.path)) throw new InvalidWorkspacePathError("工作区路径必须是绝对路径");
    const resolved = path.resolve(input.path);
    const event = createCoreEvent("workspace", projectId, "bound", actor, correlationId, { path: resolved, watchEnabled: input.watchEnabled });
    await this.repository.database.transaction().execute(async (transaction) => {
      await this.repository.bind(projectId, resolved, input.watchEnabled, transaction);
      await this.coreRepository.appendEvent(event, transaction);
    });
    this.publish([event]);
    const scanned = await this.scan(projectId, actor, correlationId);
    await this.ensureWatcher(projectId, [scanned.path, ...scanned.worktrees.map((tree) => tree.path)], scanned.watchEnabled);
    return scanned;
  }

  async scan(projectId: string, actor: CoreActor, correlationId: string) {
    const binding = await this.repository.get(projectId);
    if (!binding) throw new EntityNotFoundError("WorkspaceBinding", projectId);
    const result = await scanGitWorkspace(projectId, binding.path);
    const event = createCoreEvent("workspace", projectId, "scanned", actor, correlationId, {
      status: result.status,
      branch: result.branch,
      head: result.head,
      dirtyFiles: result.dirtyFiles,
      worktrees: result.worktrees.length,
      commits: result.commits.length,
    });
    const updated = await this.repository.database.transaction().execute(async (transaction) => {
      const entity = await this.repository.updateScan(projectId, {
        status: result.status,
        branch: result.branch,
        head: result.head,
        dirtyFiles: result.dirtyFiles,
        ahead: result.ahead,
        behind: result.behind,
        lastScannedAt: result.lastScannedAt,
        lastError: result.lastError,
        worktrees: result.worktrees,
        commits: result.commits,
      }, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return entity;
    });
    if (!updated) throw new EntityNotFoundError("WorkspaceBinding", projectId);
    this.publish([event]);
    await this.ensureWatcher(projectId, [updated.path, ...updated.worktrees.map((tree) => tree.path)], updated.watchEnabled);
    return updated;
  }

  async preflightWorktree(projectId: string, input: PrepareWorktreeInput): Promise<WorktreeCreationPreflight> {
    const binding = await this.repository.get(projectId);
    if (!binding || binding.status !== "ready") throw new WorktreeCommandError("请先绑定并成功扫描一个 Git 工作区", 409, "WORKSPACE_NOT_READY");
    if (!path.isAbsolute(input.targetPath)) throw new WorktreeCommandError("Worktree 目标路径必须是绝对路径", 400, "WORKTREE_PATH_NOT_ABSOLUTE");
    const targetPath = path.resolve(input.targetPath);
    const rootPath = path.resolve(binding.path);
    const relativeToRoot = path.relative(rootPath, targetPath);
    if (!relativeToRoot || (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot))) {
      throw new WorktreeCommandError("Worktree 目标路径需要位于主工作区之外", 400, "WORKTREE_PATH_INSIDE_ROOT");
    }
    if (binding.worktrees.some((tree) => canonicalForCompare(tree.path) === canonicalForCompare(targetPath))) {
      throw new WorktreeCommandError("目标路径已经是当前项目的 Worktree", 409, "WORKTREE_PATH_ALREADY_BOUND");
    }
    const targetExists = await access(targetPath).then(() => true).catch(() => false);
    if (targetExists) throw new WorktreeCommandError("Worktree 目标路径已经存在", 409, "WORKTREE_PATH_EXISTS");
    const parentExists = await access(path.dirname(targetPath)).then(() => true).catch(() => false);
    if (!parentExists) throw new WorktreeCommandError("Worktree 目标路径的父目录不存在", 400, "WORKTREE_PARENT_MISSING");
    let prepared: Awaited<ReturnType<typeof prepareGitWorktree>>;
    try {
      prepared = await prepareGitWorktree(rootPath, targetPath, input.branch, input.baseRef);
    } catch {
      throw new WorktreeCommandError("分支名称或基准引用无效", 400, "WORKTREE_REF_INVALID");
    }
    if (binding.worktrees.some((tree) => tree.branch === input.branch)) {
      throw new WorktreeCommandError("该分支已经被另一个 Worktree 使用", 409, "WORKTREE_BRANCH_IN_USE");
    }
    const confirmationToken = randomUUID();
    const expiresAt = Date.now() + 5 * 60_000;
    [...this.pendingCreations.entries()].filter(([, pending]) => pending.expiresAt < Date.now()).forEach(([token]) => this.pendingCreations.delete(token));
    this.pendingCreations.set(confirmationToken, {
      projectId, targetPath, branch: input.branch, baseRef: input.baseRef, branchExists: prepared.branchExists,
      args: prepared.args, expectedHead: binding.head, expiresAt,
    });
    return {
      confirmationToken,
      projectId,
      rootPath,
      targetPath,
      branch: input.branch,
      baseRef: input.baseRef,
      branchExists: prepared.branchExists,
      command: ["git", ...prepared.args],
      warnings: prepared.branchExists ? ["将检出已经存在的本地分支，不会创建新分支。"] : ["将从基准引用创建新分支。"],
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async createWorktree(projectId: string, confirmationToken: string, actor: CoreActor, correlationId: string) {
    const pending = this.pendingCreations.get(confirmationToken);
    this.pendingCreations.delete(confirmationToken);
    if (!pending || pending.projectId !== projectId) throw new WorktreeCommandError("确认信息不存在，请重新预检", 409, "WORKTREE_CONFIRMATION_INVALID");
    if (pending.expiresAt < Date.now()) throw new WorktreeCommandError("确认信息已过期，请重新预检", 409, "WORKTREE_CONFIRMATION_EXPIRED");
    const binding = await this.repository.get(projectId);
    if (!binding || binding.status !== "ready") throw new WorktreeCommandError("工作区状态已经变化，请重新预检", 409, "WORKSPACE_CHANGED");
    if (binding.head !== pending.expectedHead) throw new WorktreeCommandError("工作区 HEAD 已变化，请重新预检", 409, "WORKSPACE_CHANGED");
    try {
      const latest = await prepareGitWorktree(binding.path, pending.targetPath, pending.branch, pending.baseRef);
      if (latest.branchExists !== pending.branchExists || latest.args.join("\0") !== pending.args.join("\0")) throw new Error("preflight changed");
      await createGitWorktree(binding.path, pending.args);
    } catch (error) {
      throw new WorktreeCommandError(error instanceof Error && error.message === "preflight changed" ? "Git 状态已经变化，请重新预检" : "Git Worktree 创建失败，请检查分支和目标路径", 409, "WORKTREE_CREATE_FAILED");
    }
    const updated = await this.scan(projectId, actor, correlationId);
    const worktree = updated.worktrees.find((item) => canonicalForCompare(item.path) === canonicalForCompare(pending.targetPath));
    if (!worktree) throw new WorktreeCommandError("Git 已执行，但扫描未发现新 Worktree，请手动刷新", 500, "WORKTREE_CREATE_NOT_DISCOVERED");
    const event = createCoreEvent("worktree", worktree.id, "created", actor, correlationId, { projectId, path: worktree.path, branch: worktree.branch, baseRef: pending.baseRef });
    await this.coreRepository.appendEvent(event);
    this.publish([event]);
    return { worktree, binding: updated };
  }

  async remove(projectId: string, actor: CoreActor, correlationId: string) {
    const binding = await this.repository.get(projectId);
    if (!binding) throw new EntityNotFoundError("WorkspaceBinding", projectId);
    const event = createCoreEvent("workspace", projectId, "unbound", actor, correlationId, { path: binding.path });
    await this.repository.database.transaction().execute(async (transaction) => {
      await this.repository.remove(projectId, transaction);
      await this.coreRepository.appendEvent(event, transaction);
    });
    await this.ensureWatcher(projectId, [], false);
    this.publish([event]);
  }
}
