import { ActorKindSchema, CreateActorSchema, UpdateActorSchema } from "@pcc/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorFromRequest, correlationIdFromRequest } from "./actor.js";
import { ActorService } from "./actor-service.js";

const ActorQuerySchema = z.object({ kind: ActorKindSchema.optional() });

export async function registerActorRoutes(app: FastifyInstance, actors: ActorService) {
  app.get("/api/actors", async (request) => {
    const query = ActorQuerySchema.parse(request.query);
    const items = await actors.list(query.kind);
    return { items, total: items.length };
  });
  app.post("/api/actors", async (request, reply) => reply.code(201).send(await actors.create(CreateActorSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request))));
  app.get<{ Params: { id: string } }>("/api/actors/:id", async (request) => actors.get(request.params.id));
  app.patch<{ Params: { id: string } }>("/api/actors/:id", async (request) => actors.update(request.params.id, UpdateActorSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request)));
}
