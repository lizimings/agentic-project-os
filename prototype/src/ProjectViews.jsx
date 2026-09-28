import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  CalendarBlank,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  ClipboardText,
  Clock,
  Code,
  DotsThree,
  Flag,
  FolderOpen,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Graph,
  Lightbulb,
  LinkSimple,
  ListChecks,
  LockSimple,
  NotePencil,
  Pause,
  Play,
  Plus,
  Pulse,
  Robot,
  ShieldCheck,
  Sparkle,
  Target,
  TreeStructure,
  Tray,
  Warning,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { SiGitea, SiGithub } from "react-icons/si";
import { projects } from "./data.js";
import { logApi } from "./api.js";
import { desktopBridge } from "./desktopBridge.js";
import { MindMapView } from "./CanvasViews.jsx";
import { ProjectIdeasView } from "./ProjectKnowledgeViews.jsx";
import { ProjectGraphLive } from "./ProjectGraphLive.jsx";
import { TaskManagementView } from "./TaskManagementView.jsx";
import { WorktreeManagementView } from "./WorktreeManagementView.jsx";
import { useActors, useOrganizer, useProjectCore, useProjectLogs, useProjectPolicy, useProjectRemote, useWorkspace } from "./useCoreData.js";

const projectTabs = [
  { id: "overview", label: "总览", icon: Pulse },
  { id: "milestones", label: "里程碑", icon: Flag },
  { id: "worktrees", label: "工作树", icon: GitBranch },
  { id: "tasks", label: "任务", icon: ListChecks },
  { id: "inbox", label: "Inbox", icon: Tray },
  { id: "ideas", label: "想法库", icon: Lightbulb },
  { id: "projectGraph", label: "关系图", icon: Graph },
  { id: "mindmap", label: "思维导图", icon: TreeStructure },
  { id: "logs", label: "日志", icon: ClipboardText },
  { id: "settings", label: "设置", icon: Wrench },
];

function ProgressBar({ value, color = "#4057f4" }) {
  return <span className="progress-track"><span style={{ width: `${value}%`, background: color }} /></span>;
}

const milestoneStatusLabels = { planned: "计划中", active: "推进中", blocked: "受阻", completed: "已完成", archived: "已归档" };
const taskStatusLabels = { todo: "待开始", in_progress: "进行中", blocked: "受阻", done: "已完成", archived: "已归档" };

function formatDate(value, fallback = "未安排") {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function entityProgress(items) {
  if (!items.length) return 0;
  return Math.round((items.filter((item) => item.status === "done" || item.status === "completed").length / items.length) * 100);
}

function ProjectHeader({ section, onSectionChange, onBack, onToast, project, remote, onRemoteSync, remotePending }) {
  const projectStatus = { active: "正常推进", risk: "需要关注", paused: "已暂缓", archived: "已归档" }[project.status] ?? "正常推进";
  const RemoteIcon = remote?.provider === "gitea" ? SiGitea : SiGithub;
  return (
    <>
      <header className="project-header">
        <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={17} />项目组合</button>
        <div className="project-identity"><span className="project-avatar large" style={{ background: project.color }}>{project.name.slice(0, 1)}</span><div><div><h1>{project.name}</h1><span className={`project-state ${project.status}`}><i />{projectStatus}</span></div><p>{project.description}</p></div></div>
        <div className="project-repo"><RemoteIcon size={19} /><span><strong>{remote?.fullName || "未绑定远程仓库"}</strong><small>{remote ? `${remote.defaultBranch || "未设置默认分支"} · ${new URL(remote.baseUrl).host}` : "可连接 GitHub 或自部署 Gitea"}</small></span>{remote && <CheckCircle size={18} weight="fill" />}</div>
        <button className="quiet-button" type="button" disabled={!remote || remotePending} onClick={async () => { try { const job = await onRemoteSync(); onToast(job.status === "succeeded" ? `远程同步完成：${job.progressCurrent}/${job.progressTotal}` : `同步失败，可在设置重试：${job.error}`); } catch (error) { onToast(`同步失败：${error.message}`); } }}><ArrowsClockwise size={17} className={remotePending ? "spin" : ""} />{remotePending ? "同步中" : "同步"}</button>
        <button className="primary-small" type="button" onClick={() => onToast("已开始当前里程碑的下一个任务") }><Play size={17} weight="fill" />开始推进</button>
      </header>
      <nav className="project-tabs" aria-label="项目视图">
        {projectTabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={section === id ? "active" : ""} onClick={() => onSectionChange(id)}><Icon size={17} weight={section === id ? "fill" : "regular"} />{label}{id === "inbox" && <em>2</em>}</button>)}
      </nav>
    </>
  );
}

function WorkspaceSyncStrip({ workspace, onSectionChange, onToast }) {
  if (!workspace) return null;
  const online = workspace.watcher === "online";
  return (
    <section className="workspace-sync-strip card-surface">
      <span className="workspace-strip-icon"><FolderOpen size={21} weight="duotone" /></span>
      <div className="workspace-strip-main">
        <span><strong>本地工作区</strong><em className={online ? "" : "offline"}><i />{online ? "Local Agent 正在监听" : "尚未绑定"}</em></span>
        <code>{workspace.path}</code>
      </div>
      <div className="workspace-strip-metrics">
        <span><small>当前分支</small><strong><GitBranch size={14} />{workspace.branch}</strong></span>
        <span><small>HEAD</small><strong><GitCommit size={14} />{workspace.head}</strong></span>
        <span><small>工作区</small><strong>{workspace.dirtyFiles} 个改动 · ↑{workspace.ahead}</strong></span>
        <span><small>Worktree</small><strong>{workspace.worktrees} 个 · {workspace.lastScan}扫描</strong></span>
      </div>
      <div className="workspace-strip-actions">
        <button type="button" onClick={() => online ? onToast("已请求本地 Agent 重新扫描 Git 状态") : onSectionChange("settings")}><ArrowsClockwise size={15} />{online ? "立即扫描" : "绑定目录"}</button>
        <button type="button" onClick={() => onSectionChange("settings")}>管理连接<CaretRight size={14} /></button>
      </div>
    </section>
  );
}

function OverviewView({ project, milestones, plans, tasks, ideas, onSectionChange, onToast, workspace }) {
  const activeMilestones = milestones.filter((item) => item.status !== "archived");
  const currentMilestone = activeMilestones.find((item) => item.status === "active" || item.status === "blocked") ?? activeMilestones[0] ?? null;
  const milestonePlans = plans.filter((item) => item.status !== "archived" && item.milestoneId === currentMilestone?.id);
  const milestoneTasks = tasks.filter((item) => item.status !== "archived" && item.milestoneId === currentMilestone?.id);
  const done = milestoneTasks.filter((item) => item.status === "done").length;
  const progress = milestoneTasks.length ? Math.round((done / milestoneTasks.length) * 100) : 0;
  const nextTask = milestoneTasks.find((item) => item.status === "in_progress") ?? milestoneTasks.find((item) => item.status === "blocked") ?? milestoneTasks.find((item) => item.status === "todo") ?? null;
  const hasWorkspace = workspace.watcher === "online";
  const activityItems = [
    ...(workspace.commits ?? []).map((item) => ({ at: item.committedAt, actor: item.author, action: "提交", detail: `${item.shortHash} · ${item.subject}`, type: "git" })),
    ...milestones.map((item) => ({ at: item.updatedAt, actor: "里程碑", action: milestoneStatusLabels[item.status], detail: item.title, type: "system" })),
    ...plans.map((item) => ({ at: item.updatedAt, actor: "计划", action: milestoneStatusLabels[item.status], detail: item.title, type: "system" })),
    ...tasks.map((item) => ({ at: item.updatedAt, actor: item.assigneeId || "任务", action: taskStatusLabels[item.status], detail: item.title, type: item.assigneeType === "agent" ? "agent" : "human" })),
    ...ideas.map((item) => ({ at: item.updatedAt, actor: item.sourceType === "agent" ? "Agent" : "想法库", action: item.status === "converted" ? "已转化" : "已更新", detail: item.title, type: item.sourceType === "agent" ? "agent" : "human" })),
    { at: project.updatedAt, actor: "项目", action: "资料已同步", detail: project.name, type: "system" },
  ].filter((item) => item.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);
  return (
    <div className="project-content overview-view">
      <WorkspaceSyncStrip workspace={workspace} onSectionChange={onSectionChange} onToast={onToast} />
      <section className="project-overview-grid">
        <article className="milestone-hero card-surface">
          <div className="hero-top"><div><span className="eyebrow">当前里程碑 · 实时数据</span><h2>{currentMilestone?.title ?? "尚未定义里程碑"}</h2><p>{currentMilestone?.description || "先定义一个可验收阶段，让想法、计划和任务拥有共同方向。"}</p></div><span className="milestone-date"><CalendarBlank size={17} />{formatDate(currentMilestone?.targetDate)}</span></div>
          <div className="milestone-progress"><div><strong>{progress}%</strong><span>{done} / {milestoneTasks.length} 个任务完成</span></div><ProgressBar value={progress} /><em>{currentMilestone?.status ? milestoneStatusLabels[currentMilestone.status] : "等待创建"}</em></div>
          <div className="milestone-plans">
            {milestonePlans.slice(0, 3).map((plan) => { const planTasks = milestoneTasks.filter((task) => task.planId === plan.id); return <button type="button" key={plan.id} onClick={() => onSectionChange("tasks")}><span><CheckCircle size={17} weight={planTasks.length > 0 && planTasks.every((task) => task.status === "done") ? "fill" : "regular"} /><strong>{plan.title}</strong></span><em>{planTasks.filter((task) => task.status === "done").length} / {planTasks.length}</em></button>; })}
            {!milestonePlans.length && <button type="button" onClick={() => onSectionChange("milestones")}><span><Plus size={17} /><strong>添加阶段计划</strong></span><em>开始拆解</em></button>}
          </div>
          <button className="text-action" type="button" onClick={() => onSectionChange("milestones")}>查看完整里程碑 <ArrowRight size={15} /></button>
        </article>

        <article className="next-action-card">
          <div className="next-label"><LightningIcon /><span>系统建议的下一步</span></div>
          <h2>{nextTask?.title ?? "定义一个最小推进任务"}</h2>
          <p>{nextTask?.description || `为 ${project.name} 写下今天可以完成、能留下证据的最小结果。`}</p>
          <div><span><Clock size={15} />预计 {nextTask?.estimateMinutes ? `${nextTask.estimateMinutes} 分钟` : "待估算"}</span><span><Target size={15} />{nextTask?.status === "blocked" ? "当前受阻" : nextTask?.assigneeId ? `负责人 ${nextTask.assigneeId}` : "尚未分配"}</span></div>
          <button type="button" onClick={() => onSectionChange("tasks")}><Play size={17} weight="fill" />{nextTask ? "打开任务" : "创建任务"}</button>
        </article>
      </section>

      <section className="overview-panels">
        <article className="card-surface worktree-summary">
          <div className="section-title"><div><span>执行层</span><h2>工作树与 Agent</h2></div><button type="button" onClick={() => onSectionChange(hasWorkspace ? "worktrees" : "settings")}>{hasWorkspace ? "查看全部" : "绑定目录"}</button></div>
          {hasWorkspace ? (workspace.worktreeItems ?? []).slice(0, 3).map((tree) => <button className="mini-worktree" type="button" key={tree.id} onClick={() => onSectionChange("worktrees")}><span className={`tree-state ${tree.dirtyFiles ? "review" : tree.isCurrent ? "running" : "idle"}`}><GitBranch size={17} /></span><span><strong>{tree.branch || "detached HEAD"}</strong><small>{tree.lastCommit?.subject || tree.head} · {tree.dirtyFiles} 个改动</small></span><em className={tree.dirtyFiles ? "review" : tree.isCurrent ? "running" : "idle"}>{tree.dirtyFiles ? "有改动" : tree.isCurrent ? "当前" : "干净"}</em><CaretRight size={15} /></button>) : <button className="mini-worktree" type="button" onClick={() => onSectionChange("settings")}><span className="tree-state idle"><FolderOpen size={17} /></span><span><strong>绑定本地项目文件夹</strong><small>绑定后自动发现 Git worktree 和最近活动</small></span><CaretRight size={15} /></button>}
        </article>
        <article className="card-surface recent-output">
          <div className="section-title"><div><span>证据层</span><h2>最近产出</h2></div><button type="button" onClick={() => onSectionChange("logs")}>项目日志</button></div>
          {hasWorkspace ? (workspace.commits ?? []).slice(0, 3).map((commit) => <button type="button" className="output-item real-commit" key={commit.id} onClick={() => onSectionChange("worktrees")}><span className="output-icon"><GitCommit size={18} /></span><span><strong>{commit.subject}</strong><small>{commit.shortHash} · {commit.author}</small></span><em>{formatDate(commit.committedAt)}</em></button>) : <div className="output-empty"><GitCommit size={20} /><span><strong>等待 Git 证据</strong><small>绑定工作区后在这里显示提交、测试与产出</small></span></div>}
          {hasWorkspace && !(workspace.commits ?? []).length && <div className="output-empty"><GitCommit size={20} /><span><strong>工作区已绑定，暂无提交证据</strong><small>下一次 Git 扫描会同步最近提交</small></span></div>}
        </article>
        <article className="card-surface linked-context">
          <div className="section-title"><div><span>关系层</span><h2>关联上下文</h2></div><button type="button" onClick={() => onSectionChange("projectGraph")}>打开关系图</button></div>
          <button type="button" onClick={() => onSectionChange("ideas")}><Sparkle size={17} /><span><strong>{ideas.filter((idea) => idea.status !== "archived").length} 条项目想法</strong><small>与任务和里程碑共享关系层</small></span><CaretRight size={15} /></button>
          <button type="button" onClick={() => onSectionChange("mindmap")}><LinkSimple size={17} /><span><strong>{milestones.length + plans.length + tasks.length} 个层级实体</strong><small>可通过 @ 提及建立双向链接</small></span><CaretRight size={15} /></button>
        </article>
      </section>

      <section className="project-activity card-surface">
        <div className="section-title"><div><span>实体更新时间</span><h2>项目动态</h2></div><button type="button" onClick={() => onSectionChange("logs")}>查看完整事件日志</button></div>
        {activityItems.map((log) => <div className="activity-row" key={`${log.at}-${log.detail}`}><time>{new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(log.at))}</time><span className={`activity-dot ${log.type}`} /><span><strong>{log.actor}</strong> {log.action}<small>{log.detail}</small></span></div>)}
      </section>
    </div>
  );
}

function LightningIcon() {
  return <span className="next-icon"><Sparkle size={18} weight="fill" /></span>;
}

function MilestonesView({ projectId, milestones, plans, tasks, links, binding, onCreate, onUpdate, onArchive, onCreatePlan, onUpdatePlan, onArchivePlan, pending, onToast }) {
  const activeMilestones = milestones.filter((item) => item.status !== "archived");
  const activePlans = plans.filter((item) => item.status !== "archived");
  const [selected, setSelected] = useState(activeMilestones[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", targetDate: "" });
  const [planTitle, setPlanTitle] = useState("");
  const [draggedId, setDraggedId] = useState(null);
  useEffect(() => {
    if (!activeMilestones.some((item) => item.id === selected)) setSelected(activeMilestones[0]?.id ?? null);
  }, [milestones, selected]);
  const selectedMilestone = activeMilestones.find((item) => item.id === selected) ?? null;
  const selectedPlans = activePlans.filter((item) => item.milestoneId === selected);
  const selectedTaskIds = new Set(tasks.filter((item) => item.milestoneId === selectedMilestone?.id && item.status !== "archived").map((item) => item.id));
  const dependencyLinks = links.filter((link) => ["dependsOn", "blocks"].includes(link.relation) && link.sourceType === "task" && link.targetType === "task" && (selectedTaskIds.has(link.sourceId) || selectedTaskIds.has(link.targetId)));
  const evidenceLinks = links.filter((link) => link.relation === "evidenceFor" && link.targetType === "task" && selectedTaskIds.has(link.targetId));
  const taskWorktrees = new Set(links.filter((link) => link.sourceType === "worktree" && link.targetType === "task" && selectedTaskIds.has(link.targetId)).map((link) => link.sourceId));
  const linkedCommits = (binding?.commits ?? []).filter((commit) => taskWorktrees.has(commit.worktreeId));
  const gitEvidence = (linkedCommits.length ? linkedCommits : binding?.commits ?? []).slice(0, 3);

  const reorderMilestone = async (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const ordered = [...activeMilestones].sort((left, right) => left.position - right.position);
    const sourceIndex = ordered.findIndex((item) => item.id === sourceId);
    const targetIndex = ordered.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    try {
      await Promise.all(ordered.filter((item, index) => item.position !== index).map((item, index) => onUpdate(item.id, { position: index })));
      onToast("里程碑顺序已持久化");
    } catch (error) { onToast(`排序失败：${error.message}`); }
    finally { setDraggedId(null); }
  };

  const createMilestone = async (event) => {
    event.preventDefault();
    try {
      const created = await onCreate({
        projectId,
        title: draft.title,
        description: draft.description,
        status: "planned",
        targetDate: draft.targetDate ? new Date(`${draft.targetDate}T12:00:00`).toISOString() : null,
        position: activeMilestones.length,
      });
      setSelected(created.id);
      setDraft({ title: "", description: "", targetDate: "" });
      setCreating(false);
      onToast("里程碑已创建并写入项目关系层");
    } catch (error) { onToast(`创建失败：${error.message}`); }
  };

  const createPlan = async (event) => {
    event.preventDefault();
    if (!selectedMilestone) return;
    try {
      await onCreatePlan({ projectId, milestoneId: selectedMilestone.id, title: planTitle, description: "", status: "planned", position: selectedPlans.length });
      setPlanTitle("");
      onToast("阶段计划已创建");
    } catch (error) { onToast(`创建失败：${error.message}`); }
  };

  return (
    <div className="project-content milestones-view">
      <div className="view-heading"><div><span className="eyebrow">长期展望与分段进度 · 实时数据</span><h2>里程碑</h2><p>把长期方向拆成可验收的阶段，每个阶段再连接计划、任务、工作树和 Git 证据。</p></div><button className="primary-small" type="button" onClick={() => setCreating((value) => !value)}><Plus size={17} />新建里程碑</button></div>
      {creating && <form className="entity-composer card-surface" onSubmit={createMilestone}><label><span>里程碑名称</span><input name="milestone-title" autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：M3 · Agent 调度闭环" /></label><label><span>目标日期</span><input name="milestone-target-date" type="date" value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} /></label><label className="wide"><span>验收描述</span><input name="milestone-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="完成什么结果才算进入下一阶段" /></label><div><button type="button" onClick={() => setCreating(false)}>取消</button><button className="primary-small" type="submit" disabled={pending || !draft.title.trim()}>创建</button></div></form>}
      <section className="milestone-layout">
        <div className="milestone-list">
          {activeMilestones.map((milestone) => { const milestoneTasks = tasks.filter((item) => item.milestoneId === milestone.id && item.status !== "archived"); const progress = entityProgress(milestoneTasks); const milestonePlans = activePlans.filter((item) => item.milestoneId === milestone.id); return <button type="button" draggable key={milestone.id} className={`milestone-card ${selected === milestone.id ? "selected" : ""} ${draggedId === milestone.id ? "dragging" : ""}`} onDragStart={(event) => { setDraggedId(milestone.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", milestone.id); }} onDragEnd={() => setDraggedId(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); void reorderMilestone(event.dataTransfer.getData("text/plain") || draggedId, milestone.id); }} onClick={() => setSelected(milestone.id)}><span className="milestone-drag-handle" title="拖动排序"><DotsThree size={16} /></span><span className="milestone-flag" style={{ color: "#4057f4", background: "#4057f414" }}><Flag size={19} weight="fill" /></span><span className="milestone-main"><span><strong>{milestone.title}</strong><em>{milestoneStatusLabels[milestone.status]}</em></span><ProgressBar value={progress} /><small>{milestoneTasks.filter((item) => item.status === "done").length}/{milestoneTasks.length} 个任务 · {milestonePlans.length} 个计划</small></span><span className="milestone-deadline"><CalendarBlank size={15} />{formatDate(milestone.targetDate)}<strong>{progress}%</strong></span></button>; })}
          {!activeMilestones.length && <div className="entity-empty card-surface"><Flag size={24} /><strong>还没有里程碑</strong><span>先定义一个可验收阶段，计划和任务才能稳定归位。</span></div>}
        </div>
        <aside className="milestone-detail card-surface">
          {selectedMilestone ? <><span className="eyebrow">当前选择</span><h2>{selectedMilestone.title}</h2><p>{selectedMilestone.description || "完成该阶段的可验证成果后，再进入下一个里程碑。"}</p>
          <div className="entity-status-row"><label><span>阶段状态</span><select name="milestone-status" value={selectedMilestone.status} disabled={pending} onChange={async (event) => { try { await onUpdate(selectedMilestone.id, { status: event.target.value }); onToast("里程碑状态已更新"); } catch (error) { onToast(`更新失败：${error.message}`); } }}>{Object.entries(milestoneStatusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="button" onClick={async () => { await onArchive(selectedMilestone.id); onToast("里程碑已归档"); }} disabled={pending}>归档</button></div>
          <div className="milestone-health"><strong>阶段健康度</strong><span><i className={selectedMilestone.status === "blocked" ? "normal" : "good"} />{selectedMilestone.status === "blocked" ? "需要解除阻塞" : "层级数据已同步"}</span></div>
          <div className="plan-list"><strong>阶段计划</strong>{selectedPlans.map((plan) => { const planTasks = tasks.filter((item) => item.planId === plan.id && item.status !== "archived"); const progress = entityProgress(planTasks); return <div className="plan-row" key={plan.id}><CheckCircle size={17} weight={progress === 100 ? "fill" : "regular"} /><span><strong>{plan.title}</strong><ProgressBar value={progress} /></span><select aria-label={`${plan.title}状态`} value={plan.status} onChange={(event) => onUpdatePlan(plan.id, { status: event.target.value })}>{Object.entries(milestoneStatusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button type="button" aria-label={`归档${plan.title}`} onClick={() => onArchivePlan(plan.id)}><X size={14} /></button></div>; })}<form className="plan-composer" onSubmit={createPlan}><input name="plan-title" value={planTitle} required onChange={(event) => setPlanTitle(event.target.value)} placeholder="添加阶段计划…" /><button type="submit" disabled={pending || !planTitle.trim()}><Plus size={15} /></button></form></div>
          <div className="milestone-evidence"><strong>关联证据</strong><span><LinkSimple size={16} />{dependencyLinks.length} 条任务依赖 / 阻塞</span><span><CheckCircle size={16} />{evidenceLinks.length} 条专注完成证据</span><span><GitCommit size={16} />{gitEvidence.length} 条真实 Git 提交{linkedCommits.length ? "已关联工作树" : binding ? "（项目级）" : ""}</span>{gitEvidence.map((commit) => <button type="button" className="milestone-commit-evidence" key={commit.id} title={commit.hash}><code>{commit.shortHash}</code><span>{commit.subject}</span><em>{commit.author}</em></button>)}<span><ClipboardText size={16} />所有变更已写入项目日志</span></div></> : <div className="entity-empty compact"><Flag size={24} /><strong>选择或创建里程碑</strong></div>}
        </aside>
      </section>
    </div>
  );
}

function WorktreesView({ binding, onScan, onSectionChange, pending, onToast }) {
  const trees = binding?.worktrees ?? [];
  const [selectedId, setSelectedId] = useState(trees[0]?.id ?? null);
  useEffect(() => { if (!trees.some((tree) => tree.id === selectedId)) setSelectedId(trees[0]?.id ?? null); }, [binding, selectedId]);
  const selected = trees.find((tree) => tree.id === selectedId) ?? null;
  const rescan = async () => {
    try { const result = await onScan(); onToast(`已刷新 ${result.worktrees.length} 个工作树和 Git 状态`); }
    catch (error) { onToast(`扫描失败：${error.message}`); }
  };
  return (
    <div className="project-content worktrees-view">
      <div className="view-heading"><div><span className="eyebrow">代码执行现场 · git worktree 实时扫描</span><h2>工作树</h2><p>每个工作树都明确显示当前分支、HEAD、路径和 Git 阻塞；任务与 Agent 关联将在同一实体上补齐。</p></div><button className="primary-small" type="button" onClick={binding ? rescan : () => onSectionChange("settings")} disabled={pending}><ArrowsClockwise size={17} className={pending ? "spin" : ""} />{binding ? "重新扫描" : "绑定工作区"}</button></div>
      {binding?.status !== "ready" ? <section className="entity-empty card-surface worktree-empty"><GitBranch size={28} /><strong>{binding ? binding.lastError : "尚未绑定本地工作区"}</strong><span>在项目设置中绑定一个 Git 仓库后，Local Agent 会发现所有 worktree。</span><button className="primary-small" type="button" onClick={() => onSectionChange("settings")}>打开工作区设置</button></section> : <section className="worktree-layout">
        <div className="worktree-table card-surface">
          <div className="tree-table-head"><span>工作树 / 当前任务</span><span>负责人</span><span>状态与活动</span><span>产出 / 阻塞</span></div>
          {trees.map((tree) => { const blocker = tree.lockedReason || tree.prunableReason; return <button type="button" className={`tree-table-row ${selectedId === tree.id ? "selected" : ""}`} key={tree.id} onClick={() => setSelectedId(tree.id)}><span className="tree-branch"><i className={tree.isCurrent ? "running" : "idle"} /><span><strong>{tree.branch || (tree.isDetached ? "detached HEAD" : "bare")}</strong><small>尚未关联任务 · {tree.path}</small></span></span><span className="tree-agent"><Robot size={17} />未关联</span><span><em className={tree.isCurrent ? "running" : "idle"}>{tree.isCurrent ? "当前工作区" : "已发现"}</em><small>{formatDate(tree.scannedAt, "刚刚")}扫描</small></span><span><strong>{tree.head}</strong><small className={blocker ? "has-blocker" : "no-blocker"}>{blocker || "无 Git 阻塞"}</small></span><CaretRight size={16} /></button>; })}
        </div>
        {selected && <aside className="tree-detail card-surface">
          <div className="tree-detail-head"><span className={`tree-state ${selected.isCurrent ? "running" : "idle"}`}><GitBranch size={20} /></span><div><span>{selected.isCurrent ? "当前工作树" : "已发现工作树"}</span><h2>{selected.branch || "detached HEAD"}</h2></div><button type="button" aria-label="更多"><DotsThree size={20} /></button></div>
          <code>{selected.path}</code>
          <div className="tree-detail-state"><span><Robot size={17} /><strong>尚未关联 Agent</strong></span><em className={selected.isCurrent ? "running" : "idle"}>{selected.isCurrent ? "当前目录" : "可用"}</em></div>
          <div className="current-task"><span>当前任务</span><strong>尚未关联任务</strong><small>后续可从任务详情关联这个 worktree</small></div>
          <div className="tree-metrics"><span><small>分支模式</small><strong>{selected.isDetached ? "Detached" : selected.isBare ? "Bare" : "Branch"}</strong></span><span><small>HEAD</small><strong>{selected.head}</strong></span><span><small>阻塞</small><strong>{selected.lockedReason || selected.prunableReason || "无"}</strong></span></div>
          <div className="commit-list"><strong>当前提交证据</strong><button type="button"><GitCommit size={15} /><code>{selected.head}</code><span>来自 git rev-parse</span></button></div>
          <div className="tree-actions"><button type="button" onClick={() => onToast("任务关联将通过 WorktreeLink 实体写入") }><LinkSimple size={17} />关联任务</button><button type="button" className="primary-small" onClick={() => onToast(`本地路径：${selected.path}`) }><Code size={17} />复制路径</button></div>
        </aside>}
      </section>}
    </div>
  );
}

function TasksView({ projectId, milestones, plans, tasks, onCreate, onUpdate, onArchive, pending, onToast }) {
  const [mode, setMode] = useState("层级");
  const activeMilestones = milestones.filter((item) => item.status !== "archived");
  const activePlans = plans.filter((item) => item.status !== "archived");
  const activeTasks = tasks.filter((item) => item.status !== "archived");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: "", planId: activePlans[0]?.id ?? "", assigneeType: "unassigned", assigneeId: "", priority: "medium", dueAt: "" });
  useEffect(() => {
    if (activePlans.length && !activePlans.some((plan) => plan.id === draft.planId)) setDraft((current) => ({ ...current, planId: activePlans[0].id }));
  }, [plans, draft.planId]);
  const grouped = useMemo(() => Object.fromEntries(["todo", "in_progress", "blocked", "done"].map((status) => [status, activeTasks.filter((item) => item.status === status)])), [tasks]);
  const planById = Object.fromEntries(activePlans.map((plan) => [plan.id, plan]));
  const milestoneById = Object.fromEntries(activeMilestones.map((milestone) => [milestone.id, milestone]));
  const hierarchyRows = activePlans.flatMap((plan) => [
    { ...plan, type: "plan" },
    ...activeTasks.filter((task) => task.planId === plan.id).map((task) => ({ ...task, type: "task" })),
  ]);

  const createTask = async (event) => {
    event.preventDefault();
    const plan = planById[draft.planId];
    if (!plan) return onToast("请先在里程碑中创建阶段计划");
    try {
      await onCreate({
        projectId,
        milestoneId: plan.milestoneId,
        planId: plan.id,
        parentTaskId: null,
        title: draft.title,
        description: "",
        status: "todo",
        priority: draft.priority,
        assigneeType: draft.assigneeType,
        assigneeId: draft.assigneeType === "unassigned" ? null : draft.assigneeId,
        dueAt: draft.dueAt ? new Date(`${draft.dueAt}T12:00:00`).toISOString() : null,
        estimateMinutes: null,
        position: activeTasks.filter((item) => item.planId === plan.id).length,
      });
      setDraft((current) => ({ ...current, title: "", dueAt: "" }));
      setCreating(false);
      onToast("任务已创建，Agent 可立即读取");
    } catch (error) { onToast(`创建失败：${error.message}`); }
  };

  const changeTaskStatus = async (task, status) => {
    try { await onUpdate(task.id, { status }); onToast(`任务已更新为“${taskStatusLabels[status]}”`); }
    catch (error) { onToast(`更新失败：${error.message}`); }
  };

  return (
    <div className="project-content tasks-view">
      <div className="view-heading"><div><span className="eyebrow">Project → Milestone → Plan → Task · 实时数据</span><h2>任务与计划</h2><p>人看到的是清晰层级，Agent 读写的是稳定实体和关系。</p></div><div className="view-heading-actions"><div className="segmented">{["层级", "看板"].map((item) => <button type="button" key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item}</button>)}</div><button className="primary-small" type="button" onClick={() => setCreating((value) => !value)}><Plus size={17} />新建任务</button></div></div>
      {creating && <form className="entity-composer task-composer card-surface" onSubmit={createTask}><label className="wide"><span>任务名称</span><input name="task-title" autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="写清楚可验证的完成结果" /></label><label><span>所属计划</span><select name="task-plan" required value={draft.planId} onChange={(event) => setDraft({ ...draft, planId: event.target.value })}>{activePlans.map((plan) => <option key={plan.id} value={plan.id}>{milestoneById[plan.milestoneId]?.title} / {plan.title}</option>)}</select></label><label><span>优先级</span><select name="task-priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="urgent">紧急</option></select></label><label><span>负责人类型</span><select name="task-assignee-type" value={draft.assigneeType} onChange={(event) => setDraft({ ...draft, assigneeType: event.target.value, assigneeId: event.target.value === "unassigned" ? "" : draft.assigneeId })}><option value="unassigned">未分配</option><option value="human">人类</option><option value="agent">Agent</option></select></label>{draft.assigneeType !== "unassigned" && <label><span>负责人</span><input name="task-assignee" required value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })} placeholder={draft.assigneeType === "agent" ? "例如 Codex" : "例如 你"} /></label>}<label><span>截止日期</span><input name="task-due-date" type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label><div><button type="button" onClick={() => setCreating(false)}>取消</button><button className="primary-small" type="submit" disabled={pending || !draft.title.trim() || !draft.planId}>创建任务</button></div></form>}
      {mode === "层级" ? <section className="task-hierarchy card-surface"><div className="hierarchy-head"><span>名称</span><span>层级 / 里程碑</span><span>负责人</span><span>截止</span><span>状态</span></div>{hierarchyRows.map((item) => { const isPlan = item.type === "plan"; const itemTasks = isPlan ? activeTasks.filter((task) => task.planId === item.id) : []; const progress = isPlan ? entityProgress(itemTasks) : item.status === "done" ? 100 : item.status === "in_progress" ? 50 : item.status === "blocked" ? 25 : 0; return <div className={`hierarchy-row ${item.type}`} key={`${item.type}-${item.id}`}><span className="task-name">{isPlan ? <FolderOpen size={17} weight="fill" /> : <CheckCircle size={17} weight={item.status === "done" ? "fill" : "regular"} />}<span><strong>{item.title}</strong>{!isPlan && <small>↳ {planById[item.planId]?.title}</small>}</span></span><span><em>{isPlan ? "Plan" : "Task"}</em>{milestoneById[item.milestoneId]?.title ?? "—"}</span><span>{isPlan ? `${itemTasks.length} 个任务` : item.assigneeId || "未分配"}</span><span>{isPlan ? "—" : formatDate(item.dueAt, "未安排")}</span><span>{isPlan ? <><ProgressBar value={progress} /><em>{progress}%</em></> : <select aria-label={`${item.title}状态`} value={item.status} disabled={pending} onChange={(event) => changeTaskStatus(item, event.target.value)}>{Object.entries(taskStatusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</span>{!isPlan ? <button className="row-archive" type="button" aria-label={`归档${item.title}`} onClick={async () => { await onArchive(item.id); onToast("任务已归档"); }}><X size={14} /></button> : <CaretRight size={15} />}</div>; })}{!hierarchyRows.length && <div className="entity-empty"><ListChecks size={24} /><strong>还没有任务层级</strong><span>先创建里程碑和计划，再添加一个明确任务。</span></div>}</section> : <section className="task-board four-columns">{Object.entries(grouped).map(([status, items]) => <div className={`task-column card-surface ${status}`} key={status}><div><strong>{taskStatusLabels[status]}</strong><em>{items.length}</em><button type="button" aria-label={`在${taskStatusLabels[status]}中新建`} onClick={() => setCreating(true)}><Plus size={16} /></button></div>{items.map((task) => <article key={task.id}><span>{milestoneById[task.milestoneId]?.title}</span><h3>{task.title}</h3><p>{planById[task.planId]?.title || "项目计划"}</p><div><em>{task.assigneeId || "未分配"}</em><small>{formatDate(task.dueAt, "未安排")}</small></div><select aria-label={`${task.title}状态`} value={task.status} disabled={pending} onChange={(event) => changeTaskStatus(task, event.target.value)}>{Object.entries(taskStatusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></article>)}</div>)}</section>}
    </div>
  );
}

function ProjectInboxView({ project, milestones, plans, items, onCreateItem, onNavigate, onToast }) {
  const organizer = useOrganizer(project.id);
  const [capture, setCapture] = useState("");
  const activeMilestones = milestones.filter((item) => item.status !== "archived");
  const activePlans = plans.filter((item) => item.status !== "archived");
  const [targetMilestoneId, setTargetMilestoneId] = useState(activeMilestones[0]?.id || "");
  const [targetPlanId, setTargetPlanId] = useState(activePlans.find((item) => item.milestoneId === targetMilestoneId)?.id || "");
  const projectItems = items.filter((item) => item.projectId === project.id || (!item.projectId && item.project === project.name)).slice(0, 20);
  useEffect(() => { if (organizer.error) onToast(`Organizer 状态读取失败：${organizer.error.message}`); }, [organizer.error, onToast]);
  useEffect(() => { if (!activeMilestones.some((item) => item.id === targetMilestoneId)) setTargetMilestoneId(activeMilestones[0]?.id || ""); }, [activeMilestones, targetMilestoneId]);
  useEffect(() => { const candidates = activePlans.filter((item) => item.milestoneId === targetMilestoneId); if (!candidates.some((item) => item.id === targetPlanId)) setTargetPlanId(candidates[0]?.id || ""); }, [activePlans, targetMilestoneId, targetPlanId]);
  const captureItem = async (event) => {
    event.preventDefault();
    if (!capture.trim()) return;
    try {
      await onCreateItem({ title: capture.trim(), projectId: project.id, project: project.name, kind: "想法", source: "快捷记录" });
      setCapture("");
      onToast("已写入项目 Inbox；Organizer 将由该事件自动分析");
    } catch (error) { onToast(`记录失败：${error.message}`); }
  };
  const proposeConversion = async (item, targetType) => {
    const labels = { task: "任务", plan: "计划", milestone: "里程碑" };
    if ((targetType === "plan" || targetType === "task") && !targetMilestoneId) { onToast("先创建或选择一个里程碑"); return; }
    if (targetType === "task" && !targetPlanId) { onToast("先创建或选择一个计划"); return; }
    try {
      await organizer.submitProposal({
        projectId: project.id,
        title: `将“${item.title}”转为${labels[targetType]}`,
        summary: "保留 Inbox 原文，待确认后创建结构实体并建立 derivedFrom 反向来源。",
        kind: "convert",
        risk: targetType === "task" ? "low" : "medium",
        evidence: [`Inbox ${item.id} · ${item.kind} · ${item.source}`, `当前归属项目：${project.name}`],
        changes: [{ entityType: targetType, entityId: null, action: "create", summary: `创建${labels[targetType]}：${item.title}` }, { entityType: "entity_link", entityId: null, action: "create", summary: "建立新实体 derivedFrom Inbox 的来源链接" }],
        command: { type: "convert_inbox_to_entity", inboxItemId: item.id, targetType, projectId: project.id, ...((targetType === "plan" || targetType === "task") ? { milestoneId: targetMilestoneId } : {}), ...(targetType === "task" ? { planId: targetPlanId } : {}) },
        createdBy: "human:project-inbox",
      });
      onToast("转换建议已送往待决策中心，原始 Inbox 保持不变");
    } catch (error) { onToast(`提交建议失败：${error.message}`); }
  };
  return (
    <div className="project-content project-inbox-view">
      <div className="view-heading"><div><span className="eyebrow">{project.name} 的未决输入 · 实时数据</span><h2>项目 Inbox</h2><p>原始输入始终保留；转换项目结构时先生成 Proposal，再由你确认。</p></div><form className="project-inbox-capture" onSubmit={captureItem}><input aria-label="记录项目想法" value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="先记下来，Organizer 稍后整理…" /><button className="primary-small" type="button" disabled={!capture.trim()} onClick={captureItem}><Plus size={17} />记录</button></form></div>
      <section className="project-inbox-layout"><div className="project-inbox-list card-surface"><div className="project-inbox-targets"><strong>结构目标</strong><label>里程碑<select aria-label="项目 Inbox 目标里程碑" value={targetMilestoneId} onChange={(event) => setTargetMilestoneId(event.target.value)}><option value="">选择里程碑…</option>{activeMilestones.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>计划<select aria-label="项目 Inbox 目标计划" value={targetPlanId} onChange={(event) => setTargetPlanId(event.target.value)}><option value="">选择计划…</option>{activePlans.filter((item) => item.milestoneId === targetMilestoneId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><span>转为 Task/Plan 时使用；里程碑直接建立在项目下。</span></div>{projectItems.map((item) => <article key={item.id}><span className={`kind-badge ${item.kind}`}>{item.kind}</span><div><h3>{item.title}</h3><p>{item.note}</p><span><LinkSimple size={14} />@{project.name} · {item.source} · {item.created}</span></div><div><button type="button" disabled={organizer.pending || !targetPlanId} onClick={() => proposeConversion(item, "task")}>建议转任务</button><button type="button" disabled={organizer.pending || !targetMilestoneId} onClick={() => proposeConversion(item, "plan")}>建议转计划</button><button type="button" disabled={organizer.pending} onClick={() => proposeConversion(item, "milestone")}>建议转里程碑</button></div></article>)}{!projectItems.length && <div className="entity-empty"><Tray size={24} /><strong>项目 Inbox 目前为空</strong><span>记录一条想法后，事件会触发只读 Organizer。</span></div>}</div><aside className="agent-organizer card-surface"><span><Robot size={24} weight="duotone" /></span><h2>只读 Organizer</h2><p>读取有边界的项目快照，在权限沙盒内分析，只能向待决策中心提交建议。</p><div className="organizer-sandbox"><strong>{organizer.status?.enabled ? "事件驱动已启用" : "当前未启用"}</strong><span>文件读/写、子进程、Worker 权限均关闭 · 最近运行 {organizer.runs.length} 次</span><button type="button" disabled={organizer.pending} onClick={async () => { try { const result = await organizer.runNow(); onToast(result.proposalIds?.length ? `Organizer 生成了 ${result.proposalIds.length} 个新建议` : "分析完成，没有重复或新的建议"); } catch (error) { onToast(`分析失败：${error.message}`); } }}>{organizer.pending ? "分析中…" : "立即分析快照"}</button></div>{organizer.proposals.slice(0, 3).map((proposal) => <div key={proposal.id}><strong>{proposal.title}</strong><span>{proposal.summary}</span><button type="button" onClick={() => onNavigate("decisions")}>前往待决策中心</button></div>)}{!organizer.proposals.length && <div><strong>暂无待决策建议</strong><span>新输入到达后会自动分析；不会直接更改项目。</span></div>}</aside></section>
    </div>
  );
}

const logActionLabels = { created: "创建", updated: "更新", archived: "归档", linked: "建立关系", unlinked: "移除关系", converted: "转化", accepted: "接受", rejected: "拒绝", modified: "修改后接受", bound: "绑定", scanned: "扫描", unbound: "解除绑定", connected: "连接", validated: "验证", disconnected: "断开", started: "开始", paused: "暂停", resumed: "继续", completed: "完成", canceled: "取消" };
const logEntityLabels = { project: "项目", milestone: "里程碑", plan: "计划", task: "任务", idea: "想法", proposal: "Proposal", inbox_item: "Inbox", workspace: "工作区", worktree: "工作树", remote_repository: "远程仓库", time_block: "时间块", focus_session: "专注会话", attention_budget: "注意力预算", canvas_document: "画布", canvas_node: "画布节点" };
const logActorLabels = { human: "你", agent: "Agent", connector: "Git / Gitea", system: "系统" };

function logDetail(event) {
  const payload = event.payload || {};
  if (payload.title) return String(payload.title);
  if (payload.name) return String(payload.name);
  if (payload.fullName) return String(payload.fullName);
  if (payload.path) return String(payload.path);
  if (Array.isArray(payload.changedFields)) return `变更字段：${payload.changedFields.join("、")}`;
  if (payload.kind) return `${payload.kind}${payload.nodeCount !== undefined ? ` · ${payload.nodeCount} 个节点` : ""}`;
  const entries = Object.entries(payload).filter(([, value]) => value !== null && ["string", "number", "boolean"].includes(typeof value)).slice(0, 3);
  return entries.length ? entries.map(([key, value]) => `${key}: ${value}`).join(" · ") : `${logEntityLabels[event.entityType] || event.entityType} ${event.entityId}`;
}

function LogsView({ project, onSectionChange, onToast }) {
  const [filter, setFilter] = useState("全部");
  const [search, setSearch] = useState("");
  const logs = useProjectLogs(project.id, { ...(filter !== "全部" ? { actorType: filter } : {}), ...(search.trim() ? { search: search.trim() } : {}) });
  useEffect(() => { if (logs.error) onToast(`日志加载失败：${logs.error.message}`); }, [logs.error, onToast]);
  const openEntity = (event) => {
    const section = ({ milestone: "milestones", plan: "milestones", task: "tasks", idea: "ideas", inbox_item: "inbox", worktree: "worktrees", workspace: "settings", remote_repository: "settings", canvas_document: event.payload?.kind === "mindmap" ? "mindmap" : "overview" })[event.entityType];
    if (section) onSectionChange(section);
    else onToast(`实体 ${event.entityType}:${event.entityId} 已在日志中定位`);
  };
  const exportLogs = (format) => {
    const anchor = window.document.createElement("a");
    anchor.href = logApi.exportUrl(project.id, format);
    anchor.download = `project-log-${project.id}.${format === "json" ? "json" : "md"}`;
    anchor.click();
    onToast(`正在导出 ${format === "json" ? "JSON" : "Markdown"} 项目日志`);
  };
  return (
    <div className="project-content logs-view">
      <div className="view-heading"><div><span className="eyebrow">可追溯的项目记忆 · {logs.total} 条匹配记录</span><h2>项目日志</h2><p>统一记录用户、Agent、Git、自动化和里程碑的真实事件，作为知识库和审计证据。</p></div><div className="log-heading-actions"><input aria-label="搜索项目日志" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索类型、实体、载荷…" /><button className="quiet-button" type="button" onClick={() => exportLogs("markdown")}><ClipboardText size={17} />导出 Markdown</button><button className="quiet-button" type="button" onClick={() => exportLogs("json")}>JSON</button></div></div>
      <section className="logs-layout"><aside className="log-filters card-surface"><strong>来源</strong>{[["全部","全部"],["human","用户"],["agent","Agent"],["connector","Git / Gitea"],["system","系统"]].map(([id,label]) => <button type="button" key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</aside><div className="log-stream card-surface">{logs.items.map((event) => { const action = event.type.split(".").at(-1); const actorClass = event.actorType === "connector" ? "git" : event.actorType; return <article key={event.id} data-event-id={event.id}><time dateTime={event.occurredAt}>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.occurredAt))}</time><span className={`activity-dot ${actorClass}`} /><div><span><strong>{logActorLabels[event.actorType]} · {event.actorId}</strong><em>{logActionLabels[action] || action} {logEntityLabels[event.entityType] || event.entityType}</em></span><p>{logDetail(event)}</p><button type="button" onClick={() => openEntity(event)}><LinkSimple size={14} />查看关联实体</button></div></article>; })}{!logs.items.length && <div className="entity-empty"><ClipboardText size={24} /><strong>{logs.isLoading ? "正在读取事件日志" : "没有匹配的项目事件"}</strong><span>修改筛选或产生一次真实项目变更后再查看。</span></div>}</div><aside className="daily-digest card-surface"><span className="summary-icon"><Sparkle size={22} weight="duotone" /></span><h2>今日摘要</h2><p>{logs.digest?.summary || "正在汇总今天的真实项目事件…"}</p><div><span>全部事件<strong>{logs.digest?.totalEvents ?? 0}</strong></span><span>用户操作<strong>{logs.digest?.humanEvents ?? 0}</strong></span><span>Agent 相关<strong>{logs.digest?.agentEvents ?? 0}</strong></span><span>Git / 工作区<strong>{logs.digest?.gitEvents ?? 0}</strong></span><span>完成 / 决策<strong>{logs.digest?.completedEvents ?? 0}</strong></span></div></aside></section>
    </div>
  );
}

function WorkspaceBindingModal({ path, setPath, onClose, onSave, onToast, saving }) {
  const chooseDirectory = async () => {
    if (!desktopBridge.available) {
      onToast("当前是浏览器模式，可直接粘贴绝对路径；桌面版会打开系统文件夹选择器");
      return;
    }
    try {
      const result = await desktopBridge.selectDirectory(path);
      if (result?.path) { setPath(result.path); onToast("已从系统选择器取得本地文件夹"); }
    } catch (error) { onToast(`文件夹选择失败：${error.message}`); }
  };
  return (
    <div className="modal-backdrop">
      <form className="workspace-binding-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-binding-title" onSubmit={(event) => { event.preventDefault(); void onSave(); }}>
        <button className="modal-close" type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        <span className="capture-modal-icon"><FolderOpen size={24} weight="duotone" /></span>
        <h2 id="workspace-binding-title">绑定本地项目文件夹</h2>
        <p>本地 Agent 会读取 Git 状态和 worktree，但不会上传项目文件内容。</p>
        <label className="workspace-path-label" htmlFor="workspace-binding-path"><span>本地路径</span><div><input id="workspace-binding-path" name="workspace-binding-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="C:\\Projects\\MyProject" /><button type="button" onClick={chooseDirectory}><FolderOpen size={17} />{desktopBridge.available ? "系统选择" : "粘贴路径"}</button></div><small>{desktopBridge.available ? "使用桌面原生目录权限；选择结果仍由 projectd 做绝对路径与 Git 校验。" : "浏览器不能读取本机目录权限，请粘贴绝对路径；桌面版提供原生选择器。"}</small></label>
        <section className="workspace-detection-preview pending">
          <div><ShieldCheck size={17} /><span><strong>路径只保存在本机</strong><small>projectd 会校验目录是否存在以及是否为 Git 仓库</small></span></div>
          <div><GitBranch size={17} /><span><strong>使用本机 git CLI 扫描</strong><small>读取 branch、HEAD、dirty、远端差异和 worktree</small></span></div>
          <div><Robot size={17} /><span><strong>扫描结果可审计</strong><small>绑定和每次扫描都会写入项目事件日志</small></span></div>
        </section>
        <div className="workspace-modal-actions"><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={saving || !path.trim()}>{saving ? "正在扫描…" : "绑定并扫描 Git"}</button></div>
      </form>
    </div>
  );
}

function SettingsView({ onToast, workspace, binding, onBind, onScan, onUnbind, pending, remoteBinding, remoteJobs, webhookDeliveries, onRemoteUnbind, onRemoteSync, onRemoteRetry, onConfigureWebhook, remotePending, policy, onUpdatePolicy, policyPending }) {
  const [autoWorkspaceSync, setAutoWorkspaceSync] = useState(binding?.watchEnabled ?? true);
  const [pendingPath, setPendingPath] = useState(workspace?.path || "");
  const [bindingOpen, setBindingOpen] = useState(false);
  const [webhookReveal, setWebhookReveal] = useState(null);
  useEffect(() => { setAutoWorkspaceSync(binding?.watchEnabled ?? true); setPendingPath(binding?.path ?? ""); }, [binding]);

  const scanWorkspace = async () => {
    if (pending || !binding) return;
    onToast("本地 Agent 正在扫描 Git 状态");
    try { const result = await onScan(); onToast(`Git 扫描完成：${result.dirtyFiles} 个改动，${result.worktrees.length} 个 worktree`); }
    catch (error) { onToast(`扫描失败：${error.message}`); }
  };

  const saveWorkspace = async () => {
    try {
      const result = await onBind({ path: pendingPath, watchEnabled: autoWorkspaceSync });
      setBindingOpen(false);
      onToast(result.status === "ready" ? `工作区已绑定：发现 ${result.worktrees.length} 个 worktree` : `路径已保存，状态：${result.lastError}`);
    } catch (error) { onToast(`绑定失败：${error.message}`); }
  };

  const syncRemote = async () => {
    try { const job = await onRemoteSync(); onToast(job.status === "succeeded" ? `远程同步完成：${job.progressCurrent}/${job.progressTotal}` : `远程同步失败：${job.error}`); }
    catch (error) { onToast(`远程同步失败：${error.message}`); }
  };

  const toggleWebhook = async () => {
    try {
      const result = await onConfigureWebhook(!remoteBinding.webhookEnabled);
      setWebhookReveal(result.secret ? result : null);
      onToast(result.enabled ? "Webhook 已启用，请把一次性密钥写入远程仓库" : "Webhook 已停用并清除旧密钥");
    } catch (error) { onToast(`Webhook 配置失败：${error.message}`); }
  };

  const RemoteIcon = remoteBinding?.provider === "github" ? SiGithub : SiGitea;
  const latestJob = remoteJobs[0];
  const updatePolicy = async (input, message) => {
    try { await onUpdatePolicy(input); onToast(message); }
    catch (error) { onToast(`策略保存失败：${error.message}`); }
  };

  return (
    <div className="project-content settings-view">
      <div className="view-heading"><div><span className="eyebrow">项目配置</span><h2>设置</h2><p>管理远程仓库、本地工作区、Agent 权限、知识关系和自动记录策略。</p></div></div>
      <section className="settings-grid">
        <article className="card-surface workspace-binding-card">
          <div className="workspace-binding-heading"><span className="settings-icon blue"><Code size={20} /></span><span><h2>代码与本地工作区</h2><p>远程仓库负责协作事件，本地文件夹负责真实 Git 开发现场。</p></span><em className={binding?.status === "ready" || remoteBinding ? "" : "offline"}><i />{binding?.status === "ready" ? "Git 元数据已同步" : binding ? binding.lastError : remoteBinding ? "远程已绑定 · 本地待绑定" : "等待绑定"}</em></div>
          <div className="workspace-binding-sources">
            <section className="workspace-source remote"><span className="source-icon"><RemoteIcon size={20} /></span><div><small>远程仓库 · {remoteBinding?.provider === "github" ? "GitHub" : "Gitea"}</small><strong>{remoteBinding?.fullName || "尚未连接"}</strong><code>{remoteBinding ? `${remoteBinding.baseUrl} · 默认分支 ${remoteBinding.defaultBranch || "未设置"}` : "从项目组合 → 导入仓库连接 GitHub 或 Gitea"}</code></div><span className="workspace-source-actions"><em>{remoteBinding ? "已绑定" : "未绑定"}</em>{remoteBinding && <button type="button" disabled={remotePending} onClick={async () => { try { await onRemoteUnbind(); onToast("远程仓库已解除绑定，本地工作区保持不变"); } catch (error) { onToast(`解除远程绑定失败：${error.message}`); } }}>解除绑定</button>}</span></section>
            <section className="workspace-source local"><span className="source-icon"><FolderOpen size={20} weight="duotone" /></span><div><small>本地项目文件夹</small><strong>{binding?.path || "尚未绑定"}</strong><code>{binding?.status === "ready" ? `Local Agent · ${binding.watchEnabled ? "自动监听已启用" : "手动扫描"}` : binding?.lastError || "选择一个本地 Git 仓库"}</code></div><em>{binding?.status === "ready" ? "已绑定" : "未就绪"}</em></section>
          </div>
          {remoteBinding && <section className="remote-control-panel">
            <div className="remote-control-heading"><span><ArrowsClockwise size={18} /><strong>远程协作同步</strong><small>{remoteBinding.syncScopes.map((scope) => ({ commits: "Commit", branches: "Branch", pull_requests: "PR", issues: "Issue", milestones: "Milestone" })[scope]).join(" · ")}</small></span><em className={remoteBinding.syncStatus === "failed" ? "failed" : ""}>{remotePending ? "处理中" : ({ idle: "待首次同步", queued: "排队中", running: "同步中", succeeded: "已同步", failed: "同步失败" })[remoteBinding.syncStatus]}</em></div>
            <div className="remote-sync-stats"><span><small>最近同步</small><strong>{remoteBinding.lastSyncedAt ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(remoteBinding.lastSyncedAt)) : "尚无记录"}</strong></span><span><small>最近任务</small><strong>{latestJob ? `${latestJob.progressCurrent}/${latestJob.progressTotal} · 第 ${latestJob.attempt} 次` : "—"}</strong></span><span><small>Webhook</small><strong>{remoteBinding.webhookEnabled ? "签名校验已启用" : "未启用"}</strong></span><span><small>Delivery</small><strong>{webhookDeliveries.length} 条</strong></span></div>
            {remoteBinding.lastSyncError && <div className="remote-sync-error"><Warning size={16} />{remoteBinding.lastSyncError}</div>}
            <div className="remote-control-actions"><button type="button" onClick={syncRemote} disabled={remotePending}><ArrowsClockwise size={15} className={remotePending ? "spin" : ""} />立即同步</button>{latestJob?.status === "failed" && latestJob.attempt < latestJob.maxAttempts && <button type="button" disabled={remotePending} onClick={async () => { try { const job = await onRemoteRetry(latestJob.id); onToast(job.status === "succeeded" ? "失败任务重试成功" : `重试仍失败：${job.error}`); } catch (error) { onToast(`重试失败：${error.message}`); } }}>重试失败任务</button>}<button type="button" disabled={remotePending} onClick={toggleWebhook}>{remoteBinding.webhookEnabled ? "停用 Webhook" : "启用 Webhook"}</button></div>
            {webhookReveal?.secret && <div className="webhook-secret"><small>一次性签名密钥，请现在复制到远程 Webhook 设置</small><code>{webhookReveal.secret}</code><span>回调路径：{webhookReveal.endpointPath}</span><button type="button" onClick={() => setWebhookReveal(null)}>我已保存</button></div>}
            {!!webhookDeliveries.length && <div className="webhook-delivery-list">{webhookDeliveries.slice(0, 3).map((delivery) => <span key={delivery.id}><i className={delivery.status} /> <strong>{delivery.event}</strong><small>{delivery.deliveryId} · {delivery.status}</small></span>)}</div>}
          </section>}
          <div className="workspace-git-snapshot">
            <span><small>当前分支</small><strong>{workspace.branch || "main"}</strong></span>
            <span><small>HEAD</small><strong>{workspace.head || "—"}</strong></span>
            <span><small>未提交</small><strong>{workspace.dirtyFiles || 0} 个文件</strong></span>
            <span><small>远端差异</small><strong>↑{workspace.ahead || 0} ↓{workspace.behind || 0}</strong></span>
            <span><small>Worktree</small><strong>{workspace.worktrees || 0} 个</strong></span>
            <span><small>最近扫描</small><strong>{pending ? "扫描中…" : workspace.lastScan}</strong></span>
          </div>
          <div className="workspace-binding-footer"><span><Robot size={16} />文件不会上传；Local Agent 只同步 Git 元数据和项目活动。</span><div>{binding && <button type="button" onClick={async () => { await onUnbind(); onToast("本地工作区已解除绑定"); }} disabled={pending}>解除绑定</button>}<button type="button" onClick={scanWorkspace} disabled={pending || !binding}><ArrowsClockwise size={15} className={pending ? "spin" : ""} />{pending ? "扫描中" : "重新扫描"}</button><button type="button" onClick={() => { setPendingPath(binding?.path || ""); setBindingOpen(true); }}><FolderOpen size={15} />{binding ? "更换文件夹" : "绑定文件夹"}</button></div></div>
        </article>
        <article className="card-surface settings-card"><div><span className="settings-icon green"><ArrowsClockwise size={20} /></span><span><h2>自动同步 Git</h2><p>监听分支、HEAD、未提交改动和 worktree 变化</p></span><label className="switch-label"><input type="checkbox" name="workspace-auto-sync-enabled" checked={autoWorkspaceSync} onChange={async (event) => { const enabled = event.target.checked; setAutoWorkspaceSync(enabled); if (binding) await onBind({ path: binding.path, watchEnabled: enabled }); onToast(enabled ? "已开启本地 Git 自动同步" : "已切换为手动扫描"); }} /><span className="switch"><span /></span></label></div><button type="button" onClick={scanWorkspace} disabled={!binding}>立即扫描</button></article>
        <article className="card-surface settings-card policy-card"><div><span className="settings-icon blue"><Robot size={20} /></span><span><h2>Agent 写入边界</h2><p>{policy?.agentWritePolicy === "disabled" ? "所有 Agent 写入口停用" : policy?.agentWritePolicy === "low_risk_direct" ? "低风险捕获可直接写入，结构变化仍需 Proposal" : "所有写入先生成 Proposal，确认后执行"}</p></span></div><label><span>写入策略</span><select aria-label="Agent 写入策略" disabled={policyPending || !policy} value={policy?.agentWritePolicy || "proposal_only"} onChange={(event) => void updatePolicy({ agentWritePolicy: event.target.value }, "Agent 写入策略已保存") }><option value="disabled">停用 Agent 写入</option><option value="proposal_only">仅 Proposal（推荐）</option><option value="low_risk_direct">低风险直接写入</option></select></label></article>
        <article className="card-surface settings-card policy-card"><div><span className="settings-icon purple"><Graph size={20} /></span><span><h2>知识关系</h2><p>决定 @提及和实体关系何时自动进入知识图谱</p></span></div><label><span>关系捕获</span><select aria-label="知识关系捕获策略" disabled={policyPending || !policy} value={policy?.relationshipCapturePolicy || "mentions"} onChange={(event) => void updatePolicy({ relationshipCapturePolicy: event.target.value }, "知识关系策略已保存") }><option value="manual">仅手动建立</option><option value="mentions">解析明确 @提及</option><option value="automatic">自动建议并捕获</option></select></label></article>
        <article className="card-surface settings-card policy-card"><div><span className="settings-icon amber"><ClipboardText size={20} /></span><span><h2>项目日志</h2><p>自动记录 Agent、Git、里程碑和关键状态变化</p></span><label className="switch-label"><input type="checkbox" name="auto-log-enabled" disabled={policyPending || !policy} checked={policy?.autoLogEnabled ?? true} onChange={(event) => void updatePolicy({ autoLogEnabled: event.target.checked }, event.target.checked ? "项目自动日志已开启" : "项目自动日志已停用") } /><span className="switch"><span /></span></label></div><label><span>保留周期</span><select aria-label="项目日志保留周期" disabled={policyPending || !policy} value={policy?.logRetentionDays ?? 365} onChange={(event) => void updatePolicy({ logRetentionDays: Number(event.target.value) }, "日志保留策略已保存") }><option value="30">30 天</option><option value="90">90 天</option><option value="365">1 年</option><option value="0">永久保留</option></select></label></article>
      </section>
      {bindingOpen && <WorkspaceBindingModal path={pendingPath} setPath={setPendingPath} onClose={() => setBindingOpen(false)} onSave={saveWorkspace} onToast={onToast} saving={pending} />}
    </div>
  );
}

export function ProjectPage({ projectId = "pixelmind", section, onSectionChange, onBack, onNavigate, onToast, inboxItems, onCreateInbox }) {
  const project = projects.find((item) => item.id === projectId) || { id: projectId, name: "项目", description: "正在加载项目数据", color: "#4057f4", repo: null, worktrees: 0 };
  const core = useProjectCore(projectId);
  const workspaceCore = useWorkspace(projectId);
  const remoteCore = useProjectRemote(projectId);
  const policyCore = useProjectPolicy(projectId);
  const actorsCore = useActors();
  const liveProject = core.project ? { ...project, ...core.project } : project;
  const binding = workspaceCore.binding;
  const workspace = binding ? { path: binding.path, branch: binding.branch || "—", head: binding.head || "—", dirtyFiles: binding.dirtyFiles, ahead: binding.ahead, behind: binding.behind, worktrees: binding.worktrees.length, worktreeItems: binding.worktrees, commits: binding.commits, lastScan: binding.lastScannedAt ? formatDate(binding.lastScannedAt, "刚刚") : "未扫描", watcher: binding.status === "ready" ? "online" : "offline" } : { path: "尚未绑定本地项目文件夹", branch: "—", head: "—", dirtyFiles: 0, ahead: 0, behind: 0, worktrees: 0, worktreeItems: [], commits: [], lastScan: "未扫描", watcher: "offline" };
  useEffect(() => { if (core.error) onToast(`项目数据加载失败：${core.error.message}`); }, [core.error, onToast]);
  useEffect(() => { if (workspaceCore.error) onToast(`工作区数据加载失败：${workspaceCore.error.message}`); }, [workspaceCore.error, onToast]);
  useEffect(() => { if (remoteCore.error) onToast(`远程仓库数据加载失败：${remoteCore.error.message}`); }, [remoteCore.error, onToast]);
  useEffect(() => { if (policyCore.error) onToast(`项目策略加载失败：${policyCore.error.message}`); }, [policyCore.error, onToast]);
  useEffect(() => { if (actorsCore.error) onToast(`负责人注册表加载失败：${actorsCore.error.message}`); }, [actorsCore.error, onToast]);
  const content = {
    overview: <OverviewView project={liveProject} milestones={core.milestones} plans={core.plans} tasks={core.tasks} ideas={core.ideas} onSectionChange={onSectionChange} onToast={onToast} workspace={workspace} />,
    milestones: <MilestonesView projectId={projectId} milestones={core.milestones} plans={core.plans} tasks={core.tasks} links={core.links} binding={binding} onCreate={core.createMilestone} onUpdate={core.updateMilestone} onArchive={core.archiveMilestone} onCreatePlan={core.createPlan} onUpdatePlan={core.updatePlan} onArchivePlan={core.archivePlan} pending={core.pending} onToast={onToast} />,
    worktrees: <WorktreeManagementView binding={binding} tasks={core.tasks} actors={actorsCore.items} links={core.links} onScan={workspaceCore.scan} onPreflightWorktree={workspaceCore.preflightWorktree} onCreateWorktree={workspaceCore.createWorktree} onCreateLink={core.createLink} onDeleteLink={core.deleteLink} onSectionChange={onSectionChange} pending={workspaceCore.pending || core.pending} onToast={onToast} />,
    tasks: <TaskManagementView projectId={projectId} milestones={core.milestones} plans={core.plans} tasks={core.tasks} actors={actorsCore.items} links={core.links} onCreate={core.createTask} onUpdate={core.updateTask} onArchive={core.archiveTask} onCreateLink={core.createLink} onDeleteLink={core.deleteLink} pending={core.pending} onToast={onToast} />,
    inbox: <ProjectInboxView project={liveProject} milestones={core.milestones} plans={core.plans} items={inboxItems} onCreateItem={onCreateInbox} onNavigate={onNavigate} onToast={onToast} />,
    ideas: <ProjectIdeasView projectId={projectId} milestones={core.milestones} plans={core.plans} ideas={core.ideas} duplicates={core.ideaDuplicates} onCreate={core.createIdea} onUpdate={core.updateIdea} onArchive={core.archiveIdea} onConvert={core.convertIdea} onMerge={core.mergeIdeas} pending={core.pending} onToast={onToast} />,
    projectGraph: <ProjectGraphLive project={liveProject} onSectionChange={onSectionChange} />,
    mindmap: <MindMapView projectId={projectId} entities={{ project: liveProject, milestones: core.milestones, plans: core.plans, tasks: core.tasks, ideas: core.ideas, worktrees: binding?.worktrees || [] }} onToast={onToast} />,
    logs: <LogsView project={liveProject} onSectionChange={onSectionChange} onToast={onToast} />,
    settings: <SettingsView onToast={onToast} workspace={workspace} binding={binding} onBind={workspaceCore.bind} onScan={workspaceCore.scan} onUnbind={workspaceCore.unbind} pending={workspaceCore.pending} remoteBinding={remoteCore.binding} remoteJobs={remoteCore.jobs} webhookDeliveries={remoteCore.deliveries} onRemoteUnbind={remoteCore.unbind} onRemoteSync={remoteCore.sync} onRemoteRetry={remoteCore.retry} onConfigureWebhook={remoteCore.configureWebhook} remotePending={remoteCore.pending} policy={policyCore.policy} onUpdatePolicy={policyCore.update} policyPending={policyCore.pending} />,
  }[section] || <OverviewView project={liveProject} milestones={core.milestones} plans={core.plans} tasks={core.tasks} ideas={core.ideas} onSectionChange={onSectionChange} onToast={onToast} workspace={workspace} />;
  return <div className="project-page"><ProjectHeader section={section} onSectionChange={onSectionChange} onBack={onBack} onToast={onToast} project={liveProject} remote={remoteCore.binding} onRemoteSync={remoteCore.sync} remotePending={remoteCore.pending} />{content}</div>;
}
