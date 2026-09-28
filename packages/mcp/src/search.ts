import type { ProjectSearchResult, ProjectSearchResponse } from "@pcc/contracts";
import { DaemonClient } from "./daemon-client.js";

export async function searchProjectData(client: DaemonClient, query: string, projectId: string | undefined, limit: number): Promise<ProjectSearchResponse> {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  const projects = projectId ? (await client.listProjects()).items.filter((project) => project.id === projectId) : (await client.listProjects()).items;
  const snapshots = await Promise.all(projects.map((project) => client.getProjectSnapshot(project.id)));
  const inbox = await client.listInbox();
  const items: ProjectSearchResult[] = [];
  const add = (entityType: ProjectSearchResult["entityType"], entityId: string, ownerProjectId: string | null, title: string, context: string) => {
    const titleText = title.toLocaleLowerCase("zh-CN");
    const contextText = context.toLocaleLowerCase("zh-CN");
    if (!titleText.includes(normalized) && !contextText.includes(normalized)) return;
    const score = titleText === normalized ? 100 : titleText.startsWith(normalized) ? 75 : titleText.includes(normalized) ? 50 : 20;
    items.push({ entityType, entityId, projectId: ownerProjectId, title, context, score });
  };
  snapshots.forEach((snapshot) => {
    add("project", snapshot.project.id, snapshot.project.id, snapshot.project.name, `${snapshot.project.description}\n${snapshot.project.vision}`);
    snapshot.milestones.forEach((item) => add("milestone", item.id, item.projectId, item.title, item.description));
    snapshot.plans.forEach((item) => add("plan", item.id, item.projectId, item.title, item.description));
    snapshot.tasks.forEach((item) => add("task", item.id, item.projectId, item.title, `${item.description}\n${item.status}\n${item.assigneeId ?? ""}`));
    snapshot.ideas.forEach((item) => add("idea", item.id, item.projectId, item.title, item.body));
    snapshot.workspace?.worktrees.forEach((item) => add("worktree", item.id, item.projectId, item.branch ?? item.path, `${item.path}\n${item.head}`));
  });
  const allowedProjectNames = new Set(projects.map((project) => project.name));
  inbox.items.filter((item) => !projectId || allowedProjectNames.has(item.project)).forEach((item) => add("inbox_item", item.id, projects.find((project) => project.name === item.project)?.id ?? null, item.title, `${item.note}\n${item.project}\n${item.kind}`));
  items.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "zh-CN"));
  return { query, items: items.slice(0, limit), total: items.length };
}
