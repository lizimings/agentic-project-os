import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("global FTS search API", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("searches seeded entities, scopes projects and refreshes after writes", async () => {
    const canvas = await built.app.inject({ method: "GET", url: "/api/search?q=Canvas&limit=20" });
    expect(canvas.statusCode, canvas.body).toBe(200);
    expect(canvas.json().items).toContainEqual(expect.objectContaining({ entityType: "milestone", projectId: "pixelmind", route: expect.stringContaining("/projects/pixelmind/") }));

    const scoped = await built.app.inject({ method: "GET", url: "/api/search?q=项目&projectId=edgemind" });
    expect(scoped.statusCode, scoped.body).toBe(200);
    expect(scoped.json().items.every((item: { projectId: string | null }) => item.projectId === "edgemind")).toBe(true);

    const created = await built.app.inject({ method: "POST", url: "/api/inbox", payload: { title: "跨仓库发布节奏", note: "让多个 Agent 分批验收", source: "快捷记录", projectId: "pixelmind", kind: "想法" } });
    expect(created.statusCode, created.body).toBe(201);
    const refreshed = await built.app.inject({ method: "GET", url: "/api/search?q=跨仓库" });
    expect(refreshed.statusCode, refreshed.body).toBe(200);
    expect(refreshed.json().items[0]).toEqual(expect.objectContaining({ entityType: "inbox_item", title: "跨仓库发布节奏", route: expect.stringContaining("/inbox") }));
  });

  it("handles punctuation safely and filters entity types", async () => {
    const response = await built.app.inject({ method: "GET", url: `/api/search?q=${encodeURIComponent('Canvas "闭环"')}&types=task,milestone` });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().items.every((item: { entityType: string }) => ["task", "milestone"].includes(item.entityType))).toBe(true);
  });
});
