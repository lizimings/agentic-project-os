import { z } from "zod";
import { EntityLinkSchema, IdeaSchema, MilestoneSchema, PlanSchema, ProjectSchema, TaskSchema } from "./core.js";
import { FocusSessionSchema, AttentionBudgetSchema, TimeBlockSchema } from "./time.js";
import { ProjectRemoteBindingSchema } from "./remote.js";
import { WorkspaceBindingSchema } from "./workspace.js";
import { InboxItemSchema } from "./inbox.js";

export const SnapshotQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  weekStart: z.string().date().optional(),
}).refine((value) => Boolean(value.from) === Boolean(value.to), { message: "from 和 to 必须同时提供" });

export const ProjectSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  scope: z.object({ from: z.string().datetime(), to: z.string().datetime(), weekStart: z.string().date() }),
  project: ProjectSchema,
  milestones: z.array(MilestoneSchema),
  plans: z.array(PlanSchema),
  tasks: z.array(TaskSchema),
  ideas: z.array(IdeaSchema),
  inbox: z.array(InboxItemSchema),
  links: z.array(EntityLinkSchema),
  workspace: WorkspaceBindingSchema.nullable(),
  remote: ProjectRemoteBindingSchema.nullable(),
  timeBlocks: z.array(TimeBlockSchema),
  currentFocus: FocusSessionSchema.nullable(),
  attentionBudget: AttentionBudgetSchema.nullable(),
});

export const ProjectSearchEntityTypeSchema = z.enum(["project", "milestone", "plan", "task", "idea", "inbox_item", "worktree"]);
export const ProjectSearchResultSchema = z.object({
  entityType: ProjectSearchEntityTypeSchema,
  entityId: z.string().min(1),
  projectId: z.string().nullable(),
  title: z.string(),
  context: z.string(),
  score: z.number().int().positive(),
});
export const ProjectSearchResponseSchema = z.object({
  query: z.string(),
  items: z.array(ProjectSearchResultSchema),
  total: z.number().int().nonnegative(),
});

export type SnapshotQuery = z.infer<typeof SnapshotQuerySchema>;
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;
export type ProjectSearchResult = z.infer<typeof ProjectSearchResultSchema>;
export type ProjectSearchResponse = z.infer<typeof ProjectSearchResponseSchema>;
