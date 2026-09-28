import { randomUUID } from "node:crypto";
import type { EntityType, EventEnvelope } from "@pcc/contracts";

export interface CoreActor {
  type: EventEnvelope["actorType"];
  id: string;
}

export type CoreEventAction = "created" | "updated" | "archived" | "linked" | "unlinked" | "converted" | "accepted" | "rejected" | "modified" | "bound" | "scanned" | "unbound" | "connected" | "validated" | "disconnected" | "started" | "paused" | "resumed" | "completed" | "canceled" | "transcribed";

export function createCoreEvent(
  entityType: EntityType,
  entityId: string,
  action: CoreEventAction,
  actor: CoreActor,
  correlationId: string = randomUUID(),
  payload: Record<string, unknown> = {},
): EventEnvelope {
  return {
    id: randomUUID(),
    type: `${entityType}.${action}`,
    actorType: actor.type,
    actorId: actor.id,
    entityType,
    entityId,
    correlationId,
    occurredAt: new Date().toISOString(),
    payload,
  };
}
