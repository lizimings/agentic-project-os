import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import { ArrowCounterClockwise, ArrowRight, Cube, Graph, MagnifyingGlass, Sparkle, TreeStructure } from "@phosphor-icons/react";
import { useKnowledgeGraph } from "./useCoreData.js";

const colors = { project: "#4057f4", milestone: "#8b5cf6", plan: "#22a97a", task: "#f2a03d", idea: "#ec5fa0", worktree: "#43b6e8", commit: "#65d49a", canvas_node: "#a879ff", inbox_item: "#7b88a2", proposal: "#e95c68", remote_repository: "#2ea96f", agent: "#6f7dff", human: "#27b894" };

export function ProjectGraphLive({ project, onSectionChange }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 610 });
  const [selectedType, setSelectedType] = useState("全部");
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [search, setSearch] = useState("");
  const graph = useKnowledgeGraph({ projectId: project.id, ...(focus ? { focusType: focus.entityType, focusId: focus.rawId, depth: focus.depth } : {}) });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(320, entry.contentRect.width), height: Math.max(540, entry.contentRect.height) }));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  const types = useMemo(() => [...new Set(graph.nodes.map((node) => node.type))], [graph.nodes]);
  const graphData = useMemo(() => {
    const nodes = selectedType === "全部" ? graph.nodes : graph.nodes.filter((node) => node.type === selectedType || node.type === "project");
    const ids = new Set(nodes.map((node) => node.id));
    return { nodes: nodes.map((node) => ({ ...node })), links: graph.links.filter((link) => ids.has(typeof link.source === "object" ? link.source.id : link.source) && ids.has(typeof link.target === "object" ? link.target.id : link.target)).map((link) => ({ ...link })) };
  }, [graph.nodes, graph.links, selectedType]);
  const searchMatches = useMemo(() => search.trim() ? graph.nodes.filter((node) => `${node.label} ${node.meta}`.toLocaleLowerCase("zh-CN").includes(search.trim().toLocaleLowerCase("zh-CN"))).slice(0, 8) : [], [graph.nodes, search]);
  const focusNode = (node) => {
    setSelected(node);
    const distance = 95;
    const ratio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
    graphRef.current?.cameraPosition({ x: (node.x || 1) * ratio, y: (node.y || 1) * ratio, z: (node.z || 1) * ratio }, node, 800);
  };
  const nodeById = new Map(graphData.nodes.map((node) => [node.id, node]));
  const selectedRelations = selected ? graphData.links.filter((link) => (link.source.id || link.source) === selected.id || (link.target.id || link.target) === selected.id) : [];
  const openSelected = () => {
    const section = { milestone: "milestones", plan: "milestones", task: "tasks", idea: "ideas", worktree: "worktrees", commit: "worktrees", canvas_node: selected?.status === "mindmap" ? "mindmap" : "overview", inbox_item: "inbox", remote_repository: "settings" }[selected?.type];
    if (section) onSectionChange(section);
  };
  return <div className="project-content project-graph-view"><div className="view-heading"><div><span className="eyebrow">项目范围 · {graph.totalNodes} 个实体 · {graph.totalLinks} 条关系</span><h2>项目关系图</h2><p>直接复用全局知识图谱数据，覆盖层级、工作树、Actor、画布和双向链接；支持显式一跳/二跳聚焦。</p></div><div className="project-graph-controls"><label><MagnifyingGlass size={14} /><input aria-label="搜索项目关系图" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索节点…" /></label>{search.trim() && <div className="project-graph-search-results">{searchMatches.map((node) => <button type="button" key={node.id} onClick={() => { focusNode(node); setSearch(""); }}><i style={{ background: colors[node.type] || "#8b97ad" }} /><span><strong>{node.label}</strong><small>{node.type}</small></span></button>)}{!searchMatches.length && <em>没有匹配节点</em>}</div>}<div className="project-graph-filters"><button type="button" className={selectedType === "全部" ? "active" : ""} onClick={() => setSelectedType("全部")}><i style={{ background: "#dfe4f4" }} />全部</button>{types.map((type) => <button type="button" key={type} className={selectedType === type ? "active" : ""} onClick={() => setSelectedType(type)}><i style={{ background: colors[type] || "#8b97ad" }} />{type}</button>)}</div></div></div><section className="project-graph-shell"><div className="project-graph-canvas" ref={containerRef}><ForceGraph3D ref={graphRef} width={size.width} height={size.height} graphData={graphData} backgroundColor="#0b1020" nodeLabel={(node) => `${node.label} · ${node.type}`} nodeColor={(node) => colors[node.type] || "#8b97ad"} nodeVal={(node) => node.val} linkColor={() => "rgba(143,159,205,.48)"} linkWidth={1.25} linkDirectionalParticles={2} linkDirectionalParticleWidth={1.4} linkDirectionalParticleColor={() => "#7f91ff"} showNavInfo={false} onNodeClick={focusNode} /><div className="project-graph-help"><Cube size={15} />拖动旋转 · 点击节点后展开一跳或二跳{focus && <button type="button" onClick={() => { setFocus(null); setSelected(null); }}><ArrowCounterClockwise size={13} />返回完整项目图</button>}</div></div><aside className="project-graph-detail">{selected ? <><span className="detail-type" style={{ color: colors[selected.type] || "#8b97ad" }}>{selected.type}</span><h2>{selected.label}</h2><p>{selected.meta || `实体 ID：${selected.rawId}`}</p><div className="project-hop-actions"><button type="button" className={focus?.depth === 1 ? "active" : ""} onClick={() => setFocus({ entityType: selected.id.split(":")[0], rawId: selected.rawId, depth: 1 })}>一跳关系</button><button type="button" className={focus?.depth === 2 ? "active" : ""} onClick={() => setFocus({ entityType: selected.id.split(":")[0], rawId: selected.rawId, depth: 2 })}>二跳关系</button></div><div><strong>当前视图关系</strong>{selectedRelations.map((link) => { const sourceId = link.source.id || link.source; const targetId = link.target.id || link.target; const neighbor = nodeById.get(sourceId === selected.id ? targetId : sourceId); return <button type="button" key={link.id} onClick={() => neighbor && focusNode(neighbor)}><Graph size={14} /><em>{link.relation}</em><small>{neighbor?.label || "关联实体"}</small></button>; })}</div>{["milestone", "plan", "task", "idea", "worktree", "canvas_node", "inbox_item", "remote_repository"].includes(selected.type) && <button className="primary-small" type="button" onClick={openSelected}>打开关联视图 <ArrowRight size={16} /></button>}</> : <div className="project-graph-empty"><TreeStructure size={30} weight="duotone" /><strong>选择一个节点</strong><span>查看关系并按一跳或二跳收敛上下文。</span></div>}<div className="project-graph-summary"><span><strong>{graphData.nodes.length}</strong><small>节点</small></span><span><strong>{graphData.links.length}</strong><small>关系</small></span><span><Sparkle size={18} /><small>{focus ? `${focus.depth} 跳聚焦` : "完整项目"}</small></span></div></aside></section></div>;
}
