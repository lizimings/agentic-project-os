import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("notification center API", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("derives actionable notifications and persists read and snooze state", async () => {
    const initial = await built.app.inject({ method: "GET", url: "/api/notifications" });
    expect(initial.statusCode, initial.body).toBe(200);
    const firstBody = initial.json();
    expect(firstBody.items).toContainEqual(expect.objectContaining({ type: "proposal", status: "unread", route: expect.stringContaining("/decisions") }));
    expect(firstBody.unread).toBeGreaterThan(0);

    const proposalNotification = firstBody.items.find((item: { type: string }) => item.type === "proposal");
    const read = await built.app.inject({ method: "PATCH", url: `/api/notifications/${proposalNotification.id}`, payload: { action: "read" } });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json().status).toBe("read");

    const snoozeUntil = new Date(Date.now() + 3_600_000).toISOString();
    const snoozed = await built.app.inject({ method: "PATCH", url: `/api/notifications/${proposalNotification.id}`, payload: { action: "snooze", snoozedUntil: snoozeUntil } });
    expect(snoozed.statusCode, snoozed.body).toBe(200);
    expect(snoozed.json()).toEqual(expect.objectContaining({ status: "snoozed", snoozedUntil: snoozeUntil }));
    const hidden = (await built.app.inject({ method: "GET", url: "/api/notifications" })).json();
    expect(hidden.items.some((item: { id: string }) => item.id === proposalNotification.id)).toBe(false);
    const included = (await built.app.inject({ method: "GET", url: "/api/notifications?status=snoozed&includeSnoozed=true" })).json();
    expect(included.items).toContainEqual(expect.objectContaining({ id: proposalNotification.id }));
  });

  it("marks all active notifications read with an audit event", async () => {
    await built.app.inject({ method: "GET", url: "/api/notifications" });
    const response = await built.app.inject({ method: "POST", url: "/api/notifications/read-all" });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().updated).toBeGreaterThan(0);
    const after = (await built.app.inject({ method: "GET", url: "/api/notifications" })).json();
    expect(after.unread).toBe(0);
    const logs = (await built.app.inject({ method: "GET", url: "/api/event-log?entityType=notification" })).json();
    expect(logs.items).toContainEqual(expect.objectContaining({ type: "notification.updated", payload: expect.objectContaining({ action: "read_all" }) }));
  });
});
