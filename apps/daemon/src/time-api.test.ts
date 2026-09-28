import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("ADHD time management API", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("persists a Task-linked time block and a resumable focus session", async () => {
    const startAt = new Date(Date.now() + 3_600_000).toISOString();
    const endAt = new Date(Date.now() + 5_400_000).toISOString();
    const created = await built.app.inject({
      method: "POST",
      url: "/api/time-blocks",
      payload: {
        taskId: "30000000-0000-4000-8000-000000000001",
        title: "画布验收专注块",
        startAt,
        endAt,
        energy: "high",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ projectId: "pixelmind", taskId: "30000000-0000-4000-8000-000000000001", status: "planned", kind: "focus" });
    const blockId = created.json().id;

    const listed = await built.app.inject({ method: "GET", url: `/api/time-blocks?from=${encodeURIComponent(new Date(Date.now()).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 7_200_000).toISOString())}` });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items.map((item: { id: string }) => item.id)).toContain(blockId);

    const focus = await built.app.inject({ method: "POST", url: "/api/focus-sessions", payload: { timeBlockId: blockId, title: "执行画布验收" } });
    expect(focus.statusCode).toBe(201);
    expect(focus.json()).toMatchObject({ projectId: "pixelmind", timeBlockId: blockId, status: "running", accumulatedSeconds: 0 });
    const focusId = focus.json().id;
    expect((await built.timeRepository.getBlock(blockId))?.status).toBe("in_progress");

    const duplicate = await built.app.inject({ method: "POST", url: "/api/focus-sessions", payload: { title: "不应并行的第二个专注" } });
    expect(duplicate.statusCode).toBe(409);

    await built.database.updateTable("focus_sessions").set({ last_resumed_at: new Date(Date.now() - 5_000).toISOString() }).where("id", "=", focusId).execute();
    const paused = await built.app.inject({ method: "POST", url: `/api/focus-sessions/${focusId}/pause` });
    expect(paused.statusCode).toBe(200);
    expect(paused.json().status).toBe("paused");
    expect(paused.json().accumulatedSeconds).toBeGreaterThanOrEqual(4);
    expect((await built.app.inject({ method: "GET", url: "/api/focus-sessions/current" })).json().status).toBe("paused");

    expect((await built.app.inject({ method: "POST", url: `/api/focus-sessions/${focusId}/resume` })).json().status).toBe("running");
    const completed = await built.app.inject({ method: "POST", url: `/api/focus-sessions/${focusId}/complete`, payload: { completeTask: true } });
    expect(completed.json().status).toBe("completed");
    expect((await built.app.inject({ method: "GET", url: "/api/focus-sessions/current" })).json()).toBeNull();
    expect((await built.timeRepository.getBlock(blockId))?.status).toBe("completed");

    expect((await built.app.inject({ method: "GET", url: "/api/tasks/30000000-0000-4000-8000-000000000001" })).json().status).toBe("done");
    expect((await built.app.inject({ method: "GET", url: "/api/plans/20000000-0000-4000-8000-000000000001" })).json().status).toBe("completed");
    expect((await built.app.inject({ method: "GET", url: "/api/milestones/10000000-0000-4000-8000-000000000001" })).json().status).toBe("completed");
    const evidence = await built.database.selectFrom("entity_links").selectAll().where("source_type", "=", "focus_session").where("source_id", "=", focusId).where("target_type", "=", "task").executeTakeFirst();
    expect(evidence).toMatchObject({ target_id: "30000000-0000-4000-8000-000000000001", relation: "evidenceFor" });

    const summary = await built.app.inject({ method: "GET", url: `/api/time-summary?from=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}&utcOffsetMinutes=480` });
    expect(summary.statusCode, summary.body).toBe(200);
    expect(summary.json().focusSeconds).toBeGreaterThanOrEqual(4);
    expect(summary.json()).toMatchObject({ sessionCount: 1, completedSessionCount: 1, byProject: [{ key: "pixelmind", sessionCount: 1 }] });

    const events = await built.database.selectFrom("event_log").select("type").where("entity_id", "=", focusId).orderBy("sequence", "asc").execute();
    expect(events.map((event) => event.type)).toEqual(["focus_session.started", "focus_session.paused", "focus_session.resumed", "focus_session.completed"]);
    const hierarchyEvents = await built.database.selectFrom("event_log").select(["type", "entity_id"]).where("type", "in", ["task.completed", "task.linked", "plan.completed", "milestone.completed"]).execute();
    expect(hierarchyEvents.map((event) => event.type)).toEqual(expect.arrayContaining(["task.completed", "task.linked", "plan.completed", "milestone.completed"]));
  });

  it("validates block ranges and persists weekly project attention budgets", async () => {
    const invalid = await built.app.inject({ method: "POST", url: "/api/time-blocks", payload: { title: "错误区间", startAt: "2026-08-20T10:00:00.000Z", endAt: "2026-08-20T09:00:00.000Z" } });
    expect(invalid.statusCode).toBe(400);

    const budget = await built.app.inject({ method: "PUT", url: "/api/attention-budgets", payload: { projectId: "edgemind", weekStart: "2026-08-17", plannedMinutes: 180, minimumMinutes: 60, maximumMinutes: 300 } });
    expect(budget.statusCode).toBe(200);
    expect(budget.json()).toMatchObject({ projectId: "edgemind", plannedMinutes: 180, minimumMinutes: 60, maximumMinutes: 300 });
    const updated = await built.app.inject({ method: "PUT", url: "/api/attention-budgets", payload: { projectId: "edgemind", weekStart: "2026-08-17", plannedMinutes: 210, minimumMinutes: 90, maximumMinutes: 300 } });
    expect(updated.json().plannedMinutes).toBe(210);
    const listed = await built.app.inject({ method: "GET", url: "/api/attention-budgets?weekStart=2026-08-17" });
    expect(listed.json()).toMatchObject({ total: 1, items: [{ projectId: "edgemind", minimumMinutes: 90 }] });
    const removed = await built.app.inject({ method: "DELETE", url: "/api/attention-budgets?weekStart=2026-08-17&projectId=edgemind" });
    expect(removed.statusCode, removed.body).toBe(204);
    expect((await built.app.inject({ method: "GET", url: "/api/attention-budgets?weekStart=2026-08-17" })).json().total).toBe(0);
  });

  it("classifies minimum/planned/maximum attention thresholds and gates rebalancing behind a Proposal", async () => {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekday = monday.getDay() || 7;
    monday.setDate(monday.getDate() - weekday + 1);
    const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    const blockStart = new Date(monday); blockStart.setHours(9, 0, 0, 0);
    const createBlock = (projectId: string, title: string, minutes: number, offsetHours: number) => built.app.inject({ method: "POST", url: "/api/time-blocks", payload: { projectId, title, startAt: new Date(blockStart.getTime() + offsetHours * 3_600_000).toISOString(), endAt: new Date(blockStart.getTime() + offsetHours * 3_600_000 + minutes * 60_000).toISOString() } });
    await Promise.all([
      built.app.inject({ method: "PUT", url: "/api/attention-budgets", payload: { projectId: "edgemind", weekStart, plannedMinutes: 180, minimumMinutes: 60, maximumMinutes: 240 } }),
      built.app.inject({ method: "PUT", url: "/api/attention-budgets", payload: { projectId: "pixelmind", weekStart, plannedMinutes: 60, minimumMinutes: 30, maximumMinutes: 90 } }),
      built.app.inject({ method: "PUT", url: "/api/attention-budgets", payload: { projectId: "content-studio", weekStart, plannedMinutes: 90, minimumMinutes: 30, maximumMinutes: 180 } }),
    ]);
    await createBlock("pixelmind", "吞占注意力", 120, 0);
    await createBlock("content-studio", "已覆盖但尚未兑现", 45, 3);

    const analysis = await built.app.inject({ method: "GET", url: `/api/attention-analysis?weekStart=${weekStart}&utcOffsetMinutes=${-now.getTimezoneOffset()}` });
    expect(analysis.statusCode, analysis.body).toBe(200);
    expect(analysis.json()).toMatchObject({ starvingCount: 1, atRiskCount: 1, overfocusedCount: 1 });
    const byProject = new Map(analysis.json().items.map((item: { projectId: string; state: string }) => [item.projectId, item]));
    expect(byProject.get("edgemind")).toMatchObject({ state: "starving", deficitMinutes: 60, scheduledMinutes: 0 });
    expect(byProject.get("pixelmind")).toMatchObject({ state: "overfocused", overageMinutes: 30, scheduledMinutes: 120 });
    expect(byProject.get("content-studio")).toMatchObject({ state: "at_risk", scheduledMinutes: 45, actualMinutes: 0 });

    const blocksBefore = await built.database.selectFrom("time_blocks").select("id").execute();
    const proposed = await built.app.inject({ method: "POST", url: "/api/attention-analysis/rebalance", payload: { weekStart, utcOffsetMinutes: -now.getTimezoneOffset(), energy: "low" } });
    expect(proposed.statusCode, proposed.body).toBe(201);
    expect(proposed.json()).toMatchObject({ projectId: "edgemind", status: "pending", kind: "schedule", risk: "medium", createdBy: "attention-guard", command: { type: "create_time_block", input: { projectId: "edgemind", source: "rebalance", energy: "low" } } });
    expect(await built.database.selectFrom("time_blocks").select("id").execute()).toHaveLength(blocksBefore.length);

    const accepted = await built.app.inject({ method: "POST", url: `/api/proposals/${proposed.json().id}/decide`, payload: { decision: "accepted" } });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json()).toMatchObject({ status: "accepted", executionStatus: "applied" });
    const rebalanceBlock = await built.database.selectFrom("time_blocks").selectAll().where("project_id", "=", "edgemind").where("source", "=", "rebalance").executeTakeFirst();
    expect(rebalanceBlock).toBeTruthy();
  });
});
