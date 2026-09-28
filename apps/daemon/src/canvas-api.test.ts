import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("persistent project canvases", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("bootstraps a real project mind map and atomically persists nodes, layout and EntityLinks", async () => {
    const whiteboardResponse = await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/whiteboard" });
    expect(whiteboardResponse.statusCode, whiteboardResponse.body).toBe(200);
    expect(whiteboardResponse.json()).toMatchObject({ projectId: "pixelmind", kind: "whiteboard", revision: 1 });
    expect(whiteboardResponse.json().nodes.length).toBeGreaterThan(1);
    const initialResponse = await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/mindmap" });
    expect(initialResponse.statusCode, initialResponse.body).toBe(200);
    const initial = initialResponse.json();
    expect(initial).toMatchObject({ projectId: "pixelmind", kind: "mindmap", revision: 1 });
    expect(initial.nodes.length).toBeGreaterThan(1);
    expect(initial.nodes.find((node: { parentId: string | null }) => node.parentId === null).linkedEntities).toContainEqual(expect.objectContaining({ type: "project", id: "pixelmind" }));

    const root = initial.nodes.find((node: { parentId: string | null }) => node.parentId === null);
    const idea = (await built.app.inject({ method: "GET", url: "/api/ideas?projectId=pixelmind" })).json().items[0];
    const childId = randomUUID();
    const edgeId = randomUUID();
    const child = {
      id: childId,
      parentId: root.id,
      nodeType: "mindTopic",
      kind: "idea",
      title: "持久化后的新主题",
      content: "刷新后仍需存在",
      position: { x: 812.5, y: 612.25 },
      collapsed: true,
      tone: "pink",
      linkedEntities: [{ type: "idea", id: idea.id, label: `@想法/${idea.title}` }],
      metadata: { side: "right", owner: "Codex" },
    };
    const savedResponse = await built.app.inject({
      method: "PUT",
      url: "/api/projects/pixelmind/canvases/mindmap",
      payload: {
        expectedRevision: initial.revision,
        title: initial.title,
        viewport: { x: 15, y: -20, zoom: 0.85 },
        nodes: [...initial.nodes, child],
        edges: [...initial.edges, { id: edgeId, source: root.id, target: childId, label: "发散", relation: "relatesTo", directed: true, metadata: {} }],
      },
    });
    expect(savedResponse.statusCode, savedResponse.body).toBe(200);
    expect(savedResponse.json()).toMatchObject({ revision: initial.revision + 1, viewport: { x: 15, y: -20, zoom: 0.85 } });

    const reloaded = (await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/mindmap" })).json();
    expect(reloaded.nodes).toContainEqual(expect.objectContaining({ id: childId, title: "持久化后的新主题", collapsed: true, position: { x: 812.5, y: 612.25 } }));
    const links = (await built.app.inject({ method: "GET", url: `/api/entity-links?entityType=canvas_node&entityId=${childId}` })).json().items;
    expect(links).toContainEqual(expect.objectContaining({ sourceType: "canvas_node", sourceId: childId, targetType: "idea", targetId: idea.id, relation: "mentions" }));
    const events = await built.database.selectFrom("event_log").selectAll().where("entity_id", "=", initial.id).execute();
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["canvas_document.created", "canvas_document.updated"]));
  });

  it("rejects stale revisions and cyclic mind-map parents without partial writes", async () => {
    const initial = (await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/mindmap" })).json();
    const first = initial.nodes[0];
    const second = initial.nodes[1];
    const stale = await built.app.inject({ method: "PUT", url: "/api/projects/pixelmind/canvases/mindmap", payload: { expectedRevision: 0, viewport: initial.viewport, nodes: initial.nodes, edges: initial.edges } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe("CANVAS_CONFLICT");

    const cyclicNodes = initial.nodes.map((node: { id: string }) => node.id === first.id ? { ...node, parentId: second.id } : node.id === second.id ? { ...node, parentId: first.id } : node);
    const cyclic = await built.app.inject({ method: "PUT", url: "/api/projects/pixelmind/canvases/mindmap", payload: { expectedRevision: initial.revision, viewport: initial.viewport, nodes: cyclicNodes, edges: initial.edges } });
    expect(cyclic.statusCode).toBe(409);
    expect((await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/mindmap" })).json().revision).toBe(initial.revision);
  });
});
