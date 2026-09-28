import { KnowledgeGraphQuerySchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { KnowledgeGraphService } from "./knowledge-graph-service.js";

export async function registerKnowledgeGraphRoutes(app: FastifyInstance, graph: KnowledgeGraphService) {
  app.get("/api/knowledge-graph", async (request) => graph.get(KnowledgeGraphQuerySchema.parse(request.query)));
}
