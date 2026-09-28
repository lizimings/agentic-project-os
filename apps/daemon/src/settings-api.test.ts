import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("persistent project and global settings", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:", organizerEnabled: false, workspaceWatchingEnabled: false, host: "127.0.0.1", port: 4317 }); });
  afterEach(async () => { await built.app.close(); });

  it("persists project policies with auditable partial updates", async () => {
    const defaults = await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/settings" });
    expect(defaults.statusCode, defaults.body).toBe(200);
    expect(defaults.json()).toMatchObject({ projectId: "pixelmind", agentWritePolicy: "proposal_only", relationshipCapturePolicy: "mentions", autoLogEnabled: true, logRetentionDays: 365 });

    const updated = await built.app.inject({ method: "PUT", url: "/api/projects/pixelmind/settings", headers: { "x-pcc-actor-type": "human", "x-pcc-actor-id": "settings-test" }, payload: { agentWritePolicy: "low_risk_direct", relationshipCapturePolicy: "automatic", autoLogEnabled: false, logRetentionDays: 90 } });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({ agentWritePolicy: "low_risk_direct", relationshipCapturePolicy: "automatic", autoLogEnabled: false, logRetentionDays: 90 });

    const partial = await built.app.inject({ method: "PUT", url: "/api/projects/pixelmind/settings", payload: { autoLogEnabled: true } });
    expect(partial.json()).toMatchObject({ agentWritePolicy: "low_risk_direct", relationshipCapturePolicy: "automatic", autoLogEnabled: true, logRetentionDays: 90 });
    const event = await built.database.selectFrom("event_log").selectAll().where("entity_id", "=", "pixelmind").where("actor_id", "=", "settings-test").executeTakeFirst();
    expect(JSON.parse(event!.payload_json)).toMatchObject({ settings: true, agentWritePolicy: "low_risk_direct", relationshipCapturePolicy: "automatic" });
    expect((await built.app.inject({ method: "GET", url: "/api/projects/not-found/settings" })).statusCode).toBe(404);
  });

  it("persists startup preferences and reports runtime/data diagnostics without secrets", async () => {
    const updated = await built.app.inject({ method: "PUT", url: "/api/settings/preferences", payload: { launchAtLogin: true, minimizeToTray: false, theme: "dark", weekStartsOn: "sunday", compactMode: true } });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({ launchAtLogin: true, minimizeToTray: false, startDaemonOnLaunch: true, theme: "dark", weekStartsOn: "sunday", compactMode: true });
    const reloaded = (await built.app.inject({ method: "GET", url: "/api/settings/preferences" })).json();
    expect(reloaded).toMatchObject(updated.json());

    const diagnostics = await built.app.inject({ method: "GET", url: "/api/diagnostics" });
    expect(diagnostics.statusCode, diagnostics.body).toBe(200);
    expect(diagnostics.json()).toMatchObject({ daemon: { status: "ok", version: "0.1.0", host: "127.0.0.1", port: 4317 }, data: { databasePath: ":memory:", dataDirectory: ":memory:", databaseBytes: 0, writable: true, migration: "019_settings" }, services: { mcp: "ready", organizer: "disabled", workspaceWatcher: "disabled" } });
    expect(JSON.stringify(diagnostics.json())).not.toMatch(/api.?key|token|secret/i);
  });
});
