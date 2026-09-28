import { z } from "zod";

const DateTimeSchema = z.string().datetime();
const NullableDateTimeSchema = DateTimeSchema.nullable();
const IdSchema = z.string().min(1).max(200);

export const RemoteProviderSchema = z.enum(["gitea", "github"]);
export const RemoteConnectionStatusSchema = z.enum(["connected", "error"]);
export const RemoteSyncScopeSchema = z.enum(["commits", "branches", "pull_requests", "issues", "milestones"]);
export const RemoteSyncStatusSchema = z.enum(["idle", "queued", "running", "succeeded", "failed"]);

export const ConnectGiteaSchema = z.object({
  baseUrl: z.string().trim().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "仅支持 HTTP 或 HTTPS 地址"),
  token: z.string().min(8).max(4_096),
});

export const ConnectGitHubSchema = z.object({
  baseUrl: z.string().trim().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "仅支持 HTTP 或 HTTPS 地址").default("https://api.github.com"),
  token: z.string().min(8).max(4_096),
});

export const RemoteConnectionSchema = z.object({
  id: z.string().uuid(),
  provider: RemoteProviderSchema,
  baseUrl: z.string().url(),
  username: z.string().min(1).max(200),
  instanceVersion: z.string().max(100).nullable(),
  status: RemoteConnectionStatusSchema,
  tokenHint: z.string().min(4).max(16),
  lastValidatedAt: NullableDateTimeSchema,
  lastError: z.string().max(2_000).nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const RemoteRepositorySchema = z.object({
  id: z.number().int().nonnegative(),
  owner: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  fullName: z.string().min(3).max(401),
  description: z.string().max(20_000),
  private: z.boolean(),
  defaultBranch: z.string().max(500),
  htmlUrl: z.string().url(),
  cloneUrl: z.string().url(),
  sshUrl: z.string().max(2_000),
  updatedAt: NullableDateTimeSchema,
});

export const ListRemoteRepositoriesQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const RemoteRepositoryPageSchema = z.object({
  items: z.array(RemoteRepositorySchema),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().nonnegative(),
  hasNext: z.boolean(),
});

export const BindProjectRemoteSchema = z.object({
  connectionId: z.string().uuid(),
  fullName: z.string().trim().min(3).max(401).refine((value) => value.split("/").length === 2 && value.split("/").every(Boolean), "仓库名称必须为 owner/repo"),
  syncScopes: z.array(RemoteSyncScopeSchema).min(1).default(["commits", "branches"]),
});

export const ImportGiteaProjectSchema = z.object({
  connectionId: z.string().uuid(),
  fullName: z.string().trim().min(3).max(401).refine((value) => value.split("/").length === 2 && value.split("/").every(Boolean), "仓库名称必须为 owner/repo"),
  project: z.object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(20_000).default(""),
    vision: z.string().trim().max(20_000).default(""),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#4057f4"),
    status: z.enum(["active", "risk", "paused"]).default("active"),
  }),
  syncScopes: z.array(RemoteSyncScopeSchema).min(1).default(["commits", "branches"]),
  acknowledgedConflictIds: z.array(z.string().min(1).max(200)).default([]),
});

export const ImportRemoteProjectSchema = ImportGiteaProjectSchema;

export const ProjectRemoteBindingSchema = z.object({
  projectId: IdSchema,
  connectionId: z.string().uuid(),
  provider: RemoteProviderSchema,
  baseUrl: z.string().url(),
  owner: z.string().min(1).max(200),
  repo: z.string().min(1).max(200),
  fullName: z.string().min(3).max(401),
  defaultBranch: z.string().max(500),
  htmlUrl: z.string().url(),
  cloneUrl: z.string().url(),
  syncScopes: z.array(RemoteSyncScopeSchema),
  syncStatus: RemoteSyncStatusSchema,
  lastSyncedAt: NullableDateTimeSchema,
  lastSyncError: z.string().max(2_000).nullable(),
  webhookEnabled: z.boolean(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const RemoteImportConflictSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(["project_name", "remote_already_bound", "project_already_bound", "default_branch_mismatch", "worktree_branch_collision"]),
  severity: z.enum(["warning", "blocking"]),
  message: z.string().min(1).max(2_000),
  relatedProjectId: IdSchema.nullable(),
});

export const PreviewRemoteImportSchema = z.object({
  connectionId: z.string().uuid(),
  fullName: z.string().trim().min(3).max(401).refine((value) => value.split("/").length === 2 && value.split("/").every(Boolean), "仓库名称必须为 owner/repo"),
  projectName: z.string().trim().min(1).max(200),
  projectId: IdSchema.optional(),
  syncScopes: z.array(RemoteSyncScopeSchema).min(1).default(["commits", "branches"]),
});

export const RemoteImportPreviewSchema = z.object({
  repository: RemoteRepositorySchema,
  provider: RemoteProviderSchema,
  syncScopes: z.array(RemoteSyncScopeSchema),
  conflicts: z.array(RemoteImportConflictSchema),
  canImport: z.boolean(),
});

export const RemoteSyncItemSchema = z.object({
  id: z.string().uuid(),
  projectId: IdSchema,
  scope: RemoteSyncScopeSchema,
  externalId: z.string().min(1).max(500),
  title: z.string().max(2_000),
  state: z.string().max(100),
  url: z.string().url().nullable(),
  remoteUpdatedAt: NullableDateTimeSchema,
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const RemoteSyncJobSchema = z.object({
  id: z.string().uuid(),
  projectId: IdSchema,
  status: RemoteSyncStatusSchema,
  scopes: z.array(RemoteSyncScopeSchema),
  attempt: z.number().int().min(1),
  maxAttempts: z.number().int().min(1),
  progressCurrent: z.number().int().nonnegative(),
  progressTotal: z.number().int().nonnegative(),
  error: z.string().max(2_000).nullable(),
  trigger: z.enum(["manual", "import", "webhook", "retry"]),
  createdAt: DateTimeSchema,
  startedAt: NullableDateTimeSchema,
  completedAt: NullableDateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const ConfigureWebhookSchema = z.object({ enabled: z.boolean() });
export const WebhookConfigurationSchema = z.object({
  projectId: IdSchema,
  provider: RemoteProviderSchema,
  enabled: z.boolean(),
  endpointPath: z.string().min(1),
  secret: z.string().min(32).nullable(),
  secretHint: z.string().max(16).nullable(),
});

export const WebhookDeliverySchema = z.object({
  id: z.string().uuid(),
  projectId: IdSchema,
  provider: RemoteProviderSchema,
  deliveryId: z.string().min(1).max(500),
  event: z.string().min(1).max(200),
  signatureValid: z.boolean(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(["accepted", "rejected", "duplicate", "failed"]),
  error: z.string().max(2_000).nullable(),
  syncJobId: z.string().uuid().nullable(),
  receivedAt: DateTimeSchema,
  processedAt: NullableDateTimeSchema,
});

export type ConnectGiteaInput = z.infer<typeof ConnectGiteaSchema>;
export type ConnectGitHubInput = z.infer<typeof ConnectGitHubSchema>;
export type RemoteConnection = z.infer<typeof RemoteConnectionSchema>;
export type RemoteRepository = z.infer<typeof RemoteRepositorySchema>;
export type ListRemoteRepositoriesQuery = z.infer<typeof ListRemoteRepositoriesQuerySchema>;
export type RemoteRepositoryPage = z.infer<typeof RemoteRepositoryPageSchema>;
export type BindProjectRemoteInput = z.infer<typeof BindProjectRemoteSchema>;
export type ImportGiteaProjectInput = z.infer<typeof ImportGiteaProjectSchema>;
export type ImportRemoteProjectInput = z.infer<typeof ImportRemoteProjectSchema>;
export type ProjectRemoteBinding = z.infer<typeof ProjectRemoteBindingSchema>;
export type RemoteProvider = z.infer<typeof RemoteProviderSchema>;
export type RemoteSyncScope = z.infer<typeof RemoteSyncScopeSchema>;
export type RemoteImportConflict = z.infer<typeof RemoteImportConflictSchema>;
export type PreviewRemoteImportInput = z.infer<typeof PreviewRemoteImportSchema>;
export type RemoteImportPreview = z.infer<typeof RemoteImportPreviewSchema>;
export type RemoteSyncItem = z.infer<typeof RemoteSyncItemSchema>;
export type RemoteSyncJob = z.infer<typeof RemoteSyncJobSchema>;
export type ConfigureWebhookInput = z.infer<typeof ConfigureWebhookSchema>;
export type WebhookConfiguration = z.infer<typeof WebhookConfigurationSchema>;
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;
