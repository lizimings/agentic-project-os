import { useEffect, useMemo, useState } from "react";
import { CalendarBlank, CaretRight, CheckCircle, FolderOpen, LinkSimple, ListChecks, Plus, Robot, User, Warning, X } from "@phosphor-icons/react";

const statusLabels = { todo: "待开始", in_progress: "进行中", blocked: "受阻", done: "已完成" };
const priorityLabels = { low: "低", medium: "中", high: "高", urgent: "紧急" };

function formatDate(value, fallback = "未安排") {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function actorLabel(actor) {
  return actor ? `${actor.name} · ${actor.provider}` : "未分配";
}

function TaskEditor({ task, tasks, actors, links, onClose, onUpdate, onArchive, onCreateLink, onDeleteLink, onToast }) {
  const activeTasks = tasks.filter((item) => item.status !== "archived" && item.id !== task.id);
  const currentDependencies = links.filter((link) => link.sourceType === "task" && link.sourceId === task.id && link.targetType === "task" && link.relation === "dependsOn");
  const [draft, setDraft] = useState({
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeType: task.assigneeType,
    assigneeId: task.assigneeId ?? "",
    dueAt: task.dueAt ? task.dueAt.slice(0, 10) : "",
    estimateMinutes: task.estimateMinutes ?? "",
    parentTaskId: task.parentTaskId ?? "",
    dependencies: new Set(currentDependencies.map((link) => link.targetId)),
  });
  const [saving, setSaving] = useState(false);
  const availableActors = actors.filter((actor) => actor.kind === draft.assigneeType);
  const toggleDependency = (id) => setDraft((current) => {
    const dependencies = new Set(current.dependencies);
    if (dependencies.has(id)) dependencies.delete(id); else dependencies.add(id);
    return { ...current, dependencies };
  });
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onUpdate(task.id, {
        title: draft.title,
        description: draft.description,
        status: draft.status,
        priority: draft.priority,
        assigneeType: draft.assigneeType,
        assigneeId: draft.assigneeType === "unassigned" ? null : draft.assigneeId,
        dueAt: draft.dueAt ? new Date(`${draft.dueAt}T12:00:00`).toISOString() : null,
        estimateMinutes: draft.estimateMinutes === "" ? null : Number(draft.estimateMinutes),
        parentTaskId: draft.parentTaskId || null,
      });
      const existingIds = new Set(currentDependencies.map((link) => link.targetId));
      const removals = currentDependencies.filter((link) => !draft.dependencies.has(link.targetId)).map((link) => onDeleteLink(link.id));
      const additions = [...draft.dependencies].filter((id) => !existingIds.has(id)).map((id) => onCreateLink({ sourceType: "task", sourceId: task.id, targetType: "task", targetId: id, relation: "dependsOn", label: "task:dependency" }));
      await Promise.all([...removals, ...additions]);
      onToast("任务详情、负责人和依赖关系已保存");
      onClose();
    } catch (error) { onToast(`保存失败：${error.message}`); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop"><form className="task-detail-modal" role="dialog" aria-modal="true" aria-labelledby="task-detail-title" onSubmit={save}><button className="modal-close" type="button" aria-label="关闭任务详情" onClick={onClose}><X size={18} /></button><div><span className="eyebrow">Task · {task.id.slice(0, 8)}</span><h2 id="task-detail-title">编辑任务详情</h2><p>任务属性和依赖均写入稳定实体；负责人从 Actor 注册表中选择。</p></div><label className="wide"><span>任务名称</span><input aria-label="任务名称" required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className="wide"><span>完成定义 / 描述</span><textarea aria-label="任务描述" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="task-detail-grid"><label><span>状态</span><select aria-label="任务状态" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><span>优先级</span><select aria-label="任务优先级" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>{Object.entries(priorityLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><span>负责人类型</span><select aria-label="负责人类型" value={draft.assigneeType} onChange={(event) => { const kind = event.target.value; setDraft({ ...draft, assigneeType: kind, assigneeId: kind === "unassigned" ? "" : actors.find((actor) => actor.kind === kind)?.id ?? "" }); }}><option value="unassigned">未分配</option><option value="human">人类</option><option value="agent">Agent</option></select></label><label><span>负责人实体</span><select aria-label="负责人实体" value={draft.assigneeId} disabled={draft.assigneeType === "unassigned"} required={draft.assigneeType !== "unassigned"} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}><option value="">选择负责人</option>{availableActors.map((actor) => <option key={actor.id} value={actor.id}>{actorLabel(actor)} · {actor.status}</option>)}</select></label><label><span>截止日期</span><input aria-label="任务截止日期" type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label><label><span>预估分钟</span><input aria-label="任务预估分钟" type="number" min="0" value={draft.estimateMinutes} onChange={(event) => setDraft({ ...draft, estimateMinutes: event.target.value })} /></label><label className="wide"><span>父任务</span><select aria-label="父任务" value={draft.parentTaskId} onChange={(event) => setDraft({ ...draft, parentTaskId: event.target.value })}><option value="">无父任务</option>{activeTasks.filter((item) => item.planId === task.planId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div><fieldset className="task-dependencies"><legend>依赖任务</legend><p>依赖项未完成时，这个任务会显示真实阻塞提示。</p>{activeTasks.map((item) => <label key={item.id}><input type="checkbox" checked={draft.dependencies.has(item.id)} onChange={() => toggleDependency(item.id)} /><span><strong>{item.title}</strong><small>{statusLabels[item.status] ?? item.status}</small></span></label>)}{!activeTasks.length && <em>当前没有可选择的其他任务</em>}</fieldset><footer><button className="danger-quiet" type="button" disabled={saving} onClick={async () => { try { await onArchive(task.id); onToast("任务已归档"); onClose(); } catch (error) { onToast(`归档失败：${error.message}`); } }}>归档任务</button><div><button type="button" onClick={onClose}>取消</button><button className="primary-small" type="submit" disabled={saving || !draft.title.trim() || (draft.assigneeType !== "unassigned" && !draft.assigneeId)}>{saving ? "保存中…" : "保存任务"}</button></div></footer></form></div>;
}

export function TaskManagementView({ projectId, milestones, plans, tasks, actors, links, onCreate, onUpdate, onArchive, onCreateLink, onDeleteLink, pending, onToast }) {
  const [mode, setMode] = useState("层级");
  const [creating, setCreating] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [draggedId, setDraggedId] = useState(null);
  const [dropStatus, setDropStatus] = useState(null);
  const activeMilestones = milestones.filter((item) => item.status !== "archived");
  const activePlans = plans.filter((item) => item.status !== "archived");
  const activeTasks = tasks.filter((item) => item.status !== "archived");
  const [draft, setDraft] = useState({ title: "", planId: activePlans[0]?.id ?? "", assigneeType: "unassigned", assigneeId: "", priority: "medium", dueAt: "" });
  useEffect(() => { if (activePlans.length && !activePlans.some((plan) => plan.id === draft.planId)) setDraft((current) => ({ ...current, planId: activePlans[0].id })); }, [plans, draft.planId]);
  const grouped = useMemo(() => Object.fromEntries(Object.keys(statusLabels).map((status) => [status, activeTasks.filter((item) => item.status === status)])), [tasks]);
  const planById = Object.fromEntries(activePlans.map((plan) => [plan.id, plan]));
  const milestoneById = Object.fromEntries(activeMilestones.map((milestone) => [milestone.id, milestone]));
  const actorById = Object.fromEntries(actors.map((actor) => [actor.id, actor]));
  const taskById = Object.fromEntries(activeTasks.map((task) => [task.id, task]));
  const dependencies = (taskId) => links.filter((link) => link.sourceType === "task" && link.sourceId === taskId && link.targetType === "task" && link.relation === "dependsOn").map((link) => taskById[link.targetId]).filter(Boolean);
  const blockers = (taskId) => dependencies(taskId).filter((task) => task.status !== "done");
  const selectedTask = activeTasks.find((task) => task.id === selectedTaskId) ?? null;
  const hierarchyRows = activePlans.flatMap((plan) => [{ ...plan, type: "plan" }, ...activeTasks.filter((task) => task.planId === plan.id).map((task) => ({ ...task, type: "task" }))]);
  const toggleSelected = (id) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const createTask = async (event) => {
    event.preventDefault();
    const plan = planById[draft.planId];
    if (!plan) return onToast("请先在里程碑中创建阶段计划");
    try {
      await onCreate({ projectId, milestoneId: plan.milestoneId, planId: plan.id, parentTaskId: null, title: draft.title, description: "", status: "todo", priority: draft.priority, assigneeType: draft.assigneeType, assigneeId: draft.assigneeType === "unassigned" ? null : draft.assigneeId, dueAt: draft.dueAt ? new Date(`${draft.dueAt}T12:00:00`).toISOString() : null, estimateMinutes: null, position: activeTasks.filter((item) => item.planId === plan.id).length });
      setDraft((current) => ({ ...current, title: "", dueAt: "" })); setCreating(false); onToast("任务已创建并写入负责人关系");
    } catch (error) { onToast(`创建失败：${error.message}`); }
  };
  const changeStatus = async (task, status) => { if (task.status === status) return; try { await onUpdate(task.id, { status }); onToast(`“${task.title}”已移动到${statusLabels[status]}`); } catch (error) { onToast(`移动失败，已恢复原状态：${error.message}`); } };
  const drop = async (status) => { const task = activeTasks.find((item) => item.id === draggedId); setDraggedId(null); setDropStatus(null); if (task) await changeStatus(task, status); };
  const batch = async (action) => {
    const chosen = activeTasks.filter((task) => selectedIds.has(task.id));
    try { await Promise.all(chosen.map((task) => action === "archive" ? onArchive(task.id) : onUpdate(task.id, { status: action }))); setSelectedIds(new Set()); onToast(`已批量处理 ${chosen.length} 个任务`); }
    catch (error) { onToast(`批量操作失败：${error.message}`); }
  };
  const availableActors = actors.filter((actor) => actor.kind === draft.assigneeType);

  return <div className="project-content tasks-view"><div className="view-heading"><div><span className="eyebrow">Project → Milestone → Plan → Task · 关系驱动</span><h2>任务与计划</h2><p>层级、看板、负责人、期限和依赖共享同一份持久化数据；拖动失败会恢复原状态。</p></div><div className="view-heading-actions"><div className="segmented">{["层级", "看板"].map((item) => <button type="button" key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item}</button>)}</div><button className="primary-small" type="button" onClick={() => setCreating((value) => !value)}><Plus size={17} />新建任务</button></div></div>{creating && <form className="entity-composer task-composer card-surface" onSubmit={createTask}><label className="wide"><span>任务名称</span><input aria-label="新任务名称" autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="写清楚可验证的完成结果" /></label><label><span>所属计划</span><select aria-label="新任务计划" required value={draft.planId} onChange={(event) => setDraft({ ...draft, planId: event.target.value })}>{activePlans.map((plan) => <option key={plan.id} value={plan.id}>{milestoneById[plan.milestoneId]?.title} / {plan.title}</option>)}</select></label><label><span>优先级</span><select aria-label="新任务优先级" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>{Object.entries(priorityLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><span>负责人类型</span><select aria-label="新任务负责人类型" value={draft.assigneeType} onChange={(event) => { const kind = event.target.value; setDraft({ ...draft, assigneeType: kind, assigneeId: kind === "unassigned" ? "" : actors.find((actor) => actor.kind === kind)?.id ?? "" }); }}><option value="unassigned">未分配</option><option value="human">人类</option><option value="agent">Agent</option></select></label>{draft.assigneeType !== "unassigned" && <label><span>负责人实体</span><select aria-label="新任务负责人" required value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}><option value="">选择负责人</option>{availableActors.map((actor) => <option key={actor.id} value={actor.id}>{actorLabel(actor)}</option>)}</select></label>}<label><span>截止日期</span><input aria-label="新任务截止日期" type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label><div><button type="button" onClick={() => setCreating(false)}>取消</button><button className="primary-small" type="submit" disabled={pending || !draft.title.trim() || !draft.planId || (draft.assigneeType !== "unassigned" && !draft.assigneeId)}>创建任务</button></div></form>}{selectedIds.size > 0 && <div className="task-batch-bar"><strong>已选择 {selectedIds.size} 个任务</strong><button type="button" onClick={() => batch("in_progress")}>移到进行中</button><button type="button" onClick={() => batch("done")}>标记完成</button><button type="button" onClick={() => batch("archive")}>归档</button><button type="button" onClick={() => setSelectedIds(new Set())}>取消选择</button></div>}{mode === "层级" ? <section className="task-hierarchy card-surface"><div className="hierarchy-head real"><span>选择 / 名称</span><span>层级 / 里程碑</span><span>负责人</span><span>截止</span><span>状态</span></div>{hierarchyRows.map((item) => { const isPlan = item.type === "plan"; const itemTasks = isPlan ? activeTasks.filter((task) => task.planId === item.id) : []; const progress = isPlan ? (itemTasks.length ? Math.round(itemTasks.filter((task) => task.status === "done").length / itemTasks.length * 100) : 0) : 0; const blockedBy = isPlan ? [] : blockers(item.id); return <div className={`hierarchy-row ${item.type}`} key={`${item.type}-${item.id}`}>{isPlan ? <span className="task-name"><FolderOpen size={17} weight="fill" /><span><strong>{item.title}</strong><small>{itemTasks.length} 个任务 · {progress}% 完成</small></span></span> : <span className="task-name"><input aria-label={`选择${item.title}`} type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelected(item.id)} /><button type="button" onClick={() => setSelectedTaskId(item.id)}><CheckCircle size={17} weight={item.status === "done" ? "fill" : "regular"} /><span><strong>{item.title}</strong><small>↳ {planById[item.planId]?.title}{blockedBy.length ? ` · 被 ${blockedBy.length} 项依赖阻塞` : ""}</small></span></button></span>}<span><em>{isPlan ? "Plan" : "Task"}</em>{milestoneById[item.milestoneId]?.title ?? "—"}</span><span>{isPlan ? `${itemTasks.length} 个任务` : actorLabel(actorById[item.assigneeId])}</span><span>{isPlan ? "—" : formatDate(item.dueAt)}</span><span>{isPlan ? <><span className="progress-track"><span style={{ width: `${progress}%` }} /></span><em>{progress}%</em></> : <select aria-label={`${item.title}状态`} value={item.status} disabled={pending} onChange={(event) => changeStatus(item, event.target.value)}>{Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>}</span>{isPlan ? <CaretRight size={15} /> : <button className="row-archive" type="button" aria-label={`打开${item.title}详情`} onClick={() => setSelectedTaskId(item.id)}><CaretRight size={14} /></button>}</div>; })}{!hierarchyRows.length && <div className="entity-empty"><ListChecks size={24} /><strong>还没有任务层级</strong><span>先创建里程碑和计划，再添加一个明确任务。</span></div>}</section> : <section className="task-board four-columns">{Object.entries(grouped).map(([status, items]) => <div className={`task-column card-surface ${status} ${dropStatus === status ? "drop-target" : ""}`} key={status} onDragOver={(event) => { event.preventDefault(); setDropStatus(status); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropStatus(null); }} onDrop={(event) => { event.preventDefault(); void drop(status); }}><div><strong>{statusLabels[status]}</strong><em>{items.length}</em><button type="button" aria-label={`在${statusLabels[status]}中新建`} onClick={() => setCreating(true)}><Plus size={16} /></button></div>{items.map((task) => { const blockedBy = blockers(task.id); const actor = actorById[task.assigneeId]; return <article key={task.id} draggable onDragStart={(event) => { setDraggedId(task.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); }} onDragEnd={() => { setDraggedId(null); setDropStatus(null); }} className={`${draggedId === task.id ? "dragging" : ""} ${blockedBy.length ? "dependency-blocked" : ""}`}><button className="task-card-main" type="button" onClick={() => setSelectedTaskId(task.id)}><span>{milestoneById[task.milestoneId]?.title}</span><h3>{task.title}</h3><p>{planById[task.planId]?.title || "项目计划"}</p>{blockedBy.length > 0 && <small className="blocker-chip"><Warning size={12} />等待：{blockedBy.map((item) => item.title).join("、")}</small>}<div><em>{actor?.kind === "agent" ? <Robot size={13} /> : <User size={13} />}{actorLabel(actor)}</em><small><CalendarBlank size={12} />{formatDate(task.dueAt)}</small></div></button><div className="task-card-footer"><label><input type="checkbox" aria-label={`选择${task.title}`} checked={selectedIds.has(task.id)} onChange={() => toggleSelected(task.id)} />批量</label><select aria-label={`${task.title}状态`} value={task.status} disabled={pending} onChange={(event) => changeStatus(task, event.target.value)}>{Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div></article>; })}</div>)}</section>}{selectedTask && <TaskEditor task={selectedTask} tasks={activeTasks} actors={actors} links={links} onClose={() => setSelectedTaskId(null)} onUpdate={onUpdate} onArchive={onArchive} onCreateLink={onCreateLink} onDeleteLink={onDeleteLink} onToast={onToast} />}</div>;
}
