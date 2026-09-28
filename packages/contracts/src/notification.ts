import { z } from "zod";

export const NotificationTypeSchema = z.enum(["proposal", "overdue", "due_soon", "workspace_error", "attention_starvation"]);
export const NotificationSeveritySchema = z.enum(["info", "warning", "critical"]);
export const NotificationStatusSchema = z.enum(["unread", "read", "snoozed"]);

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  type: NotificationTypeSchema,
  projectId: z.string().nullable(),
  title: z.string().min(1),
  body: z.string(),
  severity: NotificationSeveritySchema,
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  route: z.string().startsWith("/"),
  fingerprint: z.string().min(1),
  status: NotificationStatusSchema,
  snoozedUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const NotificationQuerySchema = z.object({
  status: z.enum(["all", "unread", "read", "snoozed"]).default("all"),
  projectId: z.string().trim().min(1).optional(),
  includeSnoozed: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const UpdateNotificationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read") }),
  z.object({ action: z.literal("unread") }),
  z.object({ action: z.literal("snooze"), snoozedUntil: z.string().datetime() }),
]);

export const NotificationListResponseSchema = z.object({
  items: z.array(NotificationSchema),
  total: z.number().int().nonnegative(),
  unread: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;
export type UpdateNotificationInput = z.infer<typeof UpdateNotificationSchema>;
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;
