import { z } from "zod";

export const EventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(160),
  actorType: z.enum(["human", "agent", "system", "connector"]),
  actorId: z.string().min(1).max(200),
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(200),
  correlationId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
