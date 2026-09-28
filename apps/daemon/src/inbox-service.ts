import { randomUUID } from "node:crypto";
import type { BatchInboxOperationInput, CreateInboxItemInput, CreateLinkedInboxItemInput, UpdateInboxItemInput } from "@pcc/contracts";
import { CoreRepository, InboxRepository } from "@pcc/database";
import {
  createInboxArchivedEvent,
  createInboxCapturedEvent,
  createInboxUpdatedEvent,
  createCoreEvent,
  type InboxActor,
} from "@pcc/domain";
import { EventBroker } from "./event-broker.js";

export class EntityNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} 不存在`);
    this.name = "EntityNotFoundError";
  }
}

export class InboxService {
  constructor(
    private readonly repository: InboxRepository,
    private readonly core: CoreRepository,
    private readonly events: EventBroker,
  ) {}

  list() {
    return this.repository.list();
  }

  async create(input: CreateInboxItemInput, actor: InboxActor, correlationId: string) {
    const id = randomUUID();
    const event = createInboxCapturedEvent(id, input, actor, correlationId);
    const item = await this.repository.database.transaction().execute(async (transaction) => {
      const created = await this.repository.create(id, input, transaction);
      await this.repository.appendEvent(event, transaction);
      return created;
    });
    if (!item) throw new EntityNotFoundError("InboxItem", id);
    this.events.publish(event);
    return item;
  }

  async createLinked(input: CreateLinkedInboxItemInput, actor: InboxActor, correlationId: string) {
    const id = randomUUID();
    const captureInput: CreateInboxItemInput = { title: input.title, note: input.note, source: input.source, projectId: input.projectId, project: input.project, kind: input.kind };
    const captured = createInboxCapturedEvent(id, captureInput, actor, correlationId);
    const linkEvents = input.mentions.map((mention) => createCoreEvent("inbox_item", id, "linked", actor, correlationId, { targetType: mention.type, targetId: mention.id, relation: "mentions" }));
    const result = await this.repository.database.transaction().execute(async (transaction) => {
      for (const mention of input.mentions) {
        const entity = mention.type === "project" ? await this.core.getProject(mention.id, transaction)
          : mention.type === "milestone" ? await this.core.getMilestone(mention.id, transaction)
            : mention.type === "plan" ? await this.core.getPlan(mention.id, transaction)
              : mention.type === "task" ? await this.core.getTask(mention.id, transaction)
                : await this.core.getIdea(mention.id, transaction);
        if (!entity) throw new EntityNotFoundError(mention.type, mention.id);
      }
      const item = await this.repository.create(id, captureInput, transaction);
      if (!item) throw new EntityNotFoundError("InboxItem", id);
      const links = [];
      for (const [index, mention] of input.mentions.entries()) {
        const linkId = randomUUID();
        const link = await this.core.createLink(linkId, { sourceType: "inbox_item", sourceId: id, targetType: mention.type, targetId: mention.id, relation: "mentions", label: mention.label }, transaction);
        if (!link) throw new EntityNotFoundError("EntityLink", linkId);
        links.push(link);
        linkEvents[index] = { ...linkEvents[index]!, payload: { ...linkEvents[index]!.payload, linkId } };
      }
      await this.repository.appendEvent(captured, transaction);
      for (const event of linkEvents) await this.core.appendEvent(event, transaction);
      return { item, links };
    });
    [captured, ...linkEvents].forEach((event) => this.events.publish(event));
    return result;
  }

  async update(id: string, input: UpdateInboxItemInput, actor: InboxActor, correlationId: string) {
    const event = createInboxUpdatedEvent(id, Object.keys(input), actor, correlationId);
    const item = await this.repository.database.transaction().execute(async (transaction) => {
      const updated = await this.repository.update(id, input, transaction);
      if (!updated) throw new EntityNotFoundError("InboxItem", id);
      await this.repository.appendEvent(event, transaction);
      return updated;
    });
    this.events.publish(event);
    return item;
  }

  async archive(id: string, actor: InboxActor, correlationId: string) {
    const event = createInboxArchivedEvent(id, actor, correlationId);
    await this.repository.database.transaction().execute(async (transaction) => {
      const archived = await this.repository.archive(id, transaction);
      if (!archived) throw new EntityNotFoundError("InboxItem", id);
      await this.repository.appendEvent(event, transaction);
    });
    this.events.publish(event);
  }

  async batch(input: BatchInboxOperationInput, actor: InboxActor, correlationId: string) {
    const events = input.ids.map((id) => input.action === "archive"
      ? createInboxArchivedEvent(id, actor, correlationId)
      : createInboxUpdatedEvent(id, input.kind ? ["projectId", "kind"] : ["projectId"], actor, correlationId));
    const items = await this.repository.database.transaction().execute(async (transaction) => {
      if (input.action === "assign" && input.projectId) {
        const project = await transaction.selectFrom("projects").select("id").where("id", "=", input.projectId).executeTakeFirst();
        if (!project) throw new EntityNotFoundError("Project", input.projectId);
      }
      const updated = [];
      for (const [index, id] of input.ids.entries()) {
        const event = events[index]!;
        const current = await this.repository.getById(id, transaction);
        if (!current) throw new EntityNotFoundError("InboxItem", id);
        if (input.action === "archive") {
          if (!await this.repository.archive(id, transaction)) throw new EntityNotFoundError("InboxItem", id);
        } else {
          const item = await this.repository.update(id, { projectId: input.projectId, ...(input.kind ? { kind: input.kind } : {}) }, transaction);
          if (!item) throw new EntityNotFoundError("InboxItem", id);
          updated.push(item);
        }
        await this.repository.appendEvent(event, transaction);
      }
      return updated;
    });
    events.forEach((event) => this.events.publish(event));
    return { action: input.action, processed: input.ids.length, items };
  }
}
