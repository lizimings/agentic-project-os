import { describe, expect, it } from "vitest";
import { UpdateIdeaSchema, UpdateInboxItemSchema, UpdateMilestoneSchema, UpdatePlanSchema, UpdateProjectSchema } from "./index.js";

describe("partial update contracts", () => {
  it.each([
    ["project", UpdateProjectSchema, { status: "archived" }],
    ["milestone", UpdateMilestoneSchema, { status: "completed" }],
    ["plan", UpdatePlanSchema, { status: "blocked" }],
    ["idea", UpdateIdeaSchema, { status: "validated" }],
    ["inbox", UpdateInboxItemSchema, { kind: "需求" }],
  ])("does not materialize creation defaults for %s patches", (_name, schema, input) => {
    expect(schema.parse(input)).toEqual(input);
  });
});
