import { SnapshotQuerySchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { SnapshotService } from "./snapshot-service.js";

export async function registerSnapshotRoutes(app: FastifyInstance, snapshots: SnapshotService) {
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/snapshot", async (request) => {
    return snapshots.getProjectSnapshot(request.params.projectId, SnapshotQuerySchema.parse(request.query));
  });
}
