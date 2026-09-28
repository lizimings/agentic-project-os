import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  ArrowsOutSimple,
  Brain,
  CaretDown,
  CaretRight,
  CheckCircle,
  CursorClick,
  Flag,
  GitBranch,
  LinkSimple,
  ListBullets,
  NotePencil,
  Plus,
  Robot,
  Selection,
  Sparkle,
  Target,
  Trash,
  TreeStructure,
} from "@phosphor-icons/react";
import { useCanvasDocument, useOrganizer } from "./useCoreData.js";

const whiteboardNodes = [
  { id: "goal", type: "concept", position: { x: 360, y: 52 }, data: { tone: "blue", eyebrow: "目标", label: "M2 · Canvas 协作闭环", meta: "8 月 29 日" } },
  { id: "problem", type: "concept", position: { x: 90, y: 230 }, data: { tone: "amber", eyebrow: "问题", label: "低端设备网格重绘过多", meta: "来自语音 Inbox" } },
  { id: "worktree", type: "concept", position: { x: 375, y: 260 }, data: { tone: "green", eyebrow: "@工作树", label: "feat/canvas-grid", meta: "Codex · 3 commits" } },
  { id: "evidence", type: "concept", position: { x: 680, y: 220 }, data: { tone: "purple", eyebrow: "证据", label: "PR #128 + 性能基准", meta: "等待视觉验收" } },
  { id: "idea", type: "concept", position: { x: 150, y: 455 }, data: { tone: "pink", eyebrow: "想法", label: "节点 hover 显示 Agent 输出", meta: "@知识图谱" } },
];

const whiteboardEdges = [
  { id: "goal-problem", source: "goal", target: "problem", label: "要解决", animated: true },
  { id: "goal-worktree", source: "goal", target: "worktree", label: "执行" },
  { id: "worktree-evidence", source: "worktree", target: "evidence", label: "产出", animated: true },
  { id: "idea-worktree", source: "idea", target: "worktree", label: "@链接", style: { strokeDasharray: "5 5" } },
];

const topicKinds = {
  root: { label: "项目", icon: TreeStructure, color: "#4057f4" },
  direction: { label: "方向", icon: Target, color: "#3f78d8" },
  milestone: { label: "里程碑", icon: Flag, color: "#7c5ce5" },
  execution: { label: "执行", icon: GitBranch, color: "#21a879" },
  idea: { label: "想法", icon: Sparkle, color: "#d95a91" },
  plan: { label: "计划", icon: ListBullets, color: "#4d7fe5" },
  task: { label: "任务", icon: CheckCircle, color: "#2aaa7f" },
  agent: { label: "Agent", icon: Robot, color: "#e0972d" },
};

const initialMindMapNodes = [
  {
    id: "root",
    type: "mindTopic",
    position: { x: 430, y: 255 },
    data: { kind: "root", label: "PixelMind", meta: "项目思维导图", status: "正常推进", owner: "你 + 3 个 Agent", entity: "@项目/PixelMind", backlinks: 8, links: ["@里程碑/M2", "@知识图谱/PixelMind"], side: "center" },
  },
  {
    id: "direction",
    topicParentId: "root",
    type: "mindTopic",
    position: { x: 135, y: 70 },
    data: { kind: "direction", label: "产品方向", meta: "2 个主题", status: "长期方向", owner: "你", entity: "@项目/PixelMind", backlinks: 3, links: ["@想法/AI 图像工作台"], side: "left" },
  },
  {
    id: "workspace",
    topicParentId: "direction",
    type: "mindTopic",
    position: { x: -135, y: 25 },
    data: { kind: "plan", label: "AI 图像工作台", meta: "产品主线", status: "推进中", owner: "你", entity: "@计划/产品主线", backlinks: 2, links: ["@里程碑/M2"], side: "left" },
  },
  {
    id: "human-ai",
    topicParentId: "direction",
    type: "mindTopic",
    position: { x: -135, y: 145 },
    data: { kind: "agent", label: "人类与 Agent 协作", meta: "MCP / CLI", status: "探索中", owner: "Agent · Luna", entity: "@想法/Agent 协作", backlinks: 4, links: ["@工作树/feat-agent-link"], side: "left" },
  },
  {
    id: "milestones",
    topicParentId: "root",
    type: "mindTopic",
    position: { x: 135, y: 405 },
    data: { kind: "milestone", label: "阶段里程碑", meta: "2 个阶段", status: "M2 推进中", owner: "你", entity: "@里程碑", backlinks: 6, links: ["@里程碑/M2", "@里程碑/M3"], side: "left" },
  },
  {
    id: "m2",
    topicParentId: "milestones",
    type: "mindTopic",
    position: { x: -145, y: 350 },
    data: { kind: "milestone", label: "M2 · Canvas 协作闭环", meta: "68% · 8 月 29 日", status: "正常推进", owner: "你 + Codex", entity: "@里程碑/M2", backlinks: 9, links: ["@任务/画布验收", "@工作树/canvas-grid"], side: "left" },
  },
  {
    id: "m3",
    topicParentId: "milestones",
    type: "mindTopic",
    position: { x: -145, y: 475 },
    data: { kind: "milestone", label: "M3 · Agent 自动整理", meta: "34% · 9 月 18 日", status: "计划中", owner: "Agent · Luna", entity: "@里程碑/M3", backlinks: 5, links: ["@想法/自动整理"], side: "left" },
  },
  {
    id: "execution",
    topicParentId: "root",
    type: "mindTopic",
    position: { x: 725, y: 65 },
    data: { kind: "execution", label: "当前执行路径", meta: "3 个活跃主题", status: "2 个 Agent 运行中", owner: "Codex", entity: "@执行/当前", backlinks: 7, links: ["@工作树/canvas-grid", "@工作树/agent-link"], side: "right" },
  },
  {
    id: "grid",
    topicParentId: "execution",
    type: "mindTopic",
    position: { x: 1010, y: 10 },
    data: { kind: "execution", label: "feat/canvas-grid", meta: "Codex · 等待验收", status: "运行中", owner: "Codex", entity: "@工作树/canvas-grid", backlinks: 6, links: ["@任务/画布验收", "@提交/9ae42a1"], side: "right" },
  },
  {
    id: "acceptance",
    topicParentId: "execution",
    type: "mindTopic",
    position: { x: 1010, y: 130 },
    data: { kind: "task", label: "画布网格渲染验收", meta: "今天 · 25 分钟", status: "等待你", owner: "你", entity: "@任务/128", backlinks: 4, links: ["@里程碑/M2", "@工作树/canvas-grid"], side: "right" },
  },
  {
    id: "agent-link",
    topicParentId: "execution",
    type: "mindTopic",
    position: { x: 1010, y: 250 },
    data: { kind: "agent", label: "MCP 双向链接写入", meta: "Agent · Luna", status: "待审阅", owner: "Agent · Luna", entity: "@工作树/agent-link", backlinks: 8, links: ["@PR/131", "@知识图谱/链接层"], side: "right" },
  },
  {
    id: "ideas",
    topicParentId: "root",
    type: "mindTopic",
    position: { x: 725, y: 405 },
    data: { kind: "idea", label: "想法与待验证", meta: "2 个主题", status: "待整理", owner: "你 + Agent", entity: "@想法库/PixelMind", backlinks: 5, links: ["@Inbox/PixelMind"], side: "right" },
  },
  {
    id: "hover-output",
    topicParentId: "ideas",
    type: "mindTopic",
    position: { x: 1010, y: 375 },
    data: { kind: "idea", label: "节点显示 Agent 输出", meta: "来自项目 Inbox", status: "待验证", owner: "你", entity: "@想法/hover-output", backlinks: 3, links: ["@里程碑/M3", "@知识图谱/Agent"], side: "right" },
  },
  {
    id: "voice-inbox",
    topicParentId: "ideas",
    type: "mindTopic",
    position: { x: 1010, y: 495 },
    data: { kind: "idea", label: "语音 Inbox 自动拆分", meta: "Agent 建议", status: "候选计划", owner: "Agent · Luna", entity: "@想法/voice-inbox", backlinks: 2, links: ["@Inbox/语音记录"], side: "right" },
  },
];

const edgeColor = (kind) => topicKinds[kind]?.color || "#8a94a8";

const initialMindMapEdges = initialMindMapNodes
  .filter((node) => node.topicParentId)
  .map((node) => {
    const parent = initialMindMapNodes.find((item) => item.id === node.topicParentId);
    return {
      id: `${node.topicParentId}-${node.id}`,
      source: node.topicParentId,
      target: node.id,
      sourceHandle: parent?.id === "root" ? `${node.data.side}-source` : undefined,
      type: "smoothstep",
      style: { stroke: edgeColor(node.data.kind), strokeWidth: node.topicParentId === "root" ? 2.4 : 1.8 },
    };
  });

function canvasNodeToFlow(node) {
  return {
    id: node.id,
    type: node.nodeType,
    position: node.position,
    topicParentId: node.parentId,
    data: {
      ...node.metadata,
      _metadata: node.metadata,
      kind: node.kind,
      label: node.title,
      content: node.content,
      tone: node.tone,
      collapsed: node.collapsed,
      linkedEntities: node.linkedEntities,
      entity: node.linkedEntities[0]?.label || "未关联",
      links: node.linkedEntities.map((reference) => reference.label),
      backlinks: node.linkedEntities.length,
    },
  };
}

function flowNodeToCanvas(node) {
  const metadata = { ...(node.data._metadata || {}) };
  ["meta", "status", "owner", "side", "eyebrow"].forEach((key) => {
    if (node.data[key] !== undefined) metadata[key] = node.data[key];
  });
  return {
    id: node.id,
    parentId: node.topicParentId || null,
    nodeType: node.type === "mindTopic" ? "mindTopic" : "concept",
    kind: node.data.kind || "idea",
    title: String(node.data.label || "未命名节点"),
    content: String(node.data.content || ""),
    position: { x: node.position.x, y: node.position.y },
    collapsed: Boolean(node.data.collapsed),
    tone: node.data.tone || "blue",
    linkedEntities: node.data.linkedEntities || [],
    metadata,
  };
}

function canvasEdgeToFlow(edge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label || undefined,
    type: edge.metadata.type || "smoothstep",
    animated: Boolean(edge.metadata.animated),
    style: edge.metadata.style || undefined,
    data: { relation: edge.relation, directed: edge.directed, metadata: edge.metadata },
  };
}

function flowEdgeToCanvas(edge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: typeof edge.label === "string" ? edge.label : null,
    relation: edge.data?.relation || "relatesTo",
    directed: edge.data?.directed ?? true,
    metadata: { ...(edge.data?.metadata || {}), type: edge.type || "smoothstep", animated: Boolean(edge.animated), ...(edge.style ? { style: edge.style } : {}) },
  };
}

function documentFingerprint(document) {
  return JSON.stringify({ title: document.title, viewport: document.viewport, nodes: document.nodes, edges: document.edges });
}

function useCanvasAutosave({ document, nodes, edges, viewport, setNodes, setEdges, setViewport, save, reload, onToast }) {
  const revisionRef = useRef(document.revision);
  const persistedRef = useRef(documentFingerprint(document));
  const currentRef = useRef(null);
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const saveRef = useRef(save);
  const toastRef = useRef(onToast);
  const suppressRef = useRef(false);
  const [status, setStatus] = useState("saved");
  const snapshot = useMemo(() => ({
    title: document.title,
    viewport,
    nodes: nodes.map(flowNodeToCanvas),
    edges: edges.map(flowEdgeToCanvas),
  }), [document.title, edges, nodes, viewport]);
  const fingerprint = JSON.stringify(snapshot);
  currentRef.current = { snapshot, fingerprint };
  saveRef.current = save;
  toastRef.current = onToast;

  const flushRef = useRef(null);
  flushRef.current = async () => {
    if (savingRef.current || !pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending.fingerprint === persistedRef.current) {
      if (mountedRef.current) setStatus("saved");
      return;
    }
    savingRef.current = true;
    if (mountedRef.current) setStatus("saving");
    try {
      const result = await saveRef.current({ expectedRevision: revisionRef.current, ...pending.snapshot });
      revisionRef.current = result.revision;
      // 以实际提交的本地快照作为保存基线。服务端返回对象可能含等价的规范化字段，
      // 若直接对返回值取指纹，会把同一份内容再次误判为 dirty。
      persistedRef.current = pending.fingerprint;
      if (mountedRef.current) setStatus("saved");
    } catch (error) {
      const isConflict = error.code === "CANVAS_CONFLICT" || error.status === 409;
      if (mountedRef.current) setStatus(isConflict ? "conflict" : "error");
      toastRef.current(isConflict ? "检测到另一个会话的修改，请选择保留本地或载入远端版本" : `画布保存失败：${error.message}`);
    } finally {
      savingRef.current = false;
      if (currentRef.current && currentRef.current.fingerprint !== persistedRef.current) {
        pendingRef.current = currentRef.current;
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => void flushRef.current(), 100);
      } else if (mountedRef.current) {
        pendingRef.current = null;
        setStatus("saved");
      }
    }
  };

  useEffect(() => {
    if (document.revision <= revisionRef.current) return;
    if (currentRef.current?.fingerprint !== persistedRef.current) {
      setStatus("conflict");
      return;
    }
    suppressRef.current = true;
    revisionRef.current = document.revision;
    persistedRef.current = documentFingerprint(document);
    setNodes(document.nodes.map(canvasNodeToFlow));
    setEdges(document.edges.map(canvasEdgeToFlow));
    setViewport(document.viewport);
    window.queueMicrotask(() => { suppressRef.current = false; });
  }, [document, setEdges, setNodes, setViewport]);

  useEffect(() => {
    if (suppressRef.current) return;
    if (fingerprint === persistedRef.current) {
      pendingRef.current = null;
      window.clearTimeout(timerRef.current);
      setStatus("saved");
      return;
    }
    pendingRef.current = { snapshot, fingerprint };
    setStatus("dirty");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flushRef.current(), 550);
  }, [fingerprint, snapshot]);

  useEffect(() => {
    // React StrictMode 会在开发环境执行一次 setup → cleanup → setup。
    // 每次 setup 都恢复 mounted 标记，避免真实保存成功后状态仍停在 dirty。
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(timerRef.current);
      void flushRef.current?.();
    };
  }, []);

  const resolveConflict = async (strategy) => {
    window.clearTimeout(timerRef.current);
    pendingRef.current = null;
    const latest = await reload();
    if (!latest) throw new Error("未取得最新画布版本");
    if (strategy === "local") {
      const local = currentRef.current;
      if (!local) return;
      setStatus("saving");
      try {
        const result = await saveRef.current({ expectedRevision: latest.revision, ...local.snapshot });
        revisionRef.current = result.revision;
        persistedRef.current = local.fingerprint;
        setStatus("saved");
        toastRef.current("已基于最新 revision 保留本地版本");
      } catch (error) {
        setStatus(error.code === "CANVAS_CONFLICT" || error.status === 409 ? "conflict" : "error");
        toastRef.current(`冲突处理失败：${error.message}`);
      }
      return;
    }
    revisionRef.current = latest.revision;
    persistedRef.current = documentFingerprint(latest);
    setNodes(latest.nodes.map(canvasNodeToFlow));
    setEdges(latest.edges.map(canvasEdgeToFlow));
    setViewport(latest.viewport);
    setStatus("saved");
    toastRef.current("已载入远端最新版本，本地未保存修改已丢弃");
  };

  return { status, resolveConflict };
}

function entityOptions(entities) {
  return [
    entities.project && { type: "project", id: entities.project.id, label: `@项目/${entities.project.name}` },
    ...entities.milestones.map((item) => ({ type: "milestone", id: item.id, label: `@里程碑/${item.title}` })),
    ...entities.plans.map((item) => ({ type: "plan", id: item.id, label: `@计划/${item.title}` })),
    ...entities.tasks.map((item) => ({ type: "task", id: item.id, label: `@任务/${item.title}` })),
    ...entities.ideas.map((item) => ({ type: "idea", id: item.id, label: `@想法/${item.title}` })),
    ...(entities.worktrees || []).map((item) => ({ type: "worktree", id: item.id, label: `@工作树/${item.branch || item.path}` })),
  ].filter(Boolean);
}

function EntityReferenceEditor({ node, options, onChange }) {
  const [value, setValue] = useState("");
  const linked = node.data.linkedEntities || [];
  const available = options.filter((option) => !linked.some((reference) => reference.type === option.type && reference.id === option.id));
  return (
    <section className="canvas-entity-editor">
      <strong><LinkSimple size={15} />@ 双向关联</strong>
      <div><select aria-label="选择关联实体" value={value} onChange={(event) => setValue(event.target.value)}><option value="">选择项目实体…</option>{available.map((option) => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.label}</option>)}</select><button type="button" disabled={!value} onClick={() => { const option = available.find((item) => `${item.type}:${item.id}` === value); if (option) onChange([...linked, option]); setValue(""); }}><Plus size={14} />关联</button></div>
      <div className="canvas-entity-chips">{linked.map((reference) => <span key={`${reference.type}:${reference.id}`}><LinkSimple size={12} />{reference.label}<button type="button" aria-label={`移除${reference.label}`} onClick={() => onChange(linked.filter((item) => item !== reference))}>×</button></span>)}{!linked.length && <em>还没有关联实体</em>}</div>
    </section>
  );
}

function CanvasLoading({ kind, error }) {
  return <section className="canvas-page canvas-loading"><Brain size={28} weight="duotone" /><strong>{error ? "画布加载失败" : `正在打开${kind === "mindmap" ? "思维导图" : "白板"}…`}</strong>{error && <span>{error.message}</span>}</section>;
}

function ConceptNode({ data }) {
  return (
    <div className={`flow-node concept-node ${data.tone}`}>
      <Handle type="target" position={Position.Left} />
      <small>{data.eyebrow}</small>
      <strong>{data.label}</strong>
      <span>{data.meta}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function MindTopicNode({ data, selected }) {
  const kind = topicKinds[data.kind] || topicKinds.idea;
  const Icon = kind.icon;
  const isLeft = data.side === "left";
  const targetPosition = isLeft ? Position.Right : Position.Left;
  const sourcePosition = isLeft ? Position.Left : Position.Right;

  if (data.kind === "root") {
    return (
      <div className={`mind-topic-node root ${selected ? "selected" : ""}`} style={{ "--topic-color": kind.color }}>
        <Handle id="left-source" type="source" position={Position.Left} />
        <span className="mind-topic-icon"><Icon size={20} weight="duotone" /></span>
        <span className="mind-topic-copy"><small>中心主题</small><strong>{data.label}</strong><em>{data.meta}</em></span>
        <Handle id="right-source" type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div className={`mind-topic-node ${data.kind} ${data.side} ${selected ? "selected" : ""}`} style={{ "--topic-color": kind.color }}>
      <Handle type="target" position={targetPosition} />
      <span className="mind-topic-icon"><Icon size={18} weight="duotone" /></span>
      <span className="mind-topic-copy"><small>{kind.label}</small><strong>{data.label}</strong><em>{data.meta}</em></span>
      {data.hasChildren && (
        <button className="mind-collapse nodrag" type="button" aria-label={data.collapsed ? `展开${data.label}` : `收起${data.label}`} onClick={(event) => { event.stopPropagation(); data.onToggle(data.id); }}>
          {data.collapsed ? <CaretRight size={12} /> : <CaretDown size={12} />}
        </button>
      )}
      <Handle type="source" position={sourcePosition} />
    </div>
  );
}

function CanvasConflictBanner({ saveState }) {
  if (saveState.status !== "conflict") return null;
  return (
    <div className="canvas-conflict-banner" role="alert">
      <span><strong>检测到并行修改</strong><em>当前画布已在另一个会话更新。选择保留本地内容，或载入远端最新版本。</em></span>
      <button type="button" onClick={() => void saveState.resolveConflict("remote")}>使用远端版本</button>
      <button type="button" className="primary" onClick={() => void saveState.resolveConflict("local")}>保留我的版本</button>
    </div>
  );
}

function FlowHeader({ title, description, mode, setMode, onAdd, onUndo, canUndo, onRedo, canRedo, onDelete, canDelete, saveState }) {
  return (
    <>
      <div className="canvas-toolbar">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="canvas-tools" role="toolbar" aria-label={`${title}工具`}>
          <button type="button" className={mode === "select" ? "active" : ""} onClick={() => setMode("select")}><Selection size={17} />选择</button>
          <button type="button" className={mode === "connect" ? "active" : ""} onClick={() => setMode("connect")}><LinkSimple size={17} />连接</button>
          <button type="button" onClick={onAdd}><Plus size={17} />新增</button>
          <button type="button" aria-label="删除节点" disabled={!canDelete} onClick={onDelete}><Trash size={17} /></button>
          <button type="button" aria-label="撤销" disabled={!canUndo} onClick={onUndo}><ArrowCounterClockwise size={17} /></button>
          <button type="button" aria-label="重做" disabled={!canRedo} onClick={onRedo}><ArrowClockwise size={17} /></button>
          <span className={`canvas-save-state ${saveState.status}`}>{saveState.status === "saving" ? "保存中" : saveState.status === "dirty" ? "待保存" : saveState.status === "error" || saveState.status === "conflict" ? "保存冲突" : "已保存"}</span>
        </div>
      </div>
      <CanvasConflictBanner saveState={saveState} />
    </>
  );
}

function WhiteboardEditor({ document, save, reload, entities, onToast }) {
  const [nodes, setNodes, applyNodesChange] = useNodesState(document.nodes.map(canvasNodeToFlow));
  const [edges, setEdges, applyEdgesChange] = useEdgesState(document.edges.map(canvasEdgeToFlow));
  const [viewport, setViewport] = useState(document.viewport);
  const [mode, setMode] = useState("select");
  const [selectedId, setSelectedId] = useState(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const nodeTypes = useMemo(() => ({ concept: ConceptNode }), []);
  const options = useMemo(() => entityOptions(entities), [entities]);
  const saveState = useCanvasAutosave({ document, nodes, edges, viewport, setNodes, setEdges, setViewport, save, reload, onToast });
  const selected = nodes.find((node) => node.id === selectedId) || null;

  const remember = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-29), { nodes: structuredClone(nodes), edges: structuredClone(edges) }];
    redoRef.current = [];
    setHistoryCount(historyRef.current.length);
    setRedoCount(0);
  }, [edges, nodes]);
  const undo = () => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    redoRef.current = [...redoRef.current.slice(-29), { nodes: structuredClone(nodes), edges: structuredClone(edges) }];
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setHistoryCount(historyRef.current.length);
    setRedoCount(redoRef.current.length);
    if (selectedId && !previous.nodes.some((node) => node.id === selectedId)) setSelectedId(null);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current = [...historyRef.current.slice(-29), { nodes: structuredClone(nodes), edges: structuredClone(edges) }];
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistoryCount(historyRef.current.length);
    setRedoCount(redoRef.current.length);
    if (selectedId && !next.nodes.some((node) => node.id === selectedId)) setSelectedId(null);
  };
  const onConnect = useCallback((connection) => {
    remember();
    setEdges((items) => addEdge({ ...connection, id: crypto.randomUUID(), animated: true, type: "smoothstep", data: { relation: "relatesTo", directed: true, metadata: { animated: true } } }, items));
  }, [remember, setEdges]);

  const addNote = () => {
    remember();
    const id = crypto.randomUUID();
    setNodes((items) => [...items, { id, type: "concept", position: { x: 500 + items.length * 12, y: 350 + items.length * 9 }, topicParentId: null, data: { kind: "idea", tone: "yellow", eyebrow: "新便签", label: "新的想法", content: "", meta: "刚刚创建", collapsed: false, linkedEntities: [], _metadata: { eyebrow: "新便签", meta: "刚刚创建" } } }]);
    setSelectedId(id);
    onToast("已在白板中添加便签");
  };
  const deleteSelected = () => {
    if (!selected) return;
    remember();
    setNodes((items) => items.filter((node) => node.id !== selected.id));
    setEdges((items) => items.filter((edge) => edge.source !== selected.id && edge.target !== selected.id));
    setSelectedId(null);
    onToast("节点和相关连线已移除，保存后同步更新知识关系");
  };
  const updateSelected = (patch) => {
    remember();
    setNodes((items) => items.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node));
  };

  return (
    <section className="canvas-page">
      <FlowHeader title="项目白板" description="把问题、证据、工作树和想法放在同一块画布上" mode={mode} setMode={setMode} onAdd={addNote} onUndo={undo} canUndo={historyCount > 0} onRedo={redo} canRedo={redoCount > 0} onDelete={deleteSelected} canDelete={Boolean(selected)} saveState={saveState} />
      <div className="canvas-stage" data-testid="whiteboard-stage">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={applyNodesChange}
          onEdgesChange={applyEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          onNodeDragStart={remember}
          onMoveEnd={(_, nextViewport) => setViewport(nextViewport)}
          nodeTypes={nodeTypes}
          defaultViewport={document.viewport}
          nodesConnectable={mode === "connect"}
          elementsSelectable
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#dfe4ee" gap={22} size={1.3} />
          <MiniMap pannable zoomable nodeColor="#7180f7" />
          <Controls showInteractive={false} />
        </ReactFlow>
        <div className="canvas-hint"><CursorClick size={15} />拖动节点整理空间；连接线会写入双向关系</div>
        {selected && <aside className="whiteboard-node-inspector card-surface"><span>当前节点</span><label>标题<input aria-label="白板节点标题" value={selected.data.label} onChange={(event) => updateSelected({ label: event.target.value })} /></label><label>说明<textarea aria-label="白板节点说明" value={selected.data.content || ""} onChange={(event) => updateSelected({ content: event.target.value, meta: event.target.value.slice(0, 80) || selected.data.meta })} /></label><EntityReferenceEditor node={selected} options={options} onChange={(linkedEntities) => updateSelected({ linkedEntities, links: linkedEntities.map((item) => item.label), entity: linkedEntities[0]?.label || "未关联", backlinks: linkedEntities.length })} /></aside>}
      </div>
    </section>
  );
}

export function WhiteboardView({ projectId, entities, onToast }) {
  const canvas = useCanvasDocument(projectId, "whiteboard");
  if (!canvas.document) return <CanvasLoading kind="whiteboard" error={canvas.error} />;
  return <WhiteboardEditor key={canvas.document.id} document={canvas.document} save={canvas.save} reload={canvas.reload} entities={entities} onToast={onToast} />;
}

function getDescendants(nodes, topicParentId) {
  const descendants = [];
  const visit = (id) => {
    nodes.filter((node) => node.topicParentId === id).forEach((child) => {
      descendants.push(child.id);
      visit(child.id);
    });
  };
  visit(topicParentId);
  return descendants;
}

function MindMapEditor({ document, save, reload, entities, onToast }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(document.nodes.map(canvasNodeToFlow));
  const [edges, setEdges, onEdgesChange] = useEdgesState(document.edges.map(canvasEdgeToFlow));
  const rootId = document.nodes.find((node) => node.parentId === null)?.id;
  const [selectedId, setSelectedId] = useState(rootId);
  const [viewport, setViewport] = useState(document.viewport);
  const [flow, setFlow] = useState(null);
  const nodeTypes = useMemo(() => ({ mindTopic: MindTopicNode }), []);
  const selected = nodes.find((node) => node.id === selectedId) || nodes[0];
  const collapsed = useMemo(() => new Set(nodes.filter((node) => node.data.collapsed).map((node) => node.id)), [nodes]);
  const options = useMemo(() => entityOptions(entities), [entities]);
  const saveState = useCanvasAutosave({ document, nodes, edges, viewport, setNodes, setEdges, setViewport, save, reload, onToast });
  const organizer = useOrganizer(document.projectId);

  const hiddenIds = useMemo(() => {
    const hidden = new Set();
    collapsed.forEach((id) => getDescendants(nodes, id).forEach((childId) => hidden.add(childId)));
    return hidden;
  }, [collapsed, nodes]);

  const requestFit = useCallback(() => {
    window.setTimeout(() => flow?.fitView({ padding: 0.16, duration: 350, maxZoom: 1 }), 40);
  }, [flow]);

  useEffect(() => {
    if (!flow) return undefined;
    const fitAfterResize = () => window.setTimeout(() => flow.fitView({ padding: 0.16, duration: 220, maxZoom: 1 }), 60);
    window.addEventListener("resize", fitAfterResize);
    fitAfterResize();
    return () => window.removeEventListener("resize", fitAfterResize);
  }, [flow]);

  const toggleBranch = useCallback((id) => {
    const descendants = getDescendants(nodes, id);
    setNodes((items) => items.map((node) => node.id === id ? { ...node, data: { ...node.data, collapsed: !node.data.collapsed } } : node));
    if (descendants.includes(selectedId)) setSelectedId(id);
    requestFit();
  }, [nodes, requestFit, selectedId, setNodes]);

  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    hidden: hiddenIds.has(node.id),
    data: {
      ...node.data,
      id: node.id,
      hasChildren: nodes.some((item) => item.topicParentId === node.id),
      collapsed: Boolean(node.data.collapsed),
      onToggle: toggleBranch,
    },
  })), [hiddenIds, nodes, toggleBranch]);

  const displayEdges = useMemo(() => edges.map((edge) => ({
    ...edge,
    hidden: hiddenIds.has(edge.source) || hiddenIds.has(edge.target),
  })), [edges, hiddenIds]);

  const addChild = () => {
    const parent = nodes.find((node) => node.id === selectedId) || nodes[0];
    const side = parent.data.side === "left" ? "left" : "right";
    const siblingCount = nodes.filter((node) => node.topicParentId === parent.id).length;
    const id = crypto.randomUUID();
    const nextNode = {
      id,
      topicParentId: parent.id,
      type: "mindTopic",
      position: {
        x: parent.position.x + (side === "left" ? -275 : 275),
        y: parent.position.y + 45 + siblingCount * 78,
      },
      data: { kind: "idea", label: "新主题", content: "", meta: "等待整理", status: "草稿", owner: "你", entity: "未关联", backlinks: 0, links: [], linkedEntities: [], collapsed: false, tone: "pink", side, _metadata: { meta: "等待整理", status: "草稿", owner: "你", side } },
    };
    setNodes((items) => [...items, nextNode]);
    setEdges((items) => [...items, {
      id: crypto.randomUUID(),
      source: parent.id,
      target: id,
      sourceHandle: parent.id === "root" ? "right-source" : undefined,
      type: "smoothstep",
      style: { stroke: topicKinds.idea.color, strokeWidth: 1.8 },
      data: { relation: "relatesTo", directed: true, metadata: { type: "smoothstep", style: { stroke: topicKinds.idea.color, strokeWidth: 1.8 } } },
    }]);
    setNodes((items) => items.map((node) => node.id === parent.id ? { ...node, data: { ...node.data, collapsed: false } } : node));
    setSelectedId(id);
    onToast(`已在“${parent.data.label}”下添加子主题`);
  };

  const toggleAll = () => {
    if (collapsed.size) {
      setNodes((items) => items.map((node) => ({ ...node, data: { ...node.data, collapsed: false } })));
      onToast("已展开全部思维导图分支");
    } else {
      const branchIds = new Set(nodes.filter((node) => node.id !== rootId && nodes.some((item) => item.topicParentId === node.id)).map((node) => node.id));
      setNodes((items) => items.map((node) => ({ ...node, data: { ...node.data, collapsed: branchIds.has(node.id) } })));
      onToast("已收起二级主题，保留项目主干");
    }
    requestFit();
  };

  const renameSelected = (label) => {
    setNodes((items) => items.map((node) => node.id === selected.id ? { ...node, data: { ...node.data, label } } : node));
  };
  const updateSelected = (patch) => setNodes((items) => items.map((node) => node.id === selected.id ? { ...node, data: { ...node.data, ...patch } } : node));
  const deleteBranch = () => {
    if (!selected.topicParentId) return;
    const ids = new Set([selected.id, ...getDescendants(nodes, selected.id)]);
    setNodes((items) => items.filter((node) => !ids.has(node.id)));
    setEdges((items) => items.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)));
    setSelectedId(selected.topicParentId);
    onToast(`已删除“${selected.data.label}”及其 ${ids.size - 1} 个后代主题`);
  };
  const changeParent = (parentId) => {
    if (!selected.topicParentId || !parentId || parentId === selected.id) return;
    const invalid = new Set(getDescendants(nodes, selected.id));
    if (invalid.has(parentId)) return;
    const parent = nodes.find((node) => node.id === parentId);
    if (!parent) return;
    const side = parent.data.side === "left" ? "left" : "right";
    setNodes((items) => items.map((node) => node.id === selected.id ? { ...node, topicParentId: parentId, data: { ...node.data, side }, position: { x: parent.position.x + (side === "left" ? -275 : 275), y: parent.position.y + 65 } } : node));
    setEdges((items) => [...items.filter((edge) => edge.target !== selected.id), { id: crypto.randomUUID(), source: parentId, target: selected.id, sourceHandle: parent.data.kind === "root" ? `${side}-source` : undefined, type: "smoothstep", style: { stroke: edgeColor(selected.data.kind), strokeWidth: 1.8 }, data: { relation: "relatesTo", directed: true, metadata: { type: "smoothstep", style: { stroke: edgeColor(selected.data.kind), strokeWidth: 1.8 } } } }]);
    onToast(`“${selected.data.label}”已移动到“${parent.data.label}”下`);
  };
  const submitOrganizerProposal = async () => {
    if (saveState.status !== "saved") {
      onToast("请先等待当前思维导图自动保存完成，再生成基于 revision 的整理命令");
      return;
    }
    const branchIds = new Set([selected.id, ...getDescendants(nodes, selected.id)]);
    const candidates = nodes.filter((node) => branchIds.has(node.id));
    const normalizeTitle = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const duplicateGroups = new Map();
    candidates.filter((node) => node.topicParentId && branchIds.has(node.topicParentId)).forEach((node) => {
      const key = `${node.topicParentId}:${normalizeTitle(node.data.label)}`;
      duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), node]);
    });
    const duplicate = [...duplicateGroups.values()].filter((items) => items.length > 1).sort((a, b) => b.length - a.length)[0];
    let operations = [];
    let changes = [];
    let proposalTitle = `整理思维导图分支：${selected.data.label}`;
    if (duplicate) {
      const [target, ...sources] = duplicate;
      operations = sources.map((source) => ({ type: "merge_nodes", sourceNodeId: source.id, targetNodeId: target.id }));
      changes = sources.map((source) => ({ entityType: "canvas_node", entityId: source.id, action: "merge", summary: `把重复主题“${source.data.label}”合并到“${target.data.label}”，其子主题和实体链接一并保留` }));
      proposalTitle = `合并 ${duplicate.length} 个重复主题：${target.data.label}`;
    } else {
      const structuralGroups = new Map();
      candidates.filter((node) => node.topicParentId && branchIds.has(node.topicParentId)).forEach((node) => {
        const key = `${node.topicParentId}:${node.data.kind}:${node.data.side || "right"}`;
        structuralGroups.set(key, [...(structuralGroups.get(key) || []), node]);
      });
      const group = [...structuralGroups.values()].filter((items) => items.length > 1).sort((a, b) => b.length - a.length)[0];
      if (!group) {
        onToast("当前分支没有重复主题或可安全归组的同类兄弟节点，未创建空 Proposal");
        return;
      }
      const parent = nodes.find((node) => node.id === group[0].topicParentId);
      const side = group[0].data.side === "left" ? "left" : "right";
      const groupId = crypto.randomUUID();
      const kindLabel = topicKinds[group[0].data.kind]?.label || "同类主题";
      const averageY = group.reduce((sum, node) => sum + node.position.y, 0) / group.length;
      const groupNode = {
        id: groupId,
        parentId: parent.id,
        nodeType: "mindTopic",
        kind: "direction",
        title: `${kindLabel}分组`,
        content: `由只读整理 Agent 识别的 ${group.length} 个同类兄弟主题，接受 Proposal 后建立中间层级。`,
        position: { x: parent.position.x + (side === "left" ? -275 : 275), y: averageY },
        collapsed: false,
        tone: "blue",
        linkedEntities: [],
        metadata: { meta: `${group.length} 个${kindLabel}`, status: "已整理", owner: "Organizer", side },
      };
      operations = [{ type: "create_node", node: groupNode }, ...group.map((node) => ({ type: "move_node", nodeId: node.id, parentId: groupId }))];
      changes = [
        { entityType: "canvas_node", entityId: groupId, action: "create", summary: `在“${parent.data.label}”下创建“${groupNode.title}”中间层级` },
        ...group.map((node) => ({ entityType: "canvas_node", entityId: node.id, action: "move", summary: `把“${node.data.label}”移动到“${groupNode.title}”下` })),
      ];
      proposalTitle = `归组 ${group.length} 个${kindLabel}主题`;
    }
    try {
      await organizer.submitProposal({
        projectId: document.projectId,
        title: proposalTitle,
        summary: `只读分析已生成 ${operations.length} 条确定性结构命令；接受前不修改导图，接受时按 revision ${document.revision} 原子执行。`,
        kind: "organize",
        risk: "low",
        evidence: [`CanvasDocument ${document.id} · revision ${document.revision}`, `当前分支 ${selected.id} · ${getDescendants(nodes, selected.id).length} 个后代`, `结构命令 ${operations.length} 条，可逐项审核`],
        changes,
        command: { type: "organize_mindmap", projectId: document.projectId, documentId: document.id, expectedRevision: document.revision, operations },
        createdBy: "mindmap-organizer",
      });
      onToast(`已生成 ${operations.length} 条可审核结构命令，思维导图保持不变`);
    } catch (error) { onToast(`提交整理建议失败：${error.message}`); }
  };

  const kind = topicKinds[selected.data.kind] || topicKinds.idea;
  const SelectedIcon = kind.icon;

  return (
    <section className="canvas-page mindmap-page">
      <div className="canvas-toolbar mindmap-toolbar">
        <div>
          <span className="mindmap-kicker"><TreeStructure size={14} />结构化项目思考</span>
          <h2>项目思维导图</h2>
          <p>围绕项目分层展开方向、里程碑、执行路径和想法；实体链接会进入项目知识图谱。</p>
        </div>
        <div className="canvas-tools mindmap-tools" role="toolbar" aria-label="思维导图工具">
          <button type="button" className="active" onClick={addChild}><Plus size={17} />添加子主题</button>
          <button type="button" onClick={toggleAll}><TreeStructure size={17} />{collapsed.size ? "全部展开" : "收起分支"}</button>
          <button type="button" onClick={requestFit}><ArrowsOutSimple size={17} />适配视图</button>
          <button type="button" disabled={organizer.pending} onClick={submitOrganizerProposal}><Sparkle size={17} />Agent 整理</button>
          <span className={`canvas-save-state ${saveState.status}`}>{saveState.status === "saving" ? "保存中" : saveState.status === "dirty" ? "待保存" : saveState.status === "error" || saveState.status === "conflict" ? "保存冲突" : "已保存"}</span>
        </div>
      </div>
      <CanvasConflictBanner saveState={saveState} />

      <div className="mindmap-workspace">
        <div className="canvas-stage mindmap-stage" data-testid="mindmap-stage">
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onInit={setFlow}
            onMoveEnd={(_, nextViewport) => setViewport(nextViewport)}
            nodeTypes={nodeTypes}
            defaultViewport={document.viewport}
            minZoom={0.35}
            maxZoom={1.5}
            nodesConnectable={false}
            defaultEdgeOptions={{ type: "smoothstep" }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#e1e6f0" gap={24} size={1.1} />
            <MiniMap pannable zoomable nodeColor={(node) => topicKinds[node.data.kind]?.color || "#8b97ad"} />
            <Controls showInteractive={false} />
          </ReactFlow>
          <div className="mindmap-statusbar">
            <span><TreeStructure size={15} />{nodes.length - hiddenIds.size} / {nodes.length} 个主题可见</span>
            <span><LinkSimple size={15} />{nodes.reduce((sum, node) => sum + (node.data.links?.length || 0), 0)} 个实体链接</span>
            <span className={saveState.status === "saved" ? "autosaved" : ""}><CheckCircle size={15} weight={saveState.status === "saved" ? "fill" : "regular"} />{saveState.status === "saving" ? "正在自动保存" : saveState.status === "dirty" ? "等待自动保存" : saveState.status === "error" || saveState.status === "conflict" ? "保存需要处理" : `已保存 revision ${document.revision}`}</span>
          </div>
        </div>

        <aside className="mindmap-inspector" aria-label="主题详情">
          <div className="mindmap-inspector-head">
            <span className="mind-inspector-icon" style={{ color: kind.color, background: `${kind.color}14` }}><SelectedIcon size={20} weight="duotone" /></span>
            <span><small>当前主题</small><strong>{kind.label}</strong></span>
            <em>{selected.data.status}</em>
          </div>

          <label className="mindmap-title-field" htmlFor="mindmap-topic-title">
            <span>主题名称</span>
            <input id="mindmap-topic-title" name="mindmap-topic-title" value={selected.data.label} onChange={(event) => renameSelected(event.target.value)} />
          </label>

          <label className="mindmap-title-field" htmlFor="mindmap-topic-content"><span>主题说明</span><textarea id="mindmap-topic-content" value={selected.data.content || ""} onChange={(event) => updateSelected({ content: event.target.value, meta: event.target.value.slice(0, 80) || selected.data.meta })} /></label>

          <div className="mindmap-meta-grid">
            <span><small>负责人 / Agent</small><strong>{selected.data.owner}</strong></span>
            <span><small>反向链接</small><strong>{selected.data.backlinks} 个</strong></span>
          </div>

          <EntityReferenceEditor node={selected} options={options} onChange={(linkedEntities) => updateSelected({ linkedEntities, links: linkedEntities.map((item) => item.label), entity: linkedEntities[0]?.label || "未关联", backlinks: linkedEntities.length })} />

          <section className="mindmap-branch-summary">
            <span><TreeStructure size={15} />分支状态</span>
            <div><span>直接子主题<strong>{nodes.filter((node) => node.topicParentId === selected.id).length}</strong></span><span>全部后代<strong>{getDescendants(nodes, selected.id).length}</strong></span></div>
          </section>

          <div className="mindmap-inspector-actions">
            <button type="button" onClick={addChild}><Plus size={16} />添加子主题</button>
            {selected.topicParentId && <label className="mindmap-parent-select"><span>移动到</span><select aria-label="选择父主题" value={selected.topicParentId} onChange={(event) => changeParent(event.target.value)}>{nodes.filter((node) => node.id !== selected.id && !getDescendants(nodes, selected.id).includes(node.id)).map((node) => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select></label>}
            <button type="button" disabled={organizer.pending} onClick={submitOrganizerProposal}><Robot size={16} />交给 Agent 整理</button>
            <button type="button" disabled={!selected.topicParentId} onClick={deleteBranch}><Trash size={16} />删除当前分支</button>
          </div>

          <p className="mindmap-edit-hint"><NotePencil size={14} />修改主题名称会立即写入项目记录层。</p>
        </aside>
      </div>
    </section>
  );
}

export function MindMapView({ projectId, entities, onToast }) {
  const canvas = useCanvasDocument(projectId, "mindmap");
  if (!canvas.document) return <CanvasLoading kind="mindmap" error={canvas.error} />;
  return <MindMapEditor key={canvas.document.id} document={canvas.document} save={canvas.save} reload={canvas.reload} entities={entities} onToast={onToast} />;
}
