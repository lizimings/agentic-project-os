import { z } from "zod";

export const KnowledgeGraphNodeSchema = z.object({
  id: z.string().min(1).max(450),
  rawId: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  label: z.string().min(1).max(500),
  projectId: z.string().min(1).max(200).nullable(),
  status: z.string().max(100).nullable(),
  meta: z.string().max(2_000),
  val: z.number().positive(),
});

export const KnowledgeGraphLinkSchema = z.object({
  id: z.string().min(1).max(500),
  source: z.string().min(1).max(450),
  target: z.string().min(1).max(450),
  relation: z.string().min(1).max(100),
  label: z.string().max(500).nullable(),
  kind: z.enum(["hierarchy", "entity_link", "assignment", "workspace"]),
});

export const KnowledgeGraphResponseSchema = z.object({
  nodes: z.array(KnowledgeGraphNodeSchema).max(2_000),
  links: z.array(KnowledgeGraphLinkSchema).max(5_000),
  totalNodes: z.number().int().nonnegative(),
  totalLinks: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

export const KnowledgeGraphQuerySchema = z.object({
  projectId: z.string().min(1).max(200).optional(),
  focusType: z.string().min(1).max(100).optional(),
  focusId: z.string().min(1).max(200).optional(),
  depth: z.coerce.number().int().min(1).max(2).default(1),
}).refine((value) => Boolean(value.focusType) === Boolean(value.focusId), { message: "focusType 与 focusId 必须同时提供" });

export type KnowledgeGraphNode = z.infer<typeof KnowledgeGraphNodeSchema>;
export type KnowledgeGraphLink = z.infer<typeof KnowledgeGraphLinkSchema>;
export type KnowledgeGraphResponse = z.infer<typeof KnowledgeGraphResponseSchema>;
export type KnowledgeGraphQuery = z.infer<typeof KnowledgeGraphQuerySchema>;
