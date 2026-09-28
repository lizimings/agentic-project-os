import type { NotificationQuery, UpdateNotificationInput } from "@pcc/contracts";
import { CoreRepository, NotificationRepository } from "@pcc/database";
import { createCoreEvent, type CoreActor } from "@pcc/domain";
import { EventBroker } from "./event-broker.js";
import { EntityNotFoundError } from "./inbox-service.js";

const generatedPrefixes = ["proposal:", "task-overdue:", "task-due:", "milestone-overdue:", "milestone-due:", "workspace-error:", "attention-starvation:"];

export class InvalidNotificationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNotificationStateError";
  }
}

function mondayStart(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  return start;
}

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly core: CoreRepository,
    private readonly events: EventBroker,
  ) {}

  private async syncDerived() {
    const now = new Date();
    const nowIso = now.toISOString();
    const soon = new Date(now.getTime() + 3 * 86_400_000).toISOString();
    const weekStart = mondayStart(now);
    const weekStartDate = weekStart.toISOString().slice(0, 10);
    const [projects, proposals, milestones, tasks, workspaces, budgets, focusRows] = await Promise.all([
      this.core.listProjects(),
      this.core.listProposals(),
      this.core.listMilestones(),
      this.core.listTasks(),
      this.core.database.selectFrom("workspace_bindings").selectAll().execute(),
      this.core.database.selectFrom("attention_budgets").selectAll().where("week_start", "=", weekStartDate).execute(),
      this.core.database.selectFrom("focus_sessions").select(["project_id", "accumulated_seconds", "status", "started_at", "last_resumed_at"]).where("started_at", ">=", weekStart.toISOString()).execute(),
    ]);
    const projectNames = new Map(projects.map((project) => [project.id, project.name]));
    const active = new Set<string>();
    const add = async (input: Parameters<NotificationRepository["upsertDerived"]>[0]) => {
      active.add(input.fingerprint);
      await this.repository.upsertDerived(input);
    };

    for (const proposal of proposals.filter((item) => item.status === "pending")) {
      await add({ type: "proposal", projectId: proposal.projectId, title: proposal.title, body: `${proposal.summary} · 风险：${proposal.risk}`, severity: proposal.risk === "high" ? "critical" : proposal.risk === "medium" ? "warning" : "info", sourceType: "proposal", sourceId: proposal.id, route: `/decisions?focus=${proposal.id}`, fingerprint: `proposal:${proposal.id}` });
    }
    for (const milestone of milestones.filter((item) => item.targetDate && !["done", "archived"].includes(item.status))) {
      const overdue = milestone.targetDate! < nowIso;
      if (!overdue && milestone.targetDate! > soon) continue;
      await add({ type: overdue ? "overdue" : "due_soon", projectId: milestone.projectId, title: `${overdue ? "里程碑已逾期" : "里程碑即将到期"}：${milestone.title}`, body: `${projectNames.get(milestone.projectId) ?? milestone.projectId} · 目标 ${new Date(milestone.targetDate!).toLocaleString("zh-CN")}`, severity: overdue ? "critical" : "warning", sourceType: "milestone", sourceId: milestone.id, route: `/projects/${milestone.projectId}/milestones?focus=${milestone.id}`, fingerprint: `milestone-${overdue ? "overdue" : "due"}:${milestone.id}` });
    }
    for (const task of tasks.filter((item) => item.dueAt && !["done", "archived"].includes(item.status))) {
      const overdue = task.dueAt! < nowIso;
      if (!overdue && task.dueAt! > soon) continue;
      await add({ type: overdue ? "overdue" : "due_soon", projectId: task.projectId, title: `${overdue ? "任务已逾期" : "任务即将到期"}：${task.title}`, body: `${projectNames.get(task.projectId) ?? task.projectId} · 截止 ${new Date(task.dueAt!).toLocaleString("zh-CN")}`, severity: overdue ? "critical" : "warning", sourceType: "task", sourceId: task.id, route: `/projects/${task.projectId}/tasks?focus=${task.id}`, fingerprint: `task-${overdue ? "overdue" : "due"}:${task.id}` });
    }
    for (const workspace of workspaces.filter((item) => item.status === "error" || item.last_error)) {
      await add({ type: "workspace_error", projectId: workspace.project_id, title: `本地工作区需要处理：${projectNames.get(workspace.project_id) ?? workspace.project_id}`, body: workspace.last_error || "Git 工作区扫描状态异常", severity: "critical", sourceType: "workspace", sourceId: workspace.project_id, route: `/projects/${workspace.project_id}/worktrees?focus=workspace`, fingerprint: `workspace-error:${workspace.project_id}` });
    }
    const spentSeconds = new Map<string, number>();
    focusRows.forEach((session) => {
      if (!session.project_id) return;
      let seconds = session.accumulated_seconds;
      if (session.status === "running" && session.last_resumed_at) seconds += Math.max(0, Math.floor((now.getTime() - Date.parse(session.last_resumed_at)) / 1000));
      spentSeconds.set(session.project_id, (spentSeconds.get(session.project_id) ?? 0) + seconds);
    });
    for (const budget of budgets) {
      const spentMinutes = Math.floor((spentSeconds.get(budget.project_id) ?? 0) / 60);
      const gap = budget.minimum_minutes - spentMinutes;
      if (gap <= 0 || (now.getUTCDay() < 3 && spentMinutes > 0)) continue;
      await add({ type: "attention_starvation", projectId: budget.project_id, title: `${projectNames.get(budget.project_id) ?? budget.project_id} 本周关注不足`, body: `最低预算 ${budget.minimum_minutes} 分钟，已投入 ${spentMinutes} 分钟，还差 ${gap} 分钟。`, severity: gap >= 120 ? "critical" : "warning", sourceType: "attention_budget", sourceId: `${budget.project_id}:${budget.week_start}`, route: `/time?focus=${budget.project_id}`, fingerprint: `attention-starvation:${budget.project_id}:${budget.week_start}` });
    }
    await this.repository.resolveMissing(generatedPrefixes, active);
    await this.repository.reactivateExpired(nowIso);
  }

  async list(query: NotificationQuery) {
    await this.syncDerived();
    return this.repository.list(query);
  }

  async update(id: string, input: UpdateNotificationInput, actor: CoreActor, correlationId: string) {
    const current = await this.repository.get(id);
    if (!current) throw new EntityNotFoundError("Notification", id);
    const status = input.action === "snooze" ? "snoozed" : input.action;
    const snoozedUntil = input.action === "snooze" ? input.snoozedUntil : null;
    if (snoozedUntil && Date.parse(snoozedUntil) <= Date.now()) throw new InvalidNotificationStateError("稍后提醒时间必须晚于当前时间");
    const event = createCoreEvent("notification", id, "updated", actor, correlationId, { projectId: current.projectId, action: input.action, snoozedUntil });
    const updated = await this.repository.database.transaction().execute(async (transaction) => {
      const item = await this.repository.updateStatus(id, status, snoozedUntil, transaction);
      await this.core.appendEvent(event, transaction);
      return item;
    });
    if (!updated) throw new EntityNotFoundError("Notification", id);
    this.events.publish(event);
    return updated;
  }

  async readAll(actor: CoreActor, correlationId: string) {
    const event = createCoreEvent("notification", "all", "updated", actor, correlationId, { action: "read_all" });
    const count = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.readAll(transaction);
      await this.core.appendEvent(event, transaction);
      return updated;
    });
    this.events.publish(event);
    return { updated: count };
  }
}
