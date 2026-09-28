import type { GitCommitEvidence, WorktreeSnapshot, WorkspaceBinding } from "@pcc/contracts";
import type { DatabaseExecutor, PccDatabase } from "./types.js";

function commitFromRow(row: {
  id: string; project_id: string; worktree_id: string; hash: string; short_hash: string;
  subject: string; author: string; committed_at: string; branch: string | null; is_head: number;
}): GitCommitEvidence {
  return { id: row.id, projectId: row.project_id, worktreeId: row.worktree_id, hash: row.hash, shortHash: row.short_hash, subject: row.subject, author: row.author, committedAt: row.committed_at, branch: row.branch, isHead: Boolean(row.is_head) };
}

function snapshotFromRow(row: {
  id: string; project_id: string; path: string; branch: string | null; head: string;
  is_current: number; is_bare: number; is_detached: number; locked_reason: string | null;
  prunable_reason: string | null; dirty_files: number; ahead: number; behind: number;
  changed_files_json: string; last_commit_id: string | null; scanned_at: string;
}, commits: Map<string, GitCommitEvidence>): WorktreeSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    path: row.path,
    branch: row.branch,
    head: row.head,
    isCurrent: Boolean(row.is_current),
    isBare: Boolean(row.is_bare),
    isDetached: Boolean(row.is_detached),
    lockedReason: row.locked_reason,
    prunableReason: row.prunable_reason,
    dirtyFiles: row.dirty_files,
    ahead: row.ahead,
    behind: row.behind,
    changedFiles: JSON.parse(row.changed_files_json) as string[],
    lastCommit: row.last_commit_id ? commits.get(row.last_commit_id) ?? null : null,
    scannedAt: row.scanned_at,
  };
}

export interface WorkspaceScanUpdate {
  status: WorkspaceBinding["status"];
  branch: string | null;
  head: string | null;
  dirtyFiles: number;
  ahead: number;
  behind: number;
  lastScannedAt: string;
  lastError: string | null;
  worktrees: WorktreeSnapshot[];
  commits: GitCommitEvidence[];
}

export class WorkspaceRepository {
  constructor(private readonly db: PccDatabase) {}

  get database() {
    return this.db;
  }

  async listWatched() {
    const rows = await this.db.selectFrom("workspace_bindings").select("project_id").where("watch_enabled", "=", 1).execute();
    return (await Promise.all(rows.map((row) => this.get(row.project_id)))).filter((binding): binding is WorkspaceBinding => Boolean(binding));
  }

  async get(projectId: string, executor: DatabaseExecutor = this.db): Promise<WorkspaceBinding | undefined> {
    const row = await executor.selectFrom("workspace_bindings").selectAll().where("project_id", "=", projectId).executeTakeFirst();
    if (!row) return undefined;
    const [worktreeRows, commitRows] = await Promise.all([
      executor.selectFrom("worktree_snapshots").selectAll().where("project_id", "=", projectId).orderBy("is_current", "desc").orderBy("path", "asc").execute(),
      executor.selectFrom("git_commits").selectAll().where("project_id", "=", projectId).orderBy("committed_at", "desc").limit(100).execute(),
    ]);
    const commits = commitRows.map(commitFromRow);
    const commitsById = new Map(commits.map((commit) => [commit.id, commit]));
    return {
      projectId: row.project_id,
      path: row.path,
      watchEnabled: Boolean(row.watch_enabled),
      status: row.status as WorkspaceBinding["status"],
      branch: row.branch,
      head: row.head,
      dirtyFiles: row.dirty_files,
      ahead: row.ahead,
      behind: row.behind,
      lastScannedAt: row.last_scanned_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      worktrees: worktreeRows.map((worktree) => snapshotFromRow(worktree, commitsById)),
      commits,
    };
  }

  async bind(projectId: string, path: string, watchEnabled: boolean, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.insertInto("workspace_bindings").values({
      project_id: projectId,
      path,
      watch_enabled: watchEnabled ? 1 : 0,
      status: "error",
      branch: null,
      head: null,
      dirty_files: 0,
      ahead: 0,
      behind: 0,
      last_scanned_at: null,
      last_error: "等待首次扫描",
      created_at: now,
      updated_at: now,
    }).onConflict((conflict) => conflict.column("project_id").doUpdateSet({
      path,
      watch_enabled: watchEnabled ? 1 : 0,
      status: "error",
      branch: null,
      head: null,
      dirty_files: 0,
      ahead: 0,
      behind: 0,
      last_scanned_at: null,
      last_error: "等待首次扫描",
      updated_at: now,
    })).execute();
    await executor.deleteFrom("worktree_snapshots").where("project_id", "=", projectId).execute();
    await executor.deleteFrom("git_commits").where("project_id", "=", projectId).execute();
    return this.get(projectId, executor);
  }

  async updateScan(projectId: string, scan: WorkspaceScanUpdate, executor: DatabaseExecutor = this.db) {
    await executor.updateTable("workspace_bindings").set({
      status: scan.status,
      branch: scan.branch,
      head: scan.head,
      dirty_files: scan.dirtyFiles,
      ahead: scan.ahead,
      behind: scan.behind,
      last_scanned_at: scan.lastScannedAt,
      last_error: scan.lastError,
      updated_at: scan.lastScannedAt,
    }).where("project_id", "=", projectId).execute();
    await executor.deleteFrom("worktree_snapshots").where("project_id", "=", projectId).execute();
    await executor.deleteFrom("git_commits").where("project_id", "=", projectId).execute();
    if (scan.commits.length) {
      await executor.insertInto("git_commits").values(scan.commits.map((commit) => ({
        id: commit.id,
        project_id: commit.projectId,
        worktree_id: commit.worktreeId,
        hash: commit.hash,
        short_hash: commit.shortHash,
        subject: commit.subject,
        author: commit.author,
        committed_at: commit.committedAt,
        branch: commit.branch,
        is_head: commit.isHead ? 1 : 0,
        scanned_at: scan.lastScannedAt,
      }))).execute();
    }
    if (scan.worktrees.length) {
      await executor.insertInto("worktree_snapshots").values(scan.worktrees.map((worktree) => ({
        id: worktree.id,
        project_id: worktree.projectId,
        path: worktree.path,
        branch: worktree.branch,
        head: worktree.head,
        is_current: worktree.isCurrent ? 1 : 0,
        is_bare: worktree.isBare ? 1 : 0,
        is_detached: worktree.isDetached ? 1 : 0,
        locked_reason: worktree.lockedReason,
        prunable_reason: worktree.prunableReason,
        dirty_files: worktree.dirtyFiles,
        ahead: worktree.ahead,
        behind: worktree.behind,
        changed_files_json: JSON.stringify(worktree.changedFiles),
        last_commit_id: worktree.lastCommit?.id ?? null,
        scanned_at: worktree.scannedAt,
      }))).execute();
    }
    return this.get(projectId, executor);
  }

  async remove(projectId: string, executor: DatabaseExecutor = this.db) {
    await executor.deleteFrom("workspace_bindings").where("project_id", "=", projectId).execute();
  }
}
