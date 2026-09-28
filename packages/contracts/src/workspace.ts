import { z } from "zod";

export const WorkspaceStatusSchema = z.enum(["ready", "missing", "not_git", "error"]);

export const GitCommitEvidenceSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().min(1),
  worktreeId: z.string().uuid(),
  hash: z.string().regex(/^[0-9a-f]{40,64}$/i),
  shortHash: z.string().regex(/^[0-9a-f]{7,16}$/i),
  subject: z.string(),
  author: z.string(),
  committedAt: z.string().datetime(),
  branch: z.string().nullable(),
  isHead: z.boolean(),
});

export const WorktreeSnapshotSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().min(1),
  path: z.string().min(1),
  branch: z.string().nullable(),
  head: z.string().min(1),
  isCurrent: z.boolean(),
  isBare: z.boolean(),
  isDetached: z.boolean(),
  lockedReason: z.string().nullable(),
  prunableReason: z.string().nullable(),
  dirtyFiles: z.number().int().nonnegative(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  changedFiles: z.array(z.string()).max(25),
  lastCommit: GitCommitEvidenceSchema.nullable(),
  scannedAt: z.string().datetime(),
});

export const WorkspaceBindingSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1),
  watchEnabled: z.boolean(),
  status: WorkspaceStatusSchema,
  branch: z.string().nullable(),
  head: z.string().nullable(),
  dirtyFiles: z.number().int().nonnegative(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  lastScannedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  worktrees: z.array(WorktreeSnapshotSchema),
  commits: z.array(GitCommitEvidenceSchema),
});

export const BindWorkspaceSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  watchEnabled: z.boolean().default(true),
});

export const PrepareWorktreeSchema = z.object({
  targetPath: z.string().trim().min(1).max(4_096),
  branch: z.string().trim().min(1).max(250),
  baseRef: z.string().trim().min(1).max(500).default("HEAD"),
});

export const WorktreeCreationPreflightSchema = z.object({
  confirmationToken: z.string().uuid(),
  projectId: z.string().min(1),
  rootPath: z.string(),
  targetPath: z.string(),
  branch: z.string(),
  baseRef: z.string(),
  branchExists: z.boolean(),
  command: z.array(z.string()).min(3),
  warnings: z.array(z.string()),
  expiresAt: z.string().datetime(),
});

export const ConfirmWorktreeCreationSchema = z.object({ confirmationToken: z.string().uuid() });

export const WorktreeCreationResultSchema = z.object({
  worktree: WorktreeSnapshotSchema,
  binding: WorkspaceBindingSchema,
});

export type WorkspaceBinding = z.infer<typeof WorkspaceBindingSchema>;
export type WorktreeSnapshot = z.infer<typeof WorktreeSnapshotSchema>;
export type GitCommitEvidence = z.infer<typeof GitCommitEvidenceSchema>;
export type BindWorkspaceInput = z.infer<typeof BindWorkspaceSchema>;
export type PrepareWorktreeInput = z.infer<typeof PrepareWorktreeSchema>;
export type WorktreeCreationPreflight = z.infer<typeof WorktreeCreationPreflightSchema>;
export type ConfirmWorktreeCreationInput = z.infer<typeof ConfirmWorktreeCreationSchema>;
