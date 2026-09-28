import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("Idea duplicate detection and merge", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("detects explainable duplicates and atomically merges their content, links and audit trail", async () => {
    const first = await built.app.inject({ method: "POST", url: "/api/ideas", payload: { projectId: "pixelmind", title: "知识图谱显示 Agent 最近输出", body: "悬停节点时显示最后一次产出", status: "developing", sourceType: "manual" } });
    const second = await built.app.inject({ method: "POST", url: "/api/ideas", payload: { projectId: "pixelmind", title: "知识图谱：显示 Agent 最近输出", body: "还应该展示提交证据", status: "validated", sourceType: "voice" } });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const targetId = first.json().id as string;
    const sourceId = second.json().id as string;

    const duplicates = await built.app.inject({ method: "GET", url: "/api/ideas/duplicates?projectId=pixelmind" });
    expect(duplicates.statusCode, duplicates.body).toBe(200);
    expect(duplicates.json().items.some((item: { ideaId: string; duplicateId: string; score: number; reason: string }) => new Set([item.ideaId, item.duplicateId]).size === 2 && [item.ideaId, item.duplicateId].includes(targetId) && [item.ideaId, item.duplicateId].includes(sourceId) && item.score === 1 && item.reason === "same_title")).toBe(true);

    const merged = await built.app.inject({ method: "POST", url: `/api/ideas/${targetId}/merge`, payload: { sourceIdeaIds: [sourceId], title: "知识图谱节点活动摘要" } });
    expect(merged.statusCode, merged.body).toBe(200);
    expect(merged.json().idea).toMatchObject({ id: targetId, title: "知识图谱节点活动摘要", status: "validated" });
    expect(merged.json().idea.body).toContain("悬停节点时显示最后一次产出");
    expect(merged.json().idea.body).toContain("还应该展示提交证据");
    expect((await built.app.inject({ method: "GET", url: `/api/ideas/${sourceId}` })).json().status).toBe("archived");
    expect(merged.json().links).toEqual([expect.objectContaining({ sourceType: "idea", sourceId: targetId, targetType: "idea", targetId: sourceId, relation: "derivedFrom" })]);

    const events = await built.database.selectFrom("event_log").select(["type", "entity_id"]).where("entity_id", "in", [targetId, sourceId]).execute();
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["idea.updated", "idea.linked", "idea.archived"]));
    const remaining = await built.app.inject({ method: "GET", url: "/api/ideas/duplicates?projectId=pixelmind" });
    expect(remaining.json().items.some((item: { ideaId: string; duplicateId: string }) => [item.ideaId, item.duplicateId].includes(sourceId))).toBe(false);
  });
});
