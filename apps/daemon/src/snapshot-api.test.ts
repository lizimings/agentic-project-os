import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("read-only project snapshot API", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("assembles one bounded, secret-free project snapshot", async () => {
    const response = await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/snapshot?from=2026-08-17T00:00:00.000Z&to=2026-08-24T00:00:00.000Z&weekStart=2026-08-17" });
    expect(response.statusCode, response.body).toBe(200);
    const snapshot = response.json();
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      scope: { from: "2026-08-17T00:00:00.000Z", to: "2026-08-24T00:00:00.000Z", weekStart: "2026-08-17" },
      project: { id: "pixelmind", name: "PixelMind" },
      workspace: null,
      remote: null,
      currentFocus: null,
      inbox: expect.any(Array),
    });
    expect(snapshot.milestones.length).toBeGreaterThan(0);
    expect(snapshot.plans.length).toBeGreaterThan(0);
    expect(snapshot.tasks.length).toBeGreaterThan(0);
    expect(JSON.stringify(snapshot)).not.toContain("encryptedToken");
  });
});
