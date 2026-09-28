import { randomUUID } from "node:crypto";
import type { PccDatabase } from "./types.js";

const projectSeed = [
  ["pixelmind", "PixelMind", "AI 图像工作台与无限画布", "#4057f4", "active"],
  ["edgemind", "EdgeMind", "设备自动化与协议运行平台", "#7c5ce5", "risk"],
  ["content-studio", "Content Studio", "素材生产、审阅与发布桌面端", "#18a97a", "active"],
  ["protocol-runtime", "Protocol Runtime", "协议组件和设备能力运行时", "#ec8b22", "paused"],
] as const;

const inboxSeed = [
  ["知识图谱节点可以显示最近一次 Agent 输出", "@知识图谱 @工作树，节点 hover 时直接看摘要", "语音", null, "想法", 12],
  ["Canvas 网格性能需要在低端设备上做一次基准", "可能放进 M2 的验收计划", "快捷记录", "pixelmind", "需求", 90],
  ["EdgeMind 的 lease cleanup 应该有 dry-run", "Agent 可以先生成影响列表，再让人确认", "Agent", "edgemind", "风险", 1_440],
  ["每周自动生成所有项目的停滞报告", "按 24h / 3d / 7d 分级，并推荐下一步", "语音", null, "想法", 1_620],
  ["Gitea Webhook 应该保留签名失败证据", "关联到项目日志和对应工作树", "导入", null, "需求", 2_880],
] as const;

export async function seedDatabase(db: PccDatabase) {
  const now = new Date().toISOString();
  const actorCount = await db.selectFrom("actors").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow();
  if (Number(actorCount.count) === 0) {
    await db.insertInto("actors").values([
      { id: "local-user", name: "你", kind: "human", provider: "local", model: null, status: "available", capabilities_json: JSON.stringify(["review", "decision", "implementation"]), last_seen_at: now, created_at: now, updated_at: now },
      { id: "codex", name: "Codex", kind: "agent", provider: "openai", model: null, status: "available", capabilities_json: JSON.stringify(["coding", "review", "testing"]), last_seen_at: null, created_at: now, updated_at: now },
      { id: "organizer", name: "Organizer", kind: "agent", provider: "local-sandbox", model: null, status: "available", capabilities_json: JSON.stringify(["read_snapshot", "proposal"]), last_seen_at: null, created_at: now, updated_at: now },
    ]).execute();
  }
  const projectCount = await db.selectFrom("projects").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow();
  if (Number(projectCount.count) === 0) {
    await db.insertInto("projects").values(projectSeed.map(([id, name, description, color, status]) => ({
      id,
      name,
      description,
      vision: "",
      color,
      status,
      created_at: now,
      updated_at: now,
    }))).execute();
  }

  const inboxCount = await db.selectFrom("inbox_items").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow();
  if (Number(inboxCount.count) === 0) {
    await db.insertInto("inbox_items").values(inboxSeed.map(([title, note, source, projectId, kind, minutesAgo]) => {
      const createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
      return {
        id: randomUUID(),
        title,
        note,
        source,
        project_id: projectId,
        kind,
        created_at: createdAt,
        updated_at: createdAt,
        archived_at: null,
      };
    })).execute();
  }

  const milestoneCount = await db.selectFrom("milestones").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow();
  if (Number(milestoneCount.count) === 0) {
    const milestoneId = "10000000-0000-4000-8000-000000000001";
    const planId = "20000000-0000-4000-8000-000000000001";
    const taskId = "30000000-0000-4000-8000-000000000001";
    const ideaId = "40000000-0000-4000-8000-000000000001";

    await db.insertInto("milestones").values({
      id: milestoneId,
      project_id: "pixelmind",
      title: "M2 · Canvas 协作闭环",
      description: "完成画布网格、工作树证据与验收闭环。",
      status: "active",
      target_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000).toISOString(),
      position: 0,
      created_at: now,
      updated_at: now,
    }).execute();

    await db.insertInto("plans").values({
      id: planId,
      project_id: "pixelmind",
      milestone_id: milestoneId,
      title: "画布渲染验收计划",
      description: "覆盖实现、性能基准和人类验收。",
      status: "active",
      position: 0,
      created_at: now,
      updated_at: now,
    }).execute();

    await db.insertInto("tasks").values({
      id: taskId,
      project_id: "pixelmind",
      milestone_id: milestoneId,
      plan_id: planId,
      parent_task_id: null,
      title: "画布网格渲染验收",
      description: "确认视觉、性能和回归测试证据。",
      status: "in_progress",
      priority: "high",
      assignee_type: "agent",
      assignee_id: "codex",
      due_at: null,
      estimate_minutes: 50,
      position: 0,
      created_at: now,
      updated_at: now,
    }).execute();

    await db.insertInto("ideas").values({
      id: ideaId,
      project_id: "pixelmind",
      title: "知识图谱节点显示最近一次 Agent 输出",
      body: "节点 hover 时直接查看工作树或任务的最近产出摘要。",
      status: "developing",
      source_type: "voice",
      source_id: null,
      created_at: now,
      updated_at: now,
    }).execute();

    await db.insertInto("entity_links").values([
      {
        id: "50000000-0000-4000-8000-000000000001",
        source_type: "idea",
        source_id: ideaId,
        target_type: "task",
        target_id: taskId,
        relation: "relatesTo",
        label: "图谱交互依赖画布验收",
        created_at: now,
      },
      {
        id: "50000000-0000-4000-8000-000000000002",
        source_type: "task",
        source_id: taskId,
        target_type: "project",
        target_id: "pixelmind",
        relation: "implements",
        label: null,
        created_at: now,
      },
    ]).execute();
  }

  const proposalCount = await db.selectFrom("proposals").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow();
  if (Number(proposalCount.count) === 0) {
    await db.insertInto("proposals").values([
      {
        id: "60000000-0000-4000-8000-000000000001",
        project_id: "pixelmind",
        title: "将 Canvas 性能基准移入 M2 验收计划",
        summary: "Organizer 发现该 Inbox 需求与当前计划高度相关，建议转成任务并建立来源链接。",
        kind: "convert",
        status: "pending",
        risk: "low",
        evidence_json: JSON.stringify(["Inbox: Canvas 网格性能需要在低端设备上做一次基准", "M2 当前状态: active", "关联计划: 画布渲染验收计划"]),
        changes_json: JSON.stringify([{ entityType: "task", entityId: null, action: "create", summary: "在画布渲染验收计划下创建性能基准任务" }]),
        command_json: null,
        execution_status: "not_applicable",
        execution_error: null,
        executed_at: null,
        created_by: "organizer",
        created_at: now,
        decided_at: null,
      },
      {
        id: "60000000-0000-4000-8000-000000000002",
        project_id: "edgemind",
        title: "为 EdgeMind 安排 35 分钟最小推进时间盒",
        summary: "该项目连续 3 天没有获得专注时间，建议从 PixelMind 的超额预算中重新平衡。",
        kind: "schedule",
        status: "pending",
        risk: "medium",
        evidence_json: JSON.stringify(["EdgeMind 连续 3 天无进展", "PixelMind 已使用本周 68% 专注时间"]),
        changes_json: JSON.stringify([{ entityType: "time_block", entityId: null, action: "create", summary: "今天 13:40 创建 35 分钟 EdgeMind 时间盒" }]),
        command_json: null,
        execution_status: "not_applicable",
        execution_error: null,
        executed_at: null,
        created_by: "organizer",
        created_at: now,
        decided_at: null,
      },
    ]).execute();
  }
}
