import { useMemo, useState } from "react";
import { ArrowRight, Check, Clock, GitDiff, Robot, ShieldCheck, Sparkle, Warning, X } from "@phosphor-icons/react";

const kindLabels = { organize: "整理", schedule: "排程", convert: "转化", link: "关系", status_change: "状态" };
const riskLabels = { low: "低风险", medium: "需留意", high: "高风险" };

export function DecisionCenterView({ items, onDecide, pendingId, onToast }) {
  const [risk, setRisk] = useState("全部");
  const shown = useMemo(() => items.filter((item) => risk === "全部" || item.risk === risk), [items, risk]);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draftChanges, setDraftChanges] = useState([]);
  const [draftCommand, setDraftCommand] = useState(null);
  const selected = shown.find((item) => item.id === selectedId) || shown[0] || null;

  const selectProposal = (id) => { setSelectedId(id); setEditing(false); };
  const beginEditing = () => {
    if (!selected) return;
    setDraftChanges(structuredClone(selected.changes));
    setDraftCommand(selected.command ? structuredClone(selected.command) : null);
    setEditing(true);
  };

  const decide = async (decision) => {
    if (!selected) return;
    try {
      const result = await onDecide(selected.id, {
        decision,
        ...(decision === "modified" ? { changes: draftChanges, command: draftCommand ? normalizeCommand(draftCommand) : null } : {}),
      });
      onToast(decision === "rejected" ? "已拒绝 Proposal，原始证据仍保留" : result.executionStatus === "applied" ? "已接受并在同一事务中执行命令，审计事件已写入" : "已记录你的决定；该建议没有机器可执行命令，项目结构未被改动");
      setSelectedId(null);
      setEditing(false);
    } catch (error) {
      onToast(`决策保存失败：${error.message}`);
    }
  };

  return (
    <div className="product-page decision-page">
      <section className="decision-intro">
        <div><span className="eyebrow">Organizer · 只读分析结果</span><h1>待决策中心</h1><p>Agent 只负责收集证据和提出变更；会改变项目结构、排程或状态的动作都在这里由你确认。</p></div>
        <div className="decision-metrics"><span><strong>{items.length}</strong><small>待处理</small></span><span><strong>{items.filter((item) => item.risk !== "low").length}</strong><small>需留意</small></span><span><ShieldCheck size={20} /><small>所有决定可审计</small></span></div>
      </section>
      <section className="decision-toolbar"><div>{[["全部", "全部"], ["low", "低风险"], ["medium", "需留意"], ["high", "高风险"]].map(([id, label]) => <button type="button" key={id} className={risk === id ? "active" : ""} onClick={() => setRisk(id)}>{label}<em>{id === "全部" ? items.length : items.filter((item) => item.risk === id).length}</em></button>)}</div><span><Clock size={16} />按最需要注意的变更排序</span></section>
      <section className="decision-layout">
        <div className="proposal-list card-surface">
          <div className="proposal-list-head"><strong>Proposal</strong><span>{shown.length} 个</span></div>
          {shown.map((item) => <button type="button" key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => selectProposal(item.id)}><span className={`proposal-kind ${item.kind}`}><Sparkle size={17} weight="duotone" /></span><span><span><em>{kindLabels[item.kind]}</em><i className={item.risk}>{riskLabels[item.risk]}</i></span><strong>{item.title}</strong><small>{item.projectId || "全局"} · {item.createdBy}</small></span><ArrowRight size={15} /></button>)}
          {!shown.length && <div className="proposal-empty"><Check size={24} /><strong>当前筛选下没有待决策项</strong><span>新事件到达后会自动出现在这里。</span></div>}
        </div>
        <article className="proposal-detail card-surface">
          {selected ? <>
            <header><span className={`proposal-kind ${selected.kind}`}><Robot size={20} weight="duotone" /></span><div><span>{kindLabels[selected.kind]} Proposal · {riskLabels[selected.risk]}</span><h2>{selected.title}</h2></div></header>
            <p>{selected.summary}</p>
            <section className={`proposal-changes ${editing ? "editing" : ""}`}><div><GitDiff size={18} /><strong>{editing ? "编辑确认后的实际变更" : selected.command ? "接受后将原子执行" : "建议的变更（当前仅供确认）"}</strong></div>{(editing ? draftChanges : selected.changes).map((change, index) => <div className="proposal-change" key={`${change.action}-${index}`}><span>{index + 1}</span><div><strong>{change.action} · {change.entityType}</strong>{editing ? <textarea aria-label={`变更 ${index + 1} 说明`} value={change.summary} onChange={(event) => setDraftChanges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, summary: event.target.value } : item))} /> : <p>{change.summary}</p>}</div></div>)}</section>
            {!editing && selected.command?.type === "organize_mindmap" && <CommandEditor command={selected.command} onChange={() => {}} readOnly />}
            {editing && draftCommand && <CommandEditor command={draftCommand} onChange={setDraftCommand} />}
            <section className="proposal-evidence"><div><ShieldCheck size={18} /><strong>依据与证据</strong></div>{selected.evidence.map((evidence) => <span key={evidence}><Check size={14} />{evidence}</span>)}</section>
            {selected.risk !== "low" && <div className="proposal-warning"><Warning size={19} weight="fill" /><span><strong>确认前请查看影响</strong><small>此 Proposal 会影响其他项目的注意力预算或结构。</small></span></div>}
            {!selected.command && <div className="proposal-warning neutral"><ShieldCheck size={19} /><span><strong>这是一条非执行型建议</strong><small>接受只记录决策，不会假装创建任务、时间块或链接。</small></span></div>}
            <footer>{editing ? <><button type="button" disabled={pendingId === selected.id} onClick={() => setEditing(false)}><X size={16} />取消修改</button><button className="primary-small" type="button" disabled={pendingId === selected.id || draftChanges.some((change) => !change.summary.trim())} onClick={() => decide("modified")}><GitDiff size={16} />{pendingId === selected.id ? "执行中…" : "确认修改并接受"}</button></> : <><button type="button" disabled={pendingId === selected.id} onClick={() => decide("rejected")}><X size={16} />拒绝</button><button type="button" disabled={pendingId === selected.id} onClick={beginEditing}><GitDiff size={16} />修改后接受</button><button className="primary-small" type="button" disabled={pendingId === selected.id} onClick={() => decide("accepted")}><Check size={16} />{pendingId === selected.id ? "保存中…" : "接受"}</button></>}</footer>
          </> : <div className="proposal-empty large"><ShieldCheck size={32} /><strong>没有待处理 Proposal</strong><span>Organizer 的分析不会直接修改项目。</span></div>}
        </article>
      </section>
    </div>
  );
}

function normalizeCommand(command) {
  if ((command.type === "convert_inbox_to_entity" || command.type === "convert_inbox_to_idea") && !command.title?.trim()) {
    const next = { ...command };
    delete next.title;
    return next;
  }
  return command;
}

function localDateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function CommandEditor({ command, onChange, readOnly = false }) {
  if (command.type === "convert_inbox_to_entity" || command.type === "convert_inbox_to_idea") {
    const targetLabels = { idea: "想法", milestone: "里程碑", plan: "计划", task: "任务" };
    const target = command.type === "convert_inbox_to_idea" ? "想法" : targetLabels[command.targetType];
    return <section className="proposal-command-editor"><div><ShieldCheck size={18} /><span><strong>执行参数</strong><small>目标层级保持不变，只修改最终创建的内容。</small></span><em>转为{target}</em></div><label><span>新实体标题</span><input aria-label="新实体标题" value={command.title || ""} onChange={(event) => onChange({ ...command, title: event.target.value })} placeholder="留空则沿用 Inbox 标题" /></label><label><span>内容说明</span><textarea aria-label="新实体内容说明" value={command.body || ""} onChange={(event) => onChange({ ...command, body: event.target.value })} placeholder="留空则沿用 Inbox 原始说明" /></label></section>;
  }
  if (command.type === "create_time_block") {
    const update = (patch) => onChange({ ...command, input: { ...command.input, ...patch } });
    return <section className="proposal-command-editor"><div><Clock size={18} /><span><strong>时间块参数</strong><small>调整后仍会校验起止时间与项目边界。</small></span><em>排程</em></div><label><span>时间块标题</span><input aria-label="时间块标题" value={command.input.title} onChange={(event) => update({ title: event.target.value })} /></label><div className="proposal-command-grid"><label><span>开始时间</span><input aria-label="时间块开始时间" type="datetime-local" value={localDateTime(command.input.startAt)} onChange={(event) => update({ startAt: new Date(event.target.value).toISOString() })} /></label><label><span>结束时间</span><input aria-label="时间块结束时间" type="datetime-local" value={localDateTime(command.input.endAt)} onChange={(event) => update({ endAt: new Date(event.target.value).toISOString() })} /></label><label><span>能量要求</span><select aria-label="时间块能量要求" value={command.input.energy} onChange={(event) => update({ energy: event.target.value })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label></div></section>;
  }
  if (command.type === "organize_mindmap") {
    const operationLabels = {
      create_node: (operation) => `创建主题“${operation.node.title}”`,
      update_node: (operation) => `更新节点 ${operation.nodeId.slice(0, 8)}`,
      move_node: (operation) => `移动节点 ${operation.nodeId.slice(0, 8)} → 父节点 ${operation.parentId.slice(0, 8)}`,
      merge_nodes: (operation) => `合并节点 ${operation.sourceNodeId.slice(0, 8)} → ${operation.targetNodeId.slice(0, 8)}`,
      delete_branch: (operation) => `删除分支 ${operation.nodeId.slice(0, 8)}`,
    };
    return <section className="proposal-command-editor"><div><TreeStructureIcon /><span><strong>思维导图结构命令</strong><small>基于 revision {command.expectedRevision}；任一命令失败或 revision 已变化时整单回滚。</small></span><em>{command.operations.length} 条</em></div><div className="proposal-command-operations">{command.operations.map((operation, index) => <span key={`${operation.type}-${index}`}><b>{index + 1}</b>{operationLabels[operation.type](operation)}</span>)}</div>{!readOnly && <small>结构命令保持只读；可修改上方变更说明后接受，或返回拒绝。</small>}</section>;
  }
  return null;
}

function TreeStructureIcon() {
  return <GitDiff size={18} />;
}
