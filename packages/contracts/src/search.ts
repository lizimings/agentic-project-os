import { z } from "zod";

export const GlobalSearchEntityTypeSchema = z.enum([
  "project",
  "milestone",
  "plan",
  "task",
  "idea",
  "inbox_item",
  "worktree",
  "canvas_node",
  "proposal",
  "event_log",
  "remote_repository",
  "time_block",
  "focus_session",
  "actor",
  "commit",
]);

export const GlobalSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).optional(),
  types: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GlobalSearchResultSchema = z.object({
  entityType: GlobalSearchEntityTypeSchema,
  entityId: z.string().min(1),
  projectId: z.string().nullable(),
  title: z.string(),
  context: z.string(),
  route: z.string().startsWith("/"),
  score: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

export const GlobalSearchResponseSchema = z.object({
  query: z.string(),
  items: z.array(GlobalSearchResultSchema),
  total: z.number().int().nonnegative(),
  indexedAt: z.string().datetime(),
});

export type GlobalSearchEntityType = z.infer<typeof GlobalSearchEntityTypeSchema>;
export type GlobalSearchQuery = z.infer<typeof GlobalSearchQuerySchema>;
export type GlobalSearchResult = z.infer<typeof GlobalSearchResultSchema>;
export type GlobalSearchResponse = z.infer<typeof GlobalSearchResponseSchema>;
