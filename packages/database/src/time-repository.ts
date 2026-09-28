import type { AttentionBudget, CreateTimeBlockInput, FocusSession, StartFocusSessionInput, TimeBlock, TimeRangeQuery, TimeSummary, TimeSummaryQuery, UpdateTimeBlockInput, UpsertAttentionBudgetInput } from "@pcc/contracts";
import type { DatabaseExecutor, PccDatabase } from "./types.js";

function timeBlockFromRow(row: {
  id: string; project_id: string | null; task_id: string | null; title: string; start_at: string; end_at: string;
  status: string; kind: string; energy: string; source: string; created_at: string; updated_at: string;
}): TimeBlock {
  return { id: row.id, projectId: row.project_id, taskId: row.task_id, title: row.title, startAt: row.start_at, endAt: row.end_at, status: row.status as TimeBlock["status"], kind: row.kind as TimeBlock["kind"], energy: row.energy as TimeBlock["energy"], source: row.source as TimeBlock["source"], createdAt: row.created_at, updatedAt: row.updated_at };
}

function focusSessionFromRow(row: {
  id: string; project_id: string | null; task_id: string | null; time_block_id: string | null; title: string;
  status: string; started_at: string; last_resumed_at: string | null; ended_at: string | null;
  accumulated_seconds: number; created_at: string; updated_at: string;
}): FocusSession {
  return { id: row.id, projectId: row.project_id, taskId: row.task_id, timeBlockId: row.time_block_id, title: row.title, status: row.status as FocusSession["status"], startedAt: row.started_at, lastResumedAt: row.last_resumed_at, endedAt: row.ended_at, accumulatedSeconds: row.accumulated_seconds, createdAt: row.created_at, updatedAt: row.updated_at };
}

function budgetFromRow(row: { project_id: string; week_start: string; planned_minutes: number; minimum_minutes: number; maximum_minutes: number | null; created_at: string; updated_at: string }): AttentionBudget {
  return { projectId: row.project_id, weekStart: row.week_start, plannedMinutes: row.planned_minutes, minimumMinutes: row.minimum_minutes, maximumMinutes: row.maximum_minutes, createdAt: row.created_at, updatedAt: row.updated_at };
}

export class TimeRepository {
  constructor(private readonly db: PccDatabase) {}
  get database() { return this.db; }

  async listBlocks(query: TimeRangeQuery, executor: DatabaseExecutor = this.db) {
    let selection = executor.selectFrom("time_blocks").selectAll().where("start_at", "<", query.to).where("end_at", ">", query.from);
    if (query.projectId) selection = selection.where("project_id", "=", query.projectId);
    return (await selection.orderBy("start_at", "asc").execute()).map(timeBlockFromRow);
  }

  async getBlock(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("time_blocks").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? timeBlockFromRow(row) : undefined;
  }

  async createBlock(id: string, input: CreateTimeBlockInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.insertInto("time_blocks").values({ id, project_id: input.projectId, task_id: input.taskId, title: input.title, start_at: input.startAt, end_at: input.endAt, status: input.status, kind: input.kind, energy: input.energy, source: input.source, created_at: now, updated_at: now }).execute();
    return this.getBlock(id, executor);
  }

  async updateBlock(id: string, input: UpdateTimeBlockInput, executor: DatabaseExecutor = this.db) {
    const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (input.projectId !== undefined) update.project_id = input.projectId;
    if (input.taskId !== undefined) update.task_id = input.taskId;
    if (input.title !== undefined) update.title = input.title;
    if (input.startAt !== undefined) update.start_at = input.startAt;
    if (input.endAt !== undefined) update.end_at = input.endAt;
    if (input.status !== undefined) update.status = input.status;
    if (input.kind !== undefined) update.kind = input.kind;
    if (input.energy !== undefined) update.energy = input.energy;
    await executor.updateTable("time_blocks").set(update).where("id", "=", id).execute();
    return this.getBlock(id, executor);
  }

  async getCurrentFocus(executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("focus_sessions").selectAll().where("status", "in", ["running", "paused"]).orderBy("updated_at", "desc").executeTakeFirst();
    return row ? focusSessionFromRow(row) : undefined;
  }

  async getFocus(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("focus_sessions").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? focusSessionFromRow(row) : undefined;
  }

  async startFocus(id: string, input: StartFocusSessionInput, now: string, executor: DatabaseExecutor = this.db) {
    await executor.insertInto("focus_sessions").values({ id, project_id: input.projectId, task_id: input.taskId, time_block_id: input.timeBlockId, title: input.title, status: "running", started_at: now, last_resumed_at: now, ended_at: null, accumulated_seconds: 0, created_at: now, updated_at: now }).execute();
    return this.getFocus(id, executor);
  }

  async updateFocus(id: string, update: { status: FocusSession["status"]; lastResumedAt: string | null; endedAt: string | null; accumulatedSeconds: number; updatedAt: string }, executor: DatabaseExecutor = this.db) {
    await executor.updateTable("focus_sessions").set({ status: update.status, last_resumed_at: update.lastResumedAt, ended_at: update.endedAt, accumulated_seconds: update.accumulatedSeconds, updated_at: update.updatedAt }).where("id", "=", id).execute();
    return this.getFocus(id, executor);
  }

  async summarizeFocus(query: TimeSummaryQuery, executor: DatabaseExecutor = this.db): Promise<TimeSummary> {
    let selection = executor.selectFrom("focus_sessions")
      .selectAll()
      .where("started_at", "<", query.to)
      .where((expression) => expression.or([
        expression("ended_at", "is", null),
        expression("ended_at", ">", query.from),
      ]));
    if (query.projectId) selection = selection.where("project_id", "=", query.projectId);
    const rows = (await selection.orderBy("started_at", "asc").execute()).map(focusSessionFromRow);
    const generatedAt = new Date().toISOString();
    const byProject = new Map<string, { key: string; focusSeconds: number; sessionCount: number; completedSessionCount: number }>();
    const byDay = new Map<string, { key: string; focusSeconds: number; sessionCount: number; completedSessionCount: number }>();
    let focusSeconds = 0;
    let completedSessionCount = 0;

    for (const row of rows) {
      const runningSeconds = row.status === "running" && row.lastResumedAt
        ? Math.max(0, Math.floor((new Date(generatedAt).getTime() - new Date(row.lastResumedAt).getTime()) / 1_000))
        : 0;
      const seconds = row.accumulatedSeconds + runningSeconds;
      const projectKey = row.projectId ?? "unassigned";
      const dayKey = new Date(new Date(row.startedAt).getTime() + query.utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
      const completed = row.status === "completed" ? 1 : 0;
      focusSeconds += seconds;
      completedSessionCount += completed;
      for (const [map, key] of [[byProject, projectKey], [byDay, dayKey]] as const) {
        const current = map.get(key) ?? { key, focusSeconds: 0, sessionCount: 0, completedSessionCount: 0 };
        current.focusSeconds += seconds;
        current.sessionCount += 1;
        current.completedSessionCount += completed;
        map.set(key, current);
      }
    }

    return {
      from: query.from,
      to: query.to,
      focusSeconds,
      sessionCount: rows.length,
      completedSessionCount,
      byProject: [...byProject.values()].sort((left, right) => right.focusSeconds - left.focusSeconds),
      byDay: [...byDay.values()].sort((left, right) => left.key.localeCompare(right.key)),
      generatedAt,
    };
  }

  async listBudgets(weekStart: string, executor: DatabaseExecutor = this.db) {
    return (await executor.selectFrom("attention_budgets").selectAll().where("week_start", "=", weekStart).orderBy("project_id", "asc").execute()).map(budgetFromRow);
  }

  async upsertBudget(input: UpsertAttentionBudgetInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    const existing = await executor.selectFrom("attention_budgets").select("created_at").where("project_id", "=", input.projectId).where("week_start", "=", input.weekStart).executeTakeFirst();
    await executor.insertInto("attention_budgets").values({ project_id: input.projectId, week_start: input.weekStart, planned_minutes: input.plannedMinutes, minimum_minutes: input.minimumMinutes, maximum_minutes: input.maximumMinutes, created_at: existing?.created_at ?? now, updated_at: now }).onConflict((conflict) => conflict.columns(["project_id", "week_start"]).doUpdateSet({ planned_minutes: input.plannedMinutes, minimum_minutes: input.minimumMinutes, maximum_minutes: input.maximumMinutes, updated_at: now })).execute();
    const row = await executor.selectFrom("attention_budgets").selectAll().where("project_id", "=", input.projectId).where("week_start", "=", input.weekStart).executeTakeFirst();
    return row ? budgetFromRow(row) : undefined;
  }

  async removeBudget(projectId: string, weekStart: string, executor: DatabaseExecutor = this.db) {
    const result = await executor.deleteFrom("attention_budgets").where("project_id", "=", projectId).where("week_start", "=", weekStart).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
}
