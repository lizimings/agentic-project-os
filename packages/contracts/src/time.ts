import { z } from "zod";

const IdSchema = z.string().min(1).max(200);
const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime();

export const TimeBlockStatusSchema = z.enum(["planned", "in_progress", "completed", "canceled"]);
export const TimeBlockKindSchema = z.enum(["focus", "admin", "buffer"]);
export const EnergyLevelSchema = z.enum(["low", "medium", "high"]);
export const TimeBlockSourceSchema = z.enum(["manual", "agent", "rebalance"]);

export const TimeBlockSchema = z.object({
  id: UuidSchema,
  projectId: IdSchema.nullable(),
  taskId: UuidSchema.nullable(),
  title: z.string().min(1).max(500),
  startAt: DateTimeSchema,
  endAt: DateTimeSchema,
  status: TimeBlockStatusSchema,
  kind: TimeBlockKindSchema,
  energy: EnergyLevelSchema,
  source: TimeBlockSourceSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const CreateTimeBlockSchema = z.object({
  projectId: IdSchema.nullable().default(null),
  taskId: UuidSchema.nullable().default(null),
  title: z.string().trim().min(1).max(500),
  startAt: DateTimeSchema,
  endAt: DateTimeSchema,
  status: TimeBlockStatusSchema.default("planned"),
  kind: TimeBlockKindSchema.default("focus"),
  energy: EnergyLevelSchema.default("medium"),
  source: TimeBlockSourceSchema.default("manual"),
}).refine((value) => new Date(value.endAt).getTime() > new Date(value.startAt).getTime(), { path: ["endAt"], message: "结束时间必须晚于开始时间" });

export const UpdateTimeBlockSchema = z.object({
  projectId: IdSchema.nullable().optional(),
  taskId: UuidSchema.nullable().optional(),
  title: z.string().trim().min(1).max(500).optional(),
  startAt: DateTimeSchema.optional(),
  endAt: DateTimeSchema.optional(),
  status: TimeBlockStatusSchema.optional(),
  kind: TimeBlockKindSchema.optional(),
  energy: EnergyLevelSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "至少提供一个需要更新的字段" });

export const FocusSessionStatusSchema = z.enum(["running", "paused", "completed"]);
export const FocusSessionSchema = z.object({
  id: UuidSchema,
  projectId: IdSchema.nullable(),
  taskId: UuidSchema.nullable(),
  timeBlockId: UuidSchema.nullable(),
  title: z.string().min(1).max(500),
  status: FocusSessionStatusSchema,
  startedAt: DateTimeSchema,
  lastResumedAt: DateTimeSchema.nullable(),
  endedAt: DateTimeSchema.nullable(),
  accumulatedSeconds: z.number().int().nonnegative(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const StartFocusSessionSchema = z.object({
  projectId: IdSchema.nullable().default(null),
  taskId: UuidSchema.nullable().default(null),
  timeBlockId: UuidSchema.nullable().default(null),
  title: z.string().trim().min(1).max(500),
});

export const CompleteFocusSessionSchema = z.object({
  completeTask: z.boolean().default(false),
});

export const AttentionBudgetSchema = z.object({
  projectId: IdSchema,
  weekStart: z.string().date(),
  plannedMinutes: z.number().int().nonnegative(),
  minimumMinutes: z.number().int().nonnegative(),
  maximumMinutes: z.number().int().positive().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const UpsertAttentionBudgetSchema = z.object({
  projectId: IdSchema,
  weekStart: z.string().date(),
  plannedMinutes: z.number().int().nonnegative(),
  minimumMinutes: z.number().int().nonnegative().default(0),
  maximumMinutes: z.number().int().positive().nullable().default(null),
}).refine((value) => value.maximumMinutes === null || value.maximumMinutes >= value.minimumMinutes, { path: ["maximumMinutes"], message: "最大预算不能小于最低保障" });

export const TimeRangeQuerySchema = z.object({
  from: DateTimeSchema,
  to: DateTimeSchema,
  projectId: IdSchema.optional(),
}).refine((value) => new Date(value.to).getTime() > new Date(value.from).getTime(), { path: ["to"], message: "查询结束时间必须晚于开始时间" });

export const TimeSummaryQuerySchema = TimeRangeQuerySchema.and(z.object({
  utcOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
}));

export const TimeSummarySliceSchema = z.object({
  key: z.string().min(1).max(200),
  focusSeconds: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  completedSessionCount: z.number().int().nonnegative(),
});

export const TimeSummarySchema = z.object({
  from: DateTimeSchema,
  to: DateTimeSchema,
  focusSeconds: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  completedSessionCount: z.number().int().nonnegative(),
  byProject: z.array(TimeSummarySliceSchema),
  byDay: z.array(TimeSummarySliceSchema),
  generatedAt: DateTimeSchema,
});

export const AttentionHealthStateSchema = z.enum(["unconfigured", "starving", "at_risk", "balanced", "overfocused"]);
export const AttentionHealthItemSchema = z.object({
  projectId: IdSchema,
  state: AttentionHealthStateSchema,
  plannedMinutes: z.number().int().nonnegative().nullable(),
  minimumMinutes: z.number().int().nonnegative().nullable(),
  maximumMinutes: z.number().int().positive().nullable(),
  scheduledMinutes: z.number().int().nonnegative(),
  actualMinutes: z.number().int().nonnegative(),
  deficitMinutes: z.number().int().nonnegative(),
  overageMinutes: z.number().int().nonnegative(),
  explanation: z.string().min(1).max(2_000),
});
export const AttentionAnalysisQuerySchema = z.object({
  weekStart: z.string().date(),
  utcOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
});
export const AttentionAnalysisSchema = z.object({
  weekStart: z.string().date(),
  items: z.array(AttentionHealthItemSchema),
  starvingCount: z.number().int().nonnegative(),
  atRiskCount: z.number().int().nonnegative(),
  overfocusedCount: z.number().int().nonnegative(),
  generatedAt: DateTimeSchema,
});
export const CreateAttentionRebalanceProposalSchema = z.object({
  weekStart: z.string().date(),
  utcOffsetMinutes: z.number().int().min(-840).max(840).default(0),
  projectId: IdSchema.optional(),
  energy: EnergyLevelSchema.default("medium"),
});

export type TimeBlock = z.infer<typeof TimeBlockSchema>;
export type CreateTimeBlockInput = z.infer<typeof CreateTimeBlockSchema>;
export type UpdateTimeBlockInput = z.infer<typeof UpdateTimeBlockSchema>;
export type FocusSession = z.infer<typeof FocusSessionSchema>;
export type StartFocusSessionInput = z.infer<typeof StartFocusSessionSchema>;
export type CompleteFocusSessionInput = z.infer<typeof CompleteFocusSessionSchema>;
export type AttentionBudget = z.infer<typeof AttentionBudgetSchema>;
export type UpsertAttentionBudgetInput = z.infer<typeof UpsertAttentionBudgetSchema>;
export type TimeRangeQuery = z.infer<typeof TimeRangeQuerySchema>;
export type TimeSummaryQuery = z.infer<typeof TimeSummaryQuerySchema>;
export type TimeSummary = z.infer<typeof TimeSummarySchema>;
export type AttentionHealthItem = z.infer<typeof AttentionHealthItemSchema>;
export type AttentionAnalysisQuery = z.infer<typeof AttentionAnalysisQuerySchema>;
export type AttentionAnalysis = z.infer<typeof AttentionAnalysisSchema>;
export type CreateAttentionRebalanceProposalInput = z.infer<typeof CreateAttentionRebalanceProposalSchema>;
