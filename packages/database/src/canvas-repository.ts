import type { CanvasDocument, CanvasEdge, CanvasKind, CanvasNode, CanvasViewport, SaveCanvasDocumentInput } from "@pcc/contracts";
import type { DatabaseExecutor, PccDatabase } from "./types.js";

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function nodeFromRow(row: {
  id: string; parent_id: string | null; node_type: string; kind: string; title: string; content: string;
  position_x: number; position_y: number; collapsed: number; tone: string; linked_entity_type: string | null;
  linked_entity_id: string | null; linked_entity_label: string | null; metadata_json: string;
}, references: CanvasNode["linkedEntities"]): CanvasNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    nodeType: row.node_type as CanvasNode["nodeType"],
    kind: row.kind,
    title: row.title,
    content: row.content,
    position: { x: row.position_x, y: row.position_y },
    collapsed: Boolean(row.collapsed),
    tone: row.tone,
    linkedEntities: references,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  };
}

function edgeFromRow(row: {
  id: string; source_node_id: string; target_node_id: string; label: string | null; relation: string;
  directed: number; metadata_json: string;
}): CanvasEdge {
  return {
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    label: row.label,
    relation: row.relation as CanvasEdge["relation"],
    directed: Boolean(row.directed),
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  };
}

export class CanvasRepository {
  constructor(private readonly db: PccDatabase) {}

  get database() {
    return this.db;
  }

  getDocumentRow(projectId: string, kind: CanvasKind, executor: DatabaseExecutor = this.db) {
    return executor.selectFrom("canvas_documents").selectAll().where("project_id", "=", projectId).where("kind", "=", kind).executeTakeFirst();
  }

  getDocumentRowById(id: string, executor: DatabaseExecutor = this.db) {
    return executor.selectFrom("canvas_documents").selectAll().where("id", "=", id).executeTakeFirst();
  }

  async getSnapshot(projectId: string, kind: CanvasKind, executor: DatabaseExecutor = this.db): Promise<CanvasDocument | undefined> {
    const document = await this.getDocumentRow(projectId, kind, executor);
    if (!document) return undefined;
    const [nodes, edges, references] = await Promise.all([
      executor.selectFrom("canvas_nodes").selectAll().where("document_id", "=", document.id).orderBy("created_at", "asc").execute(),
      executor.selectFrom("canvas_edges").selectAll().where("document_id", "=", document.id).orderBy("created_at", "asc").execute(),
      executor.selectFrom("canvas_node_references").selectAll().where("document_id", "=", document.id).orderBy("position", "asc").execute(),
    ]);
    const referencesByNode = new Map<string, CanvasNode["linkedEntities"]>();
    references.forEach((reference) => {
      const items = referencesByNode.get(reference.node_id) ?? [];
      items.push({ type: reference.entity_type as CanvasNode["linkedEntities"][number]["type"], id: reference.entity_id, label: reference.entity_label });
      referencesByNode.set(reference.node_id, items);
    });
    return {
      id: document.id,
      projectId: document.project_id,
      kind: document.kind as CanvasKind,
      title: document.title,
      revision: document.revision,
      viewport: JSON.parse(document.viewport_json) as CanvasViewport,
      nodes: nodes.map((node) => nodeFromRow(node, referencesByNode.get(node.id) ?? [])),
      edges: edges.map(edgeFromRow),
      createdAt: document.created_at,
      updatedAt: document.updated_at,
    };
  }

  async createDocument(
    id: string,
    projectId: string,
    kind: CanvasKind,
    title: string,
    viewport: CanvasViewport,
    executor: DatabaseExecutor = this.db,
  ) {
    const now = new Date().toISOString();
    await executor.insertInto("canvas_documents").values({
      id,
      project_id: projectId,
      kind,
      title,
      revision: 0,
      viewport_json: JSON.stringify(viewport),
      created_at: now,
      updated_at: now,
    }).execute();
  }

  async replaceSnapshot(documentId: string, input: SaveCanvasDocumentInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.deleteFrom("canvas_edges").where("document_id", "=", documentId).execute();
    await executor.deleteFrom("canvas_node_references").where("document_id", "=", documentId).execute();
    await executor.deleteFrom("canvas_nodes").where("document_id", "=", documentId).execute();

    const nodeRows = input.nodes.map((node) => ({
      id: node.id,
      document_id: documentId,
      parent_id: node.parentId,
      node_type: node.nodeType,
      kind: node.kind,
      title: node.title,
      content: node.content,
      position_x: node.position.x,
      position_y: node.position.y,
      collapsed: node.collapsed ? 1 : 0,
      tone: node.tone,
      linked_entity_type: null,
      linked_entity_id: null,
      linked_entity_label: null,
      metadata_json: JSON.stringify(node.metadata),
      created_at: now,
      updated_at: now,
    }));
    for (const batch of chunks(nodeRows, 35)) await executor.insertInto("canvas_nodes").values(batch).execute();

    const referenceRows = input.nodes.flatMap((node) => node.linkedEntities.map((reference, position) => ({
      node_id: node.id,
      document_id: documentId,
      position,
      entity_type: reference.type,
      entity_id: reference.id,
      entity_label: reference.label,
    })));
    for (const batch of chunks(referenceRows, 100)) await executor.insertInto("canvas_node_references").values(batch).execute();

    const edgeRows = input.edges.map((edge) => ({
      id: edge.id,
      document_id: documentId,
      source_node_id: edge.source,
      target_node_id: edge.target,
      label: edge.label,
      relation: edge.relation,
      directed: edge.directed ? 1 : 0,
      metadata_json: JSON.stringify(edge.metadata),
      created_at: now,
      updated_at: now,
    }));
    for (const batch of chunks(edgeRows, 60)) await executor.insertInto("canvas_edges").values(batch).execute();

    await executor.updateTable("canvas_documents").set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      viewport_json: JSON.stringify(input.viewport),
      revision: input.expectedRevision + 1,
      updated_at: now,
    }).where("id", "=", documentId).where("revision", "=", input.expectedRevision).executeTakeFirstOrThrow();
  }
}
