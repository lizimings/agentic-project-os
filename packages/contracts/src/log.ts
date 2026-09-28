import { z } from "zod";

const DateTimeSchema = z.string().datetime();

export const ProjectEventLogItemSchema = z.object({
  sequence: z.number().int().positive(),
  id: z.string().uuid(),
  type: z.string().min(1).max(160),
  actorType: z.enum(["human", "agent", "system", "connector"]),
  actorId: z.string().min(1).max(200),
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(200),
  projectId: z.string().min(1).max(200).nullable(),
  correlationId: z.string().uuid(),
  occurredAt: DateTimeSchema,
  payload: z.record(z.string(), z.unknown()),
});

export const ProjectEventLogQuerySchema = z.object({
  projectId: z.string().min(1).max(200).optional(),
  actorType: z.enum(["human", "agent", "system", "connector"]).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().max(500).optional(),
  from: DateTimeSchema.optional(),
  to: DateTimeSchema.optional(),
  beforeSequence: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const ProjectEventLogResponseSchema = z.object({
  items: z.array(ProjectEventLogItemSchema),
  total: z.number().int().nonnegative(),
  nextBeforeSequence: z.number().int().positive().nullable(),
});

export const ProjectDailyDigestSchema = z.object({
  projectId: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  from: DateTimeSchema,
  to: DateTimeSchema,
  totalEvents: z.number().int().nonnegative(),
  humanEvents: z.number().int().nonnegative(),
  agentEvents: z.number().int().nonnegative(),
  gitEvents: z.number().int().nonnegative(),
  completedEvents: z.number().int().nonnegative(),
  highlights: z.array(ProjectEventLogItemSchema).max(8),
  summary: z.string().max(4_000),
});

export type ProjectEventLogItem = z.infer<typeof ProjectEventLogItemSchema>;
export type ProjectEventLogQuery = z.infer<typeof ProjectEventLogQuerySchema>;
export type ProjectEventLogResponse = z.infer<typeof ProjectEventLogResponseSchema>;
export type ProjectDailyDigest = z.infer<typeof ProjectDailyDigestSchema>;
