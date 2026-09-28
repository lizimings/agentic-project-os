import type { Notification, NotificationQuery } from "@pcc/contracts";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { DatabaseExecutor, PccDatabase } from "./types.js";

type DerivedNotification = {
  type: Notification["type"];
  projectId: string | null;
  title: string;
  body: string;
  severity: Notification["severity"];
  sourceType: string;
  sourceId: string;
  route: string;
  fingerprint: string;
};

function fromRow(row: {
  id: string; type: string; project_id: string | null; title: string; body: string; severity: string;
  source_type: string; source_id: string; route: string; fingerprint: string; status: string;
  snoozed_until: string | null; created_at: string; updated_at: string;
}): Notification {
  return {
    id: row.id,
    type: row.type as Notification["type"],
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    severity: row.severity as Notification["severity"],
    sourceType: row.source_type,
    sourceId: row.source_id,
    route: row.route,
    fingerprint: row.fingerprint,
    status: row.status as Notification["status"],
    snoozedUntil: row.snoozed_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class NotificationRepository {
  constructor(private readonly db: PccDatabase) {}
  get database() { return this.db; }

  async upsertDerived(input: DerivedNotification, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    const existing = await executor.selectFrom("notifications").selectAll().where("fingerprint", "=", input.fingerprint).executeTakeFirst();
    if (!existing) {
      await executor.insertInto("notifications").values({
        id: randomUUID(), type: input.type, project_id: input.projectId, title: input.title, body: input.body,
        severity: input.severity, source_type: input.sourceType, source_id: input.sourceId, route: input.route,
        fingerprint: input.fingerprint, status: "unread", snoozed_until: null, resolved_at: null,
        created_at: now, updated_at: now,
      }).execute();
    } else {
      await executor.updateTable("notifications").set({
        type: input.type, project_id: input.projectId, title: input.title, body: input.body,
        severity: input.severity, source_type: input.sourceType, source_id: input.sourceId, route: input.route,
        status: existing.resolved_at ? "unread" : existing.status,
        snoozed_until: existing.resolved_at ? null : existing.snoozed_until,
        resolved_at: null, updated_at: now,
      }).where("id", "=", existing.id).execute();
    }
  }

  async reactivateExpired(now = new Date().toISOString(), executor: DatabaseExecutor = this.db) {
    await executor.updateTable("notifications").set({ status: "unread", snoozed_until: null, updated_at: now })
      .where("resolved_at", "is", null).where("status", "=", "snoozed").where("snoozed_until", "<=", now).execute();
  }

  async resolveMissing(prefixes: string[], activeFingerprints: Set<string>, executor: DatabaseExecutor = this.db) {
    if (!prefixes.length) return;
    const rows = await executor.selectFrom("notifications").select(["id", "fingerprint"]).where("resolved_at", "is", null).execute();
    const now = new Date().toISOString();
    const ids = rows.filter((row) => prefixes.some((prefix) => row.fingerprint.startsWith(prefix)) && !activeFingerprints.has(row.fingerprint)).map((row) => row.id);
    if (ids.length) await executor.updateTable("notifications").set({ resolved_at: now, updated_at: now }).where("id", "in", ids).execute();
  }

  async get(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("notifications").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? fromRow(row) : undefined;
  }

  async list(input: NotificationQuery) {
    let selection = this.db.selectFrom("notifications").selectAll().where("resolved_at", "is", null);
    let count = this.db.selectFrom("notifications").select(({ fn }) => fn.countAll<number>().as("count")).where("resolved_at", "is", null);
    if (input.status !== "all") { selection = selection.where("status", "=", input.status); count = count.where("status", "=", input.status); }
    if (!input.includeSnoozed && input.status === "all") { selection = selection.where("status", "!=", "snoozed"); count = count.where("status", "!=", "snoozed"); }
    if (input.projectId) { selection = selection.where("project_id", "=", input.projectId); count = count.where("project_id", "=", input.projectId); }
    const [rows, countRow, unreadRow] = await Promise.all([
      selection.orderBy(sql`case severity when 'critical' then 0 when 'warning' then 1 else 2 end`).orderBy(sql`case status when 'unread' then 0 else 1 end`).orderBy("updated_at", "desc").limit(input.limit).execute(),
      count.executeTakeFirst(),
      this.db.selectFrom("notifications").select(({ fn }) => fn.countAll<number>().as("count")).where("resolved_at", "is", null).where("status", "=", "unread").executeTakeFirst(),
    ]);
    return { items: rows.map(fromRow), total: Number(countRow?.count ?? 0), unread: Number(unreadRow?.count ?? 0), generatedAt: new Date().toISOString() };
  }

  async updateStatus(id: string, status: Notification["status"], snoozedUntil: string | null, executor: DatabaseExecutor = this.db) {
    await executor.updateTable("notifications").set({ status, snoozed_until: snoozedUntil, updated_at: new Date().toISOString() }).where("id", "=", id).where("resolved_at", "is", null).execute();
    return this.get(id, executor);
  }

  async readAll(executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    const result = await executor.updateTable("notifications").set({ status: "read", snoozed_until: null, updated_at: now }).where("resolved_at", "is", null).where("status", "=", "unread").executeTakeFirst();
    return Number(result.numUpdatedRows);
  }
}
