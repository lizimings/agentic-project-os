import { describe, expect, it } from "vitest";
import { createInboxCapturedEvent } from "./inbox.js";

describe("createInboxCapturedEvent", () => {
  it("records actor, entity and source evidence", () => {
    const event = createInboxCapturedEvent(
      "11111111-1111-4111-8111-111111111111",
      {
        title: "把想法放进 Inbox",
        note: "等待整理",
        source: "MCP",
        project: "未归类",
        kind: "想法",
      },
      { type: "agent", id: "codex" },
    );

    expect(event.type).toBe("inbox.item_created");
    expect(event.actorId).toBe("codex");
    expect(event.payload.source).toBe("MCP");
  });
});
