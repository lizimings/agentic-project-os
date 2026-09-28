import type { ProjectSnapshot, SnapshotQuery } from "@pcc/contracts";
import { CoreService } from "./core-service.js";
import { RemoteService } from "./remote-service.js";
import { TimeService } from "./time-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { InboxService } from "./inbox-service.js";

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function defaultScope(query: SnapshotQuery) {
  if (query.from && query.to) {
    const anchor = new Date(query.from);
    const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() || 7) - 1));
    return { from: query.from, to: query.to, weekStart: query.weekStart ?? dateKey(monday) };
  }
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() || 7) - 1));
  const nextMonday = new Date(monday); nextMonday.setDate(nextMonday.getDate() + 7);
  return { from: monday.toISOString(), to: nextMonday.toISOString(), weekStart: query.weekStart ?? dateKey(monday) };
}

export class SnapshotService {
  constructor(
    private readonly core: CoreService,
    private readonly workspace: WorkspaceService,
    private readonly remote: RemoteService,
    private readonly time: TimeService,
    private readonly inbox: InboxService,
  ) {}

  async getProjectSnapshot(projectId: string, query: SnapshotQuery = {}): Promise<ProjectSnapshot> {
    const scope = defaultScope(query);
    const [project, milestones, plans, tasks, ideas, inboxItems, allLinks, workspace, remote, timeBlocks, currentFocus, budgets] = await Promise.all([
      this.core.getProject(projectId),
      this.core.listMilestones(projectId),
      this.core.listPlans({ projectId }),
      this.core.listTasks({ projectId }),
      this.core.listIdeas({ projectId }),
      this.inbox.list(),
      this.core.listLinks(),
      this.workspace.get(projectId),
      this.remote.getProjectBinding(projectId),
      this.time.listBlocks({ from: scope.from, to: scope.to, projectId }),
      this.time.getCurrentFocus(),
      this.time.listBudgets(scope.weekStart),
    ]);
    const entityIds = new Set([project.id, ...milestones.map((item) => item.id), ...plans.map((item) => item.id), ...tasks.map((item) => item.id), ...ideas.map((item) => item.id)]);
    const links = allLinks.filter((link) => entityIds.has(link.sourceId) || entityIds.has(link.targetId));
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      scope,
      project,
      milestones,
      plans,
      tasks,
      ideas,
      inbox: inboxItems.filter((item) => item.projectId === projectId || (!item.projectId && item.project === project.name)),
      links,
      workspace: workspace ?? null,
      remote: remote ?? null,
      timeBlocks,
      currentFocus: currentFocus?.projectId === projectId ? currentFocus : null,
      attentionBudget: budgets.find((budget) => budget.projectId === projectId) ?? null,
    };
  }
}
