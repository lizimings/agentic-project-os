import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("reviewable mind-map organization commands", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("keeps the document unchanged until acceptance, then applies all structure operations atomically", async () => {
    const initial = (await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/mindmap" })).json();
    const root = initial.nodes.find((node: { parentId: string | null }) => node.parentId === null);
    const [target, source] = initial.nodes.filter((node: { parentId: string }) => node.parentId === root.id).slice(0, 2);
    expect(target).toBeTruthy();
    expect(source).toBeTruthy();
    const groupId = randomUUID();
    const proposalResponse = await built.app.inject({ method: "POST", url: "/api/proposals", payload: {
      projectId: "pixelmind",
      title: "归组并合并思维导图节点",
      summary: "逐项审核后原子执行",
      kind: "organize",
      risk: "low",
      evidence: [`CanvasDocument ${initial.id} · revision ${initial.revision}`],
      changes: [
        { entityType: "canvas_node", entityId: groupId, action: "create", summary: "创建审核分组" },
        { entityType: "canvas_node", entityId: source.id, action: "merge", summary: "合并来源节点" },
      ],
      command: {
        type: "organize_mindmap",
        projectId: "pixelmind",
        documentId: initial.id,
        expectedRevision: initial.revision,
        operations: [
          { type: "create_node", node: { id: groupId, parentId: root.id, nodeType: "mindTopic", kind: "direction", title: "自动整理分组", content: "测试结构命令", position: { x: 120, y: 220 }, collapsed: false, tone: "blue", linkedEntities: [], metadata: { owner: "Organizer", side: "left" } } },
          { type: "move_node", nodeId: target.id, parentId: groupId },
          { type: "move_node", nodeId: source.id, parentId: groupId },
          { type: "update_node", nodeId: target.id, title: "审核后的目标主题", collapsed: false },
          { type: "merge_nodes", sourceNodeId: source.id, targetNodeId: target.id },
        ],
      },
      createdBy: "mindmap-organizer",
    } });
    expect(proposalResponse.statusCode, proposalResponse.body).toBe(201);
    expect(proposalResponse.json()).toMatchObject({ status: "pending", executionStatus: "pending", command: { type: "organize_mindmap", expectedRevision: initial.revision } });

    const beforeAcceptance = (await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/mindmap" })).json();
    expect(beforeAcceptance.revision).toBe(initial.revision);
    expect(beforeAcceptance.nodes.some((node: { id: string }) => node.id === groupId)).toBe(false);

    const decided = await built.app.inject({ method: "POST", url: `/api/proposals/${proposalResponse.json().id}/decide`, payload: { decision: "accepted" } });
    expect(decided.statusCode, decided.body).toBe(200);
    expect(decided.json()).toMatchObject({ status: "accepted", executionStatus: "applied" });
    const updated = (await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/mindmap" })).json();
    expect(updated.revision).toBe(initial.revision + 1);
    expect(updated.nodes).toContainEqual(expect.objectContaining({ id: groupId, parentId: root.id, title: "自动整理分组" }));
    expect(updated.nodes).toContainEqual(expect.objectContaining({ id: target.id, parentId: groupId, title: "审核后的目标主题" }));
    expect(updated.nodes.some((node: { id: string }) => node.id === source.id)).toBe(false);
    expect(updated.nodes.filter((node: { parentId: null }) => node.parentId === null)).toHaveLength(1);
    expect(updated.edges).toHaveLength(updated.nodes.length - 1);
    const parentById = new Map<string, string | null>(updated.nodes.map((node: { id: string; parentId: string | null }) => [node.id, node.parentId] as const));
    updated.nodes.forEach((node: { id: string }) => {
      const seen = new Set<string>();
      let current: string | null = node.id;
      while (current) {
        expect(seen.has(current)).toBe(false);
        seen.add(current);
        current = parentById.get(current) ?? null;
      }
    });
    const canvasEvent = await built.database.selectFrom("event_log").selectAll().where("entity_id", "=", initial.id).orderBy("sequence", "desc").executeTakeFirst();
    expect(JSON.parse(canvasEvent!.payload_json)).toMatchObject({ proposal: true, operationCount: 5, revision: initial.revision + 1 });
  });

  it("rejects a stale reviewed command and rolls the entire decision back", async () => {
    const initial = (await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/mindmap" })).json();
    const root = initial.nodes.find((node: { parentId: string | null }) => node.parentId === null);
    const groupId = randomUUID();
    const proposal = (await built.app.inject({ method: "POST", url: "/api/proposals", payload: {
      projectId: "pixelmind", title: "即将过期的整理命令", summary: "revision 冲突测试", kind: "organize", risk: "low",
      evidence: [`revision ${initial.revision}`], changes: [{ entityType: "canvas_node", entityId: groupId, action: "create", summary: "不应落库" }],
      command: { type: "organize_mindmap", projectId: "pixelmind", documentId: initial.id, expectedRevision: initial.revision, operations: [{ type: "create_node", node: { id: groupId, parentId: root.id, nodeType: "mindTopic", kind: "direction", title: "过期分组", content: "", position: { x: 100, y: 100 }, collapsed: false, tone: "blue", linkedEntities: [], metadata: {} } }] },
      createdBy: "test",
    } })).json();
    const concurrentSave = await built.app.inject({ method: "PUT", url: "/api/projects/pixelmind/canvases/mindmap", payload: { expectedRevision: initial.revision, title: initial.title, viewport: initial.viewport, nodes: initial.nodes, edges: initial.edges } });
    expect(concurrentSave.statusCode, concurrentSave.body).toBe(200);

    const decided = await built.app.inject({ method: "POST", url: `/api/proposals/${proposal.id}/decide`, payload: { decision: "accepted" } });
    expect(decided.statusCode).toBe(409);
    expect(decided.json().error).toBe("CANVAS_CONFLICT");
    const after = (await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/mindmap" })).json();
    expect(after.revision).toBe(initial.revision + 1);
    expect(after.nodes.some((node: { id: string }) => node.id === groupId)).toBe(false);
    expect(await built.coreRepository.getProposal(proposal.id)).toMatchObject({ status: "pending", executionStatus: "pending", executedAt: null });
  });
});
