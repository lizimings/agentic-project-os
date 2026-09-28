import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import {
  ArrowRight,
  ArrowsClockwise,
  Brain,
  CalendarBlank,
  CalendarCheck,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  CheckSquareOffset,
  Clock,
  ClockCountdown,
  Coffee,
  Cube,
  DotsThree,
  FolderOpen,
  GitBranch,
  Graph,
  Heartbeat,
  Lightning,
  ListChecks,
  MagnifyingGlass,
  Microphone,
  Pause,
  Play,
  Plus,
  Pulse,
  Robot,
  Sparkle,
  Stack,
  Target,
  Timer,
  Tray,
  TrendUp,
  Warning,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { nodeColors, projects } from "./data.js";
import { useKnowledgeGraph, useOrganizer, useTimeSystem } from "./useCoreData.js";
import { useVoiceRecorder } from "./useVoiceRecorder.js";
import { EntityMentionPicker } from "./EntityMentionPicker.jsx";
import { StatCard } from "./StatCard.jsx";
export { TimeManagementView as TimeView } from "./TimeManagementView.jsx";

function PageIntro({ eyebrow, title, description, actions }) {
  return (
    <header className="page-intro">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

function ProgressBar({ value, color = "#4057f4" }) {
  return <span className="progress-track" aria-label={`进度 ${value}%`}><span style={{ width: `${value}%`, background: color }} /></span>;
}

const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const blockMinutes = (block) => Math.max(0, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000));
const compactDuration = (minutes) => minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ""}`.trim() : `${minutes}m`;

function todayBoundaries() {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const weekStart = new Date(dayStart); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() || 7) - 1));
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  return { from: weekStart.toISOString(), to: weekEnd.toISOString(), weekStart: dayKey(weekStart), dayFrom: dayStart.getTime(), dayTo: dayEnd.getTime(), summaryFrom: dayStart.toISOString(), summaryTo: dayEnd.toISOString() };
}

export function TodayView({ projects = [], proposalCount = 0, onOpenProject, onNavigate, onToast }) {
  const boundaries = useMemo(todayBoundaries, []);
  const time = useTimeSystem(boundaries);
  const [tick, setTick] = useState(Date.now());
  const [energy, setEnergy] = useState(() => window.localStorage.getItem("pcc-energy") || "medium");
  useEffect(() => { if (time.error) onToast(`时间服务连接失败：${time.error.message}`); }, [time.error, onToast]);
  useEffect(() => {
    if (time.currentFocus?.status !== "running") return undefined;
    const id = window.setInterval(() => setTick(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [time.currentFocus?.status]);

  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const weeklyBlocks = time.blocks.filter((block) => block.status !== "canceled");
  const todayBlocks = weeklyBlocks.filter((block) => new Date(block.startAt).getTime() < boundaries.dayTo && new Date(block.endAt).getTime() > boundaries.dayFrom);
  const completedBlocks = todayBlocks.filter((block) => block.status === "completed");
  const scheduledQueue = todayBlocks.filter((block) => !["completed", "canceled"].includes(block.status) && block.id !== time.currentFocus?.timeBlockId).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  const focusBlock = time.currentFocus?.timeBlockId ? weeklyBlocks.find((block) => block.id === time.currentFocus.timeBlockId) : scheduledQueue[0];
  const focusProjectId = time.currentFocus?.projectId ?? focusBlock?.projectId;
  const focusProject = projectMap.get(focusProjectId);
  const elapsed = time.currentFocus ? time.currentFocus.accumulatedSeconds + (time.currentFocus.status === "running" && time.currentFocus.lastResumedAt ? Math.max(0, Math.floor((tick - new Date(time.currentFocus.lastResumedAt).getTime()) / 1_000)) : 0) : 0;
  const timer = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const plannedMinutes = todayBlocks.reduce((total, block) => total + blockMinutes(block), 0);
  const completedMinutes = Math.round((time.summary?.focusSeconds ?? 0) / 60);
  const scheduledByProject = new Map();
  weeklyBlocks.forEach((block) => { if (block.projectId) scheduledByProject.set(block.projectId, (scheduledByProject.get(block.projectId) ?? 0) + blockMinutes(block)); });
  const starving = time.budgets.map((budget) => ({ budget, project: projectMap.get(budget.projectId), missing: Math.max(0, budget.minimumMinutes - (scheduledByProject.get(budget.projectId) ?? 0)) })).filter((entry) => entry.project && entry.missing > 0);
  const needsCare = starving[0]?.project ?? projects.find((project) => project.status === "risk");
  const priorityWeight = { urgent: 0, high: 1, medium: 2, low: 3 };
  const scheduledTaskIds = new Set(weeklyBlocks.filter((block) => !["completed", "canceled"].includes(block.status) && block.taskId).map((block) => block.taskId));
  const unscheduledTasks = projects.flatMap((project) => (project.tasks ?? [])
    .filter((task) => ["todo", "in_progress", "blocked"].includes(task.status) && !scheduledTaskIds.has(task.id))
    .map((task) => ({ ...task, project })))
    .sort((left, right) => (priorityWeight[left.priority] ?? 9) - (priorityWeight[right.priority] ?? 9) || (left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER) - (right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER) || left.position - right.position);
  const executionQueue = [
    ...scheduledQueue.map((block, index) => ({ kind: "block", id: block.id, block, tier: index === 0 ? "NEXT" : "LATER" })),
    ...unscheduledTasks.map((task) => ({ kind: "task", id: task.id, task, tier: "LATER" })),
  ].slice(0, 8);
  const rebalanceTarget = starving[0]?.project ?? unscheduledTasks[0]?.project ?? projects.find((project) => project.status === "active");
  const rebalanceTask = unscheduledTasks.find((task) => task.project.id === rebalanceTarget?.id && (energy === "high" ? (task.estimateMinutes ?? 45) >= 40 : energy === "low" ? (task.estimateMinutes ?? 25) <= 30 : true))
    ?? unscheduledTasks.find((task) => task.project.id === rebalanceTarget?.id);
  const organizer = useOrganizer(rebalanceTarget?.id ?? "");
  const activeAgentTasks = projects.flatMap((project) => (project.tasks ?? []).filter((task) => task.assigneeType === "agent" && ["in_progress", "blocked", "todo"].includes(task.status)).map((task) => ({ ...task, project })));
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());

  const startBlock = async (block) => {
    try { await time.startFocus({ projectId: block.projectId, taskId: block.taskId, timeBlockId: block.id, title: block.title }); onToast("专注会话已开始，会跨页面与重启保留"); }
    catch (error) { onToast(`开始失败：${error.message}`); }
  };
  const transition = async (action) => {
    try {
      if (action === "pause") await time.pauseFocus(time.currentFocus.id);
      if (action === "resume") await time.resumeFocus(time.currentFocus.id);
      if (action === "complete") await time.completeFocus(time.currentFocus.id, { completeTask: Boolean(time.currentFocus.taskId) });
      onToast(action === "complete" ? (time.currentFocus.taskId ? "专注、任务及完成证据已同步，父级会按完成度自动收口" : "当前专注和关联时间块已完成") : action === "pause" ? "专注已暂停" : "专注已继续");
    } catch (error) { onToast(`操作失败：${error.message}`); }
  };
  const scheduleTaskNow = async (task) => {
    const duration = Math.max(20, Math.min(60, task.estimateMinutes ?? 30));
    const startAt = new Date();
    startAt.setSeconds(0, 0);
    const endAt = new Date(startAt.getTime() + duration * 60_000);
    try {
      const block = await time.createBlock({ projectId: task.projectId, taskId: task.id, title: task.title, startAt: startAt.toISOString(), endAt: endAt.toISOString(), status: "planned", kind: "focus", energy, source: "manual" });
      if (!time.currentFocus) await time.startFocus({ projectId: task.projectId, taskId: task.id, timeBlockId: block.id, title: task.title });
      onToast(`已把 Later 任务变成 ${duration} 分钟 NOW，并保留层级关联`);
    } catch (error) { onToast(`安排失败：${error.message}`); }
  };
  const proposeRebalance = async () => {
    if (!rebalanceTarget) return;
    const duration = energy === "low" ? 25 : energy === "high" ? 50 : 35;
    const startAt = new Date(Math.ceil(Date.now() / (15 * 60_000)) * 15 * 60_000);
    const endAt = new Date(startAt.getTime() + duration * 60_000);
    const title = rebalanceTask?.title ?? `推进 ${rebalanceTarget.name} 的最小成果`;
    const energyLabel = energy === "high" ? "高" : energy === "low" ? "低" : "中";
    try {
      await organizer.submitProposal({
        projectId: rebalanceTarget.id,
        title: `${energyLabel}精力重新排程：${title}`,
        summary: `根据当前${energyLabel}精力安排 ${duration} 分钟时间块；接受后才会写入日程。`,
        kind: "schedule",
        risk: "low",
        evidence: [`当前精力：${energyLabel}`, starving[0]?.project?.id === rebalanceTarget.id ? `本周最低保障尚缺 ${starving[0].missing} 分钟` : "当前优先队列存在未排期任务", rebalanceTask ? `任务优先级：${rebalanceTask.priority}` : "项目需要一个最小推进动作"],
        changes: [{ entityType: "time_block", entityId: null, action: "create", summary: `${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(startAt)} 开始，${duration} 分钟，关联 ${rebalanceTarget.name}` }],
        command: { type: "create_time_block", input: { projectId: rebalanceTarget.id, taskId: rebalanceTask?.id ?? null, title, startAt: startAt.toISOString(), endAt: endAt.toISOString(), status: "planned", kind: "focus", energy, source: "rebalance" } },
        createdBy: "energy-rebalance",
      });
      onToast("已生成可审阅的精力重排 Proposal；接受前不会改动日程");
      onNavigate("decisions");
    } catch (error) { onToast(`生成重排建议失败：${error.message}`); }
  };

  return <div className="product-page today-page">
    <PageIntro eyebrow={dateLabel} title="今天只需要推进这几件事" description="今日页直接读取时间块、专注会话、项目预算和 Agent 任务，不再展示演示数据。" actions={<><button className="quiet-button" type="button" onClick={() => onNavigate("time")}><ArrowsClockwise size={17} />调整时间计划</button><button className="primary-small" type="button" onClick={() => onNavigate("inbox")}><Tray size={17} />整理 Inbox</button></>} />
    <section className="today-stats">
      <StatCard icon={CheckSquareOffset} label="今日承诺" value={`${todayBlocks.length} 个成果`} note={`${completedBlocks.length} 个已完成`} />
      <StatCard icon={ClockCountdown} label="计划 / 真实专注" value={compactDuration(plannedMinutes)} note={`真实 ${compactDuration(completedMinutes)} · ${time.summary?.sessionCount ?? 0} 次`} tone="purple" />
      <StatCard icon={Robot} label="Agent 任务" value={`${activeAgentTasks.length} 个待推进`} note={`${proposalCount} 个等待你的决策`} tone="green" />
      <StatCard icon={Heartbeat} label="需要照看" value={needsCare?.name ?? "暂无"} note={starving.length ? `${starving.length} 个项目低于本周最低保障` : "注意力预算当前平衡"} tone="amber" />
    </section>
    <section className="today-grid">
      <div className={`focus-card ${!focusBlock && !time.currentFocus ? "empty-focus" : ""}`}>
        <div className="focus-topline"><span><Lightning size={17} weight="fill" />{time.currentFocus ? `NOW · ${time.currentFocus.status === "paused" ? "已暂停" : "正在进行"}` : "NEXT · 下一项"}</span><em>{focusBlock ? `${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(focusBlock.startAt))}–${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(focusBlock.endAt))}` : "尚未安排"}</em></div>
        <h2>{time.currentFocus?.title ?? focusBlock?.title ?? "给今天安排一个小而明确的成果"}</h2>
        {focusProject ? <button type="button" className="project-link" onClick={() => onOpenProject("overview", focusProject.id)}>{focusProject.name}<CaretRight size={14} />查看项目</button> : <button type="button" className="project-link" onClick={() => onNavigate("time")}>打开时间视图<CaretRight size={14} /></button>}
        <div className="timer-ring"><div><strong>{timer}</strong><span>{time.currentFocus ? "已累计专注" : "等待开始"}</span></div></div>
        <div className="focus-actions">
          {time.currentFocus ? <button type="button" className="timer-button" disabled={time.pending} onClick={() => transition(time.currentFocus.status === "running" ? "pause" : "resume")}>{time.currentFocus.status === "running" ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}{time.currentFocus.status === "running" ? "暂停" : "继续专注"}</button> : <button type="button" className="timer-button" disabled={!focusBlock || time.pending} onClick={() => focusBlock && startBlock(focusBlock)}><Play size={18} weight="fill" />开始专注</button>}
          <button type="button" className="complete-button" disabled={!time.currentFocus || time.pending} onClick={() => transition("complete")}><Check size={18} weight="bold" />{time.currentFocus?.taskId ? "完成任务并留证" : "完成时间块"}</button>
        </div>
        <div className="focus-context"><Clock size={18} /><span><strong>{focusBlock ? `${focusBlock.kind === "focus" ? "专注" : focusBlock.kind === "admin" ? "整理" : "缓冲"}时间块 · ${blockMinutes(focusBlock)} 分钟` : "目前没有今日时间块"}</strong><small>{focusBlock?.taskId ? "已关联层级任务，完成时同步时间块状态" : "专注状态由 projectd 持久化，可在页面间恢复"}</small></span><button type="button" onClick={() => onNavigate("time")}>管理时间</button></div>
      </div>
      <div className="day-plan card-surface">
        <div className="section-title"><div><span>接下来</span><h2>今天的执行队列</h2></div><button type="button" aria-label="队列设置" onClick={() => onNavigate("time")}><DotsThree size={20} /></button></div>
        <div className="task-stack">{executionQueue.length ? executionQueue.map((item) => item.kind === "block" ? <button className="today-task" type="button" key={item.id} disabled={Boolean(time.currentFocus) || time.pending} onClick={() => startBlock(item.block)}><span className={`task-order ${item.tier === "NEXT" ? "next" : "later"}`}>{item.tier === "NEXT" ? "N" : "L"}</span><span className="task-copy"><strong>{item.block.title}</strong><small>{projectMap.get(item.block.projectId)?.name ?? "系统"} · 已排期 · {item.block.energy === "high" ? "高能量" : item.block.energy === "low" ? "低能量" : "中能量"}</small></span><span className="task-time"><Clock size={14} />{blockMinutes(item.block)}m</span></button> : <button className="today-task unscheduled" type="button" key={item.id} disabled={Boolean(time.currentFocus) || time.pending} onClick={() => scheduleTaskNow(item.task)}><span className="task-order later">L</span><span className="task-copy"><strong>{item.task.title}</strong><small>{item.task.project.name} · 未排期 · {item.task.priority === "urgent" ? "紧急" : item.task.priority === "high" ? "高优先" : item.task.priority === "low" ? "低优先" : "中优先"}</small></span><span className={`priority-chip ${item.task.priority}`}>安排 {Math.max(20, Math.min(60, item.task.estimateMinutes ?? 30))}m</span></button>) : <div className="time-empty"><strong>今日队列是空的</strong><span>安排一个 25–45 分钟的小成果。</span></div>}</div>
        <button className="queue-footer" type="button" onClick={() => onNavigate("time")}><Plus size={16} />添加时间盒</button>
      </div>
      <div className="attention-card card-surface">
        <div className="section-title"><div><span>注意力护栏</span><h2>避免项目被饿死</h2></div><Brain size={21} /></div>
        {starving.length ? starving.slice(0, 2).map(({ project, budget, missing }) => <button type="button" className="attention-project" key={project.id} onClick={() => onOpenProject("overview", project.id)}><span className="project-dot" style={{ background: project.color }} /><span><strong>{project.name}</strong><small>本周最低 {budget.minimumMinutes}m · 尚未覆盖 {missing}m</small></span><em>缺 {missing}m</em></button>) : <button type="button" className="attention-project balanced" onClick={() => onNavigate("time")}><span className="project-dot" style={{ background: "#36b37e" }} /><span><strong>{time.budgets.length ? "本周最低保障已覆盖" : "尚未设置注意力预算"}</strong><small>{time.budgets.length ? "继续按当前节奏推进" : "为活跃项目设置最低与最高投入"}</small></span><em>设置</em></button>}
        <div className="energy-check"><Coffee size={18} /><span><strong>现在的精力怎么样？</strong><small>只生成 Proposal，接受后才写入日程</small></span><div>{[["low", "低"], ["medium", "中"], ["high", "高"]].map(([value, label]) => <button type="button" className={energy === value ? "selected" : ""} key={value} onClick={() => { setEnergy(value); window.localStorage.setItem("pcc-energy", value); }}>{label}</button>)}</div><button className="rebalance-button" type="button" disabled={!rebalanceTarget || organizer.pending} onClick={proposeRebalance}><Sparkle size={14} />{organizer.pending ? "生成中" : "生成重排建议"}</button></div>
      </div>
      <div className="agent-lane card-surface">
        <div className="section-title"><div><span>并行产出</span><h2>Agent 任务轨道</h2></div><button type="button" onClick={() => onNavigate("decisions")}>待决策 {proposalCount}</button></div>
        {activeAgentTasks.length ? activeAgentTasks.slice(0, 4).map((task) => <button className="agent-row" type="button" key={task.id} onClick={() => onOpenProject("tasks", task.project.id)}><span className={`agent-orb ${task.status === "blocked" ? "amber" : task.status === "in_progress" ? "green" : "blue"}`}><Robot size={17} weight="fill" /></span><span><strong>{task.assigneeId || "Agent"}</strong><small>{task.project.name} · {task.title}</small></span><em className={task.status === "blocked" ? "amber" : task.status === "in_progress" ? "green" : "blue"}>{task.status === "blocked" ? "阻塞" : task.status === "in_progress" ? "执行中" : "待启动"}</em></button>) : <div className="time-empty"><strong>当前没有分配给 Agent 的活跃任务</strong><span>在项目任务视图中把负责人类型设为 Agent。</span></div>}
      </div>
    </section>
  </div>;
}

export function InboxView({ items, projects: liveProjects = [], onCreateItem, onCreateLinkedItem, onArchiveItem, onBatchItems, onProposeConversions, onRunOrganizers, batching, onOpenProject, onNavigate, onToast }) {
  const [filter, setFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [targetProjectId, setTargetProjectId] = useState("");
  const [targetType, setTargetType] = useState("idea");
  const [milestoneId, setMilestoneId] = useState("");
  const [planId, setPlanId] = useState("");
  const [capture, setCapture] = useState("");
  const [captureSource, setCaptureSource] = useState("快捷记录");
  const [captureMentions, setCaptureMentions] = useState([]);
  const [pendingId, setPendingId] = useState(null);
  const applyTranscript = useCallback((result) => {
    setCapture((current) => [current.trim(), result.text.trim()].filter(Boolean).join("\n"));
    setCaptureSource("语音");
  }, []);
  const voice = useVoiceRecorder({ onTranscript: applyTranscript });
  const filters = ["全部", "未归类", "想法", "需求", "风险", "今天", "本周"];
  const now = Date.now();
  const todayCount = items.filter((item) => now - new Date(item.createdAt).getTime() < 24 * 60 * 60 * 1_000).length;
  const weekCount = items.filter((item) => now - new Date(item.createdAt).getTime() < 7 * 24 * 60 * 60 * 1_000).length;
  const shown = useMemo(() => items
    .filter((item) => filter === "全部"
      || (filter === "今天" && now - new Date(item.createdAt).getTime() < 24 * 60 * 60 * 1_000)
      || (filter === "本周" && now - new Date(item.createdAt).getTime() < 7 * 24 * 60 * 60 * 1_000)
      || item.project === filter
      || item.kind === filter)
    .filter((item) => `${item.title}\n${item.note}\n${item.project}\n${item.kind}\n${item.source}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => (sort === "newest" ? -1 : 1) * (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())), [filter, items, now, query, sort]);
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const targetProject = liveProjects.find((project) => project.id === targetProjectId);
  const milestoneOptions = (targetProject?.milestones || []).filter((milestone) => milestone.status !== "archived");
  const planOptions = (targetProject?.plans || []).filter((plan) => plan.status !== "archived" && (!milestoneId || plan.milestoneId === milestoneId));
  const conversionReady = selectedItems.length > 0 && targetProjectId && (targetType === "idea" || targetType === "milestone" || (targetType === "plan" && milestoneId) || (targetType === "task" && milestoneId && planId));
  useEffect(() => setSelectedIds((current) => new Set([...current].filter((id) => items.some((item) => item.id === id)))), [items]);
  useEffect(() => { setMilestoneId(""); setPlanId(""); }, [targetProjectId, targetType]);

  const addCapture = async () => {
    if (!capture.trim()) return;
    setPendingId("create");
    try {
      const projectId = captureMentions[0]?.projectId;
      const payload = { title: capture.trim(), note: captureSource === "语音" ? "来自高精度语音转写，等待 Agent 整理" : "来自快速记录，等待 Agent 整理", source: captureSource, projectId, project: projectId ? liveProjects.find((project) => project.id === projectId)?.name || "未归类" : "未归类", kind: "想法" };
      if (captureMentions.length) await onCreateLinkedItem({ ...payload, mentions: captureMentions.map(({ type, id, label }) => ({ type, id, label })) });
      else await onCreateItem(payload);
      setCapture("");
      setCaptureMentions([]);
      setCaptureSource("快捷记录");
      onToast("想法已进入总 Inbox，并完成持久化");
    } catch (error) {
      onToast(`记录失败：${error.message}`);
    } finally {
      setPendingId(null);
    }
  };

  const batchAssign = async () => {
    if (!selectedItems.length || !targetProjectId) return;
    setPendingId("batch");
    try {
      await onBatchItems({ action: "assign", ids: selectedItems.map((item) => item.id), projectId: targetProjectId });
      setSelectedIds(new Set());
      onToast(`已将 ${selectedItems.length} 条 Inbox 归入 ${targetProject.name}`);
    } catch (error) {
      onToast(`批量归类失败：${error.message}`);
    } finally {
      setPendingId(null);
    }
  };

  const proposeConversion = async () => {
    if (!conversionReady) return;
    setPendingId("batch");
    try {
      await onProposeConversions({ items: selectedItems, projectId: targetProjectId, targetType, milestoneId: milestoneId || undefined, planId: planId || undefined });
      setSelectedIds(new Set());
      onToast(`已生成 ${selectedItems.length} 条可执行转换建议，等待你确认`);
    } catch (error) { onToast(`生成建议失败：${error.message}`); }
    finally { setPendingId(null); }
  };

  const archiveSelected = async () => {
    if (!selectedItems.length) return;
    setPendingId("batch");
    try {
      await onBatchItems({ action: "archive", ids: selectedItems.map((item) => item.id) });
      setSelectedIds(new Set());
      onToast(`已归档 ${selectedItems.length} 条 Inbox`);
    } catch (error) { onToast(`批量归档失败：${error.message}`); }
    finally { setPendingId(null); }
  };

  const runOrganizer = async () => {
    const scope = selectedItems.length ? selectedItems : items;
    const projectIds = [...new Set(scope.map((item) => item.projectId).filter(Boolean))];
    if (!projectIds.length) { onToast("先把条目归入项目，Organizer 才能读取项目边界内的快照"); return; }
    try {
      const runs = await onRunOrganizers(projectIds);
      const proposalTotal = runs.reduce((total, run) => total + (run.proposalIds?.length || 0), 0);
      onToast(proposalTotal ? `Organizer 为 ${projectIds.length} 个项目生成 ${proposalTotal} 条新建议` : "Organizer 分析完成，没有新增或重复建议");
    } catch (error) { onToast(`Organizer 分析失败：${error.message}`); }
  };

  const archive = async (id) => {
    setPendingId(id);
    try {
      await onArchiveItem(id);
      onToast("条目已归档并写入事件日志");
    } catch (error) {
      onToast(`归档失败：${error.message}`);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="product-page inbox-page">
      <PageIntro eyebrow={`总 Inbox · ${items.length} 条待整理`} title="先捕获，不要现在分类" description="文字、语音、Agent 和仓库事件都可以先放进这里，再批量整理到项目、里程碑或任务。" actions={<button className="quiet-button" type="button" disabled={batching} onClick={runOrganizer}><Sparkle size={17} />{batching ? "Agent 分析中…" : "Agent 批量整理"}</button>} />
      <section className="capture-card">
        <div className="capture-input"><Sparkle size={20} weight="duotone" /><textarea id="inbox-capture" name="inbox-capture" aria-label="记录想法" value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="想到什么就写什么，再用 @ 选择器建立实体关系…" /></div>
        <EntityMentionPicker projects={liveProjects} value={captureMentions} onChange={setCaptureMentions} />
        <div className="capture-footer"><div><button className={voice.recording ? "listening" : ""} type="button" disabled={["requesting", "transcribing"].includes(voice.status)} onClick={voice.recording ? voice.stop : voice.start}><Microphone size={17} weight={voice.recording ? "fill" : "regular"} />{voice.status === "requesting" ? "请求麦克风…" : voice.status === "recording" ? `结束录音 ${Math.floor(voice.elapsedSeconds / 60)}:${String(voice.elapsedSeconds % 60).padStart(2, "0")}` : voice.status === "transcribing" ? "转写中…" : voice.status === "error" ? "重试语音" : "语音输入"}</button><span>{voice.error ? voice.error.message : voice.status === "recording" ? "正在本机录音" : voice.status === "transcribing" ? "projectd 正在调用高精度转写" : voice.status === "done" ? "转写完成，可编辑后保存" : "支持高精度转写 API"}{voice.error?.code === "AI_API_KEY_REQUIRED" && <button type="button" className="voice-config-link" onClick={() => onNavigate("settings")}>打开设置</button>}</span></div><button className="primary-small" type="button" disabled={pendingId === "create" || !capture.trim()} onClick={addCapture}>{pendingId === "create" ? "保存中…" : "放入 Inbox"} <ArrowRight size={16} /></button></div>
      </section>
      <section className="inbox-layout">
        <aside className="inbox-filters card-surface"><strong>筛选</strong>{filters.map((item) => <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}><span>{item}</span><em>{item === "全部" ? items.length : item === "今天" ? todayCount : item === "本周" ? weekCount : items.filter((entry) => entry.project === item || entry.kind === item).length}</em></button>)}</aside>
        <div className="inbox-list card-surface">
          <div className="list-header inbox-list-header"><button className={`inbox-select-all ${shown.length && shown.every((item) => selectedIds.has(item.id)) ? "selected" : ""}`} type="button" aria-label="选择当前全部条目" onClick={() => setSelectedIds((current) => { const next = new Set(current); const allSelected = shown.length && shown.every((item) => next.has(item.id)); shown.forEach((item) => allSelected ? next.delete(item.id) : next.add(item.id)); return next; })}><Check size={13} /></button><div><h2>{filter}</h2><span>{shown.length} 条</span></div><label className="inbox-search"><MagnifyingGlass size={14} /><input aria-label="搜索 Inbox" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、说明、项目…" /></label><button type="button" onClick={() => setSort((value) => value === "newest" ? "oldest" : "newest")}>{sort === "newest" ? "最新优先" : "最早优先"} <CaretDown size={14} /></button></div>
          {selectedItems.length > 0 && <div className="inbox-batch-bar"><strong>已选择 {selectedItems.length} 条</strong><select aria-label="批量目标项目" value={targetProjectId} onChange={(event) => setTargetProjectId(event.target.value)}><option value="">选择目标项目…</option>{liveProjects.filter((project) => project.status !== "archived").map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><button type="button" disabled={!targetProjectId || pendingId === "batch"} onClick={batchAssign}>归入项目</button><select aria-label="转换实体类型" value={targetType} onChange={(event) => setTargetType(event.target.value)}><option value="idea">转为想法</option><option value="milestone">转为里程碑</option><option value="plan">转为计划</option><option value="task">转为任务</option></select>{(targetType === "plan" || targetType === "task") && <select aria-label="转换目标里程碑" value={milestoneId} onChange={(event) => { setMilestoneId(event.target.value); setPlanId(""); }}><option value="">选择里程碑…</option>{milestoneOptions.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select>}{targetType === "task" && <select aria-label="转换目标计划" value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">选择计划…</option>{planOptions.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select>}<button className="primary" type="button" disabled={!conversionReady || pendingId === "batch"} onClick={proposeConversion}>生成转换建议</button><button type="button" disabled={pendingId === "batch"} onClick={archiveSelected}>批量归档</button><button className="clear" type="button" aria-label="清除选择" onClick={() => setSelectedIds(new Set())}><X size={14} /></button></div>}
          {shown.map((item) => (
            <article className={`inbox-item ${selectedIds.has(item.id) ? "selected" : ""}`} key={item.id}>
              <button className={`inbox-check ${selectedIds.has(item.id) ? "selected" : ""}`} type="button" aria-label={`选择 ${item.title}`} onClick={() => setSelectedIds((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })}><Check size={14} /></button>
              <div className="inbox-copy"><div><span className={`kind-badge ${item.kind}`}>{item.kind}</span><em>{item.source} · {item.created}</em></div><h3>{item.title}</h3><p>{item.note}</p><button type="button" className="entity-link" disabled={!item.projectId} onClick={() => item.projectId && onOpenProject("inbox", item.projectId)}><FolderOpen size={14} />{item.project}</button></div>
              <div className="inbox-actions"><button type="button" onClick={() => setSelectedIds(new Set([item.id]))}><Sparkle size={16} />整理</button><button type="button" aria-label={`归档 ${item.title}`} disabled={pendingId === item.id} onClick={() => archive(item.id)}><Check size={16} /></button></div>
            </article>
          ))}
          {!shown.length && <div className="entity-empty"><Tray size={24} /><strong>{query ? "没有匹配的 Inbox" : "这个筛选下没有条目"}</strong><span>{query ? "试试标题、项目名或来源关键词。" : "先捕获一条想法，稍后再整理。"}</span></div>}
        </div>
        <aside className="inbox-summary card-surface"><span className="summary-icon"><Robot size={22} weight="duotone" /></span><h2>整理概览</h2><p>{items.filter((item) => !item.projectId).length} 条尚未归类，{items.filter((item) => item.projectId).length} 条已进入项目边界；Agent 只生成 Proposal。</p><div><strong>按项目分布</strong>{liveProjects.map((project) => { const count = items.filter((item) => item.projectId === project.id).length; return count ? <button type="button" key={project.id} onClick={() => { setFilter(project.name); setTargetProjectId(project.id); }}>{count} 条 → {project.name}</button> : null; })}<button type="button" onClick={() => setFilter("未归类")}>{items.filter((item) => !item.projectId).length} 条 → 未归类</button></div></aside>
      </section>
    </div>
  );
}

function relativeActivity(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1_440)} 天前`;
}

function portfolioProject(project, focusSeconds = 0) {
  const milestones = project.milestones.filter((item) => item.status !== "archived");
  const currentMilestone = milestones.find((item) => item.status === "active" || item.status === "blocked") ?? milestones[0];
  const tasks = project.tasks.filter((item) => item.status !== "archived" && (!currentMilestone || item.milestoneId === currentMilestone.id));
  const completed = tasks.filter((item) => item.status === "done").length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const next = project.tasks.find((item) => item.status === "in_progress") ?? project.tasks.find((item) => item.status === "blocked") ?? project.tasks.find((item) => item.status === "todo");
  const agents = new Set(project.tasks.filter((item) => item.assigneeType === "agent" && item.assigneeId).map((item) => item.assigneeId)).size;
  const activityTimes = [project.updatedAt, ...project.milestones.map((item) => item.updatedAt), ...project.plans.map((item) => item.updatedAt), ...project.tasks.map((item) => item.updatedAt)].filter(Boolean).map((value) => new Date(value).getTime());
  const lastActivityAt = new Date(Math.max(...activityTimes)).toISOString();
  const inactiveDays = Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000);
  const openTasks = project.tasks.filter((item) => !["done", "archived"].includes(item.status)).length;
  const healthTone = project.status === "risk" || currentMilestone?.status === "blocked" || (project.status === "active" && openTasks > 0 && inactiveDays >= 3) ? "risk" : project.status;
  const health = project.status === "risk" ? "需要关注" : project.status === "paused" ? "已暂缓" : project.status === "archived" ? "已归档" : currentMilestone?.status === "blocked" ? "里程碑受阻" : openTasks > 0 && inactiveDays >= 3 ? `${inactiveDays} 天无活动` : openTasks > 0 && focusSeconds === 0 ? "本周尚未投入" : "正常推进";
  return { ...project, currentMilestone, taskCount: tasks.length, completed, milestoneProgress: progress, next: next?.title ?? "定义下一步", agents, health, healthTone, focusSeconds, lastActivityAt };
}

function ProjectEditor({ project, pending, onClose, onSave }) {
  const [draft, setDraft] = useState({ name: project?.name ?? "", description: project?.description ?? "", vision: project?.vision ?? "", color: project?.color ?? "#4057f4", status: project?.status === "archived" ? "active" : project?.status ?? "active" });
  const submit = async (event) => {
    event.preventDefault();
    await onSave(draft);
  };
  return <div className="modal-backdrop"><form className="project-editor-modal" role="dialog" aria-modal="true" aria-labelledby="project-editor-title" onSubmit={submit}><button className="modal-close" type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button><span className="capture-modal-icon"><FolderOpen size={23} weight="duotone" /></span><div><span className="eyebrow">{project ? "编辑项目" : "空白项目"}</span><h2 id="project-editor-title">{project ? project.name : "创建一个新的项目空间"}</h2><p>先记录方向和边界；里程碑、计划和任务可以稍后逐步补齐。</p></div><label><span>项目名称</span><input id="project-editor-name" name="project-name" autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：Personal OS" /></label><label><span>一句话描述</span><input id="project-editor-description" name="project-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="这个项目解决什么问题" /></label><label><span>长期展望</span><textarea id="project-editor-vision" name="project-vision" value={draft.vision} onChange={(event) => setDraft({ ...draft, vision: event.target.value })} placeholder="未来希望它变成什么样，以及明确不做什么" /></label><div className="project-editor-options"><label><span>识别色</span><input id="project-editor-color" name="project-color" type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label><label><span>状态</span><select id="project-editor-status" name="project-status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="active">推进中</option><option value="risk">需关注</option><option value="paused">暂缓</option></select></label></div><div className="capture-modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary-small" type="submit" disabled={pending || !draft.name.trim()}>{pending ? "保存中…" : project ? "保存修改" : "创建项目"}</button></div></form></div>;
}

export function ProjectsView({ projects, favoriteIds = [], onToggleFavorite, createSignal, onCreate, onUpdate, onArchive, pending, onOpenProject, onImport, onToast }) {
  const [status, setStatus] = useState("全部");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [undoArchive, setUndoArchive] = useState(null);
  const undoTimer = useRef(null);
  useEffect(() => { if (createSignal) setEditor({ mode: "create" }); }, [createSignal]);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);
  const portfolioBoundaries = useMemo(() => { const boundaries = todayBoundaries(); return { ...boundaries, summaryFrom: boundaries.from, summaryTo: boundaries.to }; }, []);
  const portfolioTime = useTimeSystem(portfolioBoundaries);
  const focusByProject = new Map((portfolioTime.summary?.byProject ?? []).map((item) => [item.key, item.focusSeconds]));
  const summaries = projects.map((project) => portfolioProject(project, focusByProject.get(project.id) ?? 0));
  const shown = summaries.filter((project) => (status === "全部" ? project.status !== "archived" : (status === "推进中" && project.status === "active") || (status === "需关注" && project.status === "risk") || (status === "暂缓" && project.status === "paused") || (status === "已归档" && project.status === "archived"))).filter((project) => `${project.name}${project.description}${project.vision}`.toLowerCase().includes(query.toLowerCase()));
  const activeCount = projects.filter((project) => project.status === "active" || project.status === "risk").length;
  const dueMilestones = projects.flatMap((project) => project.milestones).filter((milestone) => milestone.status !== "archived" && milestone.targetDate && new Date(milestone.targetDate).getTime() <= Date.now() + 14 * 86_400_000).length;
  const riskCount = summaries.filter((project) => project.healthTone === "risk").length;
  const saveProject = async (input) => {
    try {
      if (editor?.id) await onUpdate(editor.id, input);
      else await onCreate(input);
      onToast(editor?.id ? "项目资料已更新" : "项目已创建，可开始添加里程碑");
      setEditor(null);
    } catch (error) { onToast(`保存失败：${error.message}`); }
  };
  const archiveProject = async (project) => {
    try {
      await onArchive(project.id);
      setMenuId(null);
      setUndoArchive({ id: project.id, name: project.name, status: project.status });
      window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndoArchive(null), 8_000);
      onToast("项目已归档，可在 8 秒内撤销");
    } catch (error) { onToast(`归档失败：${error.message}`); }
  };
  const restoreArchivedProject = async () => {
    if (!undoArchive) return;
    try {
      await onUpdate(undoArchive.id, { status: undoArchive.status === "archived" ? "active" : undoArchive.status });
      window.clearTimeout(undoTimer.current);
      setUndoArchive(null);
      onToast(`${undoArchive.name} 已恢复到归档前状态`);
    } catch (error) { onToast(`撤销失败：${error.message}`); }
  };
  return (
    <div className="product-page projects-page">
      <PageIntro eyebrow={`${projects.length} 个项目 · 实时组合`} title="项目组合" description="同时看清每个项目的里程碑、实际投入、Agent 活动和下一步，避免任何项目悄悄失速。" actions={<><button className="quiet-button" type="button" onClick={onImport}><GitBranch size={17} />导入仓库</button><button className="primary-small" type="button" onClick={() => setEditor({ mode: "create" })}><Plus size={17} />新建项目</button></>} />
      <section className="portfolio-summary"><StatCard icon={Stack} label="活跃项目" value={`${activeCount} / ${projects.filter((project) => project.status !== "archived").length}`} note={`${projects.filter((project) => project.status === "paused").length} 个项目暂缓`} /><StatCard icon={CalendarCheck} label="近期里程碑" value={`${dueMilestones} 个`} note="未来 14 天内到期" tone="purple" /><StatCard icon={CheckSquareOffset} label="未完成任务" value={`${projects.flatMap((project) => project.tasks).filter((task) => !["done", "archived"].includes(task.status)).length} 个`} note="来自全部项目" tone="green" /><StatCard icon={WarningCircle} label="失速提醒" value={`${riskCount} 个`} note={riskCount ? "查看需关注项目" : "当前没有风险项目"} tone="amber" /></section>
      <div className="portfolio-toolbar"><div>{["全部", "推进中", "需关注", "暂缓", "已归档"].map((item) => <button type="button" className={status === item ? "active" : ""} onClick={() => setStatus(item)} key={item}>{item}</button>)}</div><label><MagnifyingGlass size={17} /><input id="project-search" name="project-search" aria-label="搜索项目" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目…" /></label></div>
      <section className="project-card-grid">
        {shown.map((project) => (
          <article className={`project-card ${project.status}`} key={project.id}>
            <div className="project-card-head"><span className="project-avatar" style={{ background: project.color }}>{project.name.slice(0, 1)}</span><div><h2>{project.name}</h2><p>{project.description || "等待补充项目描述"}</p></div><button type="button" aria-label={`${project.name}项目菜单`} onClick={() => setMenuId(menuId === project.id ? null : project.id)}><DotsThree size={20} /></button>{menuId === project.id && <div className="project-card-menu"><button type="button" onClick={() => { onToggleFavorite(project.id); setMenuId(null); onToast(favoriteIds.includes(project.id) ? "已从常用项目移除" : "已加入常用项目"); }}>{favoriteIds.includes(project.id) ? "取消常用" : "设为常用"}</button><button type="button" onClick={() => { setEditor(project); setMenuId(null); }}>编辑项目</button>{project.status === "archived" ? <button type="button" onClick={async () => { await onUpdate(project.id, { status: "active" }); setMenuId(null); onToast("项目已恢复"); }}>恢复项目</button> : <button type="button" onClick={() => archiveProject(project)}>归档项目</button>}</div>}</div>
            <div className="project-health"><span className={`health-dot ${project.healthTone}`} />{project.health}<em>{relativeActivity(project.lastActivityAt)}</em></div>
            <div className="milestone-snippet"><div><span>当前里程碑</span><strong>{project.currentMilestone?.title ?? "尚未创建里程碑"}</strong></div><em>{project.milestoneProgress}%</em><ProgressBar value={project.milestoneProgress} color={project.color} /><small>{project.currentMilestone?.targetDate ? `${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(project.currentMilestone.targetDate))} 到期` : `${project.completed} / ${project.taskCount} 个任务完成`}</small></div>
            <div className="project-metrics"><span><Clock size={15} /><strong>{compactDuration(Math.round(project.focusSeconds / 60))}</strong><small>本周真实投入</small></span><span><ListChecks size={15} /><strong>{project.tasks.filter((task) => task.status !== "archived").length}</strong><small>任务</small></span><span><Robot size={15} /><strong>{project.agents}</strong><small>Agent</small></span></div>
            <div className="next-step"><Target size={17} /><span><small>下一步</small><strong>{project.next}</strong></span></div>
            {project.status !== "archived" && <button className="open-project" type="button" onClick={() => onOpenProject("overview", project.id)}>进入项目 <ArrowRight size={16} /></button>}
          </article>
        ))}
        {!shown.length && <div className="portfolio-empty card-surface"><FolderOpen size={28} /><h2>{query ? "没有匹配的项目" : "这里还没有项目"}</h2><p>创建一个空白项目，或从 GitHub / Gitea 导入仓库。</p><button className="primary-small" type="button" onClick={() => setEditor({ mode: "create" })}><Plus size={16} />新建项目</button></div>}
      </section>
      {editor && <ProjectEditor project={editor.id ? editor : null} pending={pending} onClose={() => setEditor(null)} onSave={saveProject} />}
      {undoArchive && <div className="project-undo-banner" role="status"><CheckCircle size={17} weight="fill" /><span><strong>{undoArchive.name} 已归档</strong><small>8 秒内可以恢复原状态</small></span><button type="button" onClick={restoreArchivedProject}>撤销归档</button><button type="button" aria-label="关闭撤销提示" onClick={() => setUndoArchive(null)}><X size={14} /></button></div>}
    </div>
  );
}

function LegacyTimeView({ onOpenProject, onToast }) {
  const [range, setRange] = useState("今天");
  const rows = [
    { time: "09:00", height: 58, project: "PixelMind", title: "画布网格代码审阅", color: "#4057f4", span: "50m" },
    { time: "10:10", height: 42, project: "系统", title: "Inbox 整理 + 日计划", color: "#8b97ad", span: "25m" },
    { time: "11:00", height: 72, project: "PixelMind", title: "画布网格渲染验收", color: "#4057f4", span: "进行中 · 50m" },
    { time: "13:40", height: 50, project: "EdgeMind", title: "设备租约回收策略", color: "#7c5ce5", span: "35m" },
    { time: "15:00", height: 46, project: "Content Studio", title: "安装包 smoke test", color: "#18a97a", span: "30m" },
  ];
  return (
    <div className="product-page time-page">
      <PageIntro eyebrow="时间视图 · ADHD 护栏" title="把注意力预算变成看得见的时间" description="计划和实际投入放在一起；当某个项目吞掉过多时间时，系统会主动保护其他项目。" actions={<button className="primary-small" type="button" onClick={() => onToast("已自动安排本周剩余时间盒") }><Sparkle size={17} />自动排程</button>} />
      <section className="time-summary"><StatCard icon={Timer} label="今日可用" value="4h 10m" note="已安排 3h 20m" /><StatCard icon={TrendUp} label="实际专注" value="1h 08m" note="连续完成 2 个时间盒" tone="green" /><StatCard icon={Warning} label="偏移" value="+42m" note="PixelMind 超出今日预算" tone="amber" /></section>
      <section className="time-layout">
        <div className="schedule-panel card-surface">
          <div className="schedule-toolbar"><div>{["今天", "本周"].map((item) => <button type="button" key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>)}</div><strong>8 月 19 日 · 星期三</strong><button type="button"><CalendarBlank size={17} />选择日期</button></div>
          <div className="timeline-grid">
            {rows.map((row) => <div className="timeline-row" key={row.time}><time>{row.time}</time><button type="button" style={{ minHeight: row.height, borderLeftColor: row.color, background: `${row.color}0d` }} onClick={() => onOpenProject("overview")}><span><strong>{row.title}</strong><small>{row.project}</small></span><em>{row.span}</em></button></div>)}
            <div className="timeline-row empty"><time>16:00</time><button type="button" onClick={() => onToast("已在 16:00 创建空时间盒")}><Plus size={16} />保留缓冲时间</button></div>
          </div>
        </div>
        <aside className="time-insights">
          <article className="card-surface budget-card"><div className="section-title"><div><span>本周项目预算</span><h2>时间分配</h2></div><Clock size={20} /></div>{projects.map((project) => <button type="button" key={project.id} onClick={() => onOpenProject("overview", project.id)}><span className="project-dot" style={{ background: project.color }} /><span><strong>{project.name}</strong><ProgressBar value={Math.round(Math.min(100, project.focusHours * 5.5))} color={project.color} /></span><em>{project.focusHours}h</em></button>)}</article>
          <article className="imbalance-card"><Warning size={22} weight="fill" /><div><h2>注意力失衡</h2><p>PixelMind 已使用本周 68% 的专注时间，而 EdgeMind 连续 3 天没有获得时间盒。</p><button type="button" onClick={() => onToast("已接受建议：今天 13:40 为 EdgeMind 保留 35 分钟")}>接受重新平衡建议</button></div></article>
        <article className="card-surface rhythm-card"><div className="section-title"><div><span>个人节律</span><h2>最清晰的时段</h2></div><Pulse size={20} /></div><div className="rhythm-bars">{[38,55,78,92,86,60,42,35].map((value, index) => <span key={index} style={{ height: `${value}%` }} className={index === 3 ? "peak" : ""} />)}</div><p>你通常在 10:30–12:00 思路最清晰，复杂决策优先放在这个时间。</p></article>
        </aside>
      </section>
    </div>
  );
}

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 650 });
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(320, Math.floor(entry.contentRect.width)), height: Math.max(420, Math.floor(entry.contentRect.height)) }));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

export function KnowledgeGraphView({ onOpenProject }) {
  const graphRef = useRef();
  const [containerRef, size] = useElementSize();
  const [selectedType, setSelectedType] = useState("全部");
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [focusDepth, setFocusDepth] = useState(0);
  const graph = useKnowledgeGraph();
  const types = useMemo(() => ["全部", ...[...new Set(graph.nodes.map((node) => node.type))].sort()], [graph.nodes]);
  const searchMatches = useMemo(() => search.trim() ? graph.nodes.filter((node) => `${node.label} ${node.meta} ${node.type}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6) : [], [graph.nodes, search]);
  const graphData = useMemo(() => {
    const term = search.trim().toLowerCase();
    let allowedIds = new Set(graph.nodes.filter((node) => (selectedType === "全部" || node.type === selectedType || node.type === "project") && (!term || `${node.label} ${node.meta} ${node.type}`.toLowerCase().includes(term))).map((node) => node.id));
    if (selected && focusDepth) {
      const focused = new Set([selected.id]);
      for (let depth = 0; depth < focusDepth; depth += 1) {
        graph.links.forEach((link) => {
          const source = typeof link.source === "string" ? link.source : link.source.id;
          const target = typeof link.target === "string" ? link.target : link.target.id;
          if (focused.has(source)) focused.add(target);
          if (focused.has(target)) focused.add(source);
        });
      }
      allowedIds = new Set([...allowedIds].filter((id) => focused.has(id)));
      allowedIds.add(selected.id);
    }
    return {
      nodes: graph.nodes.filter((node) => allowedIds.has(node.id)).map((node) => ({ ...node })),
      links: graph.links.filter((link) => allowedIds.has(typeof link.source === "string" ? link.source : link.source.id) && allowedIds.has(typeof link.target === "string" ? link.target : link.target.id)).map((link) => ({ ...link, source: typeof link.source === "string" ? link.source : link.source.id, target: typeof link.target === "string" ? link.target : link.target.id })),
    };
  }, [focusDepth, graph.links, graph.nodes, search, selected, selectedType]);

  const focusNode = (node) => {
    setSelected(node);
    const distance = 90;
    const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
    graphRef.current?.cameraPosition({ x: (node.x || 1) * distRatio, y: (node.y || 1) * distRatio, z: (node.z || 1) * distRatio }, node, 900);
  };
  const relationItems = selected ? graph.links.filter((link) => {
    const source = typeof link.source === "string" ? link.source : link.source.id;
    const target = typeof link.target === "string" ? link.target : link.target.id;
    return source === selected.id || target === selected.id;
  }).map((link) => {
    const source = typeof link.source === "string" ? link.source : link.source.id;
    const target = typeof link.target === "string" ? link.target : link.target.id;
    const neighborId = source === selected.id ? target : source;
    return { ...link, neighbor: graph.nodes.find((node) => node.id === neighborId) };
  }) : [];

  return (
    <div className="graph-page">
      <div className="graph-header"><div><span className="eyebrow">全局知识层 · {graph.totalNodes} 个实体 · {graph.totalLinks} 条关系</span><h1>3D 知识图谱</h1><p>来自项目层级、画布 @ 关联和 EntityLink 的同一份实时关系数据；支持搜索与一跳/二跳聚焦。</p></div><div className="graph-header-controls"><label><MagnifyingGlass size={15} /><input aria-label="搜索知识图谱" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索节点…" /></label>{search.trim() && <div className="graph-search-results">{searchMatches.map((node) => <button type="button" key={node.id} onClick={() => focusNode(node)}><i style={{ background: nodeColors[node.type] || "#8b97ad" }} /><span><strong>{node.label}</strong><small>{node.type}</small></span></button>)}{!searchMatches.length && <em>没有匹配节点</em>}</div>}<div className="graph-filters">{types.map((type) => <button type="button" key={type} className={selectedType === type ? "active" : ""} onClick={() => setSelectedType(type)}><span style={{ background: type === "全部" ? "#fff" : nodeColors[type] || "#8b97ad" }} />{type === "全部" ? "全部" : type}</button>)}</div></div></div>
      <div className="graph-workspace">
        <div className="graph-canvas" ref={containerRef}>
          <ForceGraph3D
            ref={graphRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="#0b1020"
            nodeLabel={(node) => `${node.label} · ${node.type}`}
            nodeColor={(node) => nodeColors[node.type] || "#8b97ad"}
            nodeVal={(node) => node.val}
            nodeOpacity={0.94}
            linkColor={() => "rgba(145,159,202,.45)"}
            linkWidth={1.2}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleColor={() => "#7f91ff"}
            showNavInfo={false}
            onNodeClick={focusNode}
          />
          <div className="graph-help"><Cube size={16} />拖动旋转 · 滚轮缩放 · 点击节点查看关系 · 当前 {graphData.nodes.length} 个节点</div>
          {!graphData.nodes.length && <div className="graph-canvas-empty"><Graph size={30} /><strong>{graph.isLoading ? "正在生成实时图谱" : "没有匹配节点"}</strong></div>}
        </div>
        <aside className="graph-detail">
          {selected ? <><span className="detail-type" style={{ color: nodeColors[selected.type] || "#8b97ad" }}>{selected.type}</span><h2>{selected.label}</h2><p>{selected.meta || `实体 ID：${selected.rawId}`}</p><div className="graph-focus-actions"><button type="button" className={focusDepth === 1 ? "active" : ""} onClick={() => setFocusDepth(focusDepth === 1 ? 0 : 1)}>一跳</button><button type="button" className={focusDepth === 2 ? "active" : ""} onClick={() => setFocusDepth(focusDepth === 2 ? 0 : 2)}>二跳</button><button type="button" onClick={() => setFocusDepth(0)}>恢复全图</button></div><div className="detail-relations"><strong>关系 · {relationItems.length}</strong>{relationItems.slice(0, 18).map((link) => <button type="button" key={link.id} onClick={() => link.neighbor && focusNode(link.neighbor)}><Graph size={15} /><span>{link.relation}</span><em>{link.neighbor?.label || "未知实体"}</em></button>)}</div>{selected.projectId && <button className="primary-small" type="button" onClick={() => onOpenProject("overview", selected.projectId)}>进入所属项目 <ArrowRight size={16} /></button>}</> : <div className="graph-empty"><span><Graph size={28} weight="duotone" /></span><h2>选择一个节点</h2><p>这里会显示它的双向链接、层级关系与所属项目。</p></div>}
          <div className="graph-legend"><strong>当前实体类型</strong>{types.filter((type) => type !== "全部").map((type) => <span key={type}><i style={{ background: nodeColors[type] || "#8b97ad" }} />{type}</span>)}</div>
        </aside>
      </div>
    </div>
  );
}
