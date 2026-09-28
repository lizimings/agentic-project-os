import { z } from "zod";

export const InboxKindSchema = z.enum(["想法", "需求", "风险", "备注"]);
export const InboxSourceSchema = z.enum(["语音", "快捷记录", "Agent", "导入", "MCP", "CLI"]);

export const InboxItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(2_000),
  note: z.string().max(20_000),
  source: InboxSourceSchema,
  created: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  projectId: z.string().nullable(),
  project: z.string(),
  kind: InboxKindSchema,
});

export const CreateInboxItemSchema = z.object({
  title: z.string().trim().min(1).max(2_000),
  note: z.string().trim().max(20_000).default("等待 Agent 整理和建立双向链接"),
  source: InboxSourceSchema.default("快捷记录"),
  projectId: z.string().nullable().optional(),
  project: z.string().trim().min(1).max(200).default("未归类"),
  kind: InboxKindSchema.default("想法"),
});

export const InboxMentionSchema = z.object({
  type: z.enum(["project", "milestone", "plan", "task", "idea"]),
  id: z.string().min(1).max(200),
  label: z.string().trim().min(1).max(500),
});

export const CreateLinkedInboxItemSchema = CreateInboxItemSchema.extend({
  mentions: z.array(InboxMentionSchema).max(20).default([]),
}).superRefine((value, context) => {
  const keys = value.mentions.map((mention) => `${mention.type}:${mention.id}`);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", path: ["mentions"], message: "@ 实体引用不应重复" });
});

export const UpdateInboxItemSchema = z.object({
  title: z.string().trim().min(1).max(2_000).optional(),
  note: z.string().trim().max(20_000).optional(),
  source: InboxSourceSchema.optional(),
  projectId: z.string().nullable().optional(),
  project: z.string().trim().min(1).max(200).optional(),
  kind: InboxKindSchema.optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个需要更新的字段" },
);

const InboxBatchIdsSchema = z.array(z.string().uuid()).min(1).max(100).refine(
  (ids) => new Set(ids).size === ids.length,
  { message: "批量 Inbox ID 不应重复" },
);

export const BatchInboxOperationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    ids: InboxBatchIdsSchema,
    projectId: z.string().min(1).max(200).nullable(),
    kind: InboxKindSchema.optional(),
  }),
  z.object({ action: z.literal("archive"), ids: InboxBatchIdsSchema }),
]);

export const InboxListResponseSchema = z.object({
  items: z.array(InboxItemSchema),
  total: z.number().int().nonnegative(),
});

export type InboxItem = z.infer<typeof InboxItemSchema>;
export type CreateInboxItemInput = z.infer<typeof CreateInboxItemSchema>;
export type CreateLinkedInboxItemInput = z.infer<typeof CreateLinkedInboxItemSchema>;
export type UpdateInboxItemInput = z.infer<typeof UpdateInboxItemSchema>;
export type BatchInboxOperationInput = z.infer<typeof BatchInboxOperationSchema>;
