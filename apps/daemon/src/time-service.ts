import { randomUUID } from "node:crypto";
import type { AttentionAnalysis, AttentionAnalysisQuery, AttentionHealthItem, CompleteFocusSessionInput, CreateAttentionRebalanceProposalInput, CreateTimeBlockInput, EventEnvelope, StartFocusSessionInput, TimeRangeQuery, TimeSummaryQuery, UpdateTimeBlockInput, UpsertAttentionBudgetInput } from "@pcc/contracts";
import { CoreRepository, TimeRepository } from "@pcc/database";
import { createCoreEvent, type CoreActor } from "@pcc/domain";
import { CoreService, EntityConflictError, InvalidHierarchyError } from "./core-service.js";
import { EventBroker } from "./event-broker.js";
import { EntityNotFoundError } from "./inbox-service.js";

export class InvalidTimeStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTimeStateError";
  }
}

export class TimeService {
  constructor(
    private readonly repository: TimeRepository,
    private readonly coreRepository: CoreRepository,
    private readonly core: CoreService,
    private readonly events: EventBroker,
  ) {}

  private publish(events: EventEnvelope[]) { events.forEach((event) => this.events.publish(event)); }

  listBlocks(query: TimeRangeQuery) { return this.repository.listBlocks(query); }
  summarizeFocus(query: TimeSummaryQuery) { return this.repository.summarizeFocus(query); }

  private async resolveHierarchy(input: { projectId: string | null; taskId: string | null }) {
    let projectId = input.projectId;
    if (input.taskId) {
      const task = await this.core.getTask(input.taskId);
      if (projectId && task.projectId !== projectId) throw new InvalidHierarchyError("时间记录的 Project 与 Task 不一致");
      projectId = task.projectId;
    }
    if (projectId) await this.core.getProject(projectId);
    return { projectId, taskId: input.taskId };
  }

  async createBlock(input: CreateTimeBlockInput, actor: CoreActor, correlationId: string) {
    const hierarchy = await this.resolveHierarchy(input);
    const resolved = { ...input, ...hierarchy };
    const id = randomUUID();
    const event = createCoreEvent("time_block", id, "created", actor, correlationId, { projectId: resolved.projectId, taskId: resolved.taskId, startAt: resolved.startAt, endAt: resolved.endAt });
    const block = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.createBlock(id, resolved, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return created;
    });
    if (!block) throw new EntityNotFoundError("TimeBlock", id);
    this.publish([event]);
    return block;
  }

  async updateBlock(id: string, input: UpdateTimeBlockInput, actor: CoreActor, correlationId: string) {
    const current = await this.repository.getBlock(id);
    if (!current) throw new EntityNotFoundError("TimeBlock", id);
    const hierarchy = await this.resolveHierarchy({ projectId: input.projectId !== undefined ? input.projectId : current.projectId, taskId: input.taskId !== undefined ? input.taskId : current.taskId });
    const startAt = input.startAt ?? current.startAt;
    const endAt = input.endAt ?? current.endAt;
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) throw new InvalidTimeStateError("结束时间必须晚于开始时间");
    const update = { ...input, ...hierarchy };
    const event = createCoreEvent("time_block", id, input.status === "completed" ? "completed" : input.status === "canceled" ? "canceled" : "updated", actor, correlationId, { changedFields: Object.keys(input) });
    const block = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.updateBlock(id, update, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return updated;
    });
    if (!block) throw new EntityNotFoundError("TimeBlock", id);
    this.publish([event]);
    return block;
  }

  getCurrentFocus() { return this.repository.getCurrentFocus(); }

  async startFocus(input: StartFocusSessionInput, actor: CoreActor, correlationId: string) {
    const existing = await this.repository.getCurrentFocus();
    if (existing) throw new EntityConflictError(`已有专注会话正在${existing.status === "running" ? "运行" : "暂停"}`);
    let resolved = { ...input };
    if (input.timeBlockId) {
      const block = await this.repository.getBlock(input.timeBlockId);
      if (!block) throw new EntityNotFoundError("TimeBlock", input.timeBlockId);
      if (input.projectId && block.projectId && input.projectId !== block.projectId) throw new InvalidHierarchyError("专注会话与时间块的 Project 不一致");
      if (input.taskId && block.taskId && input.taskId !== block.taskId) throw new InvalidHierarchyError("专注会话与时间块的 Task 不一致");
      resolved = { ...resolved, projectId: input.projectId ?? block.projectId, taskId: input.taskId ?? block.taskId };
    }
    const hierarchy = await this.resolveHierarchy(resolved);
    resolved = { ...resolved, ...hierarchy };
    const id = randomUUID();
    const now = new Date().toISOString();
    const event = createCoreEvent("focus_session", id, "started", actor, correlationId, { projectId: resolved.projectId, taskId: resolved.taskId, timeBlockId: resolved.timeBlockId });
    const session = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.startFocus(id, resolved, now, transaction);
      if (resolved.timeBlockId) await this.repository.updateBlock(resolved.timeBlockId, { status: "in_progress" }, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return created;
    });
    if (!session) throw new EntityNotFoundError("FocusSession", id);
    this.publish([event]);
    return session;
  }

  private elapsedSeconds(lastResumedAt: string | null, now: string) {
    return lastResumedAt ? Math.max(0, Math.floor((new Date(now).getTime() - new Date(lastResumedAt).getTime()) / 1_000)) : 0;
  }

  async transitionFocus(id: string, action: "pause" | "resume" | "complete", actor: CoreActor, correlationId: string, completion: CompleteFocusSessionInput = { completeTask: false }) {
    const current = await this.repository.getFocus(id);
    if (!current) throw new EntityNotFoundError("FocusSession", id);
    const now = new Date().toISOString();
    if (action === "pause" && current.status !== "running") throw new InvalidTimeStateError("只有运行中的专注会话可以暂停");
    if (action === "resume" && current.status !== "paused") throw new InvalidTimeStateError("只有暂停的专注会话可以继续");
    if (action === "complete" && current.status === "completed") throw new InvalidTimeStateError("专注会话已经完成");
    const accumulatedSeconds = current.accumulatedSeconds + (current.status === "running" ? this.elapsedSeconds(current.lastResumedAt, now) : 0);
    const status = action === "pause" ? "paused" : action === "resume" ? "running" : "completed";
    const eventAction = action === "pause" ? "paused" : action === "resume" ? "resumed" : "completed";
    const event = createCoreEvent("focus_session", id, eventAction, actor, correlationId, { projectId: current.projectId, taskId: current.taskId, timeBlockId: current.timeBlockId, accumulatedSeconds, completeTask: action === "complete" && completion.completeTask });
    const completionEvents: EventEnvelope[] = [];
    const session = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.updateFocus(id, { status, lastResumedAt: status === "running" ? now : null, endedAt: status === "completed" ? now : null, accumulatedSeconds, updatedAt: now }, transaction);
      if (status === "completed" && current.timeBlockId) await this.repository.updateBlock(current.timeBlockId, { status: "completed" }, transaction);
      if (status === "completed" && completion.completeTask && current.taskId) {
        const task = await this.coreRepository.getTask(current.taskId, transaction);
        if (!task) throw new EntityNotFoundError("Task", current.taskId);
        if (task.status !== "done") {
          await this.coreRepository.updateTask(task.id, { status: "done" }, transaction);
          completionEvents.push(createCoreEvent("task", task.id, "completed", actor, correlationId, { projectId: task.projectId, planId: task.planId, milestoneId: task.milestoneId, focusSessionId: id, timeBlockId: current.timeBlockId, accumulatedSeconds }));
        }
        const evidenceLinkId = randomUUID();
        await this.coreRepository.createLink(evidenceLinkId, { sourceType: "focus_session", sourceId: id, targetType: "task", targetId: task.id, relation: "evidenceFor", label: `${Math.max(1, Math.round(accumulatedSeconds / 60))} 分钟专注完成证据` }, transaction);
        completionEvents.push(createCoreEvent("task", task.id, "linked", actor, correlationId, { projectId: task.projectId, evidenceLinkId, sourceType: "focus_session", sourceId: id, relation: "evidenceFor" }));

        const planTasks = (await this.coreRepository.listTasks({ planId: task.planId }, transaction)).filter((item) => item.status !== "archived");
        const plan = await this.coreRepository.getPlan(task.planId, transaction);
        if (plan && plan.status !== "completed" && planTasks.length > 0 && planTasks.every((item) => item.status === "done")) {
          await this.coreRepository.updatePlan(plan.id, { status: "completed" }, transaction);
          completionEvents.push(createCoreEvent("plan", plan.id, "completed", actor, correlationId, { projectId: plan.projectId, milestoneId: plan.milestoneId, completedByTaskId: task.id, focusSessionId: id }));
        }

        const milestonePlans = (await this.coreRepository.listPlans({ milestoneId: task.milestoneId }, transaction)).filter((item) => item.status !== "archived");
        const milestone = await this.coreRepository.getMilestone(task.milestoneId, transaction);
        if (milestone && milestone.status !== "completed" && milestonePlans.length > 0 && milestonePlans.every((item) => item.status === "completed")) {
          await this.coreRepository.updateMilestone(milestone.id, { status: "completed" }, transaction);
          completionEvents.push(createCoreEvent("milestone", milestone.id, "completed", actor, correlationId, { projectId: milestone.projectId, completedByPlanId: task.planId, focusSessionId: id }));
        }
      }
      await this.coreRepository.appendEvent(event, transaction);
      for (const completionEvent of completionEvents) await this.coreRepository.appendEvent(completionEvent, transaction);
      return updated;
    });
    if (!session) throw new EntityNotFoundError("FocusSession", id);
    this.publish([event, ...completionEvents]);
    return session;
  }

  listBudgets(weekStart: string) { return this.repository.listBudgets(weekStart); }

  async upsertBudget(input: UpsertAttentionBudgetInput, actor: CoreActor, correlationId: string) {
    await this.core.getProject(input.projectId);
    const event = createCoreEvent("attention_budget", `${input.projectId}:${input.weekStart}`, "updated", actor, correlationId, { projectId: input.projectId, weekStart: input.weekStart, plannedMinutes: input.plannedMinutes, minimumMinutes: input.minimumMinutes, maximumMinutes: input.maximumMinutes });
    const budget = await this.repository.database.transaction().execute(async (transaction) => {
      const saved = await this.repository.upsertBudget(input, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return saved;
    });
    if (!budget) throw new EntityNotFoundError("AttentionBudget", event.entityId);
    this.publish([event]);
    return budget;
  }

  async removeBudget(projectId: string, weekStart: string, actor: CoreActor, correlationId: string) {
    const event = createCoreEvent("attention_budget", `${projectId}:${weekStart}`, "canceled", actor, correlationId, { projectId, weekStart });
    await this.repository.database.transaction().execute(async (transaction) => {
      if (!await this.repository.removeBudget(projectId, weekStart, transaction)) throw new EntityNotFoundError("AttentionBudget", event.entityId);
      await this.coreRepository.appendEvent(event, transaction);
    });
    this.publish([event]);
  }

  private weekRange(weekStart: string, utcOffsetMinutes: number) {
    const fromMs = Date.parse(`${weekStart}T00:00:00.000Z`) - utcOffsetMinutes * 60_000;
    return { from: new Date(fromMs).toISOString(), to: new Date(fromMs + 7 * 24 * 60 * 60_000).toISOString() };
  }

  async analyzeAttention(input: AttentionAnalysisQuery): Promise<AttentionAnalysis> {
    const range = this.weekRange(input.weekStart, input.utcOffsetMinutes);
    const [projects, budgets, blocks, summary] = await Promise.all([
      this.core.listProjects(),
      this.repository.listBudgets(input.weekStart),
      this.repository.listBlocks(range),
      this.repository.summarizeFocus({ ...range, utcOffsetMinutes: input.utcOffsetMinutes }),
    ]);
    const budgetMap = new Map(budgets.map((budget) => [budget.projectId, budget]));
    const scheduled = new Map<string, number>();
    blocks.filter((block) => block.status !== "canceled" && block.projectId).forEach((block) => {
      const minutes = Math.max(0, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000));
      scheduled.set(block.projectId!, (scheduled.get(block.projectId!) ?? 0) + minutes);
    });
    const actual = new Map(summary.byProject.map((slice) => [slice.key, Math.round(slice.focusSeconds / 60)]));
    const items: AttentionHealthItem[] = projects.filter((project) => project.status !== "archived").map((project) => {
      const budget = budgetMap.get(project.id);
      const scheduledMinutes = scheduled.get(project.id) ?? 0;
      const actualMinutes = actual.get(project.id) ?? 0;
      if (!budget) return { projectId: project.id, state: "unconfigured", plannedMinutes: null, minimumMinutes: null, maximumMinutes: null, scheduledMinutes, actualMinutes, deficitMinutes: 0, overageMinutes: 0, explanation: "尚未设置最低、计划和最高注意力阈值" };
      const coverage = Math.max(scheduledMinutes, actualMinutes);
      const deficitMinutes = Math.max(0, budget.minimumMinutes - coverage);
      const overageMinutes = budget.maximumMinutes === null ? 0 : Math.max(0, Math.max(scheduledMinutes, actualMinutes) - budget.maximumMinutes);
      if (overageMinutes > 0) return { projectId: project.id, state: "overfocused", plannedMinutes: budget.plannedMinutes, minimumMinutes: budget.minimumMinutes, maximumMinutes: budget.maximumMinutes, scheduledMinutes, actualMinutes, deficitMinutes, overageMinutes, explanation: `已超出最高上限 ${overageMinutes} 分钟，需要保护其他项目` };
      if (deficitMinutes > 0) return { projectId: project.id, state: "starving", plannedMinutes: budget.plannedMinutes, minimumMinutes: budget.minimumMinutes, maximumMinutes: budget.maximumMinutes, scheduledMinutes, actualMinutes, deficitMinutes, overageMinutes, explanation: `最低保障尚缺 ${deficitMinutes} 分钟，且当前排程没有覆盖` };
      if (actualMinutes < budget.minimumMinutes) return { projectId: project.id, state: "at_risk", plannedMinutes: budget.plannedMinutes, minimumMinutes: budget.minimumMinutes, maximumMinutes: budget.maximumMinutes, scheduledMinutes, actualMinutes, deficitMinutes, overageMinutes, explanation: `排程已覆盖最低保障，但实际投入仍少 ${budget.minimumMinutes - actualMinutes} 分钟` };
      return { projectId: project.id, state: "balanced", plannedMinutes: budget.plannedMinutes, minimumMinutes: budget.minimumMinutes, maximumMinutes: budget.maximumMinutes, scheduledMinutes, actualMinutes, deficitMinutes, overageMinutes, explanation: "实际投入与排程均处于注意力上下限内" };
    });
    return {
      weekStart: input.weekStart,
      items,
      starvingCount: items.filter((item) => item.state === "starving").length,
      atRiskCount: items.filter((item) => item.state === "at_risk").length,
      overfocusedCount: items.filter((item) => item.state === "overfocused").length,
      generatedAt: new Date().toISOString(),
    };
  }

  private nextAvailableSlot(blocks: Awaited<ReturnType<TimeRepository["listBlocks"]>>, range: { from: string; to: string }, utcOffsetMinutes: number, durationMinutes: number) {
    const roundedNow = Math.ceil(Date.now() / (15 * 60_000)) * 15 * 60_000;
    let candidate = Math.max(new Date(range.from).getTime(), roundedNow);
    const rangeEnd = new Date(range.to).getTime();
    const durationMs = durationMinutes * 60_000;
    const occupied = blocks.filter((block) => block.status !== "canceled").map((block) => [new Date(block.startAt).getTime(), new Date(block.endAt).getTime()] as const);
    while (candidate + durationMs <= rangeEnd) {
      const local = new Date(candidate + utcOffsetMinutes * 60_000);
      const localMinute = local.getUTCHours() * 60 + local.getUTCMinutes();
      const withinWorkingDay = localMinute >= 8 * 60 && localMinute + durationMinutes <= 20 * 60;
      const overlaps = occupied.some(([start, end]) => candidate < end && candidate + durationMs > start);
      if (withinWorkingDay && !overlaps) return { startAt: new Date(candidate).toISOString(), endAt: new Date(candidate + durationMs).toISOString() };
      candidate += 15 * 60_000;
    }
    throw new EntityConflictError("本周 08:00–20:00 没有可用时间槽，请先调整现有时间块");
  }

  async proposeAttentionRebalance(input: CreateAttentionRebalanceProposalInput, actor: CoreActor, correlationId: string) {
    const analysis = await this.analyzeAttention(input);
    const selectable = analysis.items.filter((item) => item.minimumMinutes !== null);
    const target = input.projectId
      ? selectable.find((item) => item.projectId === input.projectId)
      : selectable.find((item) => item.state === "starving")
        ?? selectable.find((item) => item.state === "at_risk")
        ?? selectable.filter((item) => (item.plannedMinutes ?? 0) > item.scheduledMinutes).sort((a, b) => a.actualMinutes - b.actualMinutes)[0];
    if (!target) throw new EntityConflictError("当前没有需要重新平衡且已配置预算的项目");
    const project = await this.core.getProject(target.projectId);
    const range = this.weekRange(input.weekStart, input.utcOffsetMinutes);
    const blocks = await this.repository.listBlocks(range);
    const baseDuration = input.energy === "low" ? 30 : input.energy === "high" ? 60 : 45;
    const duration = Math.max(15, Math.min(baseDuration, target.deficitMinutes || Math.max(15, (target.plannedMinutes ?? baseDuration) - target.scheduledMinutes)));
    const slot = this.nextAvailableSlot(blocks, range, input.utcOffsetMinutes, Math.ceil(duration / 15) * 15);
    const overfocused = analysis.items.filter((item) => item.state === "overfocused");
    return this.core.createProposal({
      projectId: project.id,
      title: `为 ${project.name} 补一个注意力时间盒`,
      summary: `根据本周最低/计划/最高阈值生成 ${Math.ceil(duration / 15) * 15} 分钟时间块；接受后才写入日程。`,
      kind: "schedule",
      risk: overfocused.length ? "medium" : "low",
      evidence: [target.explanation, `已排期 ${target.scheduledMinutes} 分钟，实际专注 ${target.actualMinutes} 分钟`, ...overfocused.map((item) => `项目 ${item.projectId} 已超出最高上限 ${item.overageMinutes} 分钟`)],
      changes: [{ entityType: "time_block", entityId: null, action: "create", summary: `${slot.startAt} 起安排 ${Math.ceil(duration / 15) * 15} 分钟给 ${project.name}` }],
      command: { type: "create_time_block", input: { projectId: project.id, taskId: null, title: `推进 ${project.name} 的最小成果`, ...slot, status: "planned", kind: "focus", energy: input.energy, source: "rebalance" } },
      createdBy: "attention-guard",
    }, actor, correlationId);
  }
}
