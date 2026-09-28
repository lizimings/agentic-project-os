import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsClockwise, CalendarBlank, CalendarCheck, Check, Clock, ClockCountdown, Pause, Play, Plus, Scales, Sparkle, Target, Trash, Warning, X } from "@phosphor-icons/react";
import { useGlobalPreferences, useTimeSystem } from "./useCoreData.js";
import { StatCard } from "./StatCard.jsx";

const pad = (value) => String(value).padStart(2, "0");
const localDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localInput = (value) => { const date = new Date(value); return `${localDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`; };
const minutesBetween = (startAt, endAt) => Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000));
const durationLabel = (minutes) => minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ""}`.trim() : `${minutes}m`;
const DAY_START = 7 * 60;
const DAY_END = 22 * 60;
const PIXELS_PER_MINUTE = 0.8;
const snapMinutes = (value) => Math.round(value / 15) * 15;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const minutesOfDay = (value) => { const date = new Date(value); return date.getHours() * 60 + date.getMinutes(); };
const atMinutes = (dateKey, minutes) => { const date = new Date(`${dateKey}T00:00:00`); date.setMinutes(minutes); return date.toISOString(); };
const addLocalDays = (dateKey, amount) => { const date = new Date(`${dateKey}T12:00:00`); date.setDate(date.getDate() + amount); return localDateKey(date); };

function rangeFor(dateKey, range, weekStartsOn = "monday") {
  const anchor = new Date(`${dateKey}T00:00:00`);
  const weekAnchor = new Date(anchor);
  const weekday = weekAnchor.getDay();
  const offset = weekStartsOn === "sunday" ? weekday : (weekday || 7) - 1;
  weekAnchor.setDate(weekAnchor.getDate() - offset);
  if (range === "本周") {
    anchor.setTime(weekAnchor.getTime());
  }
  const end = new Date(anchor);
  end.setDate(end.getDate() + (range === "本周" ? 7 : 1));
  return { from: anchor.toISOString(), to: end.toISOString(), weekStart: localDateKey(weekAnchor) };
}

function BlockEditor({ block, projects, initialDate, pending, onClose, onSave, onCancel }) {
  const initialStart = block?.startAt ?? new Date(`${initialDate}T09:00:00`).toISOString();
  const initialEnd = block?.endAt ?? new Date(`${initialDate}T09:30:00`).toISOString();
  const [draft, setDraft] = useState({
    title: block?.title ?? "",
    projectId: block?.projectId ?? "",
    startAt: localInput(initialStart),
    endAt: localInput(initialEnd),
    kind: block?.kind ?? "focus",
    energy: block?.energy ?? "medium",
    status: block?.status ?? "planned",
  });
  const submit = async (event) => {
    event.preventDefault();
    await onSave({ ...draft, projectId: draft.projectId || null, taskId: block?.taskId ?? null, startAt: new Date(draft.startAt).toISOString(), endAt: new Date(draft.endAt).toISOString(), ...(block ? {} : { source: "manual" }) });
  };
  return <div className="modal-backdrop"><form className="project-editor-modal time-block-editor" role="dialog" aria-modal="true" aria-labelledby="time-block-title" onSubmit={submit}><button className="modal-close" type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button><span className="capture-modal-icon"><Clock size={23} weight="duotone" /></span><div><span className="eyebrow">时间护栏</span><h2 id="time-block-title">{block ? "调整时间块" : "安排一个可完成的时间块"}</h2><p>明确开始与结束，避免一个项目吞掉整天。</p></div><label><span>成果名称</span><input autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：完成接口验收" /></label><label><span>项目</span><select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}><option value="">系统 / 未归类</option>{projects.filter((project) => project.status !== "archived").map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><div className="project-editor-options"><label><span>开始</span><input type="datetime-local" required value={draft.startAt} onChange={(event) => setDraft({ ...draft, startAt: event.target.value })} /></label><label><span>结束</span><input type="datetime-local" required value={draft.endAt} onChange={(event) => setDraft({ ...draft, endAt: event.target.value })} /></label></div><div className="project-editor-options"><label><span>类型</span><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}><option value="focus">专注</option><option value="admin">整理</option><option value="buffer">缓冲</option></select></label><label><span>所需能量</span><select value={draft.energy} onChange={(event) => setDraft({ ...draft, energy: event.target.value })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label></div>{block && <label><span>状态</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="planned">计划中</option><option value="in_progress">进行中</option><option value="completed">已完成</option></select></label>}<div className="capture-modal-actions">{block && <button className="danger-action" type="button" disabled={pending} onClick={onCancel}><Trash size={15} />取消时间块</button>}<button type="button" onClick={onClose}>返回</button><button className="primary-small" type="submit" disabled={pending || !draft.title.trim()}>{pending ? "保存中…" : "保存时间块"}</button></div></form></div>;
}

function BudgetEditor({ project, budget, weekStart, pending, onClose, onSave }) {
  const [planned, setPlanned] = useState(budget?.plannedMinutes ?? 120);
  const [minimum, setMinimum] = useState(budget?.minimumMinutes ?? 30);
  const [maximum, setMaximum] = useState(budget?.maximumMinutes ?? 360);
  return <div className="modal-backdrop"><form className="project-editor-modal budget-editor" role="dialog" aria-modal="true" onSubmit={async (event) => { event.preventDefault(); await onSave({ projectId: project.id, weekStart, plannedMinutes: Number(planned), minimumMinutes: Number(minimum), maximumMinutes: maximum === "" ? null : Number(maximum) }); }}><button className="modal-close" type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button><span className="capture-modal-icon"><Target size={23} weight="duotone" /></span><div><span className="eyebrow">本周注意力预算</span><h2>{project.name}</h2><p>最低保障防止项目被饿死，最大上限防止单个项目吞掉全部精力。</p></div><label><span>计划分钟</span><input type="number" min="0" value={planned} onChange={(event) => setPlanned(event.target.value)} /></label><div className="project-editor-options"><label><span>最低保障</span><input type="number" min="0" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label><label><span>最大上限</span><input type="number" min="1" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></label></div><div className="capture-modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary-small" type="submit" disabled={pending}>保存预算</button></div></form></div>;
}

function CalendarCanvas({ range, date, weekStart, blocks, projects, projectName, pending, onEdit, onUpdate, onToast }) {
  const days = useMemo(() => range === "本周" ? Array.from({ length: 7 }, (_, index) => addLocalDays(weekStart, index)) : [date], [date, range, weekStart]);
  const drag = useRef(null);
  const [preview, setPreview] = useState(null);
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, index) => DAY_START / 60 + index);
  const canvasHeight = (DAY_END - DAY_START) * PIXELS_PER_MINUTE;
  const minCanvasWidth = 56 + days.length * (range === "本周" ? 116 : 320);
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  const applyKeyboard = async (event, block) => {
    if (!["ArrowUp", "ArrowDown"].includes(event.key) || !event.altKey) return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? -15 : 15;
    const start = minutesOfDay(block.startAt);
    const end = minutesOfDay(block.endAt);
    const dateKey = localDateKey(new Date(block.startAt));
    const next = event.shiftKey
      ? { startAt: block.startAt, endAt: atMinutes(dateKey, clamp(end + direction, start + 15, DAY_END)) }
      : (() => { const duration = end - start; const nextStart = clamp(start + direction, DAY_START, DAY_END - duration); return { startAt: atMinutes(dateKey, nextStart), endAt: atMinutes(dateKey, nextStart + duration) }; })();
    try { await onUpdate(block.id, next); onToast(event.shiftKey ? "时间块长度已调整 15 分钟" : "时间块已移动 15 分钟"); }
    catch (error) { onToast(`调整失败：${error.message}`); }
  };

  const pointerDown = (event, block, mode) => {
    if (pending || block.status === "completed") return;
    const canvas = event.currentTarget.closest(".calendar-columns");
    const rect = canvas.getBoundingClientRect();
    const startDateKey = localDateKey(new Date(block.startAt));
    drag.current = {
      id: block.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startMinute: minutesOfDay(block.startAt),
      endMinute: minutesOfDay(block.endAt),
      dayIndex: Math.max(0, days.indexOf(startDateKey)),
      dayWidth: rect.width / days.length,
      moved: false,
      next: { startAt: block.startAt, endAt: block.endAt },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const deltaMinutes = snapMinutes((event.clientY - active.startY) / PIXELS_PER_MINUTE);
    const dayDelta = range === "本周" ? Math.round((event.clientX - active.startX) / active.dayWidth) : 0;
    active.moved ||= Math.abs(event.clientY - active.startY) > 3 || Math.abs(event.clientX - active.startX) > 3;
    const targetDay = days[clamp(active.dayIndex + dayDelta, 0, days.length - 1)];
    if (active.mode === "resize") {
      const nextEnd = clamp(active.endMinute + deltaMinutes, active.startMinute + 15, DAY_END);
      active.next = { startAt: atMinutes(targetDay, active.startMinute), endAt: atMinutes(targetDay, nextEnd) };
    } else {
      const duration = active.endMinute - active.startMinute;
      const nextStart = clamp(active.startMinute + deltaMinutes, DAY_START, DAY_END - duration);
      active.next = { startAt: atMinutes(targetDay, nextStart), endAt: atMinutes(targetDay, nextStart + duration) };
    }
    setPreview({ id: active.id, ...active.next });
  };

  const pointerUp = async (event, block) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
    if (!active.moved) { onEdit(block); return; }
    try {
      await onUpdate(block.id, active.next);
      onToast(active.mode === "resize" ? "时间块长度已拖动保存" : "时间块位置已拖动保存");
    } catch (error) { onToast(`拖动保存失败：${error.message}`); }
  };

  return <div className={`calendar-shell ${range === "本周" ? "week" : "day"}`}>
    <div className="calendar-day-headers" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(${range === "本周" ? 116 : 320}px, 1fr))`, minWidth: minCanvasWidth }}><span />{days.map((dayKey) => <strong className={dayKey === localDateKey(new Date()) ? "today" : ""} key={dayKey}><small>{new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(new Date(`${dayKey}T12:00:00`))}</small>{new Date(`${dayKey}T12:00:00`).getDate()}</strong>)}</div>
    <div className="calendar-scroll" style={{ minWidth: minCanvasWidth }}>
      <div className="calendar-hours" style={{ height: canvasHeight }}>{hours.map((hour) => <time key={hour} style={{ top: (hour * 60 - DAY_START) * PIXELS_PER_MINUTE }}>{pad(hour)}:00</time>)}</div>
      <div className="calendar-columns" style={{ height: canvasHeight, gridTemplateColumns: `repeat(${days.length}, minmax(${range === "本周" ? 116 : 320}px, 1fr))` }}>
        {days.map((dayKey) => <div className="calendar-day-column" data-day={dayKey} key={dayKey}>{blocks.filter((source) => localDateKey(new Date((preview?.id === source.id ? preview.startAt : source.startAt))) === dayKey).map((source, index) => {
          const block = preview?.id === source.id ? { ...source, startAt: preview.startAt, endAt: preview.endAt } : source;
          const start = clamp(minutesOfDay(block.startAt), DAY_START, DAY_END);
          const end = clamp(minutesOfDay(block.endAt), start + 15, DAY_END);
          const color = projectMap.get(block.projectId)?.color ?? "#8b97ad";
          return <button type="button" className={`calendar-block ${block.status} ${preview?.id === block.id ? "dragging" : ""}`} aria-label={`${block.title}，${durationLabel(end - start)}。按 Alt 加方向键移动，Alt Shift 加方向键调整长度`} key={block.id} style={{ top: (start - DAY_START) * PIXELS_PER_MINUTE, height: Math.max(24, (end - start) * PIXELS_PER_MINUTE), left: 4 + (index % 2) * 3, right: 4, borderLeftColor: color }} onPointerDown={(event) => pointerDown(event, source, "move")} onPointerMove={pointerMove} onPointerUp={(event) => void pointerUp(event, source)} onPointerCancel={() => { drag.current = null; setPreview(null); }} onKeyDown={(event) => void applyKeyboard(event, source)}>
            <span><strong>{block.title}</strong><small>{projectName(block.projectId)} · {new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(block.startAt))}–{new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(block.endAt))}</small></span><em>{durationLabel(end - start)}</em><i className="calendar-resize-handle" title="拖动调整结束时间" onPointerDown={(event) => { event.stopPropagation(); pointerDown(event, source, "resize"); }} onPointerMove={(event) => { event.stopPropagation(); pointerMove(event); }} onPointerUp={(event) => { event.stopPropagation(); void pointerUp(event, source); }} />
          </button>;
        })}</div>)}
      </div>
    </div>
    <div className="calendar-help"><span>拖动时间块移动 · 拖动底部把手调整长度 · 15 分钟吸附</span><span>键盘：Alt + ↑↓ 移动；再按 Shift 调整长度</span></div>
  </div>;
}

export function TimeManagementView({ projects = [], onOpenProject, onToast }) {
  const [range, setRange] = useState("今天");
  const [date, setDate] = useState(localDateKey(new Date()));
  const [editor, setEditor] = useState(null);
  const [budgetProject, setBudgetProject] = useState(null);
  const [rebalanceEnergy, setRebalanceEnergy] = useState("medium");
  const [tick, setTick] = useState(Date.now());
  const globalPreferences = useGlobalPreferences();
  const boundaries = useMemo(() => rangeFor(date, range, globalPreferences.preferences?.weekStartsOn), [date, globalPreferences.preferences?.weekStartsOn, range]);
  const time = useTimeSystem(boundaries);
  useEffect(() => { if (time.error) onToast(`时间服务连接失败：${time.error.message}`); }, [time.error, onToast]);
  useEffect(() => { if (time.currentFocus?.status !== "running") return undefined; const id = window.setInterval(() => setTick(Date.now()), 1_000); return () => window.clearInterval(id); }, [time.currentFocus?.status]);

  const visibleBlocks = time.blocks.filter((block) => block.status !== "canceled");
  const plannedMinutes = visibleBlocks.reduce((total, block) => total + minutesBetween(block.startAt, block.endAt), 0);
  const completedMinutes = Math.round((time.summary?.focusSeconds ?? 0) / 60);
  const focusSeconds = time.currentFocus ? time.currentFocus.accumulatedSeconds + (time.currentFocus.status === "running" && time.currentFocus.lastResumedAt ? Math.max(0, Math.floor((tick - new Date(time.currentFocus.lastResumedAt).getTime()) / 1_000)) : 0) : 0;
  const focusLabel = `${pad(Math.floor(focusSeconds / 60))}:${pad(focusSeconds % 60)}`;
  const budgetMap = new Map(time.budgets.map((budget) => [budget.projectId, budget]));
  const weeklyMinutes = new Map();
  time.weeklyBlocks.filter((block) => block.status !== "canceled").forEach((block) => { if (block.projectId) weeklyMinutes.set(block.projectId, (weeklyMinutes.get(block.projectId) ?? 0) + minutesBetween(block.startAt, block.endAt)); });
  const actualWeeklyMinutes = new Map((time.weeklySummary?.byProject ?? []).map((slice) => [slice.key, Math.round(slice.focusSeconds / 60)]));
  const attentionByProject = new Map((time.attention?.items ?? []).map((item) => [item.projectId, item]));
  const attentionStates = projects.filter((project) => project.status !== "archived").map((project) => {
    const remote = attentionByProject.get(project.id);
    const budget = budgetMap.get(project.id) ?? null;
    return {
      project,
      budget,
      scheduled: remote?.scheduledMinutes ?? weeklyMinutes.get(project.id) ?? 0,
      actual: remote?.actualMinutes ?? actualWeeklyMinutes.get(project.id) ?? 0,
      state: remote?.state ?? (budget ? "balanced" : "unconfigured"),
      deficit: remote?.deficitMinutes ?? 0,
      overage: remote?.overageMinutes ?? 0,
      explanation: remote?.explanation ?? "正在分析注意力阈值",
    };
  });
  const starving = attentionStates.filter((item) => item.state === "starving");
  const overfocused = attentionStates.filter((item) => item.state === "overfocused");

  const saveBlock = async (input) => {
    try { if (editor?.id) await time.updateBlock(editor.id, input); else await time.createBlock(input); setEditor(null); onToast(editor?.id ? "时间块已更新" : "时间块已加入计划"); }
    catch (error) { onToast(`保存失败：${error.message}`); }
  };
  const saveBudget = async (input) => { try { await time.upsertBudget(input); setBudgetProject(null); onToast("项目注意力预算已保存"); } catch (error) { onToast(`预算保存失败：${error.message}`); } };
  const projectName = (id) => projects.find((project) => project.id === id)?.name ?? (id ? "未知项目" : "系统");
  const proposeRebalance = async () => {
    const target = starving[0] ?? attentionStates.find((item) => item.state === "at_risk") ?? attentionStates.find((item) => item.budget && item.scheduled < item.budget.plannedMinutes);
    try {
      const proposal = await time.proposeAttentionRebalance({ weekStart: boundaries.weekStart, utcOffsetMinutes: -new Date().getTimezoneOffset(), projectId: target?.project.id, energy: rebalanceEnergy });
      onToast(`已生成“${proposal.title}”，请在待决策中心确认后写入日程`);
    } catch (error) { onToast(`生成重平衡建议失败：${error.message}`); }
  };

  return <div className="product-page time-page real-time-page">
    <header className="page-intro"><div><span className="eyebrow">时间视图 · ADHD 护栏 · 实时持久化</span><h1>把注意力预算变成看得见的时间</h1><p>时间块、专注会话和项目最低保障都存入 SQLite；页面重开后继续同一份事实。</p></div><div className="page-actions"><button className="quiet-button" type="button" onClick={() => setDate(localDateKey(new Date()))}><CalendarBlank size={17} />回到今天</button><button className="primary-small" type="button" onClick={() => setEditor({ mode: "create" })}><Plus size={17} />新建时间块</button></div></header>
    <section className="time-summary"><StatCard icon={CalendarCheck} label={range === "今天" ? "今日计划" : "本周计划"} value={durationLabel(plannedMinutes)} note={`${visibleBlocks.length} 个时间块`} /><StatCard icon={ClockCountdown} label="真实专注" value={durationLabel(completedMinutes)} note={`${time.summary?.sessionCount ?? 0} 次会话 · 按会话历史汇总`} tone="green" /><StatCard icon={Scales} label="注意力失衡" value={`${starving.length + overfocused.length} 个项目`} note={starving.length ? `${starving.length} 个低于最低保障` : overfocused.length ? `${overfocused.length} 个超过最高上限` : "当前预算平衡"} tone="amber" /></section>
    {time.currentFocus && <section className="live-focus-strip card-surface"><span><Play size={18} weight="fill" /></span><div><small>{time.currentFocus.status === "running" ? "正在专注" : "专注已暂停"}</small><strong>{time.currentFocus.title}</strong><em>{projectName(time.currentFocus.projectId)}</em></div><b>{focusLabel}</b><div>{time.currentFocus.status === "running" ? <button type="button" onClick={() => time.pauseFocus(time.currentFocus.id)}><Pause size={16} />暂停</button> : <button type="button" onClick={() => time.resumeFocus(time.currentFocus.id)}><Play size={16} />继续</button>}<button type="button" onClick={() => time.completeFocus(time.currentFocus.id)}><Check size={16} />完成</button></div></section>}
    <section className="time-layout"><div className="schedule-panel card-surface"><div className="schedule-toolbar"><div>{["今天", "本周"].map((item) => <button type="button" key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>)}</div><strong>{range === "本周" ? `${boundaries.weekStart} 所在周` : new Intl.DateTimeFormat("zh-CN", { dateStyle: "full" }).format(new Date(`${date}T12:00:00`))}</strong><label className="date-picker-button"><CalendarBlank size={17} /><input aria-label="选择日期" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>{visibleBlocks.length ? <CalendarCanvas range={range} date={date} weekStart={boundaries.weekStart} blocks={visibleBlocks} projects={projects} projectName={projectName} pending={time.pending} onEdit={setEditor} onUpdate={time.updateBlock} onToast={onToast} /> : <div className="time-empty"><Clock size={30} weight="duotone" /><h2>这段时间还没有安排</h2><p>先放入一个 25–50 分钟、能留下证据的最小结果。</p><button className="primary-small" type="button" onClick={() => setEditor({ mode: "create" })}><Plus size={16} />添加第一个时间块</button></div>}</div>
      <aside className="time-insights">
        <article className="card-surface budget-card"><div className="section-title"><div><span>本周项目预算</span><h2>最低 · 计划 · 最高</h2></div><Clock size={20} /></div>{attentionStates.map(({ project, budget, scheduled, actual, state, explanation }) => { const target = budget?.plannedMinutes ?? 0; const progress = target ? Math.min(100, Math.round(actual / target * 100)) : 0; return <button type="button" className={`attention-state ${state}`} key={project.id} onClick={() => setBudgetProject(project)} title={explanation}><span className="project-dot" style={{ background: project.color }} /><span><strong>{project.name}<i>{({ unconfigured: "未配置", starving: "饥饿", at_risk: "待兑现", balanced: "平衡", overfocused: "过载" })[state]}</i></strong><em className="progress-track"><i style={{ width: `${progress}%`, background: project.color }} /></em><small>{budget ? `最低 ${durationLabel(budget.minimumMinutes)} · 计划 ${durationLabel(target)} · 上限 ${budget.maximumMinutes ? durationLabel(budget.maximumMinutes) : "不限"}` : "点击设置三段阈值"}</small></span><em>实 {durationLabel(actual)}<br />排 {durationLabel(scheduled)}</em></button>; })}</article>
        {(starving.length > 0 || overfocused.length > 0) && <article className="imbalance-card"><Warning size={22} weight="fill" /><div><h2>注意力护栏已触发</h2><p>{starving.length ? `${starving.map((item) => item.project.name).join("、")} 低于最低保障。` : ""}{overfocused.length ? `${overfocused.map((item) => item.project.name).join("、")} 超过最高上限。` : ""}</p><small>只生成 Proposal，接受后才会创建时间块。</small><div className="rebalance-controls">{[["low", "低"], ["medium", "中"], ["high", "高"]].map(([value, label]) => <button type="button" className={rebalanceEnergy === value ? "active" : ""} key={value} onClick={() => setRebalanceEnergy(value)}>{label}精力</button>)}</div><button className="rebalance-proposal" type="button" disabled={time.pending} onClick={proposeRebalance}><Sparkle size={15} />{time.pending ? "生成中…" : "生成重新平衡 Proposal"}</button></div></article>}
        <article className="card-surface rhythm-card"><div className="section-title"><div><span>本次专注</span><h2>{time.currentFocus ? focusLabel : "尚未开始"}</h2></div><Target size={20} /></div><p>{time.currentFocus ? `${time.currentFocus.title} · ${projectName(time.currentFocus.projectId)}` : "从一个时间块开始专注，会在这里持续显示并跨页面恢复。"}</p>{!time.currentFocus && visibleBlocks.find((block) => block.status === "planned") && <button type="button" onClick={async () => { const block = visibleBlocks.find((item) => item.status === "planned"); try { await time.startFocus({ projectId: block.projectId, taskId: block.taskId, timeBlockId: block.id, title: block.title }); onToast("专注会话已开始"); } catch (error) { onToast(`开始失败：${error.message}`); } }}><Play size={16} />开始下一个时间块</button>}</article>
      </aside></section>
    {editor && <BlockEditor block={editor.id ? editor : null} projects={projects} initialDate={date} pending={time.pending} onClose={() => setEditor(null)} onSave={saveBlock} onCancel={async () => { try { await time.cancelBlock(editor.id); setEditor(null); onToast("时间块已取消"); } catch (error) { onToast(`取消失败：${error.message}`); } }} />}
    {budgetProject && <BudgetEditor project={budgetProject} budget={budgetMap.get(budgetProject.id)} weekStart={boundaries.weekStart} pending={time.pending} onClose={() => setBudgetProject(null)} onSave={saveBudget} />}
  </div>;
}
