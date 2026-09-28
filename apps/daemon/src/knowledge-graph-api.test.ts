import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("dynamic knowledge graph API", () => {
  let built: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => { built = await buildServer({ databaseFilename: ":memory:" }); });
  afterEach(async () => { await built.app.close(); });

  it("assembles hierarchy and EntityLinks and supports project/depth focus", async () => {
    await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/canvases/mindmap" });
    const response = await built.app.inject({ method: "GET", url: "/api/knowledge-graph" });
    expect(response.statusCode, response.body).toBe(200);
    const graph = response.json();
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "project:pixelmind", type: "project", label: "PixelMind" }));
    expect(graph.nodes).toContainEqual(expect.objectContaining({ type: "canvas_node", projectId: "pixelmind" }));
    expect(graph.links).toContainEqual(expect.objectContaining({ source: "project:pixelmind", relation: "包含", kind: "hierarchy" }));
    expect(graph.links).toContainEqual(expect.objectContaining({ kind: "entity_link" }));

    const scoped = (await built.app.inject({ method: "GET", url: "/api/knowledge-graph?projectId=pixelmind" })).json();
    expect(scoped.nodes.every((node: { projectId: string | null; type: string }) => node.projectId === "pixelmind" || node.type === "agent")).toBe(true);
    expect(scoped.nodes.some((node: { projectId: string }) => node.projectId === "edgemind")).toBe(false);

    const focused = (await built.app.inject({ method: "GET", url: "/api/knowledge-graph?focusType=idea&focusId=40000000-0000-4000-8000-000000000001&depth=1" })).json();
    expect(focused.nodes).toContainEqual(expect.objectContaining({ id: "idea:40000000-0000-4000-8000-000000000001" }));
    expect(focused.totalNodes).toBeLessThan(graph.totalNodes);
    expect(focused.links.every((link: { source: string; target: string }) => focused.nodes.some((node: { id: string }) => node.id === link.source) && focused.nodes.some((node: { id: string }) => node.id === link.target))).toBe(true);
  });
});
