import { randomUUID } from "node:crypto";
import type { CreateInboxItemInput, EventEnvelope } from "@pcc/contracts";

export interface InboxActor {
  type: EventEnvelope["actorType"];
  id: string;
}

export function createInboxCapturedEvent(
  itemId: string,
  input: CreateInboxItemInput,
  actor: InboxActor,
  correlationId: string = randomUUID(),
): EventEnvelope {
  return {
    id: randomUUID(),
    type: "inbox.item_created",
    actorType: actor.type,
    actorId: actor.id,
    entityType: "inbox_item",
    entityId: itemId,
    correlationId,
    occurredAt: new Date().toISOString(),
    payload: {
      source: input.source,
      kind: input.kind,
      project: input.project,
      projectId: input.projectId ?? null,
    },
  };
}

export function createInboxUpdatedEvent(
  itemId: string,
  changedFields: string[],
  actor: InboxActor,
  correlationId: string = randomUUID(),
): EventEnvelope {
  return {
    id: randomUUID(),
    type: "inbox.item_updated",
    actorType: actor.type,
    actorId: actor.id,
    entityType: "inbox_item",
    entityId: itemId,
    correlationId,
    occurredAt: new Date().toISOString(),
    payload: { changedFields },
  };
}

export function createInboxArchivedEvent(
  itemId: string,
  actor: InboxActor,
  correlationId: string = randomUUID(),
): EventEnvelope {
  return {
    id: randomUUID(),
    type: "inbox.item_archived",
    actorType: actor.type,
    actorId: actor.id,
    entityType: "inbox_item",
    entityId: itemId,
    correlationId,
    occurredAt: new Date().toISOString(),
    payload: {},
  };
}
