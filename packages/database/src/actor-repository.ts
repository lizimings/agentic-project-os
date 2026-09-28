import type { Actor, CreateActorInput, UpdateActorInput } from "@pcc/contracts";
import type { DatabaseExecutor, PccDatabase } from "./types.js";

function fromRow(row: {
  id: string; name: string; kind: string; provider: string; model: string | null; status: string;
  capabilities_json: string; last_seen_at: string | null; created_at: string; updated_at: string;
}): Actor {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as Actor["kind"],
    provider: row.provider,
    model: row.model,
    status: row.status as Actor["status"],
    capabilities: JSON.parse(row.capabilities_json) as string[],
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ActorRepository {
  constructor(private readonly db: PccDatabase) {}
  get database() { return this.db; }

  async list(kind?: Actor["kind"], executor: DatabaseExecutor = this.db) {
    let query = executor.selectFrom("actors").selectAll();
    if (kind) query = query.where("kind", "=", kind);
    return (await query.orderBy("kind", "asc").orderBy("name", "asc").execute()).map(fromRow);
  }

  async get(id: string, executor: DatabaseExecutor = this.db) {
    const row = await executor.selectFrom("actors").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? fromRow(row) : undefined;
  }

  async create(id: string, input: CreateActorInput, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    await executor.insertInto("actors").values({ id, name: input.name, kind: input.kind, provider: input.provider, model: input.model, status: input.status, capabilities_json: JSON.stringify(input.capabilities), last_seen_at: null, created_at: now, updated_at: now }).execute();
    return this.get(id, executor);
  }

  async update(id: string, input: UpdateActorInput, executor: DatabaseExecutor = this.db) {
    const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) update.name = input.name;
    if (input.provider !== undefined) update.provider = input.provider;
    if (input.model !== undefined) update.model = input.model;
    if (input.status !== undefined) update.status = input.status;
    if (input.capabilities !== undefined) update.capabilities_json = JSON.stringify(input.capabilities);
    if (input.lastSeenAt !== undefined) update.last_seen_at = input.lastSeenAt;
    await executor.updateTable("actors").set(update).where("id", "=", id).execute();
    return this.get(id, executor);
  }
}
