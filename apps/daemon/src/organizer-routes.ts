import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { OrganizerCoordinator } from "./organizer-coordinator.js";
import { OrganizerRepository } from "@pcc/database";

export async function registerOrganizerRoutes(app: FastifyInstance, organizer: OrganizerCoordinator, repository: OrganizerRepository) {
  app.get("/api/organizer/status", async () => organizer.status());
  app.get("/api/organizer/runs", async (request) => {
    const query = z.object({ projectId: z.string().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
    const items = await repository.recent(query.projectId, query.limit);
    return { items, total: items.length };
  });
  app.post<{ Params: { projectId: string } }>("/api/organizer/run/:projectId", async (request) => organizer.runNow(request.params.projectId));
}
