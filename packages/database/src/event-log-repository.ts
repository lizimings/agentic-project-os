import type { EventEnvelope, ProjectEventLogItem, ProjectEventLogQuery, ProjectEventLogResponse } from "@pcc/contracts";
import type { DatabaseExecutor, PccDatabase } from "./types.js";

export async function resolveEventProjectId(event: EventEnvelope, executor: DatabaseExecutor): Promise<string | null> {
  if (typeof event.payload.projectId === "string" && event.payload.projectId) return event.payload.projectId;
  if (["project", "workspace", "remote_repository"].includes(event.entityType)) return event.entityId;
  if (event.entityType === "attention_budget") return event.entityId.split(":")[0] || null;
  const lookup = async (table: "milestones" | "plans" | "tasks" | "ideas" | "proposals" | "inbox_items" | "canvas_documents" | "time_blocks" | "focus_sessions" | "worktree_snapshots") => {
    const row = await executor.selectFrom(table).select("project_id").where("id", "=", event.entityId).executeTakeFirst();
    return row?.project_id ?? null;
  };
  if (event.entityType === "milestone") return lookup("milestones");
  if (event.entityType === "plan") return lookup("plans");
  if (event.entityType === "task") return lookup("tasks");
  if (event.entityType === "idea") return lookup("ideas");
  if (event.entityType === "proposal") return lookup("proposals");
  if (event.entityType === "inbox_item") return lookup("inbox_items");
  if (event.entityType === "canvas_document") return lookup("canvas_documents");
  if (event.entityType === "time_block") return lookup("time_blocks");
  if (event.entityType === "focus_session") return lookup("focus_sessions");
  if (event.entityType === "worktree") return lookup("worktree_snapshots");
  if (event.entityType === "canvas_node") {
    const row = await executor.selectFrom("canvas_nodes")
      .innerJoin("canvas_documents", "canvas_documents.id", "canvas_nodes.document_id")
      .select("canvas_documents.project_id")
      .where("canvas_nodes.id", "=", event.entityId)
      .executeTakeFirst();
    return row?.project_id ?? null;
  }
  return null;
}

function fromRow(row: {
  sequence: number; id: string; type: string; actor_type: string; actor_id: string; entity_type: string;
  entity_id: string; project_id: string | null; correlation_id: string; occurred_at: string; payload_json: string;
}): ProjectEventLogItem {
  return {
    sequence: row.sequence,
    id: row.id,
    type: row.type,
    actorType: row.actor_type as ProjectEventLogItem["actorType"],
    actorId: row.actor_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    projectId: row.project_id,
    correlationId: row.correlation_id,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  };
}

export class EventLogRepository {
  constructor(private readonly db: PccDatabase) {}

  async append(event: EventEnvelope, executor: DatabaseExecutor = this.db) {
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

  async list(input: ProjectEventLogQuery): Promise<ProjectEventLogResponse> {
    let query = this.db.selectFrom("event_log").selectAll();
    let count = this.db.selectFrom("event_log").select(({ fn }) => fn.countAll<number>().as("count"));
    if (input.projectId) { query = query.where("project_id", "=", input.projectId); count = count.where("project_id", "=", input.projectId); }
    if (input.actorType) { query = query.where("actor_type", "=", input.actorType); count = count.where("actor_type", "=", input.actorType); }
    if (input.entityType) { query = query.where("entity_type", "=", input.entityType); count = count.where("entity_type", "=", input.entityType); }
    if (input.from) { query = query.where("occurred_at", ">=", input.from); count = count.where("occurred_at", ">=", input.from); }
    if (input.to) { query = query.where("occurred_at", "<", input.to); count = count.where("occurred_at", "<", input.to); }
    if (input.search) {
      const pattern = `%${input.search}%`;
      query = query.where((expression) => expression.or([expression("id", "like", pattern), expression("type", "like", pattern), expression("actor_id", "like", pattern), expression("entity_type", "like", pattern), expression("entity_id", "like", pattern), expression("payload_json", "like", pattern)]));
      count = count.where((expression) => expression.or([expression("id", "like", pattern), expression("type", "like", pattern), expression("actor_id", "like", pattern), expression("entity_type", "like", pattern), expression("entity_id", "like", pattern), expression("payload_json", "like", pattern)]));
    }
    if (input.beforeSequence) query = query.where("sequence", "<", input.beforeSequence);
    const [rows, totalRow] = await Promise.all([
      query.orderBy("sequence", "desc").limit(input.limit).execute(),
      count.executeTakeFirst(),
    ]);
    return {
      items: rows.map(fromRow),
      total: Number(totalRow?.count ?? 0),
      nextBeforeSequence: rows.length === input.limit ? rows.at(-1)?.sequence ?? null : null,
    };
  }
}
