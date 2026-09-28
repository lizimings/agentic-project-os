import { execFile } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { GitCommitEvidence, WorktreeSnapshot } from "@pcc/contracts";

const execFileAsync = promisify(execFile);

function stableUuid(valueToHash: string) {
  const hex = createHash("sha256").update(valueToHash).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(hex[16] ?? "0", 16) % 4] ?? "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function stableWorktreeId(projectId: string, worktreePath: string) {
  const canonical = process.platform === "win32" ? path.resolve(worktreePath).toLowerCase() : path.resolve(worktreePath);
  return stableUuid(`${projectId}\0${canonical}`);
}

async function git(cwd: string, args: string[]) {
  const result = await execFileAsync("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 4 * 1024 * 1024,
    encoding: "utf8",
  });
  return result.stdout.trim();
}

export async function prepareGitWorktree(rootPath: string, targetPath: string, branch: string, baseRef: string) {
  await git(rootPath, ["check-ref-format", "--branch", branch]);
  const branchExists = await git(rootPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).then(() => true).catch(() => false);
  if (!branchExists) await git(rootPath, ["rev-parse", "--verify", `${baseRef}^{commit}`]);
  return { branchExists, args: branchExists ? ["worktree", "add", targetPath, branch] : ["worktree", "add", "-b", branch, targetPath, baseRef] };
}

export async function createGitWorktree(rootPath: string, args: string[]) {
  await git(rootPath, args);
}

type WorktreeBase = Omit<WorktreeSnapshot, "dirtyFiles" | "ahead" | "behind" | "changedFiles" | "lastCommit">;

function parseWorktrees(projectId: string, output: string, currentRoot: string, scannedAt: string): WorktreeBase[] {
  return output.split(/\r?\n\r?\n/).filter(Boolean).map((block) => {
    const fields = new Map<string, string>();
    const flags = new Set<string>();
    for (const line of block.split(/\r?\n/)) {
      const separator = line.indexOf(" ");
      if (separator === -1) flags.add(line);
      else fields.set(line.slice(0, separator), line.slice(separator + 1));
    }
    const worktreePath = fields.get("worktree") ?? "";
    const branchRef = fields.get("branch");
    const head = fields.get("HEAD") ?? "unknown";
    const samePath = process.platform === "win32"
      ? path.resolve(worktreePath).toLowerCase() === path.resolve(currentRoot).toLowerCase()
      : path.resolve(worktreePath) === path.resolve(currentRoot);
    return {
      id: stableWorktreeId(projectId, worktreePath),
      projectId,
      path: worktreePath,
      branch: branchRef?.replace(/^refs\/heads\//, "") ?? null,
      head: head.slice(0, 12),
      isCurrent: samePath,
      isBare: flags.has("bare"),
      isDetached: flags.has("detached"),
      lockedReason: fields.get("locked") ?? (flags.has("locked") ? "locked" : null),
      prunableReason: fields.get("prunable") ?? (flags.has("prunable") ? "prunable" : null),
      scannedAt,
    };
  });
}

function changedFilesFromStatus(status: string) {
  return status.split(/\r?\n/).filter(Boolean).map((line) => {
    const raw = line.length > 3 ? line.slice(3) : line;
    return raw.split(" -> ").at(-1)?.replace(/^"|"$/g, "") ?? raw;
  }).slice(0, 25);
}

function parseCommits(projectId: string, worktree: WorktreeBase, output: string): GitCommitEvidence[] {
  return output.split("\x1e").map((record) => record.trim()).filter(Boolean).map((record, index) => {
    const [hash = "", shortHash = "", author = "", committedAt = "", ...subjectParts] = record.split("\x1f");
    return {
      id: stableUuid(`${projectId}\0${worktree.id}\0${hash}`),
      projectId,
      worktreeId: worktree.id,
      hash,
      shortHash,
      subject: subjectParts.join("\x1f").trim(),
      author,
      committedAt,
      branch: worktree.branch,
      isHead: index === 0 && hash.startsWith(worktree.head),
    };
  }).filter((commit) => /^[0-9a-f]{40,64}$/i.test(commit.hash) && /^[0-9a-f]{7,16}$/i.test(commit.shortHash) && !Number.isNaN(Date.parse(commit.committedAt)));
}

async function inspectWorktree(projectId: string, worktree: WorktreeBase) {
  if (worktree.isBare) {
    const snapshot: WorktreeSnapshot = { ...worktree, dirtyFiles: 0, ahead: 0, behind: 0, changedFiles: [], lastCommit: null };
    return { snapshot, commits: [] as GitCommitEvidence[] };
  }
  const [statusOutput, upstreamCounts, logOutput] = await Promise.all([
    git(worktree.path, ["status", "--porcelain=v1", "--untracked-files=all"]).catch(() => ""),
    git(worktree.path, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]).catch(() => "0\t0"),
    git(worktree.path, ["log", "-20", "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e"]).catch(() => ""),
  ]);
  const [ahead = 0, behind = 0] = upstreamCounts.split(/\s+/).map((value) => Number(value) || 0);
  const commits = parseCommits(projectId, worktree, logOutput);
  const changedFiles = changedFilesFromStatus(statusOutput);
  const snapshot: WorktreeSnapshot = {
    ...worktree,
    dirtyFiles: statusOutput ? statusOutput.split(/\r?\n/).filter(Boolean).length : 0,
    ahead,
    behind,
    changedFiles,
    lastCommit: commits[0] ?? null,
  };
  return { snapshot, commits };
}

export type GitScanResult = {
  status: "ready" | "missing" | "not_git" | "error";
  canonicalPath: string;
  branch: string | null;
  head: string | null;
  dirtyFiles: number;
  ahead: number;
  behind: number;
  lastScannedAt: string;
  lastError: string | null;
  worktrees: WorktreeSnapshot[];
  commits: GitCommitEvidence[];
};

export async function scanGitWorkspace(projectId: string, requestedPath: string): Promise<GitScanResult> {
  const scannedAt = new Date().toISOString();
  const resolved = path.resolve(requestedPath);
  try {
    await access(resolved);
  } catch {
    return { status: "missing", canonicalPath: resolved, branch: null, head: null, dirtyFiles: 0, ahead: 0, behind: 0, lastScannedAt: scannedAt, lastError: "目录不存在或当前用户没有读取权限", worktrees: [], commits: [] };
  }

  const canonicalPath = await realpath(resolved).catch(() => resolved);
  try {
    const root = await git(canonicalPath, ["rev-parse", "--show-toplevel"]);
    const [branchResult, head, worktreeOutput] = await Promise.all([
      git(canonicalPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => ""),
      git(canonicalPath, ["rev-parse", "--short=12", "HEAD"]),
      git(canonicalPath, ["worktree", "list", "--porcelain"]),
    ]);
    const inspected = await Promise.all(parseWorktrees(projectId, worktreeOutput, root, scannedAt).map((worktree) => inspectWorktree(projectId, worktree)));
    const worktrees = inspected.map((result) => result.snapshot);
    const commits = inspected.flatMap((result) => result.commits);
    const current = worktrees.find((worktree) => worktree.isCurrent);
    return {
      status: "ready",
      canonicalPath,
      branch: branchResult || null,
      head,
      dirtyFiles: current?.dirtyFiles ?? 0,
      ahead: current?.ahead ?? 0,
      behind: current?.behind ?? 0,
      lastScannedAt: scannedAt,
      lastError: null,
      worktrees,
      commits,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notGit = /not a git repository/i.test(message);
    return { status: notGit ? "not_git" : "error", canonicalPath, branch: null, head: null, dirtyFiles: 0, ahead: 0, behind: 0, lastScannedAt: scannedAt, lastError: notGit ? "目录不是 Git 仓库" : message.slice(0, 2_000), worktrees: [], commits: [] };
  }
}
