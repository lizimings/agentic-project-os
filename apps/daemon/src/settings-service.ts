import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { UpdateGlobalPreferencesInput, UpdateProjectPolicyInput } from "@pcc/contracts";
import { CoreRepository, SettingsRepository } from "@pcc/database";
import { createCoreEvent, type CoreActor } from "@pcc/domain";
import { EventBroker } from "./event-broker.js";
import { EntityNotFoundError } from "./inbox-service.js";

export interface SettingsRuntimeOptions {
  databaseFilename: string;
  host: string;
  port: number;
  organizerEnabled: boolean;
  workspaceWatchingEnabled: boolean;
}

export class SettingsService {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly core: CoreRepository,
    private readonly events: EventBroker,
    private readonly runtime: SettingsRuntimeOptions,
  ) {}

  async getProjectPolicy(projectId: string) {
    if (!await this.core.getProject(projectId)) throw new EntityNotFoundError("Project", projectId);
    return this.repository.getProjectPolicy(projectId);
  }

  async updateProjectPolicy(projectId: string, input: UpdateProjectPolicyInput, actor: CoreActor, correlationId: string) {
    if (!await this.core.getProject(projectId)) throw new EntityNotFoundError("Project", projectId);
    const event = createCoreEvent("project", projectId, "updated", actor, correlationId, { projectId, settings: true, ...input });
    const updated = await this.repository.database.transaction().execute(async (transaction) => {
      const result = await this.repository.updateProjectPolicy(projectId, input, event.occurredAt, transaction);
      await this.core.appendEvent(event, transaction);
      return result;
    });
    this.events.publish(event);
    return updated;
  }

  getGlobalPreferences() {
    return this.repository.getGlobalPreferences();
  }

  async updateGlobalPreferences(input: UpdateGlobalPreferencesInput, actor: CoreActor, correlationId: string) {
    const event = createCoreEvent("integration", "global-preferences", "updated", actor, correlationId, { preferences: input });
    const updated = await this.repository.database.transaction().execute(async (transaction) => {
      const result = await this.repository.updateGlobalPreferences(input, event.occurredAt, transaction);
      await this.core.appendEvent(event, transaction);
      return result;
    });
    this.events.publish(event);
    return updated;
  }

  async diagnostics() {
    const memory = this.runtime.databaseFilename === ":memory:";
    const databasePath = memory ? ":memory:" : path.resolve(this.runtime.databaseFilename);
    const dataDirectory = memory ? ":memory:" : path.dirname(databasePath);
    let databaseBytes = 0;
    let writable = memory;
    if (!memory) {
      try { databaseBytes = (await stat(databasePath)).size; } catch { databaseBytes = 0; }
      try { await access(dataDirectory, constants.W_OK); writable = true; } catch { writable = false; }
    }
    return {
      checkedAt: new Date().toISOString(),
      daemon: {
        status: "ok" as const,
        version: "0.1.0",
        uptimeSeconds: Math.max(0, Math.round(process.uptime())),
        pid: process.pid,
        nodeVersion: process.version,
        platform: `${process.platform}/${process.arch}`,
        host: this.runtime.host,
        port: this.runtime.port,
      },
      data: { databasePath, dataDirectory, databaseBytes, writable, migration: "019_settings" },
      services: {
        mcp: "ready" as const,
        organizer: this.runtime.organizerEnabled ? "running" as const : "disabled" as const,
        workspaceWatcher: this.runtime.workspaceWatchingEnabled ? "running" as const : "disabled" as const,
      },
    };
  }
}
