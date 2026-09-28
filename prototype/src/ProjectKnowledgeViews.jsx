import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import {
  Archive,
  ArrowRight,
  Check,
  CheckCircle,
  Cube,
  Flag,
  FolderOpen,
  Graph,
  Lightbulb,
  LinkSimple,
  ListChecks,
  Plus,
  Robot,
  Sparkle,
  TreeStructure,
} from "@phosphor-icons/react";

const statusLabels = { draft: "草稿", developing: "发展中", validated: "已验证", converted: "已转化", archived: "已归档" };
const sourceLabels = { manual: "手工记录", inbox_item: "Inbox", voice: "语音", agent: "Agent", import: "导入" };

export function ProjectIdeasView({ projectId, milestones, plans, ideas, duplicates = [], onCreate, onUpdate, onArchive, onConvert, onMerge, pending, onToast }) {
  const [status, setStatus] = useState("全部");
  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const shown = ideas.filter((idea) => idea.status !== "archived" && (status === "全部" || idea.status === status));
  const selected = shown.find((idea) => idea.id === selectedId) || shown[0] || null;
  const duplicateMatches = selected ? duplicates.filter((candidate) => candidate.ideaId === selected.id || candidate.duplicateId === selected.id).map((candidate) => ({ candidate, idea: ideas.find((idea) => idea.id === (candidate.ideaId === selected.id ? candidate.duplicateId : candidate.ideaId)) })).filter((item) => item.idea && item.idea.status !== "archived") : [];

  const createIdea = async () => {
    if (!draft.trim()) return;
    try {
      await onCreate({ projectId, title: draft.trim(), body: "", sourceType: "manual" });
      setDraft("");
      onToast("想法已保存到项目知识层");
    } catch (error) {
      onToast(`保存想法失败：${error.message}`);
    }
  };

  const updateStatus = async (nextStatus) => {
    if (!selected) return;
    try {
      await onUpdate(selected.id, { status: nextStatus });
      onToast(`想法状态已更新为${statusLabels[nextStatus]}`);
    } catch (error) {
      onToast(`更新失败：${error.message}`);
    }
  };

  const convert = async (targetType) => {
    if (!selected) return;
    const firstMilestone = milestones.find((item) => item.status !== "archived");
    const firstPlan = plans.find((item) => item.status !== "archived");
    const input = targetType === "milestone"
      ? { targetType, projectId }
      : targetType === "plan"
        ? firstMilestone && { targetType, milestoneId: firstMilestone.id }
        : firstPlan && { targetType, planId: firstPlan.id };
    if (!input) {
      onToast(targetType === "plan" ? "需要先创建里程碑" : "需要先创建计划");
      return;
    }
    try {
      await onConvert(selected.id, input);
      onToast(`已转为${targetType === "milestone" ? "里程碑" : targetType === "plan" ? "计划" : "任务"}，并自动建立 derivedFrom 反向链接`);
    } catch (error) {
      onToast(`转化失败：${error.message}`);
    }
  };

  const archive = async () => {
    if (!selected) return;
    try {
      await onArchive(selected.id);
      setSelectedId(null);
      onToast("想法已归档，历史链接继续保留");
    } catch (error) {
      onToast(`归档失败：${error.message}`);
    }
  };

  const mergeDuplicate = async (source) => {
    if (!selected || !source) return;
    try {
      await onMerge(selected.id, { sourceIdeaIds: [source.id] });
      onToast(`已把「${source.title}」合并到当前想法；来源已归档并建立 derivedFrom 关系`);
    } catch (error) { onToast(`合并失败：${error.message}`); }
  };

  return (
    <div className="project-content ideas-view">
      <div className="view-heading"><div><span className="eyebrow">从灵感到可执行成果</span><h2>想法库</h2><p>想法有自己的生命周期；转成里程碑、计划或任务后，原始来源和双向链接仍然保留。</p></div><div className="idea-stats"><span><strong>{ideas.filter((item) => item.status !== "archived").length}</strong><small>活跃想法</small></span><span><strong>{ideas.filter((item) => item.status === "converted").length}</strong><small>已转化</small></span></div></div>
      <section className="idea-capture card-surface"><Lightbulb size={20} weight="duotone" /><input aria-label="记录项目想法" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createIdea()} placeholder="记录 PixelMind 的新想法，也可以在描述中使用 @实体…" /><button className="primary-small" type="button" disabled={!draft.trim() || pending} onClick={createIdea}><Plus size={16} />保存想法</button></section>
      <div className="idea-tabs">{[["全部", "全部"], ["draft", "草稿"], ["developing", "发展中"], ["validated", "已验证"], ["converted", "已转化"]].map(([id, label]) => <button type="button" key={id} className={status === id ? "active" : ""} onClick={() => setStatus(id)}>{label}<em>{id === "全部" ? ideas.filter((item) => item.status !== "archived").length : ideas.filter((item) => item.status === id).length}</em></button>)}</div>
      <section className="ideas-layout">
        <div className="idea-list card-surface">{shown.map((idea) => <button type="button" key={idea.id} className={selected?.id === idea.id ? "selected" : ""} onClick={() => setSelectedId(idea.id)}><span className={`idea-state ${idea.status}`}><Lightbulb size={18} weight={idea.status === "validated" ? "fill" : "duotone"} /></span><span><span><em>{statusLabels[idea.status]}</em><small>{sourceLabels[idea.sourceType]}</small></span><strong>{idea.title}</strong><p>{idea.body || "还没有补充说明"}</p></span><ArrowRight size={15} /></button>)}{!shown.length && <div className="idea-empty"><Lightbulb size={28} /><strong>这个阶段还没有想法</strong></div>}</div>
        <aside className="idea-detail card-surface">{selected ? <><header><span className={`idea-state ${selected.status}`}><Lightbulb size={21} weight="duotone" /></span><div><span>{statusLabels[selected.status]} · {sourceLabels[selected.sourceType]}</span><h2>{selected.title}</h2></div></header><p>{selected.body || "这个想法还只有标题，可以继续补充上下文、证据和相关实体。"}</p><div className="idea-origin"><LinkSimple size={17} /><span><strong>来源保持</strong><small>{selected.sourceId ? `${selected.sourceType} · ${selected.sourceId}` : `${sourceLabels[selected.sourceType]} · ${new Date(selected.createdAt).toLocaleString("zh-CN")}`}</small></span></div>{duplicateMatches.length > 0 && <section className="idea-duplicates"><strong>可能重复 · 可解释匹配</strong>{duplicateMatches.map(({ candidate, idea }) => <article key={idea.id}><span><Sparkle size={15} /><span><b>{idea.title}</b><small>{candidate.reason === "same_title" ? "归一化标题一致" : `文本相似度 ${Math.round(candidate.score * 100)}%`}</small></span></span><button type="button" disabled={pending} onClick={() => mergeDuplicate(idea)}>合并到当前想法</button></article>)}</section>}<section><strong>生命周期</strong><div className="idea-lifecycle">{[["draft", "草稿"], ["developing", "发展中"], ["validated", "已验证"]].map(([id, label]) => <button type="button" key={id} className={selected.status === id ? "active" : ""} disabled={selected.status === "converted" || pending} onClick={() => updateStatus(id)}><CheckCircle size={15} />{label}</button>)}</div></section><section><strong>转为执行实体</strong><div className="idea-convert-actions"><button type="button" disabled={selected.status === "converted" || pending} onClick={() => convert("milestone")}><Flag size={16} />里程碑</button><button type="button" disabled={selected.status === "converted" || pending} onClick={() => convert("plan")}><FolderOpen size={16} />计划</button><button type="button" disabled={selected.status === "converted" || pending} onClick={() => convert("task")}><ListChecks size={16} />任务</button></div></section><footer><button type="button" disabled={pending} onClick={archive}><Archive size={16} />归档</button><button type="button" onClick={() => onToast("Agent 将只生成整理 Proposal，不会直接改写想法")}><Robot size={16} />让 Agent 整理</button></footer></> : <div className="idea-empty large"><Lightbulb size={30} /><strong>选择一个想法查看详情</strong></div>}</aside>
      </section>
    </div>
  );
}

const graphColors = { project: "#4057f4", milestone: "#8b5cf6", plan: "#22a97a", task: "#f2a03d", idea: "#ec5fa0" };

export function ProjectGraphView({ project, milestones, plans, tasks, ideas, links, onSectionChange }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 610 });
  const [selectedType, setSelectedType] = useState("全部");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(320, entry.contentRect.width), height: Math.max(540, entry.contentRect.height) }));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!project) return { nodes: [], links: [] };
    const entities = [
      { id: `project:${project.id}`, rawId: project.id, type: "project", label: project.name, val: 14 },
      ...milestones.filter((item) => item.status !== "archived").map((item) => ({ id: `milestone:${item.id}`, rawId: item.id, type: "milestone", label: item.title, val: 9 })),
      ...plans.filter((item) => item.status !== "archived").map((item) => ({ id: `plan:${item.id}`, rawId: item.id, type: "plan", label: item.title, val: 7 })),
      ...tasks.filter((item) => item.status !== "archived").map((item) => ({ id: `task:${item.id}`, rawId: item.id, type: "task", label: item.title, val: 5 })),
      ...ideas.filter((item) => item.status !== "archived").map((item) => ({ id: `idea:${item.id}`, rawId: item.id, type: "idea", label: item.title, val: 5 })),
    ];
    const ids = new Set(entities.map((item) => item.id));
    const edges = [
      ...milestones.map((item) => ({ source: `project:${item.projectId}`, target: `milestone:${item.id}`, relation: "contains" })),
      ...plans.map((item) => ({ source: `milestone:${item.milestoneId}`, target: `plan:${item.id}`, relation: "contains" })),
      ...tasks.map((item) => ({ source: `plan:${item.planId}`, target: `task:${item.id}`, relation: "contains" })),
      ...links.map((item) => ({ source: `${item.sourceType}:${item.sourceId}`, target: `${item.targetType}:${item.targetId}`, relation: item.relation })),
    ].filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    const nodes = selectedType === "全部" ? entities : entities.filter((item) => item.type === selectedType || item.type === "project");
    const visible = new Set(nodes.map((item) => item.id));
    return { nodes, links: edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)) };
  }, [project, milestones, plans, tasks, ideas, links, selectedType]);

  const focusNode = (node) => {
    setSelected(node);
    const distance = 95;
    const ratio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
    graphRef.current?.cameraPosition({ x: (node.x || 1) * ratio, y: (node.y || 1) * ratio, z: (node.z || 1) * ratio }, node, 800);
  };

  const selectedRelations = selected ? graphData.links.filter((link) => (link.source.id || link.source) === selected.id || (link.target.id || link.target) === selected.id) : [];

  return (
    <div className="project-content project-graph-view">
      <div className="view-heading"><div><span className="eyebrow">项目范围 · 同一 EntityLink 数据源</span><h2>项目关系图</h2><p>层级关系和双向链接一起呈现；点击节点可以查看它与里程碑、任务、想法和证据的连接。</p></div><div className="project-graph-filters">{["全部", "milestone", "plan", "task", "idea"].map((type) => <button type="button" key={type} className={selectedType === type ? "active" : ""} onClick={() => setSelectedType(type)}><i style={{ background: type === "全部" ? "#dfe4f4" : graphColors[type] }} />{type === "全部" ? "全部" : type}</button>)}</div></div>
      <section className="project-graph-shell">
        <div className="project-graph-canvas" ref={containerRef}><ForceGraph3D ref={graphRef} width={size.width} height={size.height} graphData={graphData} backgroundColor="#0b1020" nodeLabel={(node) => `${node.label} · ${node.type}`} nodeColor={(node) => graphColors[node.type] || "#8b97ad"} nodeVal={(node) => node.val} linkColor={() => "rgba(143,159,205,.48)"} linkWidth={1.25} linkDirectionalParticles={2} linkDirectionalParticleWidth={1.4} linkDirectionalParticleColor={() => "#7f91ff"} showNavInfo={false} onNodeClick={focusNode} /><div className="project-graph-help"><Cube size={15} />拖动旋转 · 滚轮缩放 · 点击聚焦</div></div>
        <aside className="project-graph-detail">{selected ? <><span className="detail-type" style={{ color: graphColors[selected.type] }}>{selected.type}</span><h2>{selected.label}</h2><p>实体 ID：{selected.rawId}</p><div><strong>当前视图关系</strong>{selectedRelations.map((link, index) => <span key={`${link.relation}-${index}`}><Graph size={14} /><em>{link.relation}</em><small>{(link.source.id || link.source) === selected.id ? (link.target.label || link.target) : (link.source.label || link.source)}</small></span>)}</div>{selected.type === "idea" && <button className="primary-small" type="button" onClick={() => onSectionChange("ideas")}>打开想法库 <ArrowRight size={16} /></button>}{selected.type === "task" && <button className="primary-small" type="button" onClick={() => onSectionChange("tasks")}>打开任务 <ArrowRight size={16} /></button>}</> : <div className="project-graph-empty"><TreeStructure size={30} weight="duotone" /><strong>选择一个节点</strong><span>查看它的一跳关系与来源。</span></div>}<div className="project-graph-summary"><span><strong>{graphData.nodes.length}</strong><small>节点</small></span><span><strong>{graphData.links.length}</strong><small>关系</small></span><span><Sparkle size={18} /><small>实时数据</small></span></div></aside>
      </section>
    </div>
  );
}
