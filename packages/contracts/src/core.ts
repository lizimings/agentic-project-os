import { z } from "zod";

const IdSchema = z.string().min(1).max(200);
const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime();
const OptionalDateTimeSchema = DateTimeSchema.nullable();

export const ProjectStatusSchema = z.enum(["active", "risk", "paused", "archived"]);
export const MilestoneStatusSchema = z.enum(["planned", "active", "blocked", "completed", "archived"]);
export const PlanStatusSchema = z.enum(["planned", "active", "blocked", "completed", "archived"]);
export const TaskStatusSchema = z.enum(["todo", "in_progress", "blocked", "done", "archived"]);
export const TaskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const AssigneeTypeSchema = z.enum(["human", "agent", "unassigned"]);
export const IdeaStatusSchema = z.enum(["draft", "developing", "validated", "converted", "archived"]);
export const IdeaSourceTypeSchema = z.enum(["manual", "inbox_item", "voice", "agent", "import"]);

export const ProjectSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(20_000),
  vision: z.string().max(20_000),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  status: ProjectStatusSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20_000).default(""),
  vision: z.string().trim().max(20_000).default(""),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#4057f4"),
  status: ProjectStatusSchema.default("active"),
});

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20_000).optional(),
  vision: z.string().trim().max(20_000).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  status: ProjectStatusSchema.optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个需要更新的字段" },
);

export const MilestoneSchema = z.object({
  id: UuidSchema,
  projectId: IdSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(20_000),
  status: MilestoneStatusSchema,
  targetDate: OptionalDateTimeSchema,
  position: z.number().int().nonnegative(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const CreateMilestoneSchema = z.object({
  projectId: IdSchema,
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(20_000).default(""),
  status: MilestoneStatusSchema.default("planned"),
  targetDate: OptionalDateTimeSchema.default(null),
  position: z.number().int().nonnegative().default(0),
});

export const UpdateMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(20_000).optional(),
  status: MilestoneStatusSchema.optional(),
  targetDate: OptionalDateTimeSchema.optional(),
  position: z.number().int().nonnegative().optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个需要更新的字段" },
);

export const PlanSchema = z.object({
  id: UuidSchema,
  projectId: IdSchema,
  milestoneId: UuidSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(20_000),
  status: PlanStatusSchema,
  position: z.number().int().nonnegative(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const CreatePlanSchema = z.object({
  projectId: IdSchema,
  milestoneId: UuidSchema,
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(20_000).default(""),
  status: PlanStatusSchema.default("planned"),
  position: z.number().int().nonnegative().default(0),
});

export const UpdatePlanSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(20_000).optional(),
  status: PlanStatusSchema.optional(),
  position: z.number().int().nonnegative().optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个需要更新的字段" },
);

export const TaskSchema = z.object({
  id: UuidSchema,
  projectId: IdSchema,
  milestoneId: UuidSchema,
  planId: UuidSchema,
  parentTaskId: UuidSchema.nullable(),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  assigneeType: AssigneeTypeSchema,
  assigneeId: z.string().max(200).nullable(),
  dueAt: OptionalDateTimeSchema,
  estimateMinutes: z.number().int().nonnegative().nullable(),
  position: z.number().int().nonnegative(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const CreateTaskSchema = z.object({
  projectId: IdSchema,
  milestoneId: UuidSchema,
  planId: UuidSchema,
  parentTaskId: UuidSchema.nullable().default(null),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(20_000).default(""),
  status: TaskStatusSchema.default("todo"),
  priority: TaskPrioritySchema.default("medium"),
  assigneeType: AssigneeTypeSchema.default("unassigned"),
  assigneeId: z.string().trim().max(200).nullable().default(null),
  dueAt: OptionalDateTimeSchema.default(null),
  estimateMinutes: z.number().int().nonnegative().nullable().default(null),
  position: z.number().int().nonnegative().default(0),
}).superRefine((value, context) => {
  if (value.assigneeType === "unassigned" && value.assigneeId !== null) {
    context.addIssue({ code: "custom", path: ["assigneeId"], message: "未分配任务不应设置负责人" });
  }
  if (value.assigneeType !== "unassigned" && !value.assigneeId) {
    context.addIssue({ code: "custom", path: ["assigneeId"], message: "已分配任务必须设置负责人" });
  }
});

export const UpdateTaskSchema = z.object({
  parentTaskId: UuidSchema.nullable().optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(20_000).optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assigneeType: AssigneeTypeSchema.optional(),
  assigneeId: z.string().trim().max(200).nullable().optional(),
  dueAt: OptionalDateTimeSchema.optional(),
  estimateMinutes: z.number().int().nonnegative().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "至少提供一个需要更新的字段" });

export const IdeaSchema = z.object({
  id: UuidSchema,
  projectId: IdSchema.nullable(),
  title: z.string().min(1).max(500),
  body: z.string().max(40_000),
  status: IdeaStatusSchema,
  sourceType: IdeaSourceTypeSchema,
  sourceId: IdSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const CreateIdeaSchema = z.object({
  projectId: IdSchema.nullable().default(null),
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().max(40_000).default(""),
  status: IdeaStatusSchema.default("draft"),
  sourceType: IdeaSourceTypeSchema.default("manual"),
  sourceId: IdSchema.nullable().default(null),
});

export const UpdateIdeaSchema = z.object({
  projectId: IdSchema.nullable().optional(),
  title: z.string().trim().min(1).max(500).optional(),
  body: z.string().trim().max(40_000).optional(),
  status: IdeaStatusSchema.optional(),
  sourceType: IdeaSourceTypeSchema.optional(),
  sourceId: IdSchema.nullable().optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个需要更新的字段" },
);

export const EntityTypeSchema = z.enum([
  "project",
  "milestone",
  "plan",
  "task",
  "idea",
  "proposal",
  "notification",
  "actor",
  "inbox_item",
  "worktree",
  "workspace",
  "integration",
  "remote_repository",
  "time_block",
  "focus_session",
  "attention_budget",
  "commit",
  "log",
  "canvas_document",
  "canvas_node",
]);
export const EntityRelationSchema = z.enum([
  "relatesTo",
  "derivedFrom",
  "blocks",
  "dependsOn",
  "mentions",
  "evidenceFor",
  "implements",
]);

export const EntityLinkSchema = z.object({
  id: UuidSchema,
  sourceType: EntityTypeSchema,
  sourceId: IdSchema,
  targetType: EntityTypeSchema,
  targetId: IdSchema,
  relation: EntityRelationSchema,
  label: z.string().max(500).nullable(),
  createdAt: DateTimeSchema,
});

export const CreateEntityLinkSchema = z.object({
  sourceType: EntityTypeSchema,
  sourceId: IdSchema,
  targetType: EntityTypeSchema,
  targetId: IdSchema,
  relation: EntityRelationSchema.default("relatesTo"),
  label: z.string().trim().max(500).nullable().default(null),
}).refine(
  (value) => value.sourceType !== value.targetType || value.sourceId !== value.targetId,
  { message: "实体不能链接到自身" },
);

export const ConvertIdeaSchema = z.discriminatedUnion("targetType", [
  z.object({ targetType: z.literal("milestone"), projectId: IdSchema.optional(), title: z.string().trim().min(1).max(500).optional() }),
  z.object({ targetType: z.literal("plan"), milestoneId: UuidSchema, title: z.string().trim().min(1).max(500).optional() }),
  z.object({ targetType: z.literal("task"), planId: UuidSchema, title: z.string().trim().min(1).max(500).optional() }),
]);

export const MergeIdeasSchema = z.object({
  sourceIdeaIds: z.array(UuidSchema).min(1).max(20).superRefine((value, context) => {
    if (new Set(value).size !== value.length) context.addIssue({ code: "custom", message: "待合并想法不能重复" });
  }),
  title: z.string().trim().min(1).max(500).optional(),
  body: z.string().trim().max(40_000).optional(),
});

export const IdeaDuplicateCandidateSchema = z.object({
  ideaId: UuidSchema,
  duplicateId: UuidSchema,
  score: z.number().min(0).max(1),
  reason: z.enum(["same_title", "high_similarity"]),
});

export type Project = z.infer<typeof ProjectSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type CreateMilestoneInput = z.infer<typeof CreateMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type Idea = z.infer<typeof IdeaSchema>;
export type CreateIdeaInput = z.infer<typeof CreateIdeaSchema>;
export type UpdateIdeaInput = z.infer<typeof UpdateIdeaSchema>;
export type EntityLink = z.infer<typeof EntityLinkSchema>;
export type CreateEntityLinkInput = z.infer<typeof CreateEntityLinkSchema>;
export type ConvertIdeaInput = z.infer<typeof ConvertIdeaSchema>;
export type MergeIdeasInput = z.infer<typeof MergeIdeasSchema>;
export type IdeaDuplicateCandidate = z.infer<typeof IdeaDuplicateCandidateSchema>;
export type EntityType = z.infer<typeof EntityTypeSchema>;
