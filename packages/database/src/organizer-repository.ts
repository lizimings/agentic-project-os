import type { DatabaseExecutor, PccDatabase } from "./types.js";

export class OrganizerRepository {
  constructor(private readonly db: PccDatabase) {}
  get database() { return this.db; }

  async beginRun(input: { id: string; triggerEventId: string; projectId: string; inputHash: string }, executor: DatabaseExecutor = this.db) {
    const now = new Date().toISOString();
    const result = await executor.insertInto("organizer_runs").values({
      id: input.id,
      trigger_event_id: input.triggerEventId,
      project_id: input.projectId,
      input_hash: input.inputHash,
      status: "running",
      proposal_ids_json: "[]",
      error: null,
      created_at: now,
      completed_at: null,
    }).onConflict((conflict) => conflict.column("trigger_event_id").doNothing()).executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows) > 0;
  }

  async completeRun(id: string, proposalIds: string[], executor: DatabaseExecutor = this.db) {
    await executor.updateTable("organizer_runs").set({ status: "completed", proposal_ids_json: JSON.stringify(proposalIds), completed_at: new Date().toISOString(), error: null }).where("id", "=", id).execute();
  }

  async failRun(id: string, error: string, executor: DatabaseExecutor = this.db) {
    await executor.updateTable("organizer_runs").set({ status: "failed", error: error.slice(0, 2_000), completed_at: new Date().toISOString() }).where("id", "=", id).execute();
  }

  async recent(projectId?: string, limit = 20, executor: DatabaseExecutor = this.db) {
    let query = executor.selectFrom("organizer_runs").selectAll();
    if (projectId) query = query.where("project_id", "=", projectId);
    return query.orderBy("created_at", "desc").limit(limit).execute();
  }
}
