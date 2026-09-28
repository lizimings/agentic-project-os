import type { GlobalSearchEntityType } from "@pcc/contracts";
import { sql } from "kysely";
import type { PccDatabase } from "./types.js";

export interface SearchIndexRow {
  entity_type: GlobalSearchEntityType;
  entity_id: string;
  project_id: string | null;
  title: string;
  context: string;
  route: string;
  updated_at: string;
  rank: number | null;
}

export class SearchRepository {
  private indexedSequence: number | null = null;
  private indexedAt: string | null = null;

  constructor(private readonly db: PccDatabase) {}

  private async currentSequence() {
    const result = await sql<{ sequence: number }>`select coalesce(max(sequence), 0) as sequence from event_log`.execute(this.db);
    return Number(result.rows[0]?.sequence ?? 0);
  }

  async rebuild(force = false) {
    const sequence = await this.currentSequence();
    if (!force && this.indexedSequence === sequence && this.indexedAt) return this.indexedAt;
    await this.db.transaction().execute(async (transaction) => {
      await sql`delete from global_search_index`.execute(transaction);
      await sql`
        insert into global_search_index (entity_type, entity_id, project_id, title, context, route, updated_at)
        select 'project', id, id, name, description || char(10) || vision || char(10) || status, '/projects/' || id || '/overview', updated_at from projects
        union all
        select 'milestone', id, project_id, title, description || char(10) || status || char(10) || coalesce(target_date, ''), '/projects/' || project_id || '/milestones?focus=' || id, updated_at from milestones
        union all
        select 'plan', id, project_id, title, description || char(10) || status, '/projects/' || project_id || '/milestones?focus=' || id, updated_at from plans
        union all
        select 'task', id, project_id, title, description || char(10) || status || char(10) || priority || char(10) || coalesce(assignee_id, ''), '/projects/' || project_id || '/tasks?focus=' || id, updated_at from tasks
        union all
        select 'idea', id, project_id, title, body || char(10) || status, case when project_id is null then '/inbox?focus=' || id else '/projects/' || project_id || '/ideas?focus=' || id end, updated_at from ideas
        union all
        select 'inbox_item', id, project_id, title, note || char(10) || source || char(10) || kind, '/inbox?focus=' || id, updated_at from inbox_items where archived_at is null
        union all
        select 'worktree', id, project_id, coalesce(branch, path), path || char(10) || head || char(10) || coalesce(locked_reason, '') || char(10) || coalesce(prunable_reason, ''), '/projects/' || project_id || '/worktrees?focus=' || id, scanned_at from worktree_snapshots
        union all
        select 'canvas_node', canvas_nodes.id, canvas_documents.project_id, canvas_nodes.title, canvas_nodes.content || char(10) || canvas_nodes.kind, '/projects/' || canvas_documents.project_id || '/' || canvas_documents.kind || '?focus=' || canvas_nodes.id, canvas_nodes.updated_at from canvas_nodes join canvas_documents on canvas_documents.id = canvas_nodes.document_id
        union all
        select 'proposal', id, project_id, title, summary || char(10) || kind || char(10) || status || char(10) || risk, '/decisions?focus=' || id, coalesce(decided_at, created_at) from proposals
        union all
        select 'event_log', id, project_id, type || ' · ' || entity_type, actor_type || ':' || actor_id || char(10) || entity_id || char(10) || payload_json, case when project_id is null then '/today?focus=' || id else '/projects/' || project_id || '/logs?focus=' || id end, occurred_at from event_log
        union all
        select 'remote_repository', project_id, project_id, full_name, html_url || char(10) || clone_url || char(10) || default_branch, '/projects/' || project_id || '/settings?focus=remote', updated_at from project_remote_bindings
        union all
        select 'time_block', id, project_id, title, status || char(10) || kind || char(10) || energy || char(10) || start_at || char(10) || end_at, '/time?focus=' || id, updated_at from time_blocks
        union all
        select 'focus_session', id, project_id, title, status || char(10) || started_at || char(10) || coalesce(ended_at, ''), '/today?focus=' || id, updated_at from focus_sessions
        union all
        select 'actor', id, null, name, kind || char(10) || provider || char(10) || coalesce(model, '') || char(10) || capabilities_json, '/today?focus=actor-' || id, updated_at from actors
        union all
        select 'commit', id, project_id, short_hash || ' · ' || subject, hash || char(10) || author || char(10) || coalesce(branch, ''), '/projects/' || project_id || '/worktrees?focus=' || worktree_id, committed_at from git_commits
      `.execute(transaction);
    });
    this.indexedSequence = sequence;
    this.indexedAt = new Date().toISOString();
    return this.indexedAt;
  }

  async search(query: string, options: { projectId?: string; types?: GlobalSearchEntityType[]; limit: number }) {
    const indexedAt = await this.rebuild();
    const terms = query.trim().split(/\s+/u).filter(Boolean).map((term) => `"${term.replaceAll('"', '""')}"*`);
    const match = terms.join(" AND ");
    const projectFilter = options.projectId ? sql`and project_id = ${options.projectId}` : sql``;
    const typeFilter = options.types?.length ? sql`and entity_type in (${sql.join(options.types)})` : sql``;
    const result = await sql<SearchIndexRow>`
      with ranked as (
        select rowid, bm25(global_search_index, 10.0, 2.0) as rank
        from global_search_index
        where global_search_index match ${match}
      ), candidates as (
        select index_data.entity_type, index_data.entity_id, nullif(index_data.project_id, '') as project_id,
               index_data.title, index_data.context, index_data.route, index_data.updated_at, ranked.rank
        from global_search_index as index_data
        join ranked on ranked.rowid = index_data.rowid
        where 1 = 1 ${projectFilter} ${typeFilter}
        union all
        select index_data.entity_type, index_data.entity_id, nullif(index_data.project_id, '') as project_id,
               index_data.title, index_data.context, index_data.route, index_data.updated_at, null as rank
        from global_search_index as index_data
        left join ranked on ranked.rowid = index_data.rowid
        where ranked.rowid is null
          and instr(lower(index_data.title || char(10) || index_data.context), lower(${query.trim()})) > 0
          ${projectFilter} ${typeFilter}
      )
      select * from candidates
      order by case when lower(title) = lower(${query.trim()}) then 0 when lower(title) like lower(${`${query.trim()}%`}) then 1 when rank is not null then 2 else 3 end,
               rank asc,
               updated_at desc
      limit ${Math.min(options.limit * 5, 250)}
    `.execute(this.db);
    return { rows: result.rows, indexedAt };
  }
}
