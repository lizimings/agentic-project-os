import { randomUUID } from "node:crypto";
import type {
  CanvasDocument,
  CanvasEdge,
  CanvasEntityReference,
  CanvasKind,
  CanvasNode,
  EventEnvelope,
  ProposalCommand,
  SaveCanvasDocumentInput,
} from "@pcc/contracts";
import { CanvasRepository, CoreRepository, type DatabaseExecutor } from "@pcc/database";
import { createCoreEvent, type CoreActor } from "@pcc/domain";
import { EventBroker } from "./event-broker.js";
import { EntityNotFoundError } from "./inbox-service.js";

export class CanvasConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasConflictError";
  }
}

function makeNode(input: Omit<CanvasNode, "id">): CanvasNode {
  return { id: randomUUID(), ...input };
}

function makeEdge(source: CanvasNode, target: CanvasNode, label: string | null = null): CanvasEdge {
  return { id: randomUUID(), source: source.id, target: target.id, label, relation: "relatesTo", directed: true, metadata: {} };
}

export class CanvasService {
  constructor(
    private readonly repository: CanvasRepository,
    private readonly coreRepository: CoreRepository,
    private readonly events: EventBroker,
  ) {}

  private async createInitialState(projectId: string, kind: CanvasKind) {
    const project = await this.coreRepository.getProject(projectId);
    if (!project) throw new EntityNotFoundError("Project", projectId);
    const [milestones, plans, tasks, ideas] = await Promise.all([
      this.coreRepository.listMilestones(projectId),
      this.coreRepository.listPlans({ projectId }),
      this.coreRepository.listTasks({ projectId }),
      this.coreRepository.listIdeas({ projectId }),
    ]);

    const projectRef: CanvasEntityReference = { type: "project", id: project.id, label: `@项目/${project.name}` };
    if (kind === "whiteboard") {
      const root = makeNode({ parentId: null, nodeType: "concept", kind: "goal", title: project.name, content: project.vision || project.description, position: { x: 390, y: 55 }, collapsed: false, tone: "blue", linkedEntities: [projectRef], metadata: { eyebrow: "项目目标", meta: project.status } });
      const nodes: CanvasNode[] = [root];
      const edges: CanvasEdge[] = [];
      milestones.filter((item) => item.status !== "archived").slice(0, 4).forEach((item, index) => {
        const node = makeNode({ parentId: null, nodeType: "concept", kind: "milestone", title: item.title, content: item.description, position: { x: 65 + index * 245, y: 235 }, collapsed: false, tone: index % 2 ? "purple" : "amber", linkedEntities: [{ type: "milestone", id: item.id, label: `@里程碑/${item.title}` }], metadata: { eyebrow: "里程碑", meta: item.targetDate || item.status } });
        nodes.push(node);
        edges.push(makeEdge(root, node, "推进"));
      });
      tasks.filter((item) => item.status !== "archived" && item.status !== "done").slice(0, 3).forEach((item, index) => {
        const node = makeNode({ parentId: null, nodeType: "concept", kind: "task", title: item.title, content: item.description, position: { x: 160 + index * 285, y: 425 }, collapsed: false, tone: "green", linkedEntities: [{ type: "task", id: item.id, label: `@任务/${item.title}` }], metadata: { eyebrow: "当前任务", meta: item.assigneeId || "未分配" } });
        nodes.push(node);
        const milestoneNode = nodes.find((candidate) => candidate.linkedEntities.some((reference) => reference.type === "milestone" && reference.id === item.milestoneId));
        edges.push(makeEdge(milestoneNode ?? root, node, "执行"));
      });
      ideas.filter((item) => item.status !== "archived").slice(0, 2).forEach((item, index) => {
        const node = makeNode({ parentId: null, nodeType: "concept", kind: "idea", title: item.title, content: item.body, position: { x: 725, y: 80 + index * 145 }, collapsed: false, tone: "pink", linkedEntities: [{ type: "idea", id: item.id, label: `@想法/${item.title}` }], metadata: { eyebrow: "想法", meta: item.status } });
        nodes.push(node);
      });
      return { title: `${project.name} 白板`, nodes, edges };
    }

    const root = makeNode({ parentId: null, nodeType: "mindTopic", kind: "root", title: project.name, content: project.vision || project.description, position: { x: 430, y: 255 }, collapsed: false, tone: "blue", linkedEntities: [projectRef], metadata: { meta: "项目思维导图", status: project.status, owner: "你", side: "center" } });
    const nodes: CanvasNode[] = [root];
    const edges: CanvasEdge[] = [];
    const activeMilestones = milestones.filter((item) => item.status !== "archived").slice(0, 6);
    activeMilestones.forEach((item, index) => {
      const side = index % 2 === 0 ? "left" : "right";
      const node = makeNode({ parentId: root.id, nodeType: "mindTopic", kind: "milestone", title: item.title, content: item.description, position: { x: side === "left" ? 120 : 740, y: 55 + Math.floor(index / 2) * 180 }, collapsed: false, tone: "purple", linkedEntities: [{ type: "milestone", id: item.id, label: `@里程碑/${item.title}` }], metadata: { meta: item.targetDate || item.status, status: item.status, owner: "你", side } });
      nodes.push(node);
      edges.push(makeEdge(root, node));
      const childPlans = plans.filter((plan) => plan.milestoneId === item.id && plan.status !== "archived").slice(0, 3);
      childPlans.forEach((plan, planIndex) => {
        const planNode = makeNode({ parentId: node.id, nodeType: "mindTopic", kind: "plan", title: plan.title, content: plan.description, position: { x: side === "left" ? -170 : 1035, y: node.position.y + planIndex * 95 }, collapsed: false, tone: "blue", linkedEntities: [{ type: "plan", id: plan.id, label: `@计划/${plan.title}` }], metadata: { meta: plan.status, status: plan.status, owner: "你", side } });
        nodes.push(planNode);
        edges.push(makeEdge(node, planNode));
      });
    });
    if (ideas.some((item) => item.status !== "archived")) {
      const ideasBranch = makeNode({ parentId: root.id, nodeType: "mindTopic", kind: "idea", title: "想法与待验证", content: "来自项目想法库", position: { x: 740, y: 470 }, collapsed: false, tone: "pink", linkedEntities: [], metadata: { meta: `${ideas.length} 个想法`, status: "待整理", owner: "你 + Agent", side: "right" } });
      nodes.push(ideasBranch);
      edges.push(makeEdge(root, ideasBranch));
      ideas.filter((item) => item.status !== "archived").slice(0, 4).forEach((item, index) => {
        const ideaNode = makeNode({ parentId: ideasBranch.id, nodeType: "mindTopic", kind: "idea", title: item.title, content: item.body, position: { x: 1035, y: 405 + index * 95 }, collapsed: false, tone: "pink", linkedEntities: [{ type: "idea", id: item.id, label: `@想法/${item.title}` }], metadata: { meta: item.sourceType, status: item.status, owner: "你", side: "right" } });
        nodes.push(ideaNode);
        edges.push(makeEdge(ideasBranch, ideaNode));
      });
    }
    return { title: `${project.name} 思维导图`, nodes, edges };
  }

  async getOrCreate(projectId: string, kind: CanvasKind, actor: CoreActor, correlationId: string) {
    const existing = await this.repository.getSnapshot(projectId, kind);
    if (existing) return existing;
    const initial = await this.createInitialState(projectId, kind);
    const documentId = randomUUID();
    const event = createCoreEvent("canvas_document", documentId, "created", actor, correlationId, { projectId, kind });
    const created = await this.repository.database.transaction().execute(async (transaction) => {
      const raced = await this.repository.getSnapshot(projectId, kind, transaction);
      if (raced) return raced;
      await this.repository.createDocument(documentId, projectId, kind, initial.title, { x: 0, y: 0, zoom: 1 }, transaction);
      await this.repository.replaceSnapshot(documentId, { expectedRevision: 0, title: initial.title, viewport: { x: 0, y: 0, zoom: 1 }, nodes: initial.nodes, edges: initial.edges }, transaction);
      await this.reconcileLinks(documentId, initial.nodes, initial.edges, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return this.repository.getSnapshot(projectId, kind, transaction);
    });
    if (!created) throw new EntityNotFoundError("CanvasDocument", documentId);
    this.events.publish(event);
    return created;
  }

  private validateMindMap(nodes: CanvasNode[]) {
    const roots = nodes.filter((node) => node.parentId === null);
    if (roots.length !== 1) throw new CanvasConflictError("思维导图必须且只能有一个中心主题");
    const parentById = new Map(nodes.map((node) => [node.id, node.parentId]));
    for (const node of nodes) {
      const visited = new Set<string>();
      let current: string | null = node.id;
      while (current) {
        if (visited.has(current)) throw new CanvasConflictError("思维导图父子关系中存在循环");
        visited.add(current);
        current = parentById.get(current) ?? null;
      }
    }
  }

  private async assertReference(reference: CanvasEntityReference, executor: DatabaseExecutor) {
    let exists = false;
    if (reference.type === "project") exists = Boolean(await executor.selectFrom("projects").select("id").where("id", "=", reference.id).executeTakeFirst());
    else if (reference.type === "milestone") exists = Boolean(await executor.selectFrom("milestones").select("id").where("id", "=", reference.id).executeTakeFirst());
    else if (reference.type === "plan") exists = Boolean(await executor.selectFrom("plans").select("id").where("id", "=", reference.id).executeTakeFirst());
    else if (reference.type === "task") exists = Boolean(await executor.selectFrom("tasks").select("id").where("id", "=", reference.id).executeTakeFirst());
    else if (reference.type === "idea") exists = Boolean(await executor.selectFrom("ideas").select("id").where("id", "=", reference.id).executeTakeFirst());
    else if (reference.type === "worktree") exists = Boolean(await executor.selectFrom("worktree_snapshots").select("id").where("id", "=", reference.id).executeTakeFirst());
    else if (reference.type === "inbox_item") exists = Boolean(await executor.selectFrom("inbox_items").select("id").where("id", "=", reference.id).executeTakeFirst());
    else if (reference.type === "proposal") exists = Boolean(await executor.selectFrom("proposals").select("id").where("id", "=", reference.id).executeTakeFirst());
    if (!exists) throw new EntityNotFoundError(reference.type, reference.id);
  }

  private async reconcileLinks(documentId: string, nodes: CanvasNode[], edges: CanvasEdge[], executor: DatabaseExecutor) {
    await executor.deleteFrom("entity_links").where("label", "like", `canvas:${documentId}:%`).execute();
    const rows: Array<{
      id: string; source_type: string; source_id: string; target_type: string; target_id: string;
      relation: string; label: string; created_at: string;
    }> = [];
    const now = new Date().toISOString();
    for (const node of nodes) {
      for (const reference of node.linkedEntities) {
        await this.assertReference(reference, executor);
        rows.push({ id: randomUUID(), source_type: "canvas_node", source_id: node.id, target_type: reference.type, target_id: reference.id, relation: "mentions", label: `canvas:${documentId}:node:${node.id}:${node.title}`, created_at: now });
      }
    }
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const seen = new Set<string>();
    for (const edge of edges) {
      const source = nodesById.get(edge.source)?.linkedEntities[0];
      const target = nodesById.get(edge.target)?.linkedEntities[0];
      if (!source || !target || (source.type === target.type && source.id === target.id)) continue;
      const key = `${source.type}:${source.id}:${target.type}:${target.id}:${edge.relation}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ id: randomUUID(), source_type: source.type, source_id: source.id, target_type: target.type, target_id: target.id, relation: edge.relation, label: `canvas:${documentId}:edge:${edge.id}:${edge.label ?? "画布关系"}`, created_at: now });
    }
    for (const row of rows) {
      await executor.insertInto("entity_links").values(row).onConflict((conflict) => conflict
        .columns(["source_type", "source_id", "target_type", "target_id", "relation"])
        .doNothing()).execute();
    }
  }

  async applyOrganizationCommand(
    command: Extract<ProposalCommand, { type: "organize_mindmap" }>,
    actor: CoreActor,
    correlationId: string,
    executor: DatabaseExecutor,
  ): Promise<EventEnvelope> {
    const documentRow = await this.repository.getDocumentRowById(command.documentId, executor);
    if (!documentRow || documentRow.project_id !== command.projectId || documentRow.kind !== "mindmap") {
      throw new EntityNotFoundError("MindmapDocument", command.documentId);
    }
    if (documentRow.revision !== command.expectedRevision) {
      throw new CanvasConflictError(`思维导图已由其他会话更新（当前 revision ${documentRow.revision}，Proposal 基于 ${command.expectedRevision}）`);
    }
    const document = await this.repository.getSnapshot(command.projectId, "mindmap", executor);
    if (!document || document.id !== command.documentId) throw new EntityNotFoundError("MindmapDocument", command.documentId);

    let nodes = document.nodes.map((node) => ({ ...node, linkedEntities: [...node.linkedEntities], metadata: { ...node.metadata } }));
    const requireNode = (nodeId: string) => {
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (!node) throw new CanvasConflictError(`整理命令引用了不存在的节点 ${nodeId}`);
      return node;
    };
    const descendantsOf = (nodeId: string) => {
      const descendants = new Set<string>();
      const visit = (parentId: string) => nodes.filter((node) => node.parentId === parentId).forEach((child) => {
        if (descendants.has(child.id)) return;
        descendants.add(child.id);
        visit(child.id);
      });
      visit(nodeId);
      return descendants;
    };

    for (const operation of command.operations) {
      if (operation.type === "create_node") {
        if (nodes.some((node) => node.id === operation.node.id)) throw new CanvasConflictError(`节点 ${operation.node.id} 已存在`);
        if (operation.node.parentId) requireNode(operation.node.parentId);
        nodes.push({ ...operation.node, linkedEntities: [...operation.node.linkedEntities], metadata: { ...operation.node.metadata } });
      } else if (operation.type === "update_node") {
        const node = requireNode(operation.nodeId);
        if (operation.title !== undefined) node.title = operation.title;
        if (operation.content !== undefined) node.content = operation.content;
        if (operation.kind !== undefined) node.kind = operation.kind;
        if (operation.tone !== undefined) node.tone = operation.tone;
        if (operation.collapsed !== undefined) node.collapsed = operation.collapsed;
      } else if (operation.type === "move_node") {
        const node = requireNode(operation.nodeId);
        requireNode(operation.parentId);
        if (node.parentId === null) throw new CanvasConflictError("中心主题不能移动");
        if (operation.nodeId === operation.parentId || descendantsOf(operation.nodeId).has(operation.parentId)) {
          throw new CanvasConflictError("移动节点会形成循环");
        }
        node.parentId = operation.parentId;
      } else if (operation.type === "merge_nodes") {
        if (operation.sourceNodeId === operation.targetNodeId) throw new CanvasConflictError("合并来源与目标不能相同");
        const source = requireNode(operation.sourceNodeId);
        const target = requireNode(operation.targetNodeId);
        if (source.parentId === null) throw new CanvasConflictError("中心主题不能被合并");
        if (descendantsOf(source.id).has(target.id)) throw new CanvasConflictError("不能把父主题合并到其后代主题");
        nodes.forEach((node) => { if (node.parentId === source.id) node.parentId = target.id; });
        const referenceKeys = new Set(target.linkedEntities.map((reference) => `${reference.type}:${reference.id}`));
        target.linkedEntities = [...target.linkedEntities, ...source.linkedEntities.filter((reference) => !referenceKeys.has(`${reference.type}:${reference.id}`))];
        if (source.content.trim() && !target.content.includes(source.content.trim())) {
          target.content = [target.content.trim(), source.content.trim()].filter(Boolean).join("\n\n");
        }
        nodes = nodes.filter((node) => node.id !== source.id);
      } else {
        const node = requireNode(operation.nodeId);
        if (node.parentId === null) throw new CanvasConflictError("中心主题不能被删除");
        const removed = descendantsOf(node.id);
        removed.add(node.id);
        nodes = nodes.filter((candidate) => !removed.has(candidate.id));
      }
    }

    this.validateMindMap(nodes);
    const edges: CanvasEdge[] = nodes.filter((node) => node.parentId !== null).map((node) => ({
      id: randomUUID(),
      source: node.parentId!,
      target: node.id,
      label: null,
      relation: "relatesTo",
      directed: true,
      metadata: { source: "organizer", type: "smoothstep" },
    }));
    await this.repository.replaceSnapshot(document.id, {
      expectedRevision: command.expectedRevision,
      title: document.title,
      viewport: document.viewport,
      nodes,
      edges,
    }, executor);
    await this.reconcileLinks(document.id, nodes, edges, executor);
    return createCoreEvent("canvas_document", document.id, "updated", actor, correlationId, {
      projectId: command.projectId,
      kind: "mindmap",
      proposal: true,
      operationCount: command.operations.length,
      nodeCount: nodes.length,
      revision: command.expectedRevision + 1,
    });
  }

  async save(projectId: string, kind: CanvasKind, input: SaveCanvasDocumentInput, actor: CoreActor, correlationId: string): Promise<CanvasDocument> {
    if (kind === "mindmap") this.validateMindMap(input.nodes);
    const document = await this.getOrCreate(projectId, kind, actor, correlationId);
    const event = createCoreEvent("canvas_document", document.id, "updated", actor, correlationId, { projectId, kind, nodeCount: input.nodes.length, edgeCount: input.edges.length, revision: input.expectedRevision + 1 });
    const updated = await this.repository.database.transaction().execute(async (transaction) => {
      const current = await this.repository.getDocumentRowById(document.id, transaction);
      if (!current) throw new EntityNotFoundError("CanvasDocument", document.id);
      if (current.revision !== input.expectedRevision) throw new CanvasConflictError(`画布已由其他会话更新（当前 revision ${current.revision}）`);
      await this.repository.replaceSnapshot(document.id, input, transaction);
      await this.reconcileLinks(document.id, input.nodes, input.edges, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return this.repository.getSnapshot(projectId, kind, transaction);
    });
    if (!updated) throw new EntityNotFoundError("CanvasDocument", document.id);
    this.events.publish(event);
    return updated;
  }
}
