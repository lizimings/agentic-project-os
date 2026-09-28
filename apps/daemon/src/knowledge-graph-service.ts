import type { KnowledgeGraphLink, KnowledgeGraphNode, KnowledgeGraphQuery, KnowledgeGraphResponse } from "@pcc/contracts";
import { CoreRepository } from "@pcc/database";

const key = (type: string, id: string) => `${type}:${id}`;

export class KnowledgeGraphService {
  constructor(private readonly core: CoreRepository) {}

  async get(query: KnowledgeGraphQuery): Promise<KnowledgeGraphResponse> {
    const db = this.core.database;
    const [projects, milestones, plans, tasks, ideas, actors, worktrees, commits, canvasNodes, inbox, proposals, remotes, entityLinks] = await Promise.all([
      this.core.listProjects(),
      this.core.listMilestones(),
      this.core.listPlans(),
      this.core.listTasks(),
      this.core.listIdeas(),
      db.selectFrom("actors").selectAll().execute(),
      db.selectFrom("worktree_snapshots").selectAll().execute(),
      db.selectFrom("git_commits").selectAll().execute(),
      db.selectFrom("canvas_nodes").innerJoin("canvas_documents", "canvas_documents.id", "canvas_nodes.document_id").select(["canvas_nodes.id", "canvas_nodes.title", "canvas_nodes.kind", "canvas_nodes.content", "canvas_documents.project_id"]).execute(),
      db.selectFrom("inbox_items").selectAll().where("archived_at", "is", null).execute(),
      this.core.listProposals(),
      db.selectFrom("project_remote_bindings").selectAll().execute(),
      this.core.listLinks(),
    ]);
    const nodes = new Map<string, KnowledgeGraphNode>();
    const links: KnowledgeGraphLink[] = [];
    const linkKeys = new Set<string>();
    const addNode = (node: KnowledgeGraphNode) => nodes.set(node.id, node);
    const addLink = (link: KnowledgeGraphLink) => {
      const semantic = `${link.source}|${link.target}|${link.relation}|${link.kind}`;
      if (link.source === link.target || linkKeys.has(semantic)) return;
      linkKeys.add(semantic);
      links.push(link);
    };

    projects.filter((item) => item.status !== "archived").forEach((item) => addNode({ id: key("project", item.id), rawId: item.id, type: "project", label: item.name, projectId: item.id, status: item.status, meta: item.vision || item.description, val: 12 }));
    actors.forEach((item) => addNode({ id: key("actor", item.id), rawId: item.id, type: item.kind, label: item.name, projectId: null, status: item.status, meta: `${item.provider}${item.model ? ` · ${item.model}` : ""}`, val: 5 }));
    milestones.filter((item) => item.status !== "archived").forEach((item) => { addNode({ id: key("milestone", item.id), rawId: item.id, type: "milestone", label: item.title, projectId: item.projectId, status: item.status, meta: item.description, val: 8 }); addLink({ id: `hierarchy:project:${item.projectId}:milestone:${item.id}`, source: key("project", item.projectId), target: key("milestone", item.id), relation: "包含", label: null, kind: "hierarchy" }); });
    plans.filter((item) => item.status !== "archived").forEach((item) => { addNode({ id: key("plan", item.id), rawId: item.id, type: "plan", label: item.title, projectId: item.projectId, status: item.status, meta: item.description, val: 6 }); addLink({ id: `hierarchy:milestone:${item.milestoneId}:plan:${item.id}`, source: key("milestone", item.milestoneId), target: key("plan", item.id), relation: "计划", label: null, kind: "hierarchy" }); });
    tasks.filter((item) => item.status !== "archived").forEach((item) => {
      addNode({ id: key("task", item.id), rawId: item.id, type: "task", label: item.title, projectId: item.projectId, status: item.status, meta: item.description, val: 5 });
      addLink({ id: `hierarchy:plan:${item.planId}:task:${item.id}`, source: key("plan", item.planId), target: key("task", item.id), relation: item.parentTaskId ? "子任务" : "执行", label: null, kind: "hierarchy" });
      if (item.parentTaskId) addLink({ id: `hierarchy:task:${item.parentTaskId}:task:${item.id}`, source: key("task", item.parentTaskId), target: key("task", item.id), relation: "子任务", label: null, kind: "hierarchy" });
      if (item.assigneeType === "agent" && item.assigneeId) {
        addLink({ id: `assignment:${item.assigneeId}:${item.id}`, source: key("actor", item.assigneeId), target: key("task", item.id), relation: "负责", label: null, kind: "assignment" });
      } else if (item.assigneeType === "human" && item.assigneeId) {
        addLink({ id: `assignment:${item.assigneeId}:${item.id}`, source: key("actor", item.assigneeId), target: key("task", item.id), relation: "负责", label: null, kind: "assignment" });
      }
    });
    ideas.filter((item) => item.status !== "archived").forEach((item) => { addNode({ id: key("idea", item.id), rawId: item.id, type: "idea", label: item.title, projectId: item.projectId, status: item.status, meta: item.body, val: 4 }); if (item.projectId) addLink({ id: `hierarchy:project:${item.projectId}:idea:${item.id}`, source: key("project", item.projectId), target: key("idea", item.id), relation: "想法", label: null, kind: "hierarchy" }); });
    worktrees.forEach((item) => { addNode({ id: key("worktree", item.id), rawId: item.id, type: "worktree", label: item.branch || item.path, projectId: item.project_id, status: item.is_detached ? "detached" : "active", meta: `${item.path} · ${item.head.slice(0, 12)}`, val: 6 }); addLink({ id: `workspace:${item.project_id}:${item.id}`, source: key("project", item.project_id), target: key("worktree", item.id), relation: "工作树", label: null, kind: "workspace" }); });
    commits.forEach((item) => { addNode({ id: key("commit", item.id), rawId: item.id, type: "commit", label: `${item.short_hash} · ${item.subject}`, projectId: item.project_id, status: item.is_head ? "HEAD" : item.branch, meta: `${item.author} · ${item.committed_at}`, val: item.is_head ? 4 : 2 }); addLink({ id: `workspace:${item.worktree_id}:commit:${item.id}`, source: key("worktree", item.worktree_id), target: key("commit", item.id), relation: item.is_head ? "HEAD" : "提交", label: null, kind: "workspace" }); });
    canvasNodes.forEach((item) => addNode({ id: key("canvas_node", item.id), rawId: item.id, type: "canvas_node", label: item.title, projectId: item.project_id, status: item.kind, meta: item.content, val: 3 }));
    inbox.forEach((item) => { addNode({ id: key("inbox_item", item.id), rawId: item.id, type: "inbox_item", label: item.title, projectId: item.project_id, status: item.kind, meta: item.note, val: 3 }); if (item.project_id) addLink({ id: `hierarchy:project:${item.project_id}:inbox:${item.id}`, source: key("project", item.project_id), target: key("inbox_item", item.id), relation: "收集", label: null, kind: "hierarchy" }); });
    proposals.filter((item) => item.status === "pending").forEach((item) => { addNode({ id: key("proposal", item.id), rawId: item.id, type: "proposal", label: item.title, projectId: item.projectId, status: item.risk, meta: item.summary, val: 4 }); if (item.projectId) addLink({ id: `hierarchy:project:${item.projectId}:proposal:${item.id}`, source: key("project", item.projectId), target: key("proposal", item.id), relation: "待决策", label: null, kind: "hierarchy" }); });
    remotes.forEach((item) => { addNode({ id: key("remote_repository", item.project_id), rawId: item.project_id, type: "remote_repository", label: item.full_name, projectId: item.project_id, status: item.default_branch, meta: item.html_url, val: 5 }); addLink({ id: `workspace:${item.project_id}:remote`, source: key("project", item.project_id), target: key("remote_repository", item.project_id), relation: "远程仓库", label: null, kind: "workspace" }); });

    entityLinks.forEach((item) => {
      if (item.label === "task:assignee") return;
      const source = key(item.sourceType, item.sourceId);
      const target = key(item.targetType, item.targetId);
      if (!nodes.has(source) || !nodes.has(target)) return;
      addLink({ id: `entity_link:${item.id}`, source, target, relation: item.relation, label: item.label?.startsWith("canvas:") ? item.label.split(":").at(-1) || null : item.label, kind: "entity_link" });
    });

    let allowed = new Set(nodes.keys());
    if (query.projectId) {
      allowed = new Set([...nodes.values()].filter((node) => node.projectId === query.projectId).map((node) => node.id));
      links.forEach((link) => {
        if (allowed.has(link.source) && ["agent", "human"].includes(nodes.get(link.target)?.type ?? "")) allowed.add(link.target);
        if (allowed.has(link.target) && ["agent", "human"].includes(nodes.get(link.source)?.type ?? "")) allowed.add(link.source);
      });
    }
    if (query.focusType && query.focusId) {
      const focus = key(query.focusType, query.focusId);
      const focused = new Set<string>(nodes.has(focus) && allowed.has(focus) ? [focus] : []);
      for (let depth = 0; depth < query.depth; depth += 1) {
        links.forEach((link) => {
          if (!allowed.has(link.source) || !allowed.has(link.target)) return;
          if (focused.has(link.source)) focused.add(link.target);
          if (focused.has(link.target)) focused.add(link.source);
        });
      }
      allowed = focused;
    }
    const resultNodes = [...nodes.values()].filter((node) => allowed.has(node.id)).slice(0, 2_000);
    const resultIds = new Set(resultNodes.map((node) => node.id));
    const resultLinks = links.filter((link) => resultIds.has(link.source) && resultIds.has(link.target)).slice(0, 5_000);
    return { nodes: resultNodes, links: resultLinks, totalNodes: resultNodes.length, totalLinks: resultLinks.length, generatedAt: new Date().toISOString() };
  }
}
