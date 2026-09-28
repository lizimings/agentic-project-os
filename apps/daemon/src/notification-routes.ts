import { NotificationQuerySchema, UpdateNotificationSchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { actorFromRequest, correlationIdFromRequest } from "./actor.js";
import { NotificationService } from "./notification-service.js";

export async function registerNotificationRoutes(app: FastifyInstance, notifications: NotificationService) {
  app.get("/api/notifications", async (request) => notifications.list(NotificationQuerySchema.parse(request.query)));
  app.patch<{ Params: { id: string } }>("/api/notifications/:id", async (request) => notifications.update(request.params.id, UpdateNotificationSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request)));
  app.post("/api/notifications/read-all", async (request) => notifications.readAll(actorFromRequest(request), correlationIdFromRequest(request)));
}
