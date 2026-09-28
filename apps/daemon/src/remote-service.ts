import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  BindProjectRemoteInput,
  ConnectGiteaInput,
  EventEnvelope,
  ImportRemoteProjectInput,
  ListRemoteRepositoriesQuery,
  PreviewRemoteImportInput,
  RemoteImportConflict,
  RemoteProvider,
  RemoteSyncJob,
  RemoteSyncScope,
  WebhookDelivery,
} from "@pcc/contracts";
import { CoreRepository, RemoteRepositoryStore } from "@pcc/database";
import { createCoreEvent, type CoreActor } from "@pcc/domain";
import { CoreService, EntityConflictError } from "./core-service.js";
import { EventBroker } from "./event-broker.js";
import { GiteaClient, RemoteApiError } from "./gitea-client.js";
import { GitHubClient } from "./github-client.js";
import { EntityNotFoundError } from "./inbox-service.js";
import type { RemoteClient, RemoteSyncPayload } from "./remote-client.js";
import type { SecretCipher } from "./secret-cipher.js";

const DEFAULT_SCOPES: RemoteSyncScope[] = ["commits", "branches"];

function splitFullName(fullName: string) {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw new RemoteApiError("仓库名称必须为 owner/repo", 400, "INVALID_REMOTE_REPOSITORY");
  return { owner, repo };
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

function hash(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function syncRow(projectId: string, payload: RemoteSyncPayload) {
  const payloadJson = JSON.stringify(payload.payload);
  return {
    id: randomUUID(),
    projectId,
    externalId: payload.externalId || hash(payloadJson).slice(0, 32),
    title: payload.title,
    state: payload.state,
    url: payload.url,
    remoteUpdatedAt: payload.remoteUpdatedAt,
    payloadHash: hash(payloadJson),
    payloadJson,
  };
}

export class RemoteService {
  constructor(
    private readonly repository: RemoteRepositoryStore,
    private readonly coreRepository: CoreRepository,
    private readonly core: CoreService,
    private readonly events: EventBroker,
    private readonly secrets: SecretCipher,
  ) {}

  private publish(events: EventEnvelope[]) {
    events.forEach((event) => this.events.publish(event));
  }

  getConnection(provider: RemoteProvider = "gitea") {
    return this.repository.getConnection(provider);
  }

  private makeClient(provider: RemoteProvider, baseUrl: string, token: string): RemoteClient {
    return provider === "github" ? new GitHubClient(baseUrl, token) : new GiteaClient(baseUrl, token);
  }

  private async clientFor(provider?: RemoteProvider, connectionId?: string) {
    const connection = connectionId
      ? await this.repository.getConnectionById(connectionId)
      : await this.repository.getConnection(provider ?? "gitea");
    if (!connection) throw new EntityNotFoundError("RemoteConnection", connectionId ?? provider ?? "gitea");
    if (provider && connection.provider !== provider) throw new EntityConflictError(`连接 ${connection.id} 不属于 ${provider}`);
    const encryptedToken = await this.repository.getEncryptedToken(connection.id);
    if (!encryptedToken) throw new EntityNotFoundError("RemoteSecret", connection.id);
    const token = await this.secrets.decrypt(encryptedToken);
    return { connection, client: this.makeClient(connection.provider, connection.baseUrl, token) };
  }

  async connect(provider: RemoteProvider, input: ConnectGiteaInput, actor: CoreActor, correlationId: string) {
    const client = this.makeClient(provider, input.baseUrl, input.token);
    const identity = await client.validate();
    const current = await this.repository.getConnection(provider);
    const id = current?.id ?? randomUUID();
    const encryptedToken = await this.secrets.encrypt(input.token);
    const tokenHint = input.token.slice(-4).padStart(4, "•");
    const event = createCoreEvent("integration", id, "connected", actor, correlationId, {
      provider,
      baseUrl: identity.baseUrl,
      username: identity.username,
      instanceVersion: identity.version,
      tokenHint,
    });
    const connection = await this.repository.database.transaction().execute(async (transaction) => {
      const saved = await this.repository.saveConnection({
        id,
        provider,
        baseUrl: identity.baseUrl,
        username: identity.username,
        instanceVersion: identity.version,
        encryptedToken,
        tokenHint,
        validatedAt: event.occurredAt,
      }, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return saved;
    });
    if (!connection) throw new EntityNotFoundError("RemoteConnection", id);
    this.publish([event]);
    return connection;
  }

  async validate(provider: RemoteProvider, actor: CoreActor, correlationId: string) {
    const { connection, client } = await this.clientFor(provider);
    const identity = await client.validate();
    const event = createCoreEvent("integration", connection.id, "validated", actor, correlationId, {
      provider,
      username: identity.username,
      instanceVersion: identity.version,
    });
    const updated = await this.repository.database.transaction().execute(async (transaction) => {
      const saved = await this.repository.markValidated(connection.id, identity.version, identity.username, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return saved;
    });
    if (!updated) throw new EntityNotFoundError("RemoteConnection", connection.id);
    this.publish([event]);
    return updated;
  }

  async disconnect(provider: RemoteProvider, actor: CoreActor, correlationId: string) {
    const connection = await this.repository.getConnection(provider);
    if (!connection) throw new EntityNotFoundError("RemoteConnection", provider);
    const event = createCoreEvent("integration", connection.id, "disconnected", actor, correlationId, { provider, baseUrl: connection.baseUrl });
    await this.repository.database.transaction().execute(async (transaction) => {
      await this.repository.removeConnection(connection.id, transaction);
      await this.coreRepository.appendEvent(event, transaction);
    });
    this.publish([event]);
  }

  async listRepositories(provider: RemoteProvider, query: ListRemoteRepositoriesQuery) {
    const { client } = await this.clientFor(provider);
    return client.listRepositories(query);
  }

  getProjectBinding(projectId: string) {
    return this.repository.getProjectBinding(projectId);
  }

  async previewImport(input: PreviewRemoteImportInput) {
    const { connection, client } = await this.clientFor(undefined, input.connectionId);
    const { owner, repo } = splitFullName(input.fullName);
    const remote = await client.getRepository(owner, repo);
    const projects = await this.coreRepository.listProjects();
    const conflicts: RemoteImportConflict[] = [];
    const sameName = projects.find((project) => project.name.trim().toLocaleLowerCase() === input.projectName.trim().toLocaleLowerCase() && project.id !== input.projectId);
    if (sameName) {
      conflicts.push({
        id: `project-name:${sameName.id}`,
        type: "project_name",
        severity: "blocking",
        message: `已有同名项目“${sameName.name}”，请选择已有项目绑定或修改名称。`,
        relatedProjectId: sameName.id,
      });
    }
    const remoteBinding = await this.repository.findBindingByRemote(connection.id, remote.fullName);
    if (remoteBinding && remoteBinding.project_id !== input.projectId) {
      conflicts.push({
        id: `remote-bound:${remoteBinding.project_id}`,
        type: "remote_already_bound",
        severity: "blocking",
        message: `${remote.fullName} 已绑定到另一个项目。`,
        relatedProjectId: remoteBinding.project_id,
      });
    }
    if (input.projectId) {
      const [currentBinding, workspace, branchCollision] = await Promise.all([
        this.repository.getProjectBinding(input.projectId),
        this.repository.database.selectFrom("workspace_bindings").select(["branch"]).where("project_id", "=", input.projectId).executeTakeFirst(),
        this.repository.database.selectFrom("worktree_snapshots").select(["id", "branch"]).where("project_id", "=", input.projectId).where("branch", "=", remote.defaultBranch).executeTakeFirst(),
      ]);
      if (currentBinding && (currentBinding.connectionId !== connection.id || currentBinding.fullName !== remote.fullName)) {
        conflicts.push({
          id: `project-bound:${input.projectId}`,
          type: "project_already_bound",
          severity: "blocking",
          message: `当前项目已绑定 ${currentBinding.fullName}。`,
          relatedProjectId: input.projectId,
        });
      }
      if (workspace?.branch && remote.defaultBranch && workspace.branch !== remote.defaultBranch) {
        conflicts.push({
          id: `default-branch:${input.projectId}`,
          type: "default_branch_mismatch",
          severity: "warning",
          message: `本地当前分支为 ${workspace.branch}，远程默认分支为 ${remote.defaultBranch}。`,
          relatedProjectId: input.projectId,
        });
      }
      if (branchCollision) {
        conflicts.push({
          id: `worktree-branch:${branchCollision.id}`,
          type: "worktree_branch_collision",
          severity: "warning",
          message: `本地已有 ${remote.defaultBranch} 工作树；后续创建工作树时将复用现有分支。`,
          relatedProjectId: input.projectId,
        });
      }
    }
    return {
      repository: remote,
      provider: connection.provider,
      syncScopes: input.syncScopes,
      conflicts,
      canImport: !conflicts.some((conflict) => conflict.severity === "blocking"),
    };
  }

  async bindProject(projectId: string, input: BindProjectRemoteInput, actor: CoreActor, correlationId: string) {
    const project = await this.core.getProject(projectId);
    const preview = await this.previewImport({
      connectionId: input.connectionId,
      fullName: input.fullName,
      projectName: project.name,
      projectId,
      syncScopes: input.syncScopes,
    });
    const blocking = preview.conflicts.filter((conflict) => conflict.severity === "blocking");
    if (blocking.length) throw new EntityConflictError(blocking.map((conflict) => conflict.message).join(" "));
    const event = createCoreEvent("remote_repository", projectId, "bound", actor, correlationId, {
      connectionId: input.connectionId,
      provider: preview.provider,
      fullName: preview.repository.fullName,
      defaultBranch: preview.repository.defaultBranch,
      syncScopes: input.syncScopes,
    });
    const binding = await this.repository.database.transaction().execute(async (transaction) => {
      const saved = await this.repository.bindProject(projectId, input.connectionId, preview.repository, input.syncScopes, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return saved;
    });
    if (!binding) throw new EntityNotFoundError("ProjectRemoteBinding", projectId);
    this.publish([event]);
    return binding;
  }

  async importProject(input: ImportRemoteProjectInput, actor: CoreActor, correlationId: string) {
    const preview = await this.previewImport({
      connectionId: input.connectionId,
      fullName: input.fullName,
      projectName: input.project.name,
      syncScopes: input.syncScopes,
    });
    const acknowledged = new Set(input.acknowledgedConflictIds);
    const outstanding = preview.conflicts.filter((conflict) => conflict.severity === "blocking" && !acknowledged.has(conflict.id));
    if (outstanding.length) throw new EntityConflictError(`请先确认导入冲突：${outstanding.map((conflict) => conflict.message).join(" ")}`);
    const projectId = randomUUID();
    const projectEvent = createCoreEvent("project", projectId, "created", actor, correlationId, {
      name: input.project.name,
      provider: preview.provider,
      importedFrom: preview.repository.fullName,
    });
    const bindingEvent = createCoreEvent("remote_repository", projectId, "bound", actor, correlationId, {
      connectionId: input.connectionId,
      provider: preview.provider,
      fullName: preview.repository.fullName,
      defaultBranch: preview.repository.defaultBranch,
      syncScopes: input.syncScopes,
    });
    const result = await this.repository.database.transaction().execute(async (transaction) => {
      const project = await this.coreRepository.createProject(projectId, input.project, transaction);
      const binding = await this.repository.bindProject(projectId, input.connectionId, preview.repository, input.syncScopes, transaction);
      await this.coreRepository.appendEvent(projectEvent, transaction);
      await this.coreRepository.appendEvent(bindingEvent, transaction);
      return { project, binding };
    });
    if (!result.project || !result.binding) throw new EntityNotFoundError("ImportedProject", projectId);
    this.publish([projectEvent, bindingEvent]);
    const syncJob = await this.startSync(projectId, input.syncScopes, "import", actor, correlationId);
    return { ...result, syncJob, conflicts: preview.conflicts };
  }

  async unbindProject(projectId: string, actor: CoreActor, correlationId: string) {
    const binding = await this.repository.getProjectBinding(projectId);
    if (!binding) throw new EntityNotFoundError("ProjectRemoteBinding", projectId);
    const event = createCoreEvent("remote_repository", projectId, "unbound", actor, correlationId, { provider: binding.provider, fullName: binding.fullName });
    await this.repository.database.transaction().execute(async (transaction) => {
      await this.repository.unbindProject(projectId, transaction);
      await this.coreRepository.appendEvent(event, transaction);
    });
    this.publish([event]);
  }

  async startSync(
    projectId: string,
    scopes: RemoteSyncScope[] | undefined,
    trigger: RemoteSyncJob["trigger"],
    actor: CoreActor,
    correlationId: string,
  ) {
    const binding = await this.repository.getProjectBinding(projectId);
    if (!binding) throw new EntityNotFoundError("ProjectRemoteBinding", projectId);
    const selected = scopes?.length ? scopes : (binding.syncScopes.length ? binding.syncScopes : DEFAULT_SCOPES);
    const id = randomUUID();
    const job = await this.repository.createSyncJob(id, projectId, selected, trigger);
    if (!job) throw new EntityNotFoundError("RemoteSyncJob", id);
    return this.runSync(job, actor, correlationId);
  }

  private async runSync(job: RemoteSyncJob, actor: CoreActor, correlationId: string) {
    const binding = await this.repository.getProjectBinding(job.projectId);
    if (!binding) throw new EntityNotFoundError("ProjectRemoteBinding", job.projectId);
    const { client } = await this.clientFor(binding.provider, binding.connectionId);
    const startedAt = new Date().toISOString();
    await this.repository.updateBindingSync(job.projectId, { status: "running", lastSyncError: null });
    await this.repository.updateSyncJob(job.id, { status: "running", startedAt, progressCurrent: 0, progressTotal: job.scopes.length, error: null });
    try {
      let current = 0;
      for (const scope of job.scopes) {
        // 按范围独立拉取并落库，失败时已完成的范围保留，重试从下一个范围续跑。
        const groups = await client.syncRepository(binding.owner, binding.repo, [scope]);
        const rows = (groups.get(scope) ?? []).map((payload) => syncRow(job.projectId, payload));
        await this.repository.replaceSyncScope(job.projectId, scope, rows);
        current += 1;
        await this.repository.updateSyncJob(job.id, { progressCurrent: current });
      }
      const completedAt = new Date().toISOString();
      const event = createCoreEvent("remote_repository", job.projectId, "scanned", actor, correlationId, {
        provider: binding.provider,
        fullName: binding.fullName,
        jobId: job.id,
        trigger: job.trigger,
        scopes: job.scopes,
      });
      const completed = await this.repository.database.transaction().execute(async (transaction) => {
        await this.repository.updateBindingSync(job.projectId, { status: "succeeded", lastSyncedAt: completedAt, lastSyncError: null }, transaction);
        const updated = await this.repository.updateSyncJob(job.id, { status: "succeeded", progressCurrent: job.scopes.length, completedAt, error: null }, transaction);
        await this.coreRepository.appendEvent(event, transaction);
        return updated;
      });
      this.publish([event]);
      if (!completed) throw new EntityNotFoundError("RemoteSyncJob", job.id);
      return completed;
    } catch (error) {
      const message = errorMessage(error);
      const completedAt = new Date().toISOString();
      await this.repository.database.transaction().execute(async (transaction) => {
        await this.repository.updateBindingSync(job.projectId, { status: "failed", lastSyncError: message }, transaction);
        await this.repository.updateSyncJob(job.id, { status: "failed", error: message, completedAt }, transaction);
      });
      const failed = await this.repository.getSyncJob(job.id);
      if (!failed) throw new EntityNotFoundError("RemoteSyncJob", job.id);
      return failed;
    }
  }

  listSyncJobs(projectId: string) {
    return this.repository.listSyncJobs(projectId);
  }

  listSyncItems(projectId: string, scope?: RemoteSyncScope) {
    return this.repository.listSyncItems(projectId, scope);
  }

  async retrySync(jobId: string, actor: CoreActor, correlationId: string) {
    const job = await this.repository.getSyncJob(jobId);
    if (!job) throw new EntityNotFoundError("RemoteSyncJob", jobId);
    if (job.status !== "failed") throw new EntityConflictError("只有失败的同步任务可以重试");
    if (job.attempt >= job.maxAttempts) throw new EntityConflictError(`同步任务已达到最大重试次数 ${job.maxAttempts}`);
    const id = randomUUID();
    const remainingScopes = job.scopes.slice(job.progressCurrent);
    const retry = await this.repository.createSyncJob(id, job.projectId, remainingScopes.length ? remainingScopes : job.scopes, "retry", job.attempt + 1, job.maxAttempts);
    if (!retry) throw new EntityNotFoundError("RemoteSyncJob", id);
    return this.runSync(retry, actor, correlationId);
  }

  async configureWebhook(projectId: string, enabled: boolean) {
    const binding = await this.repository.getProjectBinding(projectId);
    if (!binding) throw new EntityNotFoundError("ProjectRemoteBinding", projectId);
    if (!enabled) {
      await this.repository.configureWebhook(projectId, { enabled: false, encryptedSecret: null, secretHint: null });
      return { projectId, provider: binding.provider, enabled: false, endpointPath: `/api/webhooks/${binding.provider}/${projectId}`, secret: null, secretHint: null };
    }
    const secret = randomBytes(32).toString("hex");
    const encryptedSecret = await this.secrets.encrypt(secret);
    const secretHint = secret.slice(-6);
    await this.repository.configureWebhook(projectId, { enabled: true, encryptedSecret, secretHint });
    return { projectId, provider: binding.provider, enabled: true, endpointPath: `/api/webhooks/${binding.provider}/${projectId}`, secret, secretHint };
  }

  listWebhookDeliveries(projectId: string) {
    return this.repository.listDeliveries(projectId);
  }

  private validSignature(provider: RemoteProvider, secret: string, rawBody: Buffer, signature: string) {
    const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
    const actual = provider === "github" ? signature.replace(/^sha256=/, "") : signature.replace(/^sha256=/, "");
    if (!/^[0-9a-f]{64}$/i.test(actual)) return false;
    return timingSafeEqual(Buffer.from(digest, "ascii"), Buffer.from(actual.toLowerCase(), "ascii"));
  }

  async receiveWebhook(input: {
    projectId: string;
    provider: RemoteProvider;
    deliveryId: string;
    event: string;
    signature: string;
    rawBody: Buffer;
    actor: CoreActor;
    correlationId: string;
  }): Promise<{ duplicate: boolean; delivery: WebhookDelivery; syncJob: RemoteSyncJob | null }> {
    const binding = await this.repository.getProjectBinding(input.projectId);
    if (!binding) throw new EntityNotFoundError("ProjectRemoteBinding", input.projectId);
    if (binding.provider !== input.provider) throw new EntityConflictError("Webhook 提供方与项目绑定不一致");
    const existing = await this.repository.getDelivery(input.projectId, input.provider, input.deliveryId);
    if (existing) return { duplicate: true, delivery: { ...existing, status: "duplicate" }, syncJob: existing.syncJobId ? await this.repository.getSyncJob(existing.syncJobId) ?? null : null };
    const secretRow = await this.repository.getWebhookSecret(input.projectId);
    if (!secretRow?.webhook_enabled || !secretRow.encrypted_webhook_secret) throw new RemoteApiError("该项目尚未启用 Webhook", 409, "WEBHOOK_DISABLED");
    const secret = await this.secrets.decrypt(secretRow.encrypted_webhook_secret);
    const signatureValid = this.validSignature(input.provider, secret, input.rawBody, input.signature);
    const now = new Date().toISOString();
    const delivery = await this.repository.createDelivery({
      id: randomUUID(),
      projectId: input.projectId,
      provider: input.provider,
      deliveryId: input.deliveryId,
      event: input.event,
      signatureValid,
      payloadHash: hash(input.rawBody),
      status: signatureValid ? "accepted" : "rejected",
      error: signatureValid ? null : "HMAC-SHA256 签名不匹配",
      syncJobId: null,
      receivedAt: now,
      processedAt: signatureValid ? null : now,
    });
    if (!delivery) throw new EntityNotFoundError("WebhookDelivery", input.deliveryId);
    if (!signatureValid) throw new RemoteApiError("Webhook 签名校验失败", 401, "INVALID_WEBHOOK_SIGNATURE");
    const syncJob = await this.startSync(input.projectId, binding.syncScopes, "webhook", input.actor, input.correlationId);
    const updated = await this.repository.updateDelivery(delivery.id, {
      status: syncJob.status === "failed" ? "failed" : "accepted",
      error: syncJob.error,
      syncJobId: syncJob.id,
      processedAt: new Date().toISOString(),
    });
    if (!updated) throw new EntityNotFoundError("WebhookDelivery", delivery.id);
    return { duplicate: false, delivery: updated, syncJob };
  }
}
