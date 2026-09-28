import type { GlobalPreferences, ProjectPolicy, UpdateGlobalPreferencesInput, UpdateProjectPolicyInput } from "@pcc/contracts";
import type { DatabaseExecutor, PccDatabase } from "./types.js";

const projectDefaults = {
  agentWritePolicy: "proposal_only" as const,
  relationshipCapturePolicy: "mentions" as const,
  autoLogEnabled: true,
  logRetentionDays: 365,
};

const globalDefaults = {
  launchAtLogin: false,
  minimizeToTray: true,
  startDaemonOnLaunch: true,
  theme: "system" as const,
  weekStartsOn: "monday" as const,
  compactMode: false,
};

export class SettingsRepository {
  constructor(private readonly db: PccDatabase) {}

  get database() { return this.db; }

  async getProjectPolicy(projectId: string, executor: DatabaseExecutor = this.db): Promise<ProjectPolicy> {
    const row = await executor.selectFrom("project_policies").selectAll().where("project_id", "=", projectId).executeTakeFirst();
    if (!row) {
      const now = new Date().toISOString();
      return { projectId, ...projectDefaults, createdAt: now, updatedAt: now };
    }
    return {
      projectId: row.project_id,
      agentWritePolicy: row.agent_write_policy as ProjectPolicy["agentWritePolicy"],
      relationshipCapturePolicy: row.relationship_capture_policy as ProjectPolicy["relationshipCapturePolicy"],
      autoLogEnabled: Boolean(row.auto_log_enabled),
      logRetentionDays: row.log_retention_days,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateProjectPolicy(projectId: string, input: UpdateProjectPolicyInput, now: string, executor: DatabaseExecutor = this.db) {
    const current = await this.getProjectPolicy(projectId, executor);
    const next: ProjectPolicy = {
      ...current,
      agentWritePolicy: input.agentWritePolicy ?? current.agentWritePolicy,
      relationshipCapturePolicy: input.relationshipCapturePolicy ?? current.relationshipCapturePolicy,
      autoLogEnabled: input.autoLogEnabled ?? current.autoLogEnabled,
      logRetentionDays: input.logRetentionDays ?? current.logRetentionDays,
      updatedAt: now,
    };
    await executor.insertInto("project_policies").values({
      project_id: projectId,
      agent_write_policy: next.agentWritePolicy,
      relationship_capture_policy: next.relationshipCapturePolicy,
      auto_log_enabled: next.autoLogEnabled ? 1 : 0,
      log_retention_days: next.logRetentionDays,
      created_at: current.createdAt,
      updated_at: now,
    }).onConflict((conflict) => conflict.column("project_id").doUpdateSet({
      agent_write_policy: next.agentWritePolicy,
      relationship_capture_policy: next.relationshipCapturePolicy,
      auto_log_enabled: next.autoLogEnabled ? 1 : 0,
      log_retention_days: next.logRetentionDays,
      updated_at: now,
    })).execute();
    return this.getProjectPolicy(projectId, executor);
  }

  async getGlobalPreferences(executor: DatabaseExecutor = this.db): Promise<GlobalPreferences> {
    const row = await executor.selectFrom("global_preferences").selectAll().where("id", "=", "default").executeTakeFirst();
    if (!row) {
      const now = new Date().toISOString();
      return { ...globalDefaults, createdAt: now, updatedAt: now };
    }
    return {
      launchAtLogin: Boolean(row.launch_at_login),
      minimizeToTray: Boolean(row.minimize_to_tray),
      startDaemonOnLaunch: Boolean(row.start_daemon_on_launch),
      theme: row.theme as GlobalPreferences["theme"],
      weekStartsOn: row.week_starts_on as GlobalPreferences["weekStartsOn"],
      compactMode: Boolean(row.compact_mode),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateGlobalPreferences(input: UpdateGlobalPreferencesInput, now: string, executor: DatabaseExecutor = this.db) {
    const current = await this.getGlobalPreferences(executor);
    const next: GlobalPreferences = {
      ...current,
      launchAtLogin: input.launchAtLogin ?? current.launchAtLogin,
      minimizeToTray: input.minimizeToTray ?? current.minimizeToTray,
      startDaemonOnLaunch: input.startDaemonOnLaunch ?? current.startDaemonOnLaunch,
      theme: input.theme ?? current.theme,
      weekStartsOn: input.weekStartsOn ?? current.weekStartsOn,
      compactMode: input.compactMode ?? current.compactMode,
      updatedAt: now,
    };
    await executor.insertInto("global_preferences").values({
      id: "default",
      launch_at_login: next.launchAtLogin ? 1 : 0,
      minimize_to_tray: next.minimizeToTray ? 1 : 0,
      start_daemon_on_launch: next.startDaemonOnLaunch ? 1 : 0,
      theme: next.theme,
      week_starts_on: next.weekStartsOn,
      compact_mode: next.compactMode ? 1 : 0,
      created_at: current.createdAt,
      updated_at: now,
    }).onConflict((conflict) => conflict.column("id").doUpdateSet({
      launch_at_login: next.launchAtLogin ? 1 : 0,
      minimize_to_tray: next.minimizeToTray ? 1 : 0,
      start_daemon_on_launch: next.startDaemonOnLaunch ? 1 : 0,
      theme: next.theme,
      week_starts_on: next.weekStartsOn,
      compact_mode: next.compactMode ? 1 : 0,
      updated_at: now,
    })).execute();
    return this.getGlobalPreferences(executor);
  }
}
