import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyPendingRestore } from "./data-recovery.js";
import { buildServer } from "./server.js";

describe("portable backup, restore and migration API", () => {
  const temporaryDirectories: string[] = [];
  let openServer: Awaited<ReturnType<typeof buildServer>> | null = null;
  afterEach(async () => {
    if (openServer) await openServer.app.close().catch(() => undefined);
    openServer = null;
    for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
  });

  it("creates a consistent backup, exports/imports it and restores on the next start", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pcc-backup-test-"));
    temporaryDirectories.push(root);
    const databaseFilename = path.join(root, "data", "project-command-center.sqlite");
    const exportDirectory = path.join(root, "exports");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(exportDirectory, { recursive: true }));
    let built = await buildServer({ databaseFilename, organizerEnabled: false, workspaceWatchingEnabled: false, seed: true });
    openServer = built;

    const before = await built.app.inject({ method: "PATCH", url: "/api/projects/pixelmind", payload: { name: "备份时名称" } });
    expect(before.statusCode, before.body).toBe(200);
    const created = await built.app.inject({ method: "POST", url: "/api/backups", payload: { label: "跨设备迁移点" } });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ label: "跨设备迁移点", kind: "manual", schemaVersion: "019_settings" });
    const backupId = created.json().id as string;

    const exported = await built.app.inject({ method: "POST", url: `/api/backups/${backupId}/export`, payload: { directory: exportDirectory } });
    expect(exported.statusCode, exported.body).toBe(200);
    const exportedDirectory = exported.json().directory as string;
    expect(JSON.parse(await readFile(path.join(exportedDirectory, "manifest.json"), "utf8"))).toMatchObject({ id: backupId, databaseSha256: created.json().databaseSha256 });
    const imported = await built.app.inject({ method: "POST", url: "/api/backups/import", payload: { directory: exportedDirectory } });
    expect(imported.statusCode, imported.body).toBe(201);
    expect(imported.json()).toMatchObject({ kind: "imported", label: "导入 · 跨设备迁移点" });
    expect(await built.app.inject({ method: "DELETE", url: `/api/backups/${imported.json().id}` })).toMatchObject({ statusCode: 204 });

    await built.app.inject({ method: "PATCH", url: "/api/projects/pixelmind", payload: { name: "恢复前已变更" } });
    const preflight = await built.app.inject({ method: "POST", url: `/api/backups/${backupId}/restore-preflight` });
    expect(preflight.statusCode, preflight.body).toBe(200);
    expect(preflight.json()).toMatchObject({ restartRequired: true, backup: { id: backupId }, warnings: expect.any(Array) });
    const scheduled = await built.app.inject({ method: "POST", url: `/api/backups/${backupId}/restore`, payload: { confirmationToken: preflight.json().confirmationToken } });
    expect(scheduled.statusCode, scheduled.body).toBe(202);
    expect(scheduled.json()).toMatchObject({ scheduled: true, recoveryBackup: { kind: "pre_restore" } });
    const inUse = await built.app.inject({ method: "DELETE", url: `/api/backups/${backupId}` });
    expect(inUse.statusCode).toBe(409);
    await built.app.close();
    openServer = null;

    const applied = await applyPendingRestore(databaseFilename);
    expect(applied).toMatchObject({ status: "applied", backupId });
    built = await buildServer({ databaseFilename, organizerEnabled: false, workspaceWatchingEnabled: false, seed: false });
    openServer = built;
    const restoredProject = await built.app.inject({ method: "GET", url: "/api/projects/pixelmind" });
    expect(restoredProject.json()).toMatchObject({ name: "备份时名称" });
    const list = await built.app.inject({ method: "GET", url: "/api/backups" });
    expect(list.json()).toMatchObject({ pendingRestore: null, lastRestore: { status: "applied", backupId } });
    expect(list.json().items.some((item: { kind: string }) => item.kind === "pre_restore")).toBe(true);
    await built.app.close();
    openServer = null;
  });

  it("rejects backup endpoints for the in-memory test runtime", async () => {
    const built = await buildServer({ databaseFilename: ":memory:", organizerEnabled: false, workspaceWatchingEnabled: false });
    openServer = built;
    const response = await built.app.inject({ method: "POST", url: "/api/backups", payload: {} });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "BACKUP_UNAVAILABLE" });
    await built.app.close();
    openServer = null;
  });
});
