import assert from "node:assert/strict";
import test from "node:test";
import { locationPath, locationState, projectSectionLabels } from "../src/routes.js";

test("whiteboard is absent from the first-release project sections", () => {
  assert.equal(projectSectionLabels.whiteboard, undefined);
});

test("legacy whiteboard links resolve to the project overview", () => {
  const state = locationState("/projects/pixelmind/whiteboard");
  assert.deepEqual(state, { view: "project", projectId: "pixelmind", projectSection: "overview" });
  assert.equal(locationPath(state.view, state.projectId, state.projectSection), "/projects/pixelmind/overview");
});

test("mind-map deep links remain available", () => {
  const state = locationState("/projects/pixelmind/mindmap");
  assert.deepEqual(state, { view: "project", projectId: "pixelmind", projectSection: "mindmap" });
});
