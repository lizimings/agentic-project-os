import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "./connection.js";
import { InboxRepository } from "./inbox-repository.js";
import { CoreRepository } from "./core-repository.js";
import { migrateDatabase } from "./migrations.js";
import { seedDatabase } from "./seed.js";

describe("database", () => {
  let db = createDatabase({ filename: ":memory:" });

  beforeEach(async () => {
    db = createDatabase({ filename: ":memory:" });
    await migrateDatabase(db);
    await seedDatabase(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("seeds projects and inbox items", async () => {
    const repository = new InboxRepository(db);
    const items = await repository.list();
    expect(items).toHaveLength(5);
    expect(items.some((item) => item.project === "PixelMind")).toBe(true);

    const core = new CoreRepository(db);
    expect(await core.listMilestones("pixelmind")).toHaveLength(1);
    expect(await core.listPlans({ projectId: "pixelmind" })).toHaveLength(1);
    expect(await core.listTasks({ projectId: "pixelmind" })).toHaveLength(1);
    expect(await core.listIdeas({ projectId: "pixelmind" })).toHaveLength(1);
    expect(await core.listLinks({ entityType: "task", entityId: "30000000-0000-4000-8000-000000000001" })).toHaveLength(2);
  });
});
