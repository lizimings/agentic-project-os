import { z } from "zod";
import { EntityRelationSchema } from "./core.js";

const IdSchema = z.string().min(1).max(200);
const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime();

export const CanvasKindSchema = z.enum(["whiteboard", "mindmap"]);
export const CanvasViewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().min(0.05).max(10),
});

export const CanvasEntityReferenceSchema = z.object({
  type: z.enum(["project", "milestone", "plan", "task", "idea", "worktree", "inbox_item", "proposal"]),
  id: IdSchema,
  label: z.string().trim().min(1).max(500),
});

export const CanvasNodeSchema = z.object({
  id: UuidSchema,
  parentId: UuidSchema.nullable(),
  nodeType: z.enum(["concept", "mindTopic"]),
  kind: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(500),
  content: z.string().max(20_000),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  collapsed: z.boolean(),
  tone: z.string().trim().min(1).max(80),
  linkedEntities: z.array(CanvasEntityReferenceSchema).max(20),
  metadata: z.record(z.string(), z.unknown()),
});

export const CanvasEdgeSchema = z.object({
  id: UuidSchema,
  source: UuidSchema,
  target: UuidSchema,
  label: z.string().trim().max(500).nullable(),
  relation: EntityRelationSchema,
  directed: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
}).refine((value) => value.source !== value.target, { message: "画布连线不能指向同一个节点" });

export const CanvasDocumentSchema = z.object({
  id: UuidSchema,
  projectId: IdSchema,
  kind: CanvasKindSchema,
  title: z.string().min(1).max(500),
  revision: z.number().int().nonnegative(),
  viewport: CanvasViewportSchema,
  nodes: z.array(CanvasNodeSchema).max(1_000),
  edges: z.array(CanvasEdgeSchema).max(2_000),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const SaveCanvasDocumentSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(500).optional(),
  viewport: CanvasViewportSchema,
  nodes: z.array(CanvasNodeSchema).max(1_000),
  edges: z.array(CanvasEdgeSchema).max(2_000),
}).superRefine((value, context) => {
  const nodeIds = new Set<string>();
  value.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) context.addIssue({ code: "custom", path: ["nodes", index, "id"], message: "节点 ID 重复" });
    nodeIds.add(node.id);
  });
  const edgeIds = new Set<string>();
  value.edges.forEach((edge, index) => {
    if (edgeIds.has(edge.id)) context.addIssue({ code: "custom", path: ["edges", index, "id"], message: "连线 ID 重复" });
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) context.addIssue({ code: "custom", path: ["edges", index, "source"], message: "连线来源节点不存在" });
    if (!nodeIds.has(edge.target)) context.addIssue({ code: "custom", path: ["edges", index, "target"], message: "连线目标节点不存在" });
  });
  value.nodes.forEach((node, index) => {
    if (node.parentId && !nodeIds.has(node.parentId)) context.addIssue({ code: "custom", path: ["nodes", index, "parentId"], message: "父节点不存在" });
    if (node.parentId === node.id) context.addIssue({ code: "custom", path: ["nodes", index, "parentId"], message: "节点不能成为自己的父节点" });
  });
});

export type CanvasKind = z.infer<typeof CanvasKindSchema>;
export type CanvasViewport = z.infer<typeof CanvasViewportSchema>;
export type CanvasEntityReference = z.infer<typeof CanvasEntityReferenceSchema>;
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;
export type CanvasDocument = z.infer<typeof CanvasDocumentSchema>;
export type SaveCanvasDocumentInput = z.infer<typeof SaveCanvasDocumentSchema>;
