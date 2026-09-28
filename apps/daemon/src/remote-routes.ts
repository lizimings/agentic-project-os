import {
  BindProjectRemoteSchema,
  ConfigureWebhookSchema,
  ConnectGiteaSchema,
  ConnectGitHubSchema,
  ImportRemoteProjectSchema,
  ListRemoteRepositoriesQuerySchema,
  PreviewRemoteImportSchema,
  RemoteProviderSchema,
  RemoteSyncScopeSchema,
} from "@pcc/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { actorFromRequest, correlationIdFromRequest } from "./actor.js";
import { RemoteService } from "./remote-service.js";

const ProviderParamsSchema = z.object({ provider: RemoteProviderSchema });
const ProjectParamsSchema = z.object({ projectId: z.string().min(1).max(200) });
const JobParamsSchema = z.object({ projectId: z.string().min(1).max(200), jobId: z.string().uuid() });
const SyncBodySchema = z.object({ scopes: z.array(RemoteSyncScopeSchema).min(1).optional() }).default({});
const SyncItemsQuerySchema = z.object({ scope: RemoteSyncScopeSchema.optional() });

function rawBodyFrom(request: FastifyRequest) {
  const captured = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
  return captured ?? Buffer.from(JSON.stringify(request.body ?? {}));
}

export async function registerRemoteRoutes(app: FastifyInstance, remote: RemoteService) {
  app.get<{ Params: { provider: string } }>("/api/integrations/:provider", async (request) => {
    const { provider } = ProviderParamsSchema.parse(request.params);
    return (await remote.getConnection(provider)) ?? null;
  });
  app.put<{ Params: { provider: string } }>("/api/integrations/:provider", async (request) => {
    const { provider } = ProviderParamsSchema.parse(request.params);
    const input = provider === "github" ? ConnectGitHubSchema.parse(request.body) : ConnectGiteaSchema.parse(request.body);
    return remote.connect(provider, input, actorFromRequest(request), correlationIdFromRequest(request));
  });
  app.post<{ Params: { provider: string } }>("/api/integrations/:provider/validate", async (request) => {
    const { provider } = ProviderParamsSchema.parse(request.params);
    return remote.validate(provider, actorFromRequest(request), correlationIdFromRequest(request));
  });
  app.delete<{ Params: { provider: string } }>("/api/integrations/:provider", async (request, reply) => {
    const { provider } = ProviderParamsSchema.parse(request.params);
    await remote.disconnect(provider, actorFromRequest(request), correlationIdFromRequest(request));
    return reply.code(204).send();
  });
  app.get<{ Params: { provider: string } }>("/api/integrations/:provider/repositories", async (request) => {
    const { provider } = ProviderParamsSchema.parse(request.params);
    return remote.listRepositories(provider, ListRemoteRepositoriesQuerySchema.parse(request.query));
  });

  app.post("/api/imports/remote/preflight", async (request) => remote.previewImport(PreviewRemoteImportSchema.parse(request.body)));
  app.post("/api/imports/remote", async (request, reply) => reply.code(201).send(await remote.importProject(ImportRemoteProjectSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request))));
  app.post("/api/imports/gitea", async (request, reply) => reply.code(201).send(await remote.importProject(ImportRemoteProjectSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request))));

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/remote", async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params);
    return (await remote.getProjectBinding(projectId)) ?? null;
  });
  app.put<{ Params: { projectId: string } }>("/api/projects/:projectId/remote", async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params);
    return remote.bindProject(projectId, BindProjectRemoteSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request));
  });
  app.delete<{ Params: { projectId: string } }>("/api/projects/:projectId/remote", async (request, reply) => {
    const { projectId } = ProjectParamsSchema.parse(request.params);
    await remote.unbindProject(projectId, actorFromRequest(request), correlationIdFromRequest(request));
    return reply.code(204).send();
  });
  app.post<{ Params: { projectId: string } }>("/api/projects/:projectId/remote/sync", async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params);
    const { scopes } = SyncBodySchema.parse(request.body ?? {});
    return remote.startSync(projectId, scopes, "manual", actorFromRequest(request), correlationIdFromRequest(request));
  });
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/remote/sync-jobs", async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params);
    return { items: await remote.listSyncJobs(projectId) };
  });
  app.post<{ Params: { projectId: string; jobId: string } }>("/api/projects/:projectId/remote/sync-jobs/:jobId/retry", async (request) => {
    const { jobId } = JobParamsSchema.parse(request.params);
    return remote.retrySync(jobId, actorFromRequest(request), correlationIdFromRequest(request));
  });
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/remote/items", async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params);
    const { scope } = SyncItemsQuerySchema.parse(request.query);
    return { items: await remote.listSyncItems(projectId, scope) };
  });

  app.put<{ Params: { projectId: string } }>("/api/projects/:projectId/webhook", async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params);
    const { enabled } = ConfigureWebhookSchema.parse(request.body);
    return remote.configureWebhook(projectId, enabled);
  });
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/webhook/deliveries", async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params);
    return { items: await remote.listWebhookDeliveries(projectId) };
  });
  app.post<{ Params: { provider: string; projectId: string } }>("/api/webhooks/:provider/:projectId", async (request) => {
    const provider = RemoteProviderSchema.parse(request.params.provider);
    const projectId = z.string().min(1).max(200).parse(request.params.projectId);
    const deliveryId = String(request.headers[provider === "github" ? "x-github-delivery" : "x-gitea-delivery"] ?? request.headers["x-github-delivery"] ?? "missing-delivery-id");
    const event = String(request.headers[provider === "github" ? "x-github-event" : "x-gitea-event"] ?? request.headers["x-github-event"] ?? "unknown");
    const signature = String(request.headers[provider === "github" ? "x-hub-signature-256" : "x-gitea-signature"] ?? request.headers["x-hub-signature-256"] ?? "");
    return remote.receiveWebhook({ projectId, provider, deliveryId, event, signature, rawBody: rawBodyFrom(request), actor: { type: "connector", id: provider }, correlationId: correlationIdFromRequest(request) });
  });
}
