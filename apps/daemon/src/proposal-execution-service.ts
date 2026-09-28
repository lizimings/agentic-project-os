import { randomUUID } from "node:crypto";
import type { DecideProposalInput, EventEnvelope, ProposalCommand } from "@pcc/contracts";
import { CoreRepository, InboxRepository, TimeRepository, type DatabaseExecutor } from "@pcc/database";
import { createCoreEvent, createInboxArchivedEvent, type CoreActor } from "@pcc/domain";
import { EntityConflictError, InvalidHierarchyError } from "./core-service.js";
import { CanvasService } from "./canvas-service.js";
import { EventBroker } from "./event-broker.js";
import { EntityNotFoundError } from "./inbox-service.js";

export class ProposalExecutionService {
  constructor(
    private readonly core: CoreRepository,
    private readonly inbox: InboxRepository,
    private readonly time: TimeRepository,
    private readonly canvas: CanvasService,
    private readonly events: EventBroker,
  ) {}

  private async applyCommand(command: ProposalCommand, actor: CoreActor, correlationId: string, executor: DatabaseExecutor): Promise<EventEnvelope[]> {
    if (command.type === "convert_inbox_to_idea") {
      const item = await this.inbox.getById(command.inboxItemId, executor);
      if (!item) throw new EntityNotFoundError("InboxItem", command.inboxItemId);
      const project = await this.core.getProject(command.projectId, executor);
      if (!project) throw new EntityNotFoundError("Project", command.projectId);
      if (item.projectId && item.projectId !== command.projectId) throw new InvalidHierarchyError("Inbox 与 Proposal 的 Project 不一致");
      const existing = await executor.selectFrom("ideas").select("id").where("source_type", "=", "inbox_item").where("source_id", "=", item.id).executeTakeFirst();
      if (existing) throw new EntityConflictError("该 Inbox 已经转为 Idea");
      const ideaId = randomUUID();
      const linkId = randomUUID();
      await this.core.createIdea(ideaId, { projectId: project.id, title: command.title ?? item.title, body: command.body ?? item.note, status: "draft", sourceType: "inbox_item", sourceId: item.id }, executor);
      await this.core.createLink(linkId, { sourceType: "idea", sourceId: ideaId, targetType: "inbox_item", targetId: item.id, relation: "derivedFrom", label: "由已确认的 Inbox 转化" }, executor);
      await this.inbox.archive(item.id, executor);
      return [
        createCoreEvent("idea", ideaId, "created", actor, correlationId, { projectId: project.id, sourceType: "inbox_item", sourceId: item.id }),
        createCoreEvent("idea", ideaId, "linked", actor, correlationId, { linkId, targetType: "inbox_item", targetId: item.id, relation: "derivedFrom" }),
        createInboxArchivedEvent(item.id, actor, correlationId),
      ];
    }

    if (command.type === "convert_inbox_to_entity") {
      const item = await this.inbox.getById(command.inboxItemId, executor);
      if (!item) throw new EntityNotFoundError("InboxItem", command.inboxItemId);
      const project = await this.core.getProject(command.projectId, executor);
      if (!project) throw new EntityNotFoundError("Project", command.projectId);
      const converted = await executor.selectFrom("entity_links")
        .select("id")
        .where("target_type", "=", "inbox_item")
        .where("target_id", "=", item.id)
        .where("relation", "=", "derivedFrom")
        .executeTakeFirst();
      if (converted) throw new EntityConflictError("该 Inbox 已经完成结构化转化");

      if (command.targetType === "plan" || command.targetType === "task") {
        const milestone = command.milestoneId ? await this.core.getMilestone(command.milestoneId, executor) : undefined;
        if (!milestone || milestone.projectId !== project.id) throw new InvalidHierarchyError("目标里程碑不属于所选 Project");
      }
      if (command.targetType === "task") {
        const plan = command.planId ? await this.core.getPlan(command.planId, executor) : undefined;
        if (!plan || plan.projectId !== project.id || plan.milestoneId !== command.milestoneId) throw new InvalidHierarchyError("目标计划不属于所选里程碑");
      }

      const entityId = randomUUID();
      const linkId = randomUUID();
      const title = command.title ?? item.title;
      const body = command.body ?? item.note;
      if (command.targetType === "idea") {
        await this.core.createIdea(entityId, { projectId: project.id, title, body, status: "draft", sourceType: "inbox_item", sourceId: item.id }, executor);
      } else if (command.targetType === "milestone") {
        await this.core.createMilestone(entityId, { projectId: project.id, title, description: body, status: "planned", targetDate: null, position: 0 }, executor);
      } else if (command.targetType === "plan") {
        await this.core.createPlan(entityId, { projectId: project.id, milestoneId: command.milestoneId!, title, description: body, status: "planned", position: 0 }, executor);
      } else {
        await this.core.createTask(entityId, { projectId: project.id, milestoneId: command.milestoneId!, planId: command.planId!, parentTaskId: null, title, description: body, status: "todo", priority: "medium", assigneeType: "unassigned", assigneeId: null, dueAt: null, estimateMinutes: null, position: 0 }, executor);
      }
      await this.core.createLink(linkId, { sourceType: command.targetType, sourceId: entityId, targetType: "inbox_item", targetId: item.id, relation: "derivedFrom", label: "由已确认的 Inbox 转化" }, executor);
      await this.inbox.archive(item.id, executor);
      return [
        createCoreEvent(command.targetType, entityId, "created", actor, correlationId, { projectId: project.id, sourceType: "inbox_item", sourceId: item.id }),
        createCoreEvent(command.targetType, entityId, "linked", actor, correlationId, { linkId, targetType: "inbox_item", targetId: item.id, relation: "derivedFrom" }),
        createInboxArchivedEvent(item.id, actor, correlationId),
      ];
    }

    if (command.type === "organize_mindmap") {
      return [await this.canvas.applyOrganizationCommand(command, actor, correlationId, executor)];
    }

    const input = command.input;
    if (input.projectId && !await this.core.getProject(input.projectId, executor)) throw new EntityNotFoundError("Project", input.projectId);
    if (input.taskId) {
      const task = await this.core.getTask(input.taskId, executor);
      if (!task) throw new EntityNotFoundError("Task", input.taskId);
      if (input.projectId && task.projectId !== input.projectId) throw new InvalidHierarchyError("时间块与 Task 的 Project 不一致");
    }
    const id = randomUUID();
    await this.time.createBlock(id, input, executor);
    return [createCoreEvent("time_block", id, "created", actor, correlationId, { projectId: input.projectId, taskId: input.taskId, startAt: input.startAt, endAt: input.endAt, proposal: true })];
  }

  async decide(id: string, input: DecideProposalInput, actor: CoreActor, correlationId: string) {
    const current = await this.core.getProposal(id);
    if (!current) throw new EntityNotFoundError("Proposal", id);
    if (current.status !== "pending") throw new EntityConflictError("该 Proposal 已经完成决策");
    const command = input.command !== undefined ? input.command : current.command;
    const changed = input.changes ?? current.changes;
    const executedAt = input.decision !== "rejected" && command ? new Date().toISOString() : null;
    const commandEvents: EventEnvelope[] = [];
    const proposalEvent = createCoreEvent("proposal", id, input.decision, actor, correlationId, { changedCount: changed.length, commandType: command?.type ?? null, executionStatus: executedAt ? "applied" : "not_applicable" });
    const proposal = await this.core.database.transaction().execute(async (transaction) => {
      if (input.decision !== "rejected" && command) commandEvents.push(...await this.applyCommand(command, actor, correlationId, transaction));
      const decided = await this.core.decideProposal(id, input.decision, input.changes, {
        command,
        executionStatus: executedAt ? "applied" : "not_applicable",
        executionError: null,
        executedAt,
      }, transaction);
      if (!decided || decided.status === "pending") throw new EntityConflictError("Proposal 决策状态发生冲突");
      for (const event of [...commandEvents, proposalEvent]) await this.core.appendEvent(event, transaction);
      return decided;
    });
    [...commandEvents, proposalEvent].forEach((event) => this.events.publish(event));
    return proposal;
  }
}
