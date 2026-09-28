import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { BatchInboxOperationSchema, CreateInboxItemSchema, CreateLinkedInboxItemSchema, UpdateInboxItemSchema } from "@pcc/contracts";
import { ActorRepository, AiSettingsRepository, CanvasRepository, CoreRepository, createDatabase, EventLogRepository, InboxRepository, migrateDatabase, NotificationRepository, OrganizerRepository, RemoteRepositoryStore, SearchRepository, seedDatabase, SettingsRepository, TimeRepository, WorkspaceRepository } from "@pcc/database";
import Fastify from "fastify";
import path from "node:path";
import { ZodError } from "zod";
import { actorFromRequest, correlationIdFromRequest } from "./actor.js";
import { registerCoreRoutes } from "./core-routes.js";
import { CoreService, EntityConflictError, InvalidHierarchyError } from "./core-service.js";
import { EventBroker } from "./event-broker.js";
import { EntityNotFoundError, InboxService } from "./inbox-service.js";
import { registerWorkspaceRoutes } from "./workspace-routes.js";
import { InvalidWorkspacePathError, WorktreeCommandError, WorkspaceService } from "./workspace-service.js";
import { RemoteApiError } from "./gitea-client.js";
import { registerRemoteRoutes } from "./remote-routes.js";
import { RemoteService } from "./remote-service.js";
import { EphemeralSecretCipher, LocalSecretCipher, type SecretCipher } from "./secret-cipher.js";
import { registerTimeRoutes } from "./time-routes.js";
import { InvalidTimeStateError, TimeService } from "./time-service.js";
import { registerSnapshotRoutes } from "./snapshot-routes.js";
import { SnapshotService } from "./snapshot-service.js";
import { OrganizerCoordinator } from "./organizer-coordinator.js";
import { registerOrganizerRoutes } from "./organizer-routes.js";
import { ProposalExecutionService } from "./proposal-execution-service.js";
import { registerCanvasRoutes } from "./canvas-routes.js";
import { CanvasConflictError, CanvasService } from "./canvas-service.js";
import { EventLogService } from "./event-log-service.js";
import { registerEventLogRoutes } from "./event-log-routes.js";
import { KnowledgeGraphService } from "./knowledge-graph-service.js";
import { registerKnowledgeGraphRoutes } from "./knowledge-graph-routes.js";
import { SearchService } from "./search-service.js";
import { registerSearchRoutes } from "./search-routes.js";
import { InvalidNotificationStateError, NotificationService } from "./notification-service.js";
import { registerNotificationRoutes } from "./notification-routes.js";
import { ActorService } from "./actor-service.js";
import { registerActorRoutes } from "./actor-routes.js";
import { AiService, AiServiceError } from "./ai-service.js";
import { registerAiRoutes } from "./ai-routes.js";
import { registerSettingsRoutes } from "./settings-routes.js";
import { SettingsService } from "./settings-service.js";
import { registerBackupRoutes } from "./backup-routes.js";
import { BackupService, BackupServiceError } from "./backup-service.js";

export interface ServerOptions {
  databaseFilename: string;
  logger?: boolean;
  seed?: boolean;
  secretCipher?: SecretCipher;
  organizerEnabled?: boolean;
  organizerDebounceMs?: number;
  workspaceWatchingEnabled?: boolean;
  workspaceWatchDebounceMs?: number;
  host?: string;
  port?: number;
}

export async function buildServer(options: ServerOptions) {
  const database = createDatabase({ filename: options.databaseFilename });
  await migrateDatabase(database);
  if (options.seed !== false) await seedDatabase(database);

  const repository = new InboxRepository(database);
  const coreRepository = new CoreRepository(database);
  const actorRepository = new ActorRepository(database);
  const broker = new EventBroker();
  const inbox = new InboxService(repository, coreRepository, broker);
  const core = new CoreService(coreRepository, broker, actorRepository);
  const actors = new ActorService(actorRepository, coreRepository, broker);
  const workspaceRepository = new WorkspaceRepository(database);
  const workspace = new WorkspaceService(workspaceRepository, coreRepository, core, broker, {
    watchingEnabled: options.workspaceWatchingEnabled ?? options.databaseFilename !== ":memory:",
    ...(options.workspaceWatchDebounceMs !== undefined ? { debounceMs: options.workspaceWatchDebounceMs } : {}),
  });
  const remoteRepository = new RemoteRepositoryStore(database);
  const secretCipher = options.secretCipher ?? (options.databaseFilename === ":memory:"
    ? new EphemeralSecretCipher()
    : new LocalSecretCipher(path.join(path.dirname(options.databaseFilename), "secret.key")));
  const remote = new RemoteService(remoteRepository, coreRepository, core, broker, secretCipher);
  const aiSettingsRepository = new AiSettingsRepository(database);
  const ai = new AiService(aiSettingsRepository, coreRepository, broker, secretCipher);
  const timeRepository = new TimeRepository(database);
  const time = new TimeService(timeRepository, coreRepository, core, broker);
  const canvasRepository = new CanvasRepository(database);
  const canvas = new CanvasService(canvasRepository, coreRepository, broker);
  const proposalExecution = new ProposalExecutionService(coreRepository, repository, timeRepository, canvas, broker);
  const eventLogRepository = new EventLogRepository(database);
  const eventLogs = new EventLogService(eventLogRepository, coreRepository);
  const knowledgeGraph = new KnowledgeGraphService(coreRepository);
  const searchRepository = new SearchRepository(database);
  const search = new SearchService(searchRepository);
  const notificationRepository = new NotificationRepository(database);
  const notifications = new NotificationService(notificationRepository, coreRepository, broker);
  const settingsRepository = new SettingsRepository(database);
  const settings = new SettingsService(settingsRepository, coreRepository, broker, {
    databaseFilename: options.databaseFilename,
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 4317,
    organizerEnabled: options.organizerEnabled ?? options.databaseFilename !== ":memory:",
    workspaceWatchingEnabled: options.workspaceWatchingEnabled ?? options.databaseFilename !== ":memory:",
  });
  const backups = new BackupService(options.databaseFilename);
  const snapshots = new SnapshotService(core, workspace, remote, time, inbox);
  const organizerRepository = new OrganizerRepository(database);
  const organizer = new OrganizerCoordinator(organizerRepository, snapshots, core, inbox, broker, undefined, {
    enabled: options.organizerEnabled ?? options.databaseFilename !== ":memory:",
    ...(options.organizerDebounceMs !== undefined ? { debounceMs: options.organizerDebounceMs } : {}),
  });
  const app = Fastify({ logger: options.logger ?? false });

  // Webhook HMAC 必须针对收到的原始字节计算。统一保留 JSON 原文，再交给现有路由使用解析后的对象。
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    (request as typeof request & { rawBody?: Buffer }).rawBody = rawBody;
    try {
      done(null, rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {});
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) callback(null, true);
      else callback(new Error("Origin 不在本地允许列表中"), false);
    },
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 20 * 1024 * 1024, fields: 4 },
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "projectd",
    version: "0.1.0",
    capabilities: { api: true, events: true, mcpStdio: true, mcpHttp: false },
  }));

  app.get("/api/inbox", async () => {
    const items = await inbox.list();
    return { items, total: items.length };
  });

  app.post("/api/inbox", async (request, reply) => {
    const input = CreateInboxItemSchema.parse(request.body);
    const item = await inbox.create(input, actorFromRequest(request), correlationIdFromRequest(request));
    return reply.code(201).send(item);
  });

  app.post("/api/inbox/capture", async (request, reply) => reply.code(201).send(await inbox.createLinked(CreateLinkedInboxItemSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request))));

  app.patch<{ Params: { id: string } }>("/api/inbox/:id", async (request) => {
    const input = UpdateInboxItemSchema.parse(request.body);
    return inbox.update(request.params.id, input, actorFromRequest(request), correlationIdFromRequest(request));
  });

  app.delete<{ Params: { id: string } }>("/api/inbox/:id", async (request, reply) => {
    await inbox.archive(request.params.id, actorFromRequest(request), correlationIdFromRequest(request));
    return reply.code(204).send();
  });

  app.post("/api/inbox/batch", async (request) => inbox.batch(BatchInboxOperationSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request)));

  app.get("/api/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
    const unsubscribe = broker.subscribe((event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const keepAlive = setInterval(() => reply.raw.write(": keep-alive\n\n"), 20_000);
    request.raw.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  await registerCoreRoutes(app, core, proposalExecution);
  await registerWorkspaceRoutes(app, workspace);
  await registerRemoteRoutes(app, remote);
  await registerTimeRoutes(app, time);
  await registerSnapshotRoutes(app, snapshots);
  await registerOrganizerRoutes(app, organizer, organizerRepository);
  await registerCanvasRoutes(app, canvas);
  await registerEventLogRoutes(app, eventLogs);
  await registerKnowledgeGraphRoutes(app, knowledgeGraph);
  await registerSearchRoutes(app, search);
  await registerNotificationRoutes(app, notifications);
  await registerActorRoutes(app, actors);
  await registerAiRoutes(app, ai);
  await registerSettingsRoutes(app, settings);
  await registerBackupRoutes(app, backups);
  await workspace.start();
  organizer.start();

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", message: "请求数据校验失败", issues: error.issues });
    }
    if (error instanceof EntityNotFoundError) {
      return reply.code(404).send({ error: "NOT_FOUND", message: error.message });
    }
    if (error instanceof EntityConflictError) {
      return reply.code(409).send({ error: "CONFLICT", message: error.message });
    }
    if (error instanceof InvalidHierarchyError) {
      return reply.code(400).send({ error: "INVALID_HIERARCHY", message: error.message });
    }
    if (error instanceof InvalidWorkspacePathError) {
      return reply.code(400).send({ error: "INVALID_WORKSPACE_PATH", message: error.message });
    }
    if (error instanceof WorktreeCommandError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof RemoteApiError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof InvalidTimeStateError) {
      return reply.code(400).send({ error: "INVALID_TIME_STATE", message: error.message });
    }
    if (error instanceof InvalidNotificationStateError) {
      return reply.code(400).send({ error: "INVALID_NOTIFICATION_STATE", message: error.message });
    }
    if (error instanceof CanvasConflictError) {
      return reply.code(409).send({ error: "CANVAS_CONFLICT", message: error.message });
    }
    if (error instanceof AiServiceError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof BackupServiceError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    const clientError = error as { statusCode?: number; code?: string; message?: string };
    if (clientError.statusCode && clientError.statusCode >= 400 && clientError.statusCode < 500) {
      return reply.code(clientError.statusCode).send({
        error: clientError.code || "BAD_REQUEST",
        message: clientError.message || "请求格式不正确",
      });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "INTERNAL_ERROR", message: "projectd 处理请求时发生错误" });
  });

  app.addHook("onClose", async () => {
    organizer.stop();
    await workspace.stop();
    await database.destroy();
  });

  return { app, database, repository, coreRepository, actorRepository, aiSettingsRepository, workspaceRepository, remoteRepository, timeRepository, canvasRepository, eventLogRepository, searchRepository, notificationRepository, settingsRepository, organizerRepository, organizer, backups, broker };
}
