import { GlobalSearchQuerySchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { SearchService } from "./search-service.js";

export async function registerSearchRoutes(app: FastifyInstance, search: SearchService) {
  app.get("/api/search", async (request) => search.search(GlobalSearchQuerySchema.parse(request.query)));
}
