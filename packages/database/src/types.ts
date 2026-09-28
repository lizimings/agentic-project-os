import type { Generated, Kysely, Transaction } from "kysely";

export interface ProjectTable {
  id: string;
  name: string;
  description: string;
  vision: string;
  color: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MilestoneTable {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  target_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PlanTable {
  id: string;
  project_id: string;
  milestone_id: string;
  title: string;
  description: string;
  status: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TaskTable {
  id: string;
  project_id: string;
  milestone_id: string;
  plan_id: string;
  parent_task_id: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_type: string;
  assignee_id: string | null;
  due_at: string | null;
  estimate_minutes: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface IdeaTable {
  id: string;
  project_id: string | null;
  title: string;
  body: string;
  status: string;
  source_type: string;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntityLinkTable {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relation: string;
  label: string | null;
  created_at: string;
}

export interface ProposalTable {
  id: string;
  project_id: string | null;
  title: string;
  summary: string;
  kind: string;
  status: string;
  risk: string;
  evidence_json: string;
  changes_json: string;
  command_json: string | null;
  execution_status: string;
  execution_error: string | null;
  executed_at: string | null;
  created_by: string;
  created_at: string;
  decided_at: string | null;
}

export interface WorkspaceBindingTable {
  project_id: string;
  path: string;
  watch_enabled: number;
  status: string;
  branch: string | null;
  head: string | null;
  dirty_files: number;
  ahead: number;
  behind: number;
  last_scanned_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorktreeSnapshotTable {
  id: string;
  project_id: string;
  path: string;
  branch: string | null;
  head: string;
  is_current: number;
  is_bare: number;
  is_detached: number;
  locked_reason: string | null;
  prunable_reason: string | null;
  dirty_files: number;
  ahead: number;
  behind: number;
  changed_files_json: string;
  last_commit_id: string | null;
  scanned_at: string;
}

export interface GitCommitTable {
  id: string;
  project_id: string;
  worktree_id: string;
  hash: string;
  short_hash: string;
  subject: string;
  author: string;
  committed_at: string;
  branch: string | null;
  is_head: number;
  scanned_at: string;
}

export interface RemoteConnectionTable {
  id: string;
  provider: string;
  base_url: string;
  username: string;
  instance_version: string | null;
  status: string;
  encrypted_token: string;
  token_hint: string;
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRemoteBindingTable {
  project_id: string;
  connection_id: string;
  owner: string;
  repo: string;
  full_name: string;
  default_branch: string;
  html_url: string;
  clone_url: string;
  sync_scopes_json: string;
  sync_status: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  webhook_enabled: number;
  encrypted_webhook_secret: string | null;
  webhook_secret_hint: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteSyncItemTable {
  id: string;
  project_id: string;
  scope: string;
  external_id: string;
  title: string;
  state: string;
  url: string | null;
  remote_updated_at: string | null;
  payload_hash: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

export interface RemoteSyncJobTable {
  id: string;
  project_id: string;
  status: string;
  scopes_json: string;
  attempt: number;
  max_attempts: number;
  progress_current: number;
  progress_total: number;
  error: string | null;
  trigger: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface WebhookDeliveryTable {
  id: string;
  project_id: string;
  provider: string;
  delivery_id: string;
  event: string;
  signature_valid: number;
  payload_hash: string;
  status: string;
  error: string | null;
  sync_job_id: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface TimeBlockTable {
  id: string;
  project_id: string | null;
  task_id: string | null;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  kind: string;
  energy: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface FocusSessionTable {
  id: string;
  project_id: string | null;
  task_id: string | null;
  time_block_id: string | null;
  title: string;
  status: string;
  started_at: string;
  last_resumed_at: string | null;
  ended_at: string | null;
  accumulated_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface AttentionBudgetTable {
  project_id: string;
  week_start: string;
  planned_minutes: number;
  minimum_minutes: number;
  maximum_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizerRunTable {
  id: string;
  trigger_event_id: string;
  project_id: string;
  input_hash: string;
  status: string;
  proposal_ids_json: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CanvasDocumentTable {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  revision: number;
  viewport_json: string;
  created_at: string;
  updated_at: string;
}

export interface CanvasNodeTable {
  id: string;
  document_id: string;
  parent_id: string | null;
  node_type: string;
  kind: string;
  title: string;
  content: string;
  position_x: number;
  position_y: number;
  collapsed: number;
  tone: string;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  linked_entity_label: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface CanvasEdgeTable {
  id: string;
  document_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  relation: string;
  directed: number;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface CanvasNodeReferenceTable {
  node_id: string;
  document_id: string;
  position: number;
  entity_type: string;
  entity_id: string;
  entity_label: string;
}

export interface InboxItemTable {
  id: string;
  title: string;
  note: string;
  source: string;
  project_id: string | null;
  kind: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface EventLogTable {
  sequence: Generated<number>;
  id: string;
  type: string;
  actor_type: string;
  actor_id: string;
  entity_type: string;
  entity_id: string;
  project_id: string | null;
  correlation_id: string;
  occurred_at: string;
  payload_json: string;
}

export interface NotificationTable {
  id: string;
  type: string;
  project_id: string | null;
  title: string;
  body: string;
  severity: string;
  source_type: string;
  source_id: string;
  route: string;
  fingerprint: string;
  status: string;
  snoozed_until: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActorTable {
  id: string;
  name: string;
  kind: string;
  provider: string;
  model: string | null;
  status: string;
  capabilities_json: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiSettingsTable {
  id: string;
  provider: string;
  base_url: string;
  transcription_model: string;
  encrypted_api_key: string | null;
  api_key_hint: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectPolicyTable {
  project_id: string;
  agent_write_policy: string;
  relationship_capture_policy: string;
  auto_log_enabled: number;
  log_retention_days: number;
  created_at: string;
  updated_at: string;
}

export interface GlobalPreferencesTable {
  id: string;
  launch_at_login: number;
  minimize_to_tray: number;
  start_daemon_on_launch: number;
  theme: string;
  week_starts_on: string;
  compact_mode: number;
  created_at: string;
  updated_at: string;
}

export interface DatabaseSchema {
  projects: ProjectTable;
  milestones: MilestoneTable;
  plans: PlanTable;
  tasks: TaskTable;
  ideas: IdeaTable;
  entity_links: EntityLinkTable;
  proposals: ProposalTable;
  workspace_bindings: WorkspaceBindingTable;
  worktree_snapshots: WorktreeSnapshotTable;
  git_commits: GitCommitTable;
  remote_connections: RemoteConnectionTable;
  project_remote_bindings: ProjectRemoteBindingTable;
  remote_sync_items: RemoteSyncItemTable;
  remote_sync_jobs: RemoteSyncJobTable;
  webhook_deliveries: WebhookDeliveryTable;
  time_blocks: TimeBlockTable;
  focus_sessions: FocusSessionTable;
  attention_budgets: AttentionBudgetTable;
  organizer_runs: OrganizerRunTable;
  canvas_documents: CanvasDocumentTable;
  canvas_nodes: CanvasNodeTable;
  canvas_edges: CanvasEdgeTable;
  canvas_node_references: CanvasNodeReferenceTable;
  inbox_items: InboxItemTable;
  event_log: EventLogTable;
  notifications: NotificationTable;
  actors: ActorTable;
  ai_settings: AiSettingsTable;
  project_policies: ProjectPolicyTable;
  global_preferences: GlobalPreferencesTable;
}

export type PccDatabase = Kysely<DatabaseSchema>;
export type DatabaseExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
