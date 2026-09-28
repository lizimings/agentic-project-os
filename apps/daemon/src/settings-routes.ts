import { UpdateGlobalPreferencesSchema, UpdateProjectPolicySchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { actorFromRequest, correlationIdFromRequest } from "./actor.js";
import { SettingsService } from "./settings-service.js";

export async function registerSettingsRoutes(app: FastifyInstance, settings: SettingsService) {
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/settings", async (request) => settings.getProjectPolicy(request.params.projectId));
  app.put<{ Params: { projectId: string } }>("/api/projects/:projectId/settings", async (request) => settings.updateProjectPolicy(request.params.projectId, UpdateProjectPolicySchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request)));
  app.get("/api/settings/preferences", async () => settings.getGlobalPreferences());
  app.put("/api/settings/preferences", async (request) => settings.updateGlobalPreferences(UpdateGlobalPreferencesSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request)));
  app.get("/api/diagnostics", async () => settings.diagnostics());
}
