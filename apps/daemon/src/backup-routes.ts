import { BackupPathInputSchema, CreateBackupInputSchema, RestoreBackupInputSchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { BackupService } from "./backup-service.js";

export async function registerBackupRoutes(app: FastifyInstance, backups: BackupService) {
  app.get("/api/backups", async () => backups.list());
  app.post("/api/backups", async (request, reply) => reply.code(201).send(await backups.create(CreateBackupInputSchema.parse(request.body).label)));
  app.post("/api/backups/import", async (request, reply) => reply.code(201).send(await backups.import(BackupPathInputSchema.parse(request.body).directory)));
  app.post<{ Params: { backupId: string } }>("/api/backups/:backupId/export", async (request) => backups.export(request.params.backupId, BackupPathInputSchema.parse(request.body).directory));
  app.post<{ Params: { backupId: string } }>("/api/backups/:backupId/restore-preflight", async (request) => backups.preflightRestore(request.params.backupId));
  app.post<{ Params: { backupId: string } }>("/api/backups/:backupId/restore", async (request, reply) => reply.code(202).send(await backups.scheduleRestore(request.params.backupId, RestoreBackupInputSchema.parse(request.body).confirmationToken)));
  app.delete<{ Params: { backupId: string } }>("/api/backups/:backupId", async (request, reply) => {
    await backups.delete(request.params.backupId);
    return reply.code(204).send();
  });
}
