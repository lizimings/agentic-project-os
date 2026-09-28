import { z } from "zod";
import { CanvasNodeSchema } from "./canvas.js";
import { CreateTimeBlockSchema } from "./time.js";

export const ProposalKindSchema = z.enum(["organize", "schedule", "convert", "link", "status_change"]);
export const ProposalStatusSchema = z.enum(["pending", "accepted", "rejected", "modified"]);
export const ProposalRiskSchema = z.enum(["low", "medium", "high"]);
export const ProposalExecutionStatusSchema = z.enum(["not_applicable", "pending", "applied", "failed"]);
export const MindmapOrganizeOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_node"), node: CanvasNodeSchema }),
  z.object({
    type: z.literal("update_node"),
    nodeId: z.string().uuid(),
    title: z.string().trim().min(1).max(500).optional(),
    content: z.string().max(20_000).optional(),
    kind: z.string().trim().min(1).max(80).optional(),
    tone: z.string().trim().min(1).max(80).optional(),
    collapsed: z.boolean().optional(),
  }).refine((value) => Object.keys(value).some((key) => !["type", "nodeId"].includes(key)), { message: "更新节点必须包含至少一个字段" }),
  z.object({ type: z.literal("move_node"), nodeId: z.string().uuid(), parentId: z.string().uuid() }),
  z.object({ type: z.literal("merge_nodes"), sourceNodeId: z.string().uuid(), targetNodeId: z.string().uuid() }),
  z.object({ type: z.literal("delete_branch"), nodeId: z.string().uuid() }),
]);
export const ProposalCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("convert_inbox_to_idea"),
    inboxItemId: z.string().uuid(),
    projectId: z.string().min(1).max(200),
    title: z.string().trim().min(1).max(500).optional(),
    body: z.string().trim().max(40_000).optional(),
  }),
  z.object({
    type: z.literal("convert_inbox_to_entity"),
    inboxItemId: z.string().uuid(),
    targetType: z.enum(["idea", "milestone", "plan", "task"]),
    projectId: z.string().min(1).max(200),
    milestoneId: z.string().uuid().optional(),
    planId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(500).optional(),
    body: z.string().trim().max(40_000).optional(),
  }).superRefine((value, context) => {
    if ((value.targetType === "plan" || value.targetType === "task") && !value.milestoneId) {
      context.addIssue({ code: "custom", path: ["milestoneId"], message: "转为计划或任务时必须选择里程碑" });
    }
    if (value.targetType === "task" && !value.planId) {
      context.addIssue({ code: "custom", path: ["planId"], message: "转为任务时必须选择计划" });
    }
  }),
  z.object({ type: z.literal("create_time_block"), input: CreateTimeBlockSchema }),
  z.object({
    type: z.literal("organize_mindmap"),
    projectId: z.string().min(1).max(200),
    documentId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    operations: z.array(MindmapOrganizeOperationSchema).min(1).max(100),
  }),
]);
export const ProposalChangeSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().max(200).nullable(),
  action: z.string().min(1).max(100),
  summary: z.string().min(1).max(2_000),
});

export const ProposalSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().max(200).nullable(),
  title: z.string().min(1).max(500),
  summary: z.string().max(20_000),
  kind: ProposalKindSchema,
  status: ProposalStatusSchema,
  risk: ProposalRiskSchema,
  evidence: z.array(z.string().max(2_000)),
  changes: z.array(ProposalChangeSchema),
  command: ProposalCommandSchema.nullable(),
  executionStatus: ProposalExecutionStatusSchema,
  executionError: z.string().max(2_000).nullable(),
  executedAt: z.string().datetime().nullable(),
  createdBy: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
});

export const CreateProposalSchema = z.object({
  projectId: z.string().max(200).nullable().default(null),
  title: z.string().trim().min(1).max(500),
  summary: z.string().trim().max(20_000).default(""),
  kind: ProposalKindSchema,
  risk: ProposalRiskSchema.default("low"),
  evidence: z.array(z.string().trim().min(1).max(2_000)).default([]),
  changes: z.array(ProposalChangeSchema).min(1),
  command: ProposalCommandSchema.nullable().optional(),
  createdBy: z.string().trim().min(1).max(200).default("organizer"),
});

export const DecideProposalSchema = z.object({
  decision: z.enum(["accepted", "rejected", "modified"]),
  changes: z.array(ProposalChangeSchema).min(1).optional(),
  command: ProposalCommandSchema.nullable().optional(),
}).superRefine((value, context) => {
  if (value.decision === "modified" && !value.changes) {
    context.addIssue({ code: "custom", path: ["changes"], message: "修改后接受必须提供新的变更列表" });
  }
});

export type Proposal = z.infer<typeof ProposalSchema>;
export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;
export type DecideProposalInput = z.infer<typeof DecideProposalSchema>;
export type ProposalCommand = z.infer<typeof ProposalCommandSchema>;
export type MindmapOrganizeOperation = z.infer<typeof MindmapOrganizeOperationSchema>;
