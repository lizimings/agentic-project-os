import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { InboxActor } from "@pcc/domain";

const actorTypes = new Set<InboxActor["type"]>(["human", "agent", "system", "connector"]);

export function actorFromRequest(request: FastifyRequest): InboxActor {
  const typeHeader = request.headers["x-pcc-actor-type"];
  const idHeader = request.headers["x-pcc-actor-id"];
  const type = typeof typeHeader === "string" && actorTypes.has(typeHeader as InboxActor["type"])
    ? typeHeader as InboxActor["type"]
    : "human";
  return {
    type,
    id: typeof idHeader === "string" && idHeader.trim() ? idHeader.trim() : "local-user",
  };
}

export function correlationIdFromRequest(request: FastifyRequest) {
  const value = request.headers["x-correlation-id"];
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : randomUUID();
}
