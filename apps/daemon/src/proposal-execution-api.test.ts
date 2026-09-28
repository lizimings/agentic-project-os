import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("executable Proposal decisions", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("atomically converts Inbox to Idea with a derivedFrom link when accepted", async () => {
    const inboxResponse = await built.app.inject({ method: "POST", url: "/api/inbox", payload: { title: "接受后转为想法", note: "保留这段原始说明", projectId: "pixelmind", project: "PixelMind", kind: "想法", source: "快捷记录" } });
    const inbox = inboxResponse.json();
    const created = await built.app.inject({ method: "POST", url: "/api/proposals", payload: {
      projectId: "pixelmind",
      title: "把 Inbox 转为 Idea",
      summary: "原子执行转化与来源链接。",
      kind: "convert",
      risk: "low",
      evidence: [`Inbox ${inbox.id}`],
      changes: [{ entityType: "idea", entityId: null, action: "create", summary: "创建 Idea 并建立来源" }],
      command: { type: "convert_inbox_to_idea", inboxItemId: inbox.id, projectId: "pixelmind" },
      createdBy: "test",
    } });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ executionStatus: "pending", command: { type: "convert_inbox_to_idea" } });

    const decided = await built.app.inject({ method: "POST", url: `/api/proposals/${created.json().id}/decide`, payload: { decision: "accepted" } });
    expect(decided.statusCode, decided.body).toBe(200);
    expect(decided.json()).toMatchObject({ status: "accepted", executionStatus: "applied", executionError: null });
    expect(decided.json().executedAt).toEqual(expect.any(String));
    expect((await built.app.inject({ method: "GET", url: "/api/inbox" })).json().items.some((item: { id: string }) => item.id === inbox.id)).toBe(false);
    const ideas = (await built.app.inject({ method: "GET", url: "/api/ideas?projectId=pixelmind" })).json().items;
    const idea = ideas.find((item: { sourceId: string }) => item.sourceId === inbox.id);
    expect(idea).toMatchObject({ title: "接受后转为想法", body: "保留这段原始说明", sourceType: "inbox_item" });
    const links = (await built.app.inject({ method: "GET", url: `/api/entity-links?entityType=idea&entityId=${idea.id}` })).json().items;
    expect(links).toContainEqual(expect.objectContaining({ sourceId: idea.id, targetType: "inbox_item", targetId: inbox.id, relation: "derivedFrom" }));
  });

  it("converts Inbox to every supported project hierarchy entity and preserves derivedFrom", async () => {
    const milestone = (await built.app.inject({ method: "GET", url: "/api/milestones?projectId=pixelmind" })).json().items[0];
    const plan = (await built.app.inject({ method: "GET", url: `/api/plans?milestoneId=${milestone.id}` })).json().items[0];
    const cases = [
      { targetType: "idea", endpoint: "/api/ideas?projectId=pixelmind" },
      { targetType: "milestone", endpoint: "/api/milestones?projectId=pixelmind" },
      { targetType: "plan", endpoint: `/api/plans?milestoneId=${milestone.id}`, milestoneId: milestone.id },
      { targetType: "task", endpoint: `/api/tasks?planId=${plan.id}`, milestoneId: milestone.id, planId: plan.id },
    ];

    for (const itemCase of cases) {
      const title = `Inbox 转 ${itemCase.targetType}`;
      const inbox = (await built.app.inject({ method: "POST", url: "/api/inbox", payload: { title, note: "来源说明必须保留", projectId: "pixelmind", project: "PixelMind", kind: "需求", source: "快捷记录" } })).json();
      const proposal = await built.app.inject({ method: "POST", url: "/api/proposals", payload: {
        projectId: "pixelmind", title: `转换 ${title}`, summary: "确认后执行原子转换", kind: "convert", risk: "low",
        evidence: [`Inbox ${inbox.id}`], changes: [{ entityType: itemCase.targetType, entityId: null, action: "create", summary: title }],
        command: { type: "convert_inbox_to_entity", inboxItemId: inbox.id, projectId: "pixelmind", targetType: itemCase.targetType, milestoneId: itemCase.milestoneId, planId: itemCase.planId }, createdBy: "test",
      } });
      expect(proposal.statusCode, proposal.body).toBe(201);
      const decided = await built.app.inject({ method: "POST", url: `/api/proposals/${proposal.json().id}/decide`, payload: { decision: "accepted" } });
      expect(decided.statusCode, decided.body).toBe(200);
      expect(decided.json()).toMatchObject({ executionStatus: "applied" });
      const entity = (await built.app.inject({ method: "GET", url: itemCase.endpoint })).json().items.find((candidate: { title: string }) => candidate.title === title);
      expect(entity).toBeTruthy();
      const links = (await built.app.inject({ method: "GET", url: `/api/entity-links?entityType=${itemCase.targetType}&entityId=${entity.id}` })).json().items;
      expect(links).toContainEqual(expect.objectContaining({ sourceType: itemCase.targetType, sourceId: entity.id, targetType: "inbox_item", targetId: inbox.id, relation: "derivedFrom" }));
    }
  });

  it("rolls back a failing command and keeps the Proposal pending", async () => {
    const created = await built.app.inject({ method: "POST", url: "/api/proposals", payload: {
      projectId: "pixelmind", title: "错误命令", summary: "引用不存在的 Inbox", kind: "convert", risk: "low",
      evidence: ["test"], changes: [{ entityType: "idea", entityId: null, action: "create", summary: "不应创建" }],
      command: { type: "convert_inbox_to_idea", inboxItemId: "99999999-9999-4999-8999-999999999999", projectId: "pixelmind" }, createdBy: "test",
    } });
    const decided = await built.app.inject({ method: "POST", url: `/api/proposals/${created.json().id}/decide`, payload: { decision: "accepted" } });
    expect(decided.statusCode).toBe(404);
    const proposal = await built.coreRepository.getProposal(created.json().id);
    expect(proposal).toMatchObject({ status: "pending", executionStatus: "pending", executedAt: null });
  });

  it("creates a time block from an accepted command and labels legacy advice honestly", async () => {
    const startAt = "2026-08-21T02:00:00.000Z";
    const endAt = "2026-08-21T02:30:00.000Z";
    const created = await built.app.inject({ method: "POST", url: "/api/proposals", payload: {
      projectId: "edgemind", title: "安排最小推进", summary: "创建 30 分钟时间块", kind: "schedule", risk: "medium",
      evidence: ["最低保障缺口"], changes: [{ entityType: "time_block", entityId: null, action: "create", summary: "安排 30 分钟" }],
      command: { type: "create_time_block", input: { projectId: "edgemind", title: "EdgeMind 最小推进", startAt, endAt, kind: "focus", energy: "medium", source: "agent" } }, createdBy: "test",
    } });
    const decided = await built.app.inject({ method: "POST", url: `/api/proposals/${created.json().id}/decide`, payload: { decision: "accepted" } });
    expect(decided.json().executionStatus).toBe("applied");
    const blocks = (await built.app.inject({ method: "GET", url: `/api/time-blocks?from=${encodeURIComponent("2026-08-21T00:00:00.000Z")}&to=${encodeURIComponent("2026-08-22T00:00:00.000Z")}` })).json().items;
    expect(blocks).toContainEqual(expect.objectContaining({ projectId: "edgemind", title: "EdgeMind 最小推进", source: "agent" }));

    const legacy = await built.app.inject({ method: "POST", url: "/api/proposals/60000000-0000-4000-8000-000000000001/decide", payload: { decision: "accepted" } });
    expect(legacy.json()).toMatchObject({ status: "accepted", executionStatus: "not_applicable", command: null });
  });
});
