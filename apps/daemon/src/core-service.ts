import { randomUUID } from "node:crypto";
import type {
  ConvertIdeaInput,
  CreateEntityLinkInput,
  CreateIdeaInput,
  CreateMilestoneInput,
  CreatePlanInput,
  CreateProposalInput,
  CreateProjectInput,
  CreateTaskInput,
  EntityType,
  EventEnvelope,
  Idea,
  IdeaDuplicateCandidate,
  MergeIdeasInput,
  DecideProposalInput,
  Proposal,
  UpdateIdeaInput,
  UpdateMilestoneInput,
  UpdatePlanInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@pcc/contracts";
import { ActorRepository, CoreRepository, type DatabaseExecutor } from "@pcc/database";
import { createCoreEvent, type CoreActor } from "@pcc/domain";
import { EventBroker } from "./event-broker.js";
import { EntityNotFoundError } from "./inbox-service.js";

export class EntityConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityConflictError";
  }
}

export class InvalidHierarchyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHierarchyError";
  }
}

function normalizedIdeaText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function ideaBigrams(value: string) {
  const normalized = normalizedIdeaText(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection);
}

export class CoreService {
  constructor(private readonly repository: CoreRepository, private readonly events: EventBroker, private readonly actors: ActorRepository) {}

  private publish(events: EventEnvelope[]) {
    events.forEach((event) => this.events.publish(event));
  }

  listProjects() {
    return this.repository.listProjects();
  }

  async getProject(id: string) {
    const entity = await this.repository.getProject(id);
    if (!entity) throw new EntityNotFoundError("Project", id);
    return entity;
  }

  async createProject(input: CreateProjectInput, actor: CoreActor, correlationId: string) {
    const id = randomUUID();
    const event = createCoreEvent("project", id, "created", actor, correlationId, { name: input.name });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.createProject(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return created;
    });
    if (!entity) throw new EntityNotFoundError("Project", id);
    this.publish([event]);
    return entity;
  }

  async updateProject(id: string, input: UpdateProjectInput, actor: CoreActor, correlationId: string) {
    await this.getProject(id);
    const event = createCoreEvent("project", id, input.status === "archived" ? "archived" : "updated", actor, correlationId, { changedFields: Object.keys(input) });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.updateProject(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return updated;
    });
    if (!entity) throw new EntityNotFoundError("Project", id);
    this.publish([event]);
    return entity;
  }

  listMilestones(projectId?: string) {
    return this.repository.listMilestones(projectId);
  }

  async getMilestone(id: string) {
    const entity = await this.repository.getMilestone(id);
    if (!entity) throw new EntityNotFoundError("Milestone", id);
    return entity;
  }

  async createMilestone(input: CreateMilestoneInput, actor: CoreActor, correlationId: string) {
    await this.getProject(input.projectId);
    const id = randomUUID();
    const event = createCoreEvent("milestone", id, "created", actor, correlationId, { projectId: input.projectId });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.createMilestone(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return created;
    });
    if (!entity) throw new EntityNotFoundError("Milestone", id);
    this.publish([event]);
    return entity;
  }

  async updateMilestone(id: string, input: UpdateMilestoneInput, actor: CoreActor, correlationId: string) {
    await this.getMilestone(id);
    const event = createCoreEvent("milestone", id, input.status === "archived" ? "archived" : "updated", actor, correlationId, { changedFields: Object.keys(input) });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.updateMilestone(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return updated;
    });
    if (!entity) throw new EntityNotFoundError("Milestone", id);
    this.publish([event]);
    return entity;
  }

  listPlans(filters: { projectId?: string; milestoneId?: string } = {}) {
    return this.repository.listPlans(filters);
  }

  async getPlan(id: string) {
    const entity = await this.repository.getPlan(id);
    if (!entity) throw new EntityNotFoundError("Plan", id);
    return entity;
  }

  async createPlan(input: CreatePlanInput, actor: CoreActor, correlationId: string) {
    const milestone = await this.getMilestone(input.milestoneId);
    if (milestone.projectId !== input.projectId) {
      throw new InvalidHierarchyError("Plan 的 projectId 必须与所属 Milestone 一致");
    }
    const id = randomUUID();
    const event = createCoreEvent("plan", id, "created", actor, correlationId, { projectId: input.projectId, milestoneId: input.milestoneId });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.createPlan(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return created;
    });
    if (!entity) throw new EntityNotFoundError("Plan", id);
    this.publish([event]);
    return entity;
  }

  async updatePlan(id: string, input: UpdatePlanInput, actor: CoreActor, correlationId: string) {
    await this.getPlan(id);
    const event = createCoreEvent("plan", id, input.status === "archived" ? "archived" : "updated", actor, correlationId, { changedFields: Object.keys(input) });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.updatePlan(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return updated;
    });
    if (!entity) throw new EntityNotFoundError("Plan", id);
    this.publish([event]);
    return entity;
  }

  listTasks(filters: { projectId?: string; milestoneId?: string; planId?: string } = {}) {
    return this.repository.listTasks(filters);
  }

  async getTask(id: string) {
    const entity = await this.repository.getTask(id);
    if (!entity) throw new EntityNotFoundError("Task", id);
    return entity;
  }

  private async validateTaskHierarchy(input: Pick<CreateTaskInput, "projectId" | "milestoneId" | "planId" | "parentTaskId">, taskId?: string) {
    const plan = await this.getPlan(input.planId);
    if (plan.projectId !== input.projectId || plan.milestoneId !== input.milestoneId) {
      throw new InvalidHierarchyError("Task 的 Project、Milestone 和 Plan 层级不一致");
    }
    if (input.parentTaskId) {
      if (input.parentTaskId === taskId) throw new InvalidHierarchyError("Task 不能成为自己的父任务");
      const parent = await this.getTask(input.parentTaskId);
      if (parent.planId !== input.planId) throw new InvalidHierarchyError("父任务必须位于同一 Plan");
    }
  }

  private async validateAssignee(assigneeType: string, assigneeId: string | null) {
    if (assigneeType === "unassigned" && assigneeId !== null) {
      throw new InvalidHierarchyError("未分配任务不应设置负责人");
    }
    if (assigneeType !== "unassigned" && !assigneeId) {
      throw new InvalidHierarchyError("已分配任务必须设置负责人");
    }
    if (assigneeType !== "unassigned" && assigneeId) {
      const actor = await this.actors.get(assigneeId);
      if (!actor) throw new InvalidHierarchyError("负责人必须来自已注册的人类或 Agent 实体");
      if (actor.kind !== assigneeType) throw new InvalidHierarchyError("负责人的实体类型与任务分配类型不一致");
    }
  }

  private async syncTaskAssignee(taskId: string, assigneeType: string, assigneeId: string | null, executor: DatabaseExecutor) {
    await executor.deleteFrom("entity_links").where("target_type", "=", "task").where("target_id", "=", taskId).where("source_type", "=", "actor").where("label", "=", "task:assignee").execute();
    if (assigneeType !== "unassigned" && assigneeId) {
      await executor.insertInto("entity_links").values({ id: randomUUID(), source_type: "actor", source_id: assigneeId, target_type: "task", target_id: taskId, relation: "implements", label: "task:assignee", created_at: new Date().toISOString() }).execute();
    }
  }

  async createTask(input: CreateTaskInput, actor: CoreActor, correlationId: string) {
    await this.validateTaskHierarchy(input);
    await this.validateAssignee(input.assigneeType, input.assigneeId);
    const id = randomUUID();
    const event = createCoreEvent("task", id, "created", actor, correlationId, { projectId: input.projectId, milestoneId: input.milestoneId, planId: input.planId });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.createTask(id, input, transaction);
      await this.syncTaskAssignee(id, input.assigneeType, input.assigneeId, transaction);
      await this.repository.appendEvent(event, transaction);
      return created;
    });
    if (!entity) throw new EntityNotFoundError("Task", id);
    this.publish([event]);
    return entity;
  }

  async updateTask(id: string, input: UpdateTaskInput, actor: CoreActor, correlationId: string) {
    const current = await this.getTask(id);
    if (input.parentTaskId !== undefined) {
      await this.validateTaskHierarchy({
        projectId: current.projectId,
        milestoneId: current.milestoneId,
        planId: current.planId,
        parentTaskId: input.parentTaskId,
      }, id);
    }
    const assigneeType = input.assigneeType ?? current.assigneeType;
    const assigneeId = input.assigneeId !== undefined ? input.assigneeId : input.assigneeType === "unassigned" ? null : current.assigneeId;
    await this.validateAssignee(assigneeType, assigneeId);
    const event = createCoreEvent("task", id, input.status === "archived" ? "archived" : "updated", actor, correlationId, { changedFields: Object.keys(input) });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.updateTask(id, input, transaction);
      if (input.assigneeType !== undefined || input.assigneeId !== undefined) await this.syncTaskAssignee(id, assigneeType, assigneeId, transaction);
      await this.repository.appendEvent(event, transaction);
      return updated;
    });
    if (!entity) throw new EntityNotFoundError("Task", id);
    this.publish([event]);
    return entity;
  }

  listIdeas(filters: { projectId?: string; status?: Idea["status"] } = {}) {
    return this.repository.listIdeas(filters);
  }

  async getIdea(id: string) {
    const entity = await this.repository.getIdea(id);
    if (!entity) throw new EntityNotFoundError("Idea", id);
    return entity;
  }

  async createIdea(input: CreateIdeaInput, actor: CoreActor, correlationId: string) {
    if (input.projectId) await this.getProject(input.projectId);
    if (input.sourceType === "inbox_item" && !input.sourceId) {
      throw new InvalidHierarchyError("从 Inbox 转入的 Idea 必须保留 sourceId");
    }
    const id = randomUUID();
    const event = createCoreEvent("idea", id, "created", actor, correlationId, { projectId: input.projectId, sourceType: input.sourceType, sourceId: input.sourceId });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.createIdea(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return created;
    });
    if (!entity) throw new EntityNotFoundError("Idea", id);
    this.publish([event]);
    return entity;
  }

  async updateIdea(id: string, input: UpdateIdeaInput, actor: CoreActor, correlationId: string) {
    await this.getIdea(id);
    if (input.projectId) await this.getProject(input.projectId);
    const event = createCoreEvent("idea", id, input.status === "archived" ? "archived" : "updated", actor, correlationId, { changedFields: Object.keys(input) });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.updateIdea(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return updated;
    });
    if (!entity) throw new EntityNotFoundError("Idea", id);
    this.publish([event]);
    return entity;
  }

  async findIdeaDuplicates(projectId: string): Promise<IdeaDuplicateCandidate[]> {
    await this.getProject(projectId);
    const ideas = (await this.repository.listIdeas({ projectId })).filter((idea) => !["archived", "converted"].includes(idea.status));
    const candidates: IdeaDuplicateCandidate[] = [];
    for (let leftIndex = 0; leftIndex < ideas.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ideas.length; rightIndex += 1) {
        const left = ideas[leftIndex]!;
        const right = ideas[rightIndex]!;
        const sameTitle = normalizedIdeaText(left.title) === normalizedIdeaText(right.title);
        const titleSimilarity = jaccard(ideaBigrams(left.title), ideaBigrams(right.title));
        const bodySimilarity = jaccard(ideaBigrams(left.body), ideaBigrams(right.body));
        const score = sameTitle ? 1 : Math.round((titleSimilarity * 0.82 + bodySimilarity * 0.18) * 100) / 100;
        if (sameTitle || score >= 0.58) candidates.push({ ideaId: left.id, duplicateId: right.id, score, reason: sameTitle ? "same_title" : "high_similarity" });
      }
    }
    return candidates.sort((left, right) => right.score - left.score);
  }

  async mergeIdeas(targetId: string, input: MergeIdeasInput, actor: CoreActor, correlationId: string) {
    if (input.sourceIdeaIds.includes(targetId)) throw new InvalidHierarchyError("目标想法不能同时作为合并来源");
    const current = await this.getIdea(targetId);
    if (["archived", "converted"].includes(current.status)) throw new EntityConflictError("目标想法当前状态不允许合并");
    const sources = await Promise.all(input.sourceIdeaIds.map((id) => this.getIdea(id)));
    if (sources.some((idea) => idea.projectId !== current.projectId)) throw new InvalidHierarchyError("只能合并同一项目内的想法");
    if (sources.some((idea) => ["archived", "converted"].includes(idea.status))) throw new EntityConflictError("归档或已转化的想法不能再次合并");
    const statusRank: Record<Idea["status"], number> = { draft: 0, developing: 1, validated: 2, converted: 3, archived: -1 };
    const mergedStatus = [current, ...sources].sort((left, right) => statusRank[right.status] - statusRank[left.status])[0]!.status as "draft" | "developing" | "validated";
    const mergedBody = input.body ?? [...new Set([current.body, ...sources.map((idea) => idea.body)].map((body) => body.trim()).filter(Boolean))].join("\n\n---\n\n").slice(0, 40_000);
    const events: EventEnvelope[] = [createCoreEvent("idea", targetId, "updated", actor, correlationId, { projectId: current.projectId, mergedSourceIds: input.sourceIdeaIds, changedFields: ["title", "body", "status"] })];
    const links: NonNullable<Awaited<ReturnType<CoreRepository["createLink"]>>>[] = [];
    const idea = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.updateIdea(targetId, { title: input.title ?? current.title, body: mergedBody, status: mergedStatus }, transaction);
      for (const source of sources) {
        const linkId = randomUUID();
        const link = await this.repository.createLink(linkId, { sourceType: "idea", sourceId: targetId, targetType: "idea", targetId: source.id, relation: "derivedFrom", label: "合并重复想法" }, transaction);
        if (link) links.push(link);
        await this.repository.updateIdea(source.id, { status: "archived" }, transaction);
        events.push(
          createCoreEvent("idea", targetId, "linked", actor, correlationId, { projectId: current.projectId, linkId, targetType: "idea", targetId: source.id, relation: "derivedFrom" }),
          createCoreEvent("idea", source.id, "archived", actor, correlationId, { projectId: current.projectId, mergedIntoIdeaId: targetId }),
        );
      }
      for (const event of events) await this.repository.appendEvent(event, transaction);
      return updated;
    });
    if (!idea) throw new EntityNotFoundError("Idea", targetId);
    this.publish(events);
    return { idea, mergedIdeas: sources, links };
  }

  listLinks(filters: { entityType?: EntityType; entityId?: string } = {}) {
    return this.repository.listLinks(filters);
  }

  async createLink(input: CreateEntityLinkInput, actor: CoreActor, correlationId: string) {
    await this.assertEntityExists(input.sourceType, input.sourceId);
    await this.assertEntityExists(input.targetType, input.targetId);
    const existing = await this.repository.listLinks({ entityType: input.sourceType, entityId: input.sourceId });
    if (existing.some((link) => link.sourceType === input.sourceType && link.sourceId === input.sourceId && link.targetType === input.targetType && link.targetId === input.targetId && link.relation === input.relation)) {
      throw new EntityConflictError("相同语义的实体链接已经存在");
    }
    const id = randomUUID();
    const event = createCoreEvent(input.sourceType, input.sourceId, "linked", actor, correlationId, { linkId: id, targetType: input.targetType, targetId: input.targetId, relation: input.relation });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.createLink(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return created;
    });
    if (!entity) throw new EntityNotFoundError("EntityLink", id);
    this.publish([event]);
    return entity;
  }

  async deleteLink(id: string, actor: CoreActor, correlationId: string) {
    const current = await this.repository.getLink(id);
    if (!current) throw new EntityNotFoundError("EntityLink", id);
    const event = createCoreEvent(current.sourceType, current.sourceId, "unlinked", actor, correlationId, { linkId: id, targetType: current.targetType, targetId: current.targetId, relation: current.relation });
    await this.repository.database.transaction().execute(async (transaction) => {
      const deleted = await this.repository.deleteLink(id, transaction);
      if (!deleted) throw new EntityNotFoundError("EntityLink", id);
      await this.repository.appendEvent(event, transaction);
    });
    this.publish([event]);
  }

  listProposals(filters: { projectId?: string; status?: Proposal["status"] } = {}) {
    return this.repository.listProposals(filters);
  }

  async getProposal(id: string) {
    const entity = await this.repository.getProposal(id);
    if (!entity) throw new EntityNotFoundError("Proposal", id);
    return entity;
  }

  async createProposal(input: CreateProposalInput, actor: CoreActor, correlationId: string) {
    if (input.projectId) await this.getProject(input.projectId);
    const id = randomUUID();
    const event = createCoreEvent("proposal", id, "created", actor, correlationId, { projectId: input.projectId, kind: input.kind, risk: input.risk });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.createProposal(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return created;
    });
    if (!entity) throw new EntityNotFoundError("Proposal", id);
    this.publish([event]);
    return entity;
  }

  async decideProposal(id: string, input: DecideProposalInput, actor: CoreActor, correlationId: string) {
    const current = await this.getProposal(id);
    if (current.status !== "pending") throw new EntityConflictError("该 Proposal 已经完成决策");
    const event = createCoreEvent("proposal", id, input.decision, actor, correlationId, { changedCount: input.changes?.length ?? current.changes.length });
    const entity = await this.repository.database.transaction().execute(async (transaction) => {
      const decided = await this.repository.decideProposal(id, input.decision, input.changes, {
        ...(input.command !== undefined ? { command: input.command } : {}),
        executionStatus: (input.command ?? current.command) ? "pending" : "not_applicable",
      }, transaction);
      if (!decided || decided.status === "pending") throw new EntityConflictError("Proposal 决策状态发生冲突");
      await this.repository.appendEvent(event, transaction);
      return decided;
    });
    this.publish([event]);
    return entity;
  }

  private async assertEntityExists(type: EntityType, id: string) {
    let exists = false;
    if (type === "project") exists = Boolean(await this.repository.getProject(id));
    else if (type === "milestone") exists = Boolean(await this.repository.getMilestone(id));
    else if (type === "plan") exists = Boolean(await this.repository.getPlan(id));
    else if (type === "task") exists = Boolean(await this.repository.getTask(id));
    else if (type === "idea") exists = Boolean(await this.repository.getIdea(id));
    else if (type === "proposal") exists = Boolean(await this.repository.getProposal(id));
    else if (type === "actor") exists = Boolean(await this.actors.get(id));
    else if (type === "worktree") exists = Boolean(await this.repository.database.selectFrom("worktree_snapshots").select("id").where("id", "=", id).executeTakeFirst());
    else if (type === "commit") exists = Boolean(await this.repository.database.selectFrom("git_commits").select("id").where("id", "=", id).executeTakeFirst());
    else if (type === "inbox_item") {
      exists = Boolean(await this.repository.database.selectFrom("inbox_items").select("id").where("id", "=", id).executeTakeFirst());
    }
    else if (type === "canvas_document") {
      exists = Boolean(await this.repository.database.selectFrom("canvas_documents").select("id").where("id", "=", id).executeTakeFirst());
    }
    else if (type === "canvas_node") {
      exists = Boolean(await this.repository.database.selectFrom("canvas_nodes").select("id").where("id", "=", id).executeTakeFirst());
    }
    if (!exists) throw new EntityNotFoundError(type, id);
  }

  async convertIdea(id: string, input: ConvertIdeaInput, actor: CoreActor, correlationId: string) {
    const idea = await this.getIdea(id);
    if (idea.status === "converted" || idea.status === "archived") {
      throw new EntityConflictError("该 Idea 当前状态不允许再次转化");
    }

    const targetId = randomUUID();
    const linkId = randomUUID();
    const targetTitle = input.title ?? idea.title;
    const createdEvents: EventEnvelope[] = [];

    const result = await this.repository.database.transaction().execute(async (transaction) => {
      let target: Awaited<ReturnType<CoreRepository["createMilestone"]>> | Awaited<ReturnType<CoreRepository["createPlan"]>> | Awaited<ReturnType<CoreRepository["createTask"]>>;
      let targetType: "milestone" | "plan" | "task";

      if (input.targetType === "milestone") {
        const projectId = input.projectId ?? idea.projectId;
        if (!projectId) throw new InvalidHierarchyError("转为 Milestone 前需要选择项目");
        if (!await this.repository.getProject(projectId, transaction)) throw new EntityNotFoundError("Project", projectId);
        targetType = "milestone";
        target = await this.repository.createMilestone(targetId, {
          projectId,
          title: targetTitle,
          description: idea.body,
          status: "planned",
          targetDate: null,
          position: 0,
        }, transaction);
      } else if (input.targetType === "plan") {
        const milestone = await this.repository.getMilestone(input.milestoneId, transaction);
        if (!milestone) throw new EntityNotFoundError("Milestone", input.milestoneId);
        targetType = "plan";
        target = await this.repository.createPlan(targetId, {
          projectId: milestone.projectId,
          milestoneId: milestone.id,
          title: targetTitle,
          description: idea.body,
          status: "planned",
          position: 0,
        }, transaction);
      } else {
        const plan = await this.repository.getPlan(input.planId, transaction);
        if (!plan) throw new EntityNotFoundError("Plan", input.planId);
        targetType = "task";
        target = await this.repository.createTask(targetId, {
          projectId: plan.projectId,
          milestoneId: plan.milestoneId,
          planId: plan.id,
          parentTaskId: null,
          title: targetTitle,
          description: idea.body,
          status: "todo",
          priority: "medium",
          assigneeType: "unassigned",
          assigneeId: null,
          dueAt: null,
          estimateMinutes: null,
          position: 0,
        }, transaction);
      }

      if (!target) throw new EntityNotFoundError(targetType, targetId);
      const link = await this.repository.createLink(linkId, {
        sourceType: targetType,
        sourceId: targetId,
        targetType: "idea",
        targetId: idea.id,
        relation: "derivedFrom",
        label: null,
      }, transaction);
      const updatedIdea = await this.repository.updateIdea(idea.id, { status: "converted" }, transaction);
      if (!link || !updatedIdea) throw new EntityNotFoundError("Idea", idea.id);

      createdEvents.push(
        createCoreEvent(targetType, targetId, "created", actor, correlationId, { derivedFromIdeaId: idea.id }),
        createCoreEvent("idea", idea.id, "converted", actor, correlationId, { targetType, targetId, linkId }),
      );
      for (const event of createdEvents) await this.repository.appendEvent(event, transaction);
      return { idea: updatedIdea, target, link };
    });

    this.publish(createdEvents);
    return result;
  }
}
