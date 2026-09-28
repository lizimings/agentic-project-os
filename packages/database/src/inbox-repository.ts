import type { CreateInboxItemInput, EventEnvelope, InboxItem, UpdateInboxItemInput } from "@pcc/contracts";
import type { DatabaseExecutor, PccDatabase } from "./types.js";
import { resolveEventProjectId } from "./event-log-repository.js";

function relativeTime(iso: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (elapsedMinutes < 1) return "刚刚";
  if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`;
  if (elapsedMinutes < 24 * 60) return `${Math.floor(elapsedMinutes / 60)} 小时前`;
  if (elapsedMinutes < 48 * 60) return "昨天";
  return `${Math.floor(elapsedMinutes / (24 * 60))} 天前`;
}

async function resolveProjectId(db: DatabaseExecutor, input: { projectId?: string | null | undefined; project?: string | undefined }) {
  if ("projectId" in input) return input.projectId ?? null;
  if (!input.project || input.project === "未归类") return null;
  const project = await db.selectFrom("projects").select("id").where("name", "=", input.project).executeTakeFirst();
  return project?.id ?? null;
}

export class InboxRepository {
  constructor(private readonly db: PccDatabase) {}

  get database() {
    return this.db;
  }

  async list(executor: DatabaseExecutor = this.db): Promise<InboxItem[]> {
    const rows = await executor
      .selectFrom("inbox_items")
      .leftJoin("projects", "projects.id", "inbox_items.project_id")
      .select([
        "inbox_items.id",
        "inbox_items.title",
        "inbox_items.note",
        "inbox_items.source",
        "inbox_items.project_id as projectId",
        "inbox_items.kind",
        "inbox_items.created_at as createdAt",
        "inbox_items.updated_at as updatedAt",
        "projects.name as projectName",
      ])
      .where("inbox_items.archived_at", "is", null)
      .orderBy("inbox_items.created_at", "desc")
      .execute();

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      note: row.note,
      source: row.source as InboxItem["source"],
      projectId: row.projectId,
      project: row.projectName ?? "未归类",
      kind: row.kind as InboxItem["kind"],
      created: relativeTime(row.createdAt),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async getById(id: string, executor: DatabaseExecutor = this.db) {
    const items = await this.list(executor);
    return items.find((item) => item.id === id);
  }

  async create(id: string, input: CreateInboxItemInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    const projectId = await resolveProjectId(executor, input);
    await executor.insertInto("inbox_items").values({
      id,
      title: input.title,
      note: input.note,
      source: input.source,
      project_id: projectId,
      kind: input.kind,
      created_at: now,
      updated_at: now,
      archived_at: null,
    }).execute();
    return this.getById(id, executor);
  }

  async update(id: string, input: UpdateInboxItemInput, executor: DatabaseExecutor = this.db) {
    const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) update.title = input.title;
    if (input.note !== undefined) update.note = input.note;
    if (input.source !== undefined) update.source = input.source;
    if (input.kind !== undefined) update.kind = input.kind;
    if (input.project !== undefined || input.projectId !== undefined) {
      update.project_id = await resolveProjectId(executor, input);
    }
    await executor.updateTable("inbox_items").set(update).where("id", "=", id).where("archived_at", "is", null).execute();
    return this.getById(id, executor);
  }

  async archive(id: string, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    const result = await executor.updateTable("inbox_items").set({ archived_at: now, updated_at: now }).where("id", "=", id).where("archived_at", "is", null).executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
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

  async listEvents(limit = 100) {
    return this.db.selectFrom("event_log").selectAll().orderBy("sequence", "desc").limit(limit).execute();
  }
}
