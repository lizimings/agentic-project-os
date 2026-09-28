import type {
  CreateEntityLinkInput,
  CreateIdeaInput,
  CreateMilestoneInput,
  CreatePlanInput,
  CreateProposalInput,
  CreateProjectInput,
  CreateTaskInput,
  EntityLink,
  EntityType,
  EventEnvelope,
  Idea,
  Milestone,
  Plan,
  Proposal,
  Project,
  Task,
  UpdateIdeaInput,
  UpdateMilestoneInput,
  UpdatePlanInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@pcc/contracts";
import type { DatabaseExecutor, PccDatabase } from "./types.js";
import { resolveEventProjectId } from "./event-log-repository.js";

type ProjectRow = Awaited<ReturnType<CoreRepository["projectRow"]>>;

function projectFromRow(row: NonNullable<ProjectRow>): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    vision: row.vision,
    color: row.color,
    status: row.status as Project["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function milestoneFromRow(row: {
  id: string; project_id: string; title: string; description: string; status: string;
  target_date: string | null; position: number; created_at: string; updated_at: string;
}): Milestone {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status as Milestone["status"],
    targetDate: row.target_date,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function planFromRow(row: {
  id: string; project_id: string; milestone_id: string; title: string; description: string;
  status: string; position: number; created_at: string; updated_at: string;
}): Plan {
  return {
    id: row.id,
    projectId: row.project_id,
    milestoneId: row.milestone_id,
    title: row.title,
    description: row.description,
    status: row.status as Plan["status"],
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function taskFromRow(row: {
  id: string; project_id: string; milestone_id: string; plan_id: string; parent_task_id: string | null;
  title: string; description: string; status: string; priority: string; assignee_type: string;
  assignee_id: string | null; due_at: string | null; estimate_minutes: number | null; position: number;
  created_at: string; updated_at: string;
}): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    milestoneId: row.milestone_id,
    planId: row.plan_id,
    parentTaskId: row.parent_task_id,
    title: row.title,
    description: row.description,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    assigneeType: row.assignee_type as Task["assigneeType"],
    assigneeId: row.assignee_id,
    dueAt: row.due_at,
    estimateMinutes: row.estimate_minutes,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ideaFromRow(row: {
  id: string; project_id: string | null; title: string; body: string; status: string;
  source_type: string; source_id: string | null; created_at: string; updated_at: string;
}): Idea {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    status: row.status as Idea["status"],
    sourceType: row.source_type as Idea["sourceType"],
    sourceId: row.source_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function linkFromRow(row: {
  id: string; source_type: string; source_id: string; target_type: string; target_id: string;
  relation: string; label: string | null; created_at: string;
}): EntityLink {
  return {
    id: row.id,
    sourceType: row.source_type as EntityLink["sourceType"],
    sourceId: row.source_id,
    targetType: row.target_type as EntityLink["targetType"],
    targetId: row.target_id,
    relation: row.relation as EntityLink["relation"],
    label: row.label,
    createdAt: row.created_at,
  };
}

function proposalFromRow(row: {
  id: string; project_id: string | null; title: string; summary: string; kind: string; status: string;
  risk: string; evidence_json: string; changes_json: string; command_json: string | null; execution_status: string;
  execution_error: string | null; executed_at: string | null; created_by: string; created_at: string; decided_at: string | null;
}): Proposal {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    summary: row.summary,
    kind: row.kind as Proposal["kind"],
    status: row.status as Proposal["status"],
    risk: row.risk as Proposal["risk"],
    evidence: JSON.parse(row.evidence_json) as Proposal["evidence"],
    changes: JSON.parse(row.changes_json) as Proposal["changes"],
    command: row.command_json ? JSON.parse(row.command_json) as Proposal["command"] : null,
    executionStatus: row.execution_status as Proposal["executionStatus"],
    executionError: row.execution_error,
    executedAt: row.executed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export class CoreRepository {
  constructor(private readonly db: PccDatabase) {}

  get database() {
    return this.db;
  }

  projectRow(id: string, executor: DatabaseExecutor = this.db) {
    return executor.selectFrom("projects").selectAll().where("id", "=", id).executeTakeFirst();
  }

  async listProjects(executor: DatabaseExecutor = this.db) {
    const rows = await executor.selectFrom("projects").selectAll().orderBy("updated_at", "desc").execute();
    return rows.map(projectFromRow);
  }

  async getProject(id: string, executor: DatabaseExecutor = this.db) {
    const row = await this.projectRow(id, executor);
    return row ? projectFromRow(row) : undefined;
  }

  async createProject(id: string, input: CreateProjectInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.insertInto("projects").values({
      id,
      name: input.name,
      description: input.description,
      vision: input.vision,
      color: input.color,
      status: input.status,
      created_at: now,
      updated_at: now,
    }).execute();
    return this.getProject(id, executor);
  }

  async updateProject(id: string, input: UpdateProjectInput, executor: DatabaseExecutor = this.db) {
    const update: Record<string, string> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) update.name = input.name;
    if (input.description !== undefined) update.description = input.description;
    if (input.vision !== undefined) update.vision = input.vision;
    if (input.color !== undefined) update.color = input.color;
    if (input.status !== undefined) update.status = input.status;
    await executor.updateTable("projects").set(update).where("id", "=", id).execute();
    return this.getProject(id, executor);
  }

  async listMilestones(projectId?: string, executor: DatabaseExecutor = this.db) {
    let query = executor.selectFrom("milestones").selectAll();
    if (projectId) query = query.where("project_id", "=", projectId);
    const rows = await query.orderBy("position", "asc").orderBy("created_at", "asc").execute();
    return rows.map(milestoneFromRow);
  }

  async getMilestone(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("milestones").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? milestoneFromRow(row) : undefined;
  }

  async createMilestone(id: string, input: CreateMilestoneInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.insertInto("milestones").values({
      id,
      project_id: input.projectId,
      title: input.title,
      description: input.description,
      status: input.status,
      target_date: input.targetDate,
      position: input.position,
      created_at: now,
      updated_at: now,
    }).execute();
    return this.getMilestone(id, executor);
  }

  async updateMilestone(id: string, input: UpdateMilestoneInput, executor: DatabaseExecutor = this.db) {
    const update: Record<string, string | number | null> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) update.title = input.title;
    if (input.description !== undefined) update.description = input.description;
    if (input.status !== undefined) update.status = input.status;
    if (input.targetDate !== undefined) update.target_date = input.targetDate;
    if (input.position !== undefined) update.position = input.position;
    await executor.updateTable("milestones").set(update).where("id", "=", id).execute();
    return this.getMilestone(id, executor);
  }

  async listPlans(filters: { projectId?: string; milestoneId?: string } = {}, executor: DatabaseExecutor = this.db) {
    let query = executor.selectFrom("plans").selectAll();
    if (filters.projectId) query = query.where("project_id", "=", filters.projectId);
    if (filters.milestoneId) query = query.where("milestone_id", "=", filters.milestoneId);
    const rows = await query.orderBy("position", "asc").orderBy("created_at", "asc").execute();
    return rows.map(planFromRow);
  }

  async getPlan(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("plans").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? planFromRow(row) : undefined;
  }

  async createPlan(id: string, input: CreatePlanInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.insertInto("plans").values({
      id,
      project_id: input.projectId,
      milestone_id: input.milestoneId,
      title: input.title,
      description: input.description,
      status: input.status,
      position: input.position,
      created_at: now,
      updated_at: now,
    }).execute();
    return this.getPlan(id, executor);
  }

  async updatePlan(id: string, input: UpdatePlanInput, executor: DatabaseExecutor = this.db) {
    const update: Record<string, string | number> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) update.title = input.title;
    if (input.description !== undefined) update.description = input.description;
    if (input.status !== undefined) update.status = input.status;
    if (input.position !== undefined) update.position = input.position;
    await executor.updateTable("plans").set(update).where("id", "=", id).execute();
    return this.getPlan(id, executor);
  }

  async listTasks(filters: { projectId?: string; milestoneId?: string; planId?: string } = {}, executor: DatabaseExecutor = this.db) {
    let query = executor.selectFrom("tasks").selectAll();
    if (filters.projectId) query = query.where("project_id", "=", filters.projectId);
    if (filters.milestoneId) query = query.where("milestone_id", "=", filters.milestoneId);
    if (filters.planId) query = query.where("plan_id", "=", filters.planId);
    const rows = await query.orderBy("position", "asc").orderBy("created_at", "asc").execute();
    return rows.map(taskFromRow);
  }

  async getTask(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("tasks").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? taskFromRow(row) : undefined;
  }

  async createTask(id: string, input: CreateTaskInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.insertInto("tasks").values({
      id,
      project_id: input.projectId,
      milestone_id: input.milestoneId,
      plan_id: input.planId,
      parent_task_id: input.parentTaskId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assignee_type: input.assigneeType,
      assignee_id: input.assigneeId,
      due_at: input.dueAt,
      estimate_minutes: input.estimateMinutes,
      position: input.position,
      created_at: now,
      updated_at: now,
    }).execute();
    return this.getTask(id, executor);
  }

  async updateTask(id: string, input: UpdateTaskInput, executor: DatabaseExecutor = this.db) {
    const update: Record<string, string | number | null> = { updated_at: new Date().toISOString() };
    if (input.parentTaskId !== undefined) update.parent_task_id = input.parentTaskId;
    if (input.title !== undefined) update.title = input.title;
    if (input.description !== undefined) update.description = input.description;
    if (input.status !== undefined) update.status = input.status;
    if (input.priority !== undefined) update.priority = input.priority;
    if (input.assigneeType !== undefined) update.assignee_type = input.assigneeType;
    if (input.assigneeId !== undefined) update.assignee_id = input.assigneeId;
    if (input.dueAt !== undefined) update.due_at = input.dueAt;
    if (input.estimateMinutes !== undefined) update.estimate_minutes = input.estimateMinutes;
    if (input.position !== undefined) update.position = input.position;
    await executor.updateTable("tasks").set(update).where("id", "=", id).execute();
    return this.getTask(id, executor);
  }

  async listIdeas(filters: { projectId?: string; status?: Idea["status"] } = {}, executor: DatabaseExecutor = this.db) {
    let query = executor.selectFrom("ideas").selectAll();
    if (filters.projectId) query = query.where("project_id", "=", filters.projectId);
    if (filters.status) query = query.where("status", "=", filters.status);
    const rows = await query.orderBy("updated_at", "desc").execute();
    return rows.map(ideaFromRow);
  }

  async getIdea(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("ideas").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? ideaFromRow(row) : undefined;
  }

  async createIdea(id: string, input: CreateIdeaInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.insertInto("ideas").values({
      id,
      project_id: input.projectId,
      title: input.title,
      body: input.body,
      status: input.status,
      source_type: input.sourceType,
      source_id: input.sourceId,
      created_at: now,
      updated_at: now,
    }).execute();
    return this.getIdea(id, executor);
  }

  async updateIdea(id: string, input: UpdateIdeaInput, executor: DatabaseExecutor = this.db) {
    const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (input.projectId !== undefined) update.project_id = input.projectId;
    if (input.title !== undefined) update.title = input.title;
    if (input.body !== undefined) update.body = input.body;
    if (input.status !== undefined) update.status = input.status;
    if (input.sourceType !== undefined) update.source_type = input.sourceType;
    if (input.sourceId !== undefined) update.source_id = input.sourceId;
    await executor.updateTable("ideas").set(update).where("id", "=", id).execute();
    return this.getIdea(id, executor);
  }

  async listLinks(filters: { entityType?: EntityType; entityId?: string } = {}, executor: DatabaseExecutor = this.db) {
    let query = executor.selectFrom("entity_links").selectAll();
    if (filters.entityType && filters.entityId) {
      query = query.where((expression) => expression.or([
        expression.and([
          expression("source_type", "=", filters.entityType!),
          expression("source_id", "=", filters.entityId!),
        ]),
        expression.and([
          expression("target_type", "=", filters.entityType!),
          expression("target_id", "=", filters.entityId!),
        ]),
      ]));
    }
    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map(linkFromRow);
  }

  async getLink(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("entity_links").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? linkFromRow(row) : undefined;
  }

  async createLink(id: string, input: CreateEntityLinkInput, executor: DatabaseExecutor = this.db) {
    await executor.insertInto("entity_links").values({
      id,
      source_type: input.sourceType,
      source_id: input.sourceId,
      target_type: input.targetType,
      target_id: input.targetId,
      relation: input.relation,
      label: input.label,
      created_at: new Date().toISOString(),
    }).execute();
    return this.getLink(id, executor);
  }

  async deleteLink(id: string, executor: DatabaseExecutor = this.db) {
    const result = await executor.deleteFrom("entity_links").where("id", "=", id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async listProposals(filters: { projectId?: string; status?: Proposal["status"] } = {}, executor: DatabaseExecutor = this.db) {
    let query = executor.selectFrom("proposals").selectAll();
    if (filters.projectId) query = query.where("project_id", "=", filters.projectId);
    if (filters.status) query = query.where("status", "=", filters.status);
    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map(proposalFromRow);
  }

  async getProposal(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("proposals").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? proposalFromRow(row) : undefined;
  }

  async createProposal(id: string, input: CreateProposalInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.insertInto("proposals").values({
      id,
      project_id: input.projectId,
      title: input.title,
      summary: input.summary,
      kind: input.kind,
      status: "pending",
      risk: input.risk,
      evidence_json: JSON.stringify(input.evidence),
      changes_json: JSON.stringify(input.changes),
      command_json: input.command ? JSON.stringify(input.command) : null,
      execution_status: input.command ? "pending" : "not_applicable",
      execution_error: null,
      executed_at: null,
      created_by: input.createdBy,
      created_at: now,
      decided_at: null,
    }).execute();
    return this.getProposal(id, executor);
  }

  async decideProposal(id: string, decision: Proposal["status"], changes: Proposal["changes"] | undefined, execution: { command?: Proposal["command"]; executionStatus?: Proposal["executionStatus"]; executionError?: string | null; executedAt?: string | null } = {}, executor: DatabaseExecutor = this.db) {
    const update: { status: string; decided_at: string; changes_json?: string; command_json?: string | null; execution_status?: string; execution_error?: string | null; executed_at?: string | null } = {
      status: decision,
      decided_at: new Date().toISOString(),
    };
    if (changes) update.changes_json = JSON.stringify(changes);
    if (execution.command !== undefined) update.command_json = execution.command ? JSON.stringify(execution.command) : null;
    if (execution.executionStatus !== undefined) update.execution_status = execution.executionStatus;
    if (execution.executionError !== undefined) update.execution_error = execution.executionError;
    if (execution.executedAt !== undefined) update.executed_at = execution.executedAt;
    await executor.updateTable("proposals").set(update).where("id", "=", id).where("status", "=", "pending").execute();
    return this.getProposal(id, executor);
  }

  async appendEvent(event: EventEnvelope, executor: DatabaseExecutor = this.db) {
    const projectId = await resolveEventProjectId(event, executor);
    await executor.insertInto("event_log").values({
      id: event.id,
      type: event.type,
      actor_type: event.actorType,
      actor_id: event.actorId,
      entity_type: event.entityType,
      entity_id: event.entityId,
      project_id: projectId,
      correlation_id: event.correlationId,
      occurred_at: event.occurredAt,
      payload_json: JSON.stringify(event.payload),
    }).execute();
  }
}
