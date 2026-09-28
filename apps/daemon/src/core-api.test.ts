import type { FastifyInstance } from "fastify";
import type { PccDatabase } from "@pcc/database";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("projectd core entity API", () => {
  let app: FastifyInstance;
  let database: PccDatabase;

  beforeEach(async () => {
    ({ app, database } = await buildServer({ databaseFilename: ":memory:" }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("keeps Project → Milestone → Plan → Task hierarchy and converts an Idea with a backlink", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Project Command Center", description: "本地优先项目指挥中心", vision: "让人和 Agent 共享同一份项目事实" },
    });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json();

    const milestoneResponse = await app.inject({
      method: "POST",
      url: "/api/milestones",
      payload: { projectId: project.id, title: "M1 · 核心实体闭环", status: "active" },
    });
    expect(milestoneResponse.statusCode).toBe(201);
    const milestone = milestoneResponse.json();

    const planResponse = await app.inject({
      method: "POST",
      url: "/api/plans",
      payload: { projectId: project.id, milestoneId: milestone.id, title: "实体持久化计划", status: "active" },
    });
    expect(planResponse.statusCode).toBe(201);
    const plan = planResponse.json();

    const taskResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        projectId: project.id,
        milestoneId: milestone.id,
        planId: plan.id,
        title: "完成层级 API",
        assigneeType: "agent",
        assigneeId: "codex",
      },
    });
    expect(taskResponse.statusCode).toBe(201);
    expect(taskResponse.json().planId).toBe(plan.id);

    const ideaResponse = await app.inject({
      method: "POST",
      url: "/api/ideas",
      payload: { projectId: project.id, title: "把项目关系做成 3D 图谱", body: "来自统一 EntityLink 数据源" },
    });
    expect(ideaResponse.statusCode).toBe(201);
    const idea = ideaResponse.json();

    const conversionResponse = await app.inject({
      method: "POST",
      url: `/api/ideas/${idea.id}/convert`,
      payload: { targetType: "task", planId: plan.id },
    });
    expect(conversionResponse.statusCode).toBe(201);
    const conversion = conversionResponse.json();
    expect(conversion.idea.status).toBe("converted");
    expect(conversion.target.planId).toBe(plan.id);
    expect(conversion.link.relation).toBe("derivedFrom");
    expect(conversion.link.targetId).toBe(idea.id);

    const linksResponse = await app.inject({
      method: "GET",
      url: `/api/entity-links?entityType=idea&entityId=${idea.id}`,
    });
    expect(linksResponse.statusCode).toBe(200);
    expect(linksResponse.json().items.some((link: { id: string }) => link.id === conversion.link.id)).toBe(true);

    const eventTypes = (await database.selectFrom("event_log").select("type").execute()).map((row) => row.type);
    expect(eventTypes).toContain("project.created");
    expect(eventTypes).toContain("idea.converted");
    expect(eventTypes).toContain("task.created");
  });

  it("rejects a Plan whose project does not match its Milestone", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/plans",
      payload: {
        projectId: "edgemind",
        milestoneId: "10000000-0000-4000-8000-000000000001",
        title: "错误层级计划",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("INVALID_HIERARCHY");
  });

  it("does not replace omitted Project fields during a status-only update", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        name: "Patch regression",
        description: "必须保留的说明",
        vision: "必须保留的愿景",
        color: "#123abc",
      },
    });
    const project = created.json();

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { status: "archived" },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      status: "archived",
      description: "必须保留的说明",
      vision: "必须保留的愿景",
      color: "#123abc",
    });
  });

  it("returns seeded entities and both directions of EntityLink queries", async () => {
    const [projects, milestones, plans, tasks, ideas, links] = await Promise.all([
      app.inject({ method: "GET", url: "/api/projects" }),
      app.inject({ method: "GET", url: "/api/milestones?projectId=pixelmind" }),
      app.inject({ method: "GET", url: "/api/plans?projectId=pixelmind" }),
      app.inject({ method: "GET", url: "/api/tasks?projectId=pixelmind" }),
      app.inject({ method: "GET", url: "/api/ideas?projectId=pixelmind" }),
      app.inject({ method: "GET", url: "/api/entity-links?entityType=task&entityId=30000000-0000-4000-8000-000000000001" }),
    ]);
    expect(projects.json().total).toBe(4);
    expect(milestones.json().total).toBe(1);
    expect(plans.json().total).toBe(1);
    expect(tasks.json().total).toBe(1);
    expect(ideas.json().total).toBe(1);
    expect(links.json().total).toBe(2);
  });

  it("persists Proposal decisions exactly once", async () => {
    const list = await app.inject({ method: "GET", url: "/api/proposals?status=pending" });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(2);
    const proposal = list.json().items[0];

    const accepted = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/decide`,
      payload: { decision: "accepted" },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe("accepted");
    expect(accepted.json().decidedAt).toBeTruthy();

    const duplicate = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/decide`,
      payload: { decision: "rejected" },
    });
    expect(duplicate.statusCode).toBe(409);

    const events = await database.selectFrom("event_log").select("type").where("entity_id", "=", proposal.id).execute();
    expect(events.map((event) => event.type)).toContain("proposal.accepted");
  });
});
