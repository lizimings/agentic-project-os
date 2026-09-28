import { CanvasKindSchema, SaveCanvasDocumentSchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { actorFromRequest, correlationIdFromRequest } from "./actor.js";
import { CanvasService } from "./canvas-service.js";

export async function registerCanvasRoutes(app: FastifyInstance, canvas: CanvasService) {
  app.get<{ Params: { projectId: string; kind: string } }>("/api/projects/:projectId/canvases/:kind", async (request) => {
    const kind = CanvasKindSchema.parse(request.params.kind);
    return canvas.getOrCreate(request.params.projectId, kind, actorFromRequest(request), correlationIdFromRequest(request));
  });

  app.put<{ Params: { projectId: string; kind: string } }>("/api/projects/:projectId/canvases/:kind", async (request) => {
    const kind = CanvasKindSchema.parse(request.params.kind);
    const input = SaveCanvasDocumentSchema.parse(request.body);
    return canvas.save(request.params.projectId, kind, input, actorFromRequest(request), correlationIdFromRequest(request));
  });
}
