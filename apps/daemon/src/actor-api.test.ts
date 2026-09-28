import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("actor registry and task assignment", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("registers stable actor entities and persists relational task assignments", async () => {
    const initial = await built.app.inject({ method: "GET", url: "/api/actors" });
    expect(initial.statusCode, initial.body).toBe(200);
    expect(initial.json().items).toContainEqual(expect.objectContaining({ id: "codex", kind: "agent" }));

    const createdActor = await built.app.inject({ method: "POST", url: "/api/actors", payload: { id: "review-agent", name: "Review Agent", kind: "agent", provider: "custom", capabilities: ["review"] } });
    expect(createdActor.statusCode, createdActor.body).toBe(201);

    const task = await built.app.inject({ method: "POST", url: "/api/tasks", payload: {
      projectId: "pixelmind", milestoneId: "10000000-0000-4000-8000-000000000001", planId: "20000000-0000-4000-8000-000000000001",
      title: "Agent 关系验证", assigneeType: "agent", assigneeId: "review-agent",
    } });
    expect(task.statusCode, task.body).toBe(201);
    const links = (await built.app.inject({ method: "GET", url: `/api/entity-links?entityType=task&entityId=${task.json().id}` })).json();
    expect(links.items).toContainEqual(expect.objectContaining({ sourceType: "actor", sourceId: "review-agent", targetType: "task", targetId: task.json().id, label: "task:assignee" }));

    const invalid = await built.app.inject({ method: "PATCH", url: `/api/tasks/${task.json().id}`, payload: { assigneeType: "agent", assigneeId: "missing-agent" } });
    expect(invalid.statusCode, invalid.body).toBe(400);
  });
});
