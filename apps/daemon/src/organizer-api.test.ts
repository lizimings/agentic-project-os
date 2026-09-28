import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("等待 Organizer 结果超时");
}

describe("event-driven read-only Organizer", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:", organizerEnabled: true, organizerDebounceMs: 10 }); });
  afterEach(async () => { await built.app.close(); });

  it("analyzes a bounded snapshot in a permission sandbox and only emits a Proposal", async () => {
    const title = "Organizer 沙盒整理验收";
    const created = await built.app.inject({ method: "POST", url: "/api/inbox", payload: { title, projectId: "pixelmind", project: "PixelMind", kind: "需求", source: "快捷记录" } });
    expect(created.statusCode).toBe(201);

    await waitUntil(async () => {
      const response = await built.app.inject({ method: "GET", url: "/api/proposals?projectId=pixelmind&status=pending" });
      return response.json().items.some((proposal: { title: string }) => proposal.title === `整理 Inbox：${title}`);
    });

    const proposals = (await built.app.inject({ method: "GET", url: "/api/proposals?projectId=pixelmind&status=pending" })).json().items;
    const proposal = proposals.find((item: { title: string }) => item.title === `整理 Inbox：${title}`);
    expect(proposal).toMatchObject({ kind: "convert", status: "pending", createdBy: "organizer:sandbox-v1" });
    const originalInbox = (await built.app.inject({ method: "GET", url: "/api/inbox" })).json().items.find((item: { title: string }) => item.title === title);
    expect(originalInbox).toBeTruthy();
    const status = (await built.app.inject({ method: "GET", url: "/api/organizer/status" })).json();
    expect(status.sandbox).toEqual({ fsRead: false, fsWrite: false, childProcess: false, worker: false });
    const runs = (await built.app.inject({ method: "GET", url: "/api/organizer/runs?projectId=pixelmind" })).json().items;
    expect(runs[0]).toMatchObject({ status: "completed", project_id: "pixelmind", error: null });
  });

  it("deduplicates repeated suggestions and ignores its own proposal events", async () => {
    const title = "Organizer 幂等验收";
    for (let index = 0; index < 2; index += 1) {
      await built.app.inject({ method: "POST", url: "/api/inbox", payload: { title, projectId: "edgemind", project: "EdgeMind", kind: "想法", source: "快捷记录" } });
      await waitUntil(async () => (await built.organizerRepository.recent("edgemind", 10)).filter((run) => run.status === "completed").length >= index + 1);
    }
    const proposals = (await built.app.inject({ method: "GET", url: "/api/proposals?projectId=edgemind&status=pending" })).json().items;
    expect(proposals.filter((proposal: { title: string }) => proposal.title === `整理 Inbox：${title}`)).toHaveLength(1);
    expect((await built.organizerRepository.recent("edgemind", 20)).length).toBe(2);
  });
});
