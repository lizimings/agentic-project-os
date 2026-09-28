import { ProjectEventLogQuerySchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { EventLogService } from "./event-log-service.js";

const DigestQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  utcOffsetMinutes: z.coerce.number().int().min(-720).max(840).default(0),
});
const ExportQuerySchema = ProjectEventLogQuerySchema.omit({ projectId: true, limit: true }).extend({ format: z.enum(["json", "markdown"]).default("markdown") });

export async function registerEventLogRoutes(app: FastifyInstance, logs: EventLogService) {
  app.get("/api/event-log", async (request) => logs.list(ProjectEventLogQuerySchema.parse(request.query)));
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/digest", async (request) => {
    const query = DigestQuerySchema.parse(request.query);
    return logs.digest(request.params.projectId, query.date, query.utcOffsetMinutes);
  });
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/logs/export", async (request, reply) => {
    const query = ExportQuerySchema.parse(request.query);
    const body = await logs.export(request.params.projectId, { ...query, projectId: request.params.projectId, limit: 500 }, query.format);
    const extension = query.format === "json" ? "json" : "md";
    return reply.type(query.format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8")
      .header("Content-Disposition", `attachment; filename=project-log-${request.params.projectId}.${extension}`)
      .send(body);
  });
}
