import { describe, expect, it } from "vitest";
import { createCoreEvent } from "./core.js";

describe("createCoreEvent", () => {
  it("creates a typed auditable entity event", () => {
    const event = createCoreEvent(
      "milestone",
      "10000000-0000-4000-8000-000000000001",
      "created",
      { type: "human", id: "local-user" },
      "60000000-0000-4000-8000-000000000001",
      { projectId: "pixelmind" },
    );
    expect(event.type).toBe("milestone.created");
    expect(event.payload.projectId).toBe("pixelmind");
  });
});
