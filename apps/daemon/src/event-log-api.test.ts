import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("project event log API", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("scopes, filters, summarizes and exports durable audit events", async () => {
    const created = await built.app.inject({ method: "POST", url: "/api/ideas", payload: { projectId: "pixelmind", title: "日志检索验收", body: "必须只出现在 PixelMind 日志" } });
    expect(created.statusCode).toBe(201);
    await built.app.inject({ method: "POST", url: "/api/ideas", payload: { projectId: "edgemind", title: "另一个项目事件" } });

    const logs = await built.app.inject({ method: "GET", url: "/api/event-log?projectId=pixelmind&entityType=idea&limit=50" });
    expect(logs.statusCode, logs.body).toBe(200);
    expect(logs.json().items).toContainEqual(expect.objectContaining({ type: "idea.created", projectId: "pixelmind", entityId: created.json().id, actorType: "human" }));
    expect(logs.json().items.every((item: { projectId: string }) => item.projectId === "pixelmind")).toBe(true);

    const searched = await built.app.inject({ method: "GET", url: "/api/event-log?projectId=pixelmind&search=idea.created" });
    expect(searched.json().total).toBeGreaterThan(0);

    const date = new Date().toISOString().slice(0, 10);
    const digest = await built.app.inject({ method: "GET", url: `/api/projects/pixelmind/digest?date=${date}&utcOffsetMinutes=0` });
    expect(digest.statusCode, digest.body).toBe(200);
    expect(digest.json()).toMatchObject({ projectId: "pixelmind", date });
    expect(digest.json().totalEvents).toBeGreaterThan(0);
    expect(digest.json().summary).toContain("可审计活动");

    const exported = await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/logs/export?format=markdown" });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/markdown");
    expect(exported.body).toContain("# 项目日志");
    expect(exported.body).toContain(created.json().id);
  });
});
