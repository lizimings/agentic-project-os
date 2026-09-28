import type { ProjectRemoteBinding, RemoteConnection, RemoteProvider, RemoteRepository, RemoteSyncItem, RemoteSyncJob, RemoteSyncScope, WebhookDelivery } from "@pcc/contracts";
import type { DatabaseExecutor, PccDatabase } from "./types.js";

function connectionFromRow(row: {
  id: string; provider: string; base_url: string; username: string; instance_version: string | null;
  status: string; token_hint: string; last_validated_at: string | null; last_error: string | null;
  created_at: string; updated_at: string;
}): RemoteConnection {
  return {
    id: row.id,
    provider: row.provider as RemoteConnection["provider"],
    baseUrl: row.base_url,
    username: row.username,
    instanceVersion: row.instance_version,
    status: row.status as RemoteConnection["status"],
    tokenHint: row.token_hint,
    lastValidatedAt: row.last_validated_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bindingFromRow(row: {
  project_id: string; connection_id: string; provider: string; base_url: string;
  owner: string; repo: string; full_name: string; default_branch: string; html_url: string;
  clone_url: string; created_at: string; updated_at: string;
  sync_scopes_json: string; sync_status: string; last_synced_at: string | null; last_sync_error: string | null;
  webhook_enabled: number;
}): ProjectRemoteBinding {
  return {
    projectId: row.project_id,
    connectionId: row.connection_id,
    provider: row.provider as ProjectRemoteBinding["provider"],
    baseUrl: row.base_url,
    owner: row.owner,
    repo: row.repo,
    fullName: row.full_name,
    defaultBranch: row.default_branch,
    htmlUrl: row.html_url,
    cloneUrl: row.clone_url,
    syncScopes: JSON.parse(row.sync_scopes_json) as RemoteSyncScope[],
    syncStatus: row.sync_status as ProjectRemoteBinding["syncStatus"],
    lastSyncedAt: row.last_synced_at,
    lastSyncError: row.last_sync_error,
    webhookEnabled: Boolean(row.webhook_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SaveRemoteConnectionInput {
  id: string;
  provider: RemoteProvider;
  baseUrl: string;
  username: string;
  instanceVersion: string | null;
  encryptedToken: string;
  tokenHint: string;
  validatedAt: string;
}

export class RemoteRepositoryStore {
  constructor(private readonly db: PccDatabase) {}

  get database() {
    return this.db;
  }

  async getConnection(provider: RemoteProvider = "gitea", executor: DatabaseExecutor = this.db): Promise<RemoteConnection | undefined> {
    const row = await executor.selectFrom("remote_connections").selectAll().where("provider", "=", provider).executeTakeFirst();
    return row ? connectionFromRow(row) : undefined;
  }

  async getConnectionById(id: string, executor: DatabaseExecutor = this.db): Promise<RemoteConnection | undefined> {
    const row = await executor.selectFrom("remote_connections").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? connectionFromRow(row) : undefined;
  }

  async getEncryptedToken(id: string, executor: DatabaseExecutor = this.db) {
    return (await executor.selectFrom("remote_connections").select("encrypted_token").where("id", "=", id).executeTakeFirst())?.encrypted_token;
  }

  async saveConnection(input: SaveRemoteConnectionInput, executor: DatabaseExecutor = this.db) {
    const existing = await executor.selectFrom("remote_connections").select("created_at").where("provider", "=", input.provider).executeTakeFirst();
    const now = input.validatedAt;
    await executor.insertInto("remote_connections").values({
      id: input.id,
      provider: input.provider,
      base_url: input.baseUrl,
      username: input.username,
      instance_version: input.instanceVersion,
      status: "connected",
      encrypted_token: input.encryptedToken,
      token_hint: input.tokenHint,
      last_validated_at: now,
      last_error: null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }).onConflict((conflict) => conflict.column("provider").doUpdateSet({
      id: input.id,
      base_url: input.baseUrl,
      username: input.username,
      instance_version: input.instanceVersion,
      status: "connected",
      encrypted_token: input.encryptedToken,
      token_hint: input.tokenHint,
      last_validated_at: now,
      last_error: null,
      updated_at: now,
    })).execute();
    return this.getConnection(input.provider, executor);
  }

  async markValidated(id: string, version: string | null, username: string, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.updateTable("remote_connections").set({ status: "connected", instance_version: version, username, last_validated_at: now, last_error: null, updated_at: now }).where("id", "=", id).execute();
    return this.getConnectionById(id, executor);
  }

  async removeConnection(id: string, executor: DatabaseExecutor = this.db) {
    await executor.deleteFrom("remote_connections").where("id", "=", id).execute();
  }

  async getProjectBinding(projectId: string, executor: DatabaseExecutor = this.db): Promise<ProjectRemoteBinding | undefined> {
    const row = await executor.selectFrom("project_remote_bindings as binding")
      .innerJoin("remote_connections as connection", "connection.id", "binding.connection_id")
      .select([
        "binding.project_id", "binding.connection_id", "connection.provider", "connection.base_url",
        "binding.owner", "binding.repo", "binding.full_name", "binding.default_branch", "binding.html_url",
        "binding.clone_url", "binding.sync_scopes_json", "binding.sync_status", "binding.last_synced_at", "binding.last_sync_error", "binding.webhook_enabled", "binding.created_at", "binding.updated_at",
      ]).where("binding.project_id", "=", projectId).executeTakeFirst();
    return row ? bindingFromRow(row) : undefined;
  }

  async bindProject(projectId: string, connectionId: string, remote: RemoteRepository, syncScopes: RemoteSyncScope[] = ["commits", "branches"], executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    const existing = await executor.selectFrom("project_remote_bindings").select("created_at").where("project_id", "=", projectId).executeTakeFirst();
    await executor.insertInto("project_remote_bindings").values({
      project_id: projectId,
      connection_id: connectionId,
      owner: remote.owner,
      repo: remote.name,
      full_name: remote.fullName,
      default_branch: remote.defaultBranch,
      html_url: remote.htmlUrl,
      clone_url: remote.cloneUrl,
      sync_scopes_json: JSON.stringify(syncScopes),
      sync_status: "idle",
      last_synced_at: null,
      last_sync_error: null,
      webhook_enabled: 0,
      encrypted_webhook_secret: null,
      webhook_secret_hint: null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }).onConflict((conflict) => conflict.column("project_id").doUpdateSet({
      connection_id: connectionId,
      owner: remote.owner,
      repo: remote.name,
      full_name: remote.fullName,
      default_branch: remote.defaultBranch,
      html_url: remote.htmlUrl,
      clone_url: remote.cloneUrl,
      sync_scopes_json: JSON.stringify(syncScopes),
      sync_status: "idle",
      last_sync_error: null,
      updated_at: now,
    })).execute();
    return this.getProjectBinding(projectId, executor);
  }

  async unbindProject(projectId: string, executor: DatabaseExecutor = this.db) {
    await executor.deleteFrom("project_remote_bindings").where("project_id", "=", projectId).execute();
  }

  async findBindingByRemote(connectionId: string, fullName: string, executor: DatabaseExecutor = this.db) {
    return executor.selectFrom("project_remote_bindings").select("project_id").where("connection_id", "=", connectionId).where("full_name", "=", fullName).executeTakeFirst();
  }

  async updateBindingSync(projectId: string, update: { status: ProjectRemoteBinding["syncStatus"]; lastSyncedAt?: string | null; lastSyncError?: string | null }, executor: DatabaseExecutor = this.db) {
    const values: Record<string, string | null> = { sync_status: update.status, updated_at: new Date().toISOString() };
    if (update.lastSyncedAt !== undefined) values.last_synced_at = update.lastSyncedAt;
    if (update.lastSyncError !== undefined) values.last_sync_error = update.lastSyncError;
    await executor.updateTable("project_remote_bindings").set(values).where("project_id", "=", projectId).execute();
    return this.getProjectBinding(projectId, executor);
  }

  async configureWebhook(projectId: string, input: { enabled: boolean; encryptedSecret: string | null; secretHint: string | null }, executor: DatabaseExecutor = this.db) {
    await executor.updateTable("project_remote_bindings").set({ webhook_enabled: input.enabled ? 1 : 0, encrypted_webhook_secret: input.encryptedSecret, webhook_secret_hint: input.secretHint, updated_at: new Date().toISOString() }).where("project_id", "=", projectId).execute();
    return this.getProjectBinding(projectId, executor);
  }

  async getWebhookSecret(projectId: string, executor: DatabaseExecutor = this.db) {
    return executor.selectFrom("project_remote_bindings").select(["encrypted_webhook_secret", "webhook_secret_hint", "webhook_enabled"]).where("project_id", "=", projectId).executeTakeFirst();
  }

  private syncItemFromRow(row: { id: string; project_id: string; scope: string; external_id: string; title: string; state: string; url: string | null; remote_updated_at: string | null; payload_hash: string; created_at: string; updated_at: string }): RemoteSyncItem {
    return { id: row.id, projectId: row.project_id, scope: row.scope as RemoteSyncScope, externalId: row.external_id, title: row.title, state: row.state, url: row.url, remoteUpdatedAt: row.remote_updated_at, payloadHash: row.payload_hash, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async replaceSyncScope(projectId: string, scope: RemoteSyncScope, items: Array<{ id: string; externalId: string; title: string; state: string; url: string | null; remoteUpdatedAt: string | null; payloadHash: string; payloadJson: string }>, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.deleteFrom("remote_sync_items").where("project_id", "=", projectId).where("scope", "=", scope).execute();
    if (items.length) await executor.insertInto("remote_sync_items").values(items.map((item) => ({ id: item.id, project_id: projectId, scope, external_id: item.externalId, title: item.title, state: item.state, url: item.url, remote_updated_at: item.remoteUpdatedAt, payload_hash: item.payloadHash, payload_json: item.payloadJson, created_at: now, updated_at: now }))).execute();
  }

  async listSyncItems(projectId: string, scope?: RemoteSyncScope, executor: DatabaseExecutor = this.db) {
    let query = executor.selectFrom("remote_sync_items").selectAll().where("project_id", "=", projectId);
    if (scope) query = query.where("scope", "=", scope);
    return (await query.orderBy("remote_updated_at", "desc").orderBy("updated_at", "desc").execute()).map((row) => this.syncItemFromRow(row));
  }

  private syncJobFromRow(row: { id: string; project_id: string; status: string; scopes_json: string; attempt: number; max_attempts: number; progress_current: number; progress_total: number; error: string | null; trigger: string; created_at: string; started_at: string | null; completed_at: string | null; updated_at: string }): RemoteSyncJob {
    return { id: row.id, projectId: row.project_id, status: row.status as RemoteSyncJob["status"], scopes: JSON.parse(row.scopes_json), attempt: row.attempt, maxAttempts: row.max_attempts, progressCurrent: row.progress_current, progressTotal: row.progress_total, error: row.error, trigger: row.trigger as RemoteSyncJob["trigger"], createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at };
  }

  async createSyncJob(id: string, projectId: string, scopes: RemoteSyncScope[], trigger: RemoteSyncJob["trigger"], attempt = 1, maxAttempts = 3, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.insertInto("remote_sync_jobs").values({ id, project_id: projectId, status: "queued", scopes_json: JSON.stringify(scopes), attempt, max_attempts: maxAttempts, progress_current: 0, progress_total: scopes.length, error: null, trigger, created_at: now, started_at: null, completed_at: null, updated_at: now }).execute();
    return this.getSyncJob(id, executor);
  }

  async updateSyncJob(id: string, update: Partial<{ status: RemoteSyncJob["status"]; progressCurrent: number; progressTotal: number; error: string | null; startedAt: string | null; completedAt: string | null }>, executor: DatabaseExecutor = this.db) {
    const values: Record<string, string | number | null> = { updated_at: new Date().toISOString() };
    if (update.status !== undefined) values.status = update.status;
    if (update.progressCurrent !== undefined) values.progress_current = update.progressCurrent;
    if (update.progressTotal !== undefined) values.progress_total = update.progressTotal;
    if (update.error !== undefined) values.error = update.error;
    if (update.startedAt !== undefined) values.started_at = update.startedAt;
    if (update.completedAt !== undefined) values.completed_at = update.completedAt;
    await executor.updateTable("remote_sync_jobs").set(values).where("id", "=", id).execute();
    return this.getSyncJob(id, executor);
  }

  async getSyncJob(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("remote_sync_jobs").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.syncJobFromRow(row) : undefined;
  }

  async listSyncJobs(projectId: string, executor: DatabaseExecutor = this.db) {
    return (await executor.selectFrom("remote_sync_jobs").selectAll().where("project_id", "=", projectId).orderBy("created_at", "desc").limit(50).execute()).map((row) => this.syncJobFromRow(row));
  }

  private deliveryFromRow(row: { id: string; project_id: string; provider: string; delivery_id: string; event: string; signature_valid: number; payload_hash: string; status: string; error: string | null; sync_job_id: string | null; received_at: string; processed_at: string | null }): WebhookDelivery {
    return { id: row.id, projectId: row.project_id, provider: row.provider as RemoteProvider, deliveryId: row.delivery_id, event: row.event, signatureValid: Boolean(row.signature_valid), payloadHash: row.payload_hash, status: row.status as WebhookDelivery["status"], error: row.error, syncJobId: row.sync_job_id, receivedAt: row.received_at, processedAt: row.processed_at };
  }

  async getDelivery(projectId: string, provider: RemoteProvider, deliveryId: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("webhook_deliveries").selectAll().where("project_id", "=", projectId).where("provider", "=", provider).where("delivery_id", "=", deliveryId).executeTakeFirst();
    return row ? this.deliveryFromRow(row) : undefined;
  }

  async createDelivery(input: { id: string; projectId: string; provider: RemoteProvider; deliveryId: string; event: string; signatureValid: boolean; payloadHash: string; status: WebhookDelivery["status"]; error: string | null; syncJobId: string | null; receivedAt: string; processedAt: string | null }, executor: DatabaseExecutor = this.db) {
    await executor.insertInto("webhook_deliveries").values({ id: input.id, project_id: input.projectId, provider: input.provider, delivery_id: input.deliveryId, event: input.event, signature_valid: input.signatureValid ? 1 : 0, payload_hash: input.payloadHash, status: input.status, error: input.error, sync_job_id: input.syncJobId, received_at: input.receivedAt, processed_at: input.processedAt }).execute();
    return this.getDelivery(input.projectId, input.provider, input.deliveryId, executor);
  }

  async updateDelivery(id: string, update: { status?: WebhookDelivery["status"]; error?: string | null; syncJobId?: string | null; processedAt?: string | null }, executor: DatabaseExecutor = this.db) {
    const values: Record<string, string | null> = {};
    if (update.status !== undefined) values.status = update.status;
    if (update.error !== undefined) values.error = update.error;
    if (update.syncJobId !== undefined) values.sync_job_id = update.syncJobId;
    if (update.processedAt !== undefined) values.processed_at = update.processedAt;
    await executor.updateTable("webhook_deliveries").set(values).where("id", "=", id).execute();
    const row = await executor.selectFrom("webhook_deliveries").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.deliveryFromRow(row) : undefined;
  }

  async listDeliveries(projectId: string, executor: DatabaseExecutor = this.db) {
    return (await executor.selectFrom("webhook_deliveries").selectAll().where("project_id", "=", projectId).orderBy("received_at", "desc").limit(100).execute()).map((row) => this.deliveryFromRow(row));
  }
}
