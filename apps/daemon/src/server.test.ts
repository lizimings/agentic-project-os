import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";

describe("projectd inbox API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await buildServer({ databaseFilename: ":memory:" }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("persists, updates and archives an inbox item with audit events", async () => {
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/inbox",
      headers: { "x-pcc-actor-type": "agent", "x-pcc-actor-id": "codex" },
      payload: { title: "从 MCP 捕获需求", source: "MCP", project: "PixelMind", kind: "需求" },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json();
    expect(created.project).toBe("PixelMind");

    const updatedResponse = await app.inject({
      method: "PATCH",
      url: `/api/inbox/${created.id}`,
      payload: { project: "EdgeMind", kind: "风险" },
    });
    expect(updatedResponse.statusCode).toBe(200);
    expect(updatedResponse.json().project).toBe("EdgeMind");

    const deletedResponse = await app.inject({ method: "DELETE", url: `/api/inbox/${created.id}` });
    expect(deletedResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/api/inbox" });
    expect(listResponse.json().items.some((item: { id: string }) => item.id === created.id)).toBe(false);
  });

  it("returns structured validation errors", async () => {
    const response = await app.inject({ method: "POST", url: "/api/inbox", payload: { title: "" } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("VALIDATION_ERROR");
  });

  it("assigns and archives Inbox items as an atomic batch", async () => {
    const first = (await app.inject({ method: "POST", url: "/api/inbox", payload: { title: "批量条目一" } })).json();
    const second = (await app.inject({ method: "POST", url: "/api/inbox", payload: { title: "批量条目二" } })).json();
    const assigned = await app.inject({ method: "POST", url: "/api/inbox/batch", payload: { action: "assign", ids: [first.id, second.id], projectId: "edgemind", kind: "需求" } });
    expect(assigned.statusCode, assigned.body).toBe(200);
    expect(assigned.json()).toMatchObject({ action: "assign", processed: 2, items: [{ projectId: "edgemind", project: "EdgeMind", kind: "需求" }, { projectId: "edgemind", project: "EdgeMind", kind: "需求" }] });

    const archived = await app.inject({ method: "POST", url: "/api/inbox/batch", payload: { action: "archive", ids: [first.id, second.id] } });
    expect(archived.statusCode, archived.body).toBe(200);
    expect(archived.json()).toMatchObject({ action: "archive", processed: 2, items: [] });
    const remaining = (await app.inject({ method: "GET", url: "/api/inbox" })).json().items;
    expect(remaining.some((item: { id: string }) => item.id === first.id || item.id === second.id)).toBe(false);
  });

  it("captures Inbox mentions and knowledge-graph edges in one transaction", async () => {
    const task = (await app.inject({ method: "GET", url: "/api/tasks?projectId=pixelmind" })).json().items[0];
    const response = await app.inject({ method: "POST", url: "/api/inbox/capture", payload: {
      title: "带 @ 引用的快速记录", note: "关联项目与任务", source: "快捷记录", kind: "想法", projectId: "pixelmind",
      mentions: [{ type: "project", id: "pixelmind", label: "@项目/PixelMind" }, { type: "task", id: task.id, label: `@任务/${task.title}` }],
    } });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ item: { projectId: "pixelmind" }, links: [{ sourceType: "inbox_item", targetType: "project", relation: "mentions" }, { sourceType: "inbox_item", targetType: "task", relation: "mentions" }] });
    const itemId = response.json().item.id;
    const graph = (await app.inject({ method: "GET", url: `/api/knowledge-graph?focusType=inbox_item&focusId=${itemId}&depth=1` })).json();
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: `inbox_item:${itemId}`, type: "inbox_item" }));
    expect(graph.links).toContainEqual(expect.objectContaining({ source: `inbox_item:${itemId}`, target: `task:${task.id}`, relation: "mentions" }));
  });
});
