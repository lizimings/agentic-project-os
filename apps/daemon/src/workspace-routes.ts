import { BindWorkspaceSchema, ConfirmWorktreeCreationSchema, PrepareWorktreeSchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { actorFromRequest, correlationIdFromRequest } from "./actor.js";
import { WorkspaceService } from "./workspace-service.js";

export async function registerWorkspaceRoutes(app: FastifyInstance, workspace: WorkspaceService) {
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/workspace", async (request) => {
    const binding = await workspace.get(request.params.projectId);
    return binding ?? null;
  });
  app.put<{ Params: { projectId: string } }>("/api/projects/:projectId/workspace", async (request) => workspace.bind(request.params.projectId, BindWorkspaceSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request)));
  app.post<{ Params: { projectId: string } }>("/api/projects/:projectId/workspace/scan", async (request) => workspace.scan(request.params.projectId, actorFromRequest(request), correlationIdFromRequest(request)));
  app.post<{ Params: { projectId: string } }>("/api/projects/:projectId/worktrees/preflight", async (request) => workspace.preflightWorktree(request.params.projectId, PrepareWorktreeSchema.parse(request.body)));
  app.post<{ Params: { projectId: string } }>("/api/projects/:projectId/worktrees", async (request, reply) => {
    const input = ConfirmWorktreeCreationSchema.parse(request.body);
    return reply.code(201).send(await workspace.createWorktree(request.params.projectId, input.confirmationToken, actorFromRequest(request), correlationIdFromRequest(request)));
  });
  app.delete<{ Params: { projectId: string } }>("/api/projects/:projectId/workspace", async (request, reply) => {
    await workspace.remove(request.params.projectId, actorFromRequest(request), correlationIdFromRequest(request));
    return reply.code(204).send();
  });
}
