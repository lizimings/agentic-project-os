import { sql, type Kysely } from "kysely";
import { Migrator, type Migration, type MigrationProvider } from "kysely/migration";
import type { DatabaseSchema } from "./types.js";

const initialMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("projects")
      .ifNotExists()
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("name", "text", (column) => column.notNull().unique())
      .addColumn("description", "text", (column) => column.notNull())
      .addColumn("color", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("inbox_items")
      .ifNotExists()
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("note", "text", (column) => column.notNull())
      .addColumn("source", "text", (column) => column.notNull())
      .addColumn("project_id", "text", (column) => column.references("projects.id").onDelete("set null"))
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addColumn("archived_at", "text")
      .execute();

    await db.schema
      .createIndex("inbox_items_active_created_idx")
      .ifNotExists()
      .on("inbox_items")
      .columns(["archived_at", "created_at"])
      .execute();

    await db.schema
      .createTable("event_log")
      .ifNotExists()
      .addColumn("sequence", "integer", (column) => column.primaryKey().autoIncrement())
      .addColumn("id", "text", (column) => column.notNull().unique())
      .addColumn("type", "text", (column) => column.notNull())
      .addColumn("actor_type", "text", (column) => column.notNull())
      .addColumn("actor_id", "text", (column) => column.notNull())
      .addColumn("entity_type", "text", (column) => column.notNull())
      .addColumn("entity_id", "text", (column) => column.notNull())
      .addColumn("correlation_id", "text", (column) => column.notNull())
      .addColumn("occurred_at", "text", (column) => column.notNull())
      .addColumn("payload_json", "text", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("event_log_entity_idx")
      .ifNotExists()
      .on("event_log")
      .columns(["entity_type", "entity_id", "sequence"])
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("event_log").ifExists().execute();
    await db.schema.dropTable("inbox_items").ifExists().execute();
    await db.schema.dropTable("projects").ifExists().execute();
  },
};

const coreEntitiesMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable("projects")
      .addColumn("vision", "text", (column) => column.notNull().defaultTo(""))
      .execute();

    await db.schema
      .createTable("milestones")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("description", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("target_date", "text")
      .addColumn("position", "integer", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("milestones_project_position_idx")
      .on("milestones")
      .columns(["project_id", "position"])
      .execute();

    await db.schema
      .createTable("plans")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("milestone_id", "text", (column) => column.notNull().references("milestones.id").onDelete("cascade"))
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("description", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("position", "integer", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("plans_milestone_position_idx")
      .on("plans")
      .columns(["milestone_id", "position"])
      .execute();

    await db.schema
      .createTable("tasks")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("milestone_id", "text", (column) => column.notNull().references("milestones.id").onDelete("cascade"))
      .addColumn("plan_id", "text", (column) => column.notNull().references("plans.id").onDelete("cascade"))
      .addColumn("parent_task_id", "text", (column) => column.references("tasks.id").onDelete("set null"))
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("description", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("priority", "text", (column) => column.notNull())
      .addColumn("assignee_type", "text", (column) => column.notNull())
      .addColumn("assignee_id", "text")
      .addColumn("due_at", "text")
      .addColumn("estimate_minutes", "integer")
      .addColumn("position", "integer", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("tasks_plan_position_idx")
      .on("tasks")
      .columns(["plan_id", "position"])
      .execute();

    await db.schema
      .createTable("ideas")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.references("projects.id").onDelete("set null"))
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("body", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("source_type", "text", (column) => column.notNull())
      .addColumn("source_id", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("ideas_project_status_updated_idx")
      .on("ideas")
      .columns(["project_id", "status", "updated_at"])
      .execute();

    await db.schema
      .createTable("entity_links")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("source_type", "text", (column) => column.notNull())
      .addColumn("source_id", "text", (column) => column.notNull())
      .addColumn("target_type", "text", (column) => column.notNull())
      .addColumn("target_id", "text", (column) => column.notNull())
      .addColumn("relation", "text", (column) => column.notNull())
      .addColumn("label", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addUniqueConstraint("entity_links_unique", ["source_type", "source_id", "target_type", "target_id", "relation"])
      .execute();

    await db.schema
      .createIndex("entity_links_source_idx")
      .on("entity_links")
      .columns(["source_type", "source_id"])
      .execute();

    await db.schema
      .createIndex("entity_links_target_idx")
      .on("entity_links")
      .columns(["target_type", "target_id"])
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("entity_links").ifExists().execute();
    await db.schema.dropTable("ideas").ifExists().execute();
    await db.schema.dropTable("tasks").ifExists().execute();
    await db.schema.dropTable("plans").ifExists().execute();
    await db.schema.dropTable("milestones").ifExists().execute();
    await db.schema.alterTable("projects").dropColumn("vision").execute();
  },
};

const proposalsMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("proposals")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.references("projects.id").onDelete("set null"))
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("summary", "text", (column) => column.notNull())
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("risk", "text", (column) => column.notNull())
      .addColumn("evidence_json", "text", (column) => column.notNull())
      .addColumn("changes_json", "text", (column) => column.notNull())
      .addColumn("created_by", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("decided_at", "text")
      .execute();

    await db.schema
      .createIndex("proposals_status_created_idx")
      .on("proposals")
      .columns(["status", "created_at"])
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("proposals").ifExists().execute();
  },
};

const workspaceMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("workspace_bindings")
      .addColumn("project_id", "text", (column) => column.primaryKey().references("projects.id").onDelete("cascade"))
      .addColumn("path", "text", (column) => column.notNull())
      .addColumn("watch_enabled", "integer", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("branch", "text")
      .addColumn("head", "text")
      .addColumn("dirty_files", "integer", (column) => column.notNull())
      .addColumn("ahead", "integer", (column) => column.notNull())
      .addColumn("behind", "integer", (column) => column.notNull())
      .addColumn("last_scanned_at", "text")
      .addColumn("last_error", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("worktree_snapshots")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("path", "text", (column) => column.notNull())
      .addColumn("branch", "text")
      .addColumn("head", "text", (column) => column.notNull())
      .addColumn("is_current", "integer", (column) => column.notNull())
      .addColumn("is_bare", "integer", (column) => column.notNull())
      .addColumn("is_detached", "integer", (column) => column.notNull())
      .addColumn("locked_reason", "text")
      .addColumn("prunable_reason", "text")
      .addColumn("scanned_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createIndex("worktree_project_path_idx").on("worktree_snapshots").columns(["project_id", "path"]).unique().execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("worktree_snapshots").ifExists().execute();
    await db.schema.dropTable("workspace_bindings").ifExists().execute();
  },
};

const remoteRepositoriesMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("remote_connections")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("provider", "text", (column) => column.notNull().unique())
      .addColumn("base_url", "text", (column) => column.notNull())
      .addColumn("username", "text", (column) => column.notNull())
      .addColumn("instance_version", "text")
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("encrypted_token", "text", (column) => column.notNull())
      .addColumn("token_hint", "text", (column) => column.notNull())
      .addColumn("last_validated_at", "text")
      .addColumn("last_error", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("project_remote_bindings")
      .addColumn("project_id", "text", (column) => column.primaryKey().references("projects.id").onDelete("cascade"))
      .addColumn("connection_id", "text", (column) => column.notNull().references("remote_connections.id").onDelete("cascade"))
      .addColumn("owner", "text", (column) => column.notNull())
      .addColumn("repo", "text", (column) => column.notNull())
      .addColumn("full_name", "text", (column) => column.notNull())
      .addColumn("default_branch", "text", (column) => column.notNull())
      .addColumn("html_url", "text", (column) => column.notNull())
      .addColumn("clone_url", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("project_remote_bindings").ifExists().execute();
    await db.schema.dropTable("remote_connections").ifExists().execute();
  },
};

const timeManagementMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("time_blocks")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.references("projects.id").onDelete("set null"))
      .addColumn("task_id", "text", (column) => column.references("tasks.id").onDelete("set null"))
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("start_at", "text", (column) => column.notNull())
      .addColumn("end_at", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("energy", "text", (column) => column.notNull())
      .addColumn("source", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createIndex("time_blocks_range_idx").on("time_blocks").columns(["start_at", "end_at"]).execute();
    await db.schema.createIndex("time_blocks_project_range_idx").on("time_blocks").columns(["project_id", "start_at"]).execute();

    await db.schema
      .createTable("focus_sessions")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.references("projects.id").onDelete("set null"))
      .addColumn("task_id", "text", (column) => column.references("tasks.id").onDelete("set null"))
      .addColumn("time_block_id", "text", (column) => column.references("time_blocks.id").onDelete("set null"))
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("started_at", "text", (column) => column.notNull())
      .addColumn("last_resumed_at", "text")
      .addColumn("ended_at", "text")
      .addColumn("accumulated_seconds", "integer", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createIndex("focus_sessions_status_updated_idx").on("focus_sessions").columns(["status", "updated_at"]).execute();

    await db.schema
      .createTable("attention_budgets")
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("week_start", "text", (column) => column.notNull())
      .addColumn("planned_minutes", "integer", (column) => column.notNull())
      .addColumn("minimum_minutes", "integer", (column) => column.notNull())
      .addColumn("maximum_minutes", "integer")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addPrimaryKeyConstraint("attention_budgets_pk", ["project_id", "week_start"])
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("attention_budgets").ifExists().execute();
    await db.schema.dropTable("focus_sessions").ifExists().execute();
    await db.schema.dropTable("time_blocks").ifExists().execute();
  },
};

const organizerRunsMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("organizer_runs")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("trigger_event_id", "text", (column) => column.notNull().unique())
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("input_hash", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("proposal_ids_json", "text", (column) => column.notNull())
      .addColumn("error", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("completed_at", "text")
      .execute();
    await db.schema.createIndex("organizer_runs_project_created_idx").on("organizer_runs").columns(["project_id", "created_at"]).execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("organizer_runs").ifExists().execute();
  },
};

const executableProposalsMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable("proposals").addColumn("command_json", "text").execute();
    await db.schema.alterTable("proposals").addColumn("execution_status", "text", (column) => column.notNull().defaultTo("not_applicable")).execute();
    await db.schema.alterTable("proposals").addColumn("execution_error", "text").execute();
    await db.schema.alterTable("proposals").addColumn("executed_at", "text").execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable("proposals").dropColumn("executed_at").execute();
    await db.schema.alterTable("proposals").dropColumn("execution_error").execute();
    await db.schema.alterTable("proposals").dropColumn("execution_status").execute();
    await db.schema.alterTable("proposals").dropColumn("command_json").execute();
  },
};

const canvasDocumentsMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("canvas_documents")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("revision", "integer", (column) => column.notNull())
      .addColumn("viewport_json", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addUniqueConstraint("canvas_document_project_kind_unique", ["project_id", "kind"])
      .execute();

    await db.schema
      .createTable("canvas_nodes")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("document_id", "text", (column) => column.notNull().references("canvas_documents.id").onDelete("cascade"))
      .addColumn("parent_id", "text")
      .addColumn("node_type", "text", (column) => column.notNull())
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("content", "text", (column) => column.notNull())
      .addColumn("position_x", "real", (column) => column.notNull())
      .addColumn("position_y", "real", (column) => column.notNull())
      .addColumn("collapsed", "integer", (column) => column.notNull())
      .addColumn("tone", "text", (column) => column.notNull())
      .addColumn("linked_entity_type", "text")
      .addColumn("linked_entity_id", "text")
      .addColumn("linked_entity_label", "text")
      .addColumn("metadata_json", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createIndex("canvas_nodes_document_idx").on("canvas_nodes").column("document_id").execute();

    await db.schema
      .createTable("canvas_edges")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("document_id", "text", (column) => column.notNull().references("canvas_documents.id").onDelete("cascade"))
      .addColumn("source_node_id", "text", (column) => column.notNull().references("canvas_nodes.id").onDelete("cascade"))
      .addColumn("target_node_id", "text", (column) => column.notNull().references("canvas_nodes.id").onDelete("cascade"))
      .addColumn("label", "text")
      .addColumn("relation", "text", (column) => column.notNull())
      .addColumn("directed", "integer", (column) => column.notNull())
      .addColumn("metadata_json", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createIndex("canvas_edges_document_idx").on("canvas_edges").column("document_id").execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("canvas_edges").ifExists().execute();
    await db.schema.dropTable("canvas_nodes").ifExists().execute();
    await db.schema.dropTable("canvas_documents").ifExists().execute();
  },
};

const canvasNodeReferencesMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("canvas_node_references")
      .addColumn("node_id", "text", (column) => column.notNull().references("canvas_nodes.id").onDelete("cascade"))
      .addColumn("document_id", "text", (column) => column.notNull().references("canvas_documents.id").onDelete("cascade"))
      .addColumn("position", "integer", (column) => column.notNull())
      .addColumn("entity_type", "text", (column) => column.notNull())
      .addColumn("entity_id", "text", (column) => column.notNull())
      .addColumn("entity_label", "text", (column) => column.notNull())
      .addPrimaryKeyConstraint("canvas_node_references_pk", ["node_id", "position"])
      .execute();
    await db.schema.createIndex("canvas_node_references_document_idx").on("canvas_node_references").column("document_id").execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("canvas_node_references").ifExists().execute();
  },
};

const migrateLegacyCanvasReferencesMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await sql`
      insert or ignore into canvas_node_references (node_id, document_id, position, entity_type, entity_id, entity_label)
      select id, document_id, 0, linked_entity_type, linked_entity_id, linked_entity_label
      from canvas_nodes
      where linked_entity_type is not null and linked_entity_id is not null and linked_entity_label is not null
    `.execute(db);
  },
  async down() {},
};

const scopedEventLogMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable("event_log").addColumn("project_id", "text").execute();
    await sql`update event_log set project_id = json_extract(payload_json, '$.projectId') where json_extract(payload_json, '$.projectId') is not null`.execute(db);
    await sql`update event_log set project_id = entity_id where project_id is null and entity_type in ('project', 'workspace', 'remote_repository')`.execute(db);
    await sql`update event_log set project_id = (select project_id from milestones where milestones.id = event_log.entity_id) where project_id is null and entity_type = 'milestone'`.execute(db);
    await sql`update event_log set project_id = (select project_id from plans where plans.id = event_log.entity_id) where project_id is null and entity_type = 'plan'`.execute(db);
    await sql`update event_log set project_id = (select project_id from tasks where tasks.id = event_log.entity_id) where project_id is null and entity_type = 'task'`.execute(db);
    await sql`update event_log set project_id = (select project_id from ideas where ideas.id = event_log.entity_id) where project_id is null and entity_type = 'idea'`.execute(db);
    await sql`update event_log set project_id = (select project_id from proposals where proposals.id = event_log.entity_id) where project_id is null and entity_type = 'proposal'`.execute(db);
    await sql`update event_log set project_id = (select project_id from inbox_items where inbox_items.id = event_log.entity_id) where project_id is null and entity_type = 'inbox_item'`.execute(db);
    await sql`update event_log set project_id = (select project_id from canvas_documents where canvas_documents.id = event_log.entity_id) where project_id is null and entity_type = 'canvas_document'`.execute(db);
    await sql`update event_log set project_id = (select canvas_documents.project_id from canvas_nodes join canvas_documents on canvas_documents.id = canvas_nodes.document_id where canvas_nodes.id = event_log.entity_id) where project_id is null and entity_type = 'canvas_node'`.execute(db);
    await sql`update event_log set project_id = (select project_id from time_blocks where time_blocks.id = event_log.entity_id) where project_id is null and entity_type = 'time_block'`.execute(db);
    await sql`update event_log set project_id = (select project_id from focus_sessions where focus_sessions.id = event_log.entity_id) where project_id is null and entity_type = 'focus_session'`.execute(db);
    await sql`update event_log set project_id = (select project_id from worktree_snapshots where worktree_snapshots.id = event_log.entity_id) where project_id is null and entity_type = 'worktree'`.execute(db);
    await db.schema.createIndex("event_log_project_sequence_idx").on("event_log").columns(["project_id", "sequence"]).execute();
    await db.schema.createIndex("event_log_occurred_idx").on("event_log").column("occurred_at").execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex("event_log_occurred_idx").ifExists().execute();
    await db.schema.dropIndex("event_log_project_sequence_idx").ifExists().execute();
    await db.schema.alterTable("event_log").dropColumn("project_id").execute();
  },
};

const globalSearchMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await sql`
      create virtual table global_search_index using fts5(
        entity_type unindexed,
        entity_id unindexed,
        project_id unindexed,
        title,
        context,
        route unindexed,
        updated_at unindexed,
        tokenize = 'unicode61 remove_diacritics 2',
        prefix = '2 3 4'
      )
    `.execute(db);
  },
  async down(db: Kysely<unknown>) {
    await sql`drop table if exists global_search_index`.execute(db);
  },
};

const notificationsMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.createTable("notifications")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("type", "text", (column) => column.notNull())
      .addColumn("project_id", "text", (column) => column.references("projects.id").onDelete("set null"))
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("body", "text", (column) => column.notNull())
      .addColumn("severity", "text", (column) => column.notNull())
      .addColumn("source_type", "text", (column) => column.notNull())
      .addColumn("source_id", "text", (column) => column.notNull())
      .addColumn("route", "text", (column) => column.notNull())
      .addColumn("fingerprint", "text", (column) => column.notNull().unique())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("snoozed_until", "text")
      .addColumn("resolved_at", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createIndex("notifications_active_status_idx").on("notifications").columns(["resolved_at", "status", "updated_at"]).execute();
    await db.schema.createIndex("notifications_project_idx").on("notifications").columns(["project_id", "resolved_at"]).execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("notifications").ifExists().execute();
  },
};

const actorRegistryMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.createTable("actors")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("provider", "text", (column) => column.notNull())
      .addColumn("model", "text")
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("capabilities_json", "text", (column) => column.notNull())
      .addColumn("last_seen_at", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createIndex("actors_kind_status_idx").on("actors").columns(["kind", "status"]).execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("actors").ifExists().execute();
  },
};

const aiSettingsMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.createTable("ai_settings")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("provider", "text", (column) => column.notNull())
      .addColumn("base_url", "text", (column) => column.notNull())
      .addColumn("transcription_model", "text", (column) => column.notNull())
      .addColumn("encrypted_api_key", "text")
      .addColumn("api_key_hint", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("ai_settings").ifExists().execute();
  },
};

const gitEvidenceMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable("worktree_snapshots").addColumn("dirty_files", "integer", (column) => column.notNull().defaultTo(0)).execute();
    await db.schema.alterTable("worktree_snapshots").addColumn("ahead", "integer", (column) => column.notNull().defaultTo(0)).execute();
    await db.schema.alterTable("worktree_snapshots").addColumn("behind", "integer", (column) => column.notNull().defaultTo(0)).execute();
    await db.schema.alterTable("worktree_snapshots").addColumn("changed_files_json", "text", (column) => column.notNull().defaultTo("[]")).execute();
    await db.schema.alterTable("worktree_snapshots").addColumn("last_commit_id", "text").execute();
    await db.schema.createTable("git_commits")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("worktree_id", "text", (column) => column.notNull())
      .addColumn("hash", "text", (column) => column.notNull())
      .addColumn("short_hash", "text", (column) => column.notNull())
      .addColumn("subject", "text", (column) => column.notNull())
      .addColumn("author", "text", (column) => column.notNull())
      .addColumn("committed_at", "text", (column) => column.notNull())
      .addColumn("branch", "text")
      .addColumn("is_head", "integer", (column) => column.notNull())
      .addColumn("scanned_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createIndex("git_commits_project_time_idx").on("git_commits").columns(["project_id", "committed_at"]).execute();
    await db.schema.createIndex("git_commits_worktree_time_idx").on("git_commits").columns(["worktree_id", "committed_at"]).execute();
    await db.schema.createIndex("git_commits_hash_idx").on("git_commits").columns(["project_id", "hash"]).execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("git_commits").ifExists().execute();
    await db.schema.alterTable("worktree_snapshots").dropColumn("last_commit_id").execute();
    await db.schema.alterTable("worktree_snapshots").dropColumn("changed_files_json").execute();
    await db.schema.alterTable("worktree_snapshots").dropColumn("behind").execute();
    await db.schema.alterTable("worktree_snapshots").dropColumn("ahead").execute();
    await db.schema.alterTable("worktree_snapshots").dropColumn("dirty_files").execute();
  },
};

const remoteSyncMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable("project_remote_bindings").addColumn("sync_scopes_json", "text", (column) => column.notNull().defaultTo('["commits","branches"]')).execute();
    await db.schema.alterTable("project_remote_bindings").addColumn("sync_status", "text", (column) => column.notNull().defaultTo("idle")).execute();
    await db.schema.alterTable("project_remote_bindings").addColumn("last_synced_at", "text").execute();
    await db.schema.alterTable("project_remote_bindings").addColumn("last_sync_error", "text").execute();
    await db.schema.alterTable("project_remote_bindings").addColumn("webhook_enabled", "integer", (column) => column.notNull().defaultTo(0)).execute();
    await db.schema.alterTable("project_remote_bindings").addColumn("encrypted_webhook_secret", "text").execute();
    await db.schema.alterTable("project_remote_bindings").addColumn("webhook_secret_hint", "text").execute();
    await db.schema.createTable("remote_sync_items")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("scope", "text", (column) => column.notNull())
      .addColumn("external_id", "text", (column) => column.notNull())
      .addColumn("title", "text", (column) => column.notNull())
      .addColumn("state", "text", (column) => column.notNull())
      .addColumn("url", "text")
      .addColumn("remote_updated_at", "text")
      .addColumn("payload_hash", "text", (column) => column.notNull())
      .addColumn("payload_json", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createIndex("remote_sync_items_identity_idx").on("remote_sync_items").columns(["project_id", "scope", "external_id"]).unique().execute();
    await db.schema.createIndex("remote_sync_items_project_scope_idx").on("remote_sync_items").columns(["project_id", "scope", "updated_at"]).execute();
    await db.schema.createTable("remote_sync_jobs")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("scopes_json", "text", (column) => column.notNull())
      .addColumn("attempt", "integer", (column) => column.notNull())
      .addColumn("max_attempts", "integer", (column) => column.notNull())
      .addColumn("progress_current", "integer", (column) => column.notNull())
      .addColumn("progress_total", "integer", (column) => column.notNull())
      .addColumn("error", "text")
      .addColumn("trigger", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("started_at", "text")
      .addColumn("completed_at", "text")
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createIndex("remote_sync_jobs_project_time_idx").on("remote_sync_jobs").columns(["project_id", "created_at"]).execute();
    await db.schema.createTable("webhook_deliveries")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) => column.notNull().references("projects.id").onDelete("cascade"))
      .addColumn("provider", "text", (column) => column.notNull())
      .addColumn("delivery_id", "text", (column) => column.notNull())
      .addColumn("event", "text", (column) => column.notNull())
      .addColumn("signature_valid", "integer", (column) => column.notNull())
      .addColumn("payload_hash", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("error", "text")
      .addColumn("sync_job_id", "text")
      .addColumn("received_at", "text", (column) => column.notNull())
      .addColumn("processed_at", "text")
      .execute();
    await db.schema.createIndex("webhook_delivery_replay_idx").on("webhook_deliveries").columns(["project_id", "provider", "delivery_id"]).unique().execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("webhook_deliveries").ifExists().execute();
    await db.schema.dropTable("remote_sync_jobs").ifExists().execute();
    await db.schema.dropTable("remote_sync_items").ifExists().execute();
    await db.schema.alterTable("project_remote_bindings").dropColumn("webhook_secret_hint").execute();
    await db.schema.alterTable("project_remote_bindings").dropColumn("encrypted_webhook_secret").execute();
    await db.schema.alterTable("project_remote_bindings").dropColumn("webhook_enabled").execute();
    await db.schema.alterTable("project_remote_bindings").dropColumn("last_sync_error").execute();
    await db.schema.alterTable("project_remote_bindings").dropColumn("last_synced_at").execute();
    await db.schema.alterTable("project_remote_bindings").dropColumn("sync_status").execute();
    await db.schema.alterTable("project_remote_bindings").dropColumn("sync_scopes_json").execute();
  },
};

const settingsMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await db.schema.createTable("project_policies")
      .addColumn("project_id", "text", (column) => column.primaryKey().references("projects.id").onDelete("cascade"))
      .addColumn("agent_write_policy", "text", (column) => column.notNull().defaultTo("proposal_only"))
      .addColumn("relationship_capture_policy", "text", (column) => column.notNull().defaultTo("mentions"))
      .addColumn("auto_log_enabled", "integer", (column) => column.notNull().defaultTo(1))
      .addColumn("log_retention_days", "integer", (column) => column.notNull().defaultTo(365))
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
    await db.schema.createTable("global_preferences")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("launch_at_login", "integer", (column) => column.notNull().defaultTo(0))
      .addColumn("minimize_to_tray", "integer", (column) => column.notNull().defaultTo(1))
      .addColumn("start_daemon_on_launch", "integer", (column) => column.notNull().defaultTo(1))
      .addColumn("theme", "text", (column) => column.notNull().defaultTo("system"))
      .addColumn("week_starts_on", "text", (column) => column.notNull().defaultTo("monday"))
      .addColumn("compact_mode", "integer", (column) => column.notNull().defaultTo(0))
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("global_preferences").ifExists().execute();
    await db.schema.dropTable("project_policies").ifExists().execute();
  },
};

export class PccMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return { "001_initial": initialMigration, "002_core_entities": coreEntitiesMigration, "003_proposals": proposalsMigration, "004_workspace_git": workspaceMigration, "005_remote_repositories": remoteRepositoriesMigration, "006_time_management": timeManagementMigration, "007_organizer_runs": organizerRunsMigration, "008_executable_proposals": executableProposalsMigration, "009_canvas_documents": canvasDocumentsMigration, "010_canvas_node_references": canvasNodeReferencesMigration, "011_migrate_legacy_canvas_references": migrateLegacyCanvasReferencesMigration, "012_scoped_event_log": scopedEventLogMigration, "013_global_search": globalSearchMigration, "014_notifications": notificationsMigration, "015_actor_registry": actorRegistryMigration, "016_ai_settings": aiSettingsMigration, "017_git_evidence": gitEvidenceMigration, "018_remote_sync": remoteSyncMigration, "019_settings": settingsMigration };
  }
}

export async function migrateDatabase(db: Kysely<DatabaseSchema>) {
  const migrator = new Migrator({ db, provider: new PccMigrationProvider() });
  const result = await migrator.migrateToLatest();
  const failed = result.results?.find((item) => item.status === "Error");
  if (failed || result.error) {
    throw result.error ?? new Error(`数据库迁移失败：${failed?.migrationName ?? "unknown"}`);
  }
  return result;
}
