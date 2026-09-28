import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarBlank,
  CaretDown,
  CaretRight,
  CaretUp,
  CheckCircle,
  Clock,
  FolderSimple,
  Graph,
  GearSix,
  MagnifyingGlass,
  Microphone,
  PencilSimple,
  Plus,
  Sparkle,
  Tray,
  X,
} from "@phosphor-icons/react";
import { InboxView, KnowledgeGraphView, ProjectsView, TimeView, TodayView } from "./GlobalViews.jsx";
import { ImportRepositoryView } from "./ImportRepositoryView.jsx";
import { DecisionCenterView } from "./DecisionCenterView.jsx";
import { ProjectPage } from "./ProjectViews.jsx";
import { GlobalSettingsView } from "./GlobalSettingsView.jsx";
import { EntityMentionPicker } from "./EntityMentionPicker.jsx";
import { DiagnosticFault, PageErrorBoundary } from "./PageErrorBoundary.jsx";
import { useInbox } from "./useInbox.js";
import { useGlobalSearch, useNotifications, useProjects, useProposals } from "./useCoreData.js";
import { useVoiceRecorder } from "./useVoiceRecorder.js";
import { locationPath, locationState, projectSectionLabels, viewLabels } from "./routes.js";

const navItems = [
  { id: "today", label: "今天", icon: CalendarBlank },
  { id: "inbox", label: "收件箱", icon: Tray },
  { id: "decisions", label: "待决策", icon: CheckCircle },
  { id: "projects", label: "项目", icon: FolderSimple },
  { id: "time", label: "时间", icon: Clock },
  { id: "graph", label: "知识图谱", icon: Graph },
  { id: "settings", label: "设置", icon: GearSix },
];

function AppLogo() {
  return <div className="brand-lockup" aria-label="Agentic Project OS"><img src="/assets/project-mark.png" alt="" className="brand-mark" /><span>Agentic<br />Project OS</span></div>;
}

function Sidebar({ view, projectId, projects, favoriteIds, onToggleFavorite, onMoveFavorite, onNavigate, onOpenProject, onNewProject, inboxCount, proposalCount }) {
  const globalActive = view === "project" || view === "import" ? "projects" : view;
  const activeProjects = projects.filter((project) => project.status !== "archived");
  const visibleProjects = favoriteIds.map((id) => activeProjects.find((project) => project.id === id)).filter(Boolean);
  return <aside className="sidebar"><AppLogo /><nav aria-label="主导航">{navItems.map(({ id, label, icon: Icon }) => { const badge = id === "inbox" ? inboxCount : id === "decisions" ? proposalCount : null; return <button className={`nav-item ${globalActive === id ? "active" : ""}`} key={id} type="button" onClick={() => onNavigate(id)}><Icon size={21} weight={globalActive === id ? "fill" : "regular"} /><span>{label}</span>{badge > 0 && <em>{badge}</em>}</button>; })}</nav><div className="sidebar-projects"><div className="sidebar-projects-head"><strong>常用项目</strong><button type="button" aria-label="新建项目" onClick={onNewProject}><Plus size={15} /></button></div>{visibleProjects.map((project, index) => <div className={`sidebar-project-row ${view === "project" && project.id === projectId ? "active" : ""}`} key={project.id}><button type="button" className="sidebar-project-main" onClick={() => onOpenProject("overview", project.id)}><span style={{ background: project.color }}>{project.name.slice(0, 1)}</span><em>{project.name}</em>{project.status === "risk" && <i />}</button><span className="sidebar-project-order"><button type="button" aria-label={`上移常用项目 ${project.name}`} disabled={index === 0} onClick={() => onMoveFavorite(project.id, -1)}><CaretUp size={11} /></button><button type="button" aria-label={`下移常用项目 ${project.name}`} disabled={index === visibleProjects.length - 1} onClick={() => onMoveFavorite(project.id, 1)}><CaretDown size={11} /></button><button type="button" aria-label={`取消常用项目 ${project.name}`} onClick={() => onToggleFavorite(project.id)}><X size={10} /></button></span></div>)}{!visibleProjects.length && <button className="sidebar-favorite-empty" type="button" onClick={() => onNavigate("projects")}>从项目组合添加常用项目</button>}</div><button className="agent-status" type="button" onClick={() => onNavigate("decisions")}><span className="status-dot" /><span><strong>Agent 同步中</strong><small>3/3 在线 · {proposalCount} 个需决策</small></span><CaretRight size={16} /></button></aside>;
}

const searchTypeLabels = { project: "项目", milestone: "里程碑", plan: "计划", task: "任务", idea: "想法", inbox_item: "Inbox", worktree: "工作树", commit: "Git 提交", canvas_node: "画布节点", proposal: "待决策", event_log: "项目日志", remote_repository: "远程仓库", time_block: "时间块", focus_session: "专注记录" };

function Topbar({ view, projectSection, projectName, onOpenRoute, onCapture, onToast }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const searchInput = useRef(null);
  const projectMode = view === "project";
  const search = useGlobalSearch(debouncedQuery);
  const notifications = useNotifications();
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const selectResult = (result) => { onOpenRoute(result.route); setQuery(""); setDebouncedQuery(""); setSearchOpen(false); };
  const openNotification = async (item) => {
    try {
      if (item.status === "unread") await notifications.update(item.id, { action: "read" });
      onOpenRoute(item.route);
      setNotificationOpen(false);
    } catch (error) { onToast(`通知更新失败：${error.message}`); }
  };
  const snoozeNotification = async (item) => {
    try {
      await notifications.update(item.id, { action: "snooze", snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString() });
      onToast("已推迟到明天提醒");
    } catch (error) { onToast(`稍后提醒失败：${error.message}`); }
  };
  const now = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "long" }).format(new Date());
  return <header className="topbar"><div className="breadcrumb"><strong>{projectMode ? "项目" : viewLabels[view] || "Agentic Project OS"}</strong>{projectMode && <><span>/</span><strong>{projectName || "项目"}</strong><span>/</span><strong>{projectSectionLabels[projectSection]}</strong></>}</div><div className="search-wrap"><label className="global-search"><MagnifyingGlass size={19} /><input ref={searchInput} id="global-search" name="global-search" aria-label="全局搜索" value={query} onFocus={() => setSearchOpen(true)} onKeyDown={(event) => { if (event.key === "Enter" && search.items[0]) selectResult(search.items[0]); }} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} placeholder="搜索项目、任务、工作树、想法…" /><kbd>⌘K</kbd></label>{searchOpen && query && <div className="search-results" role="listbox" aria-label="搜索结果">{search.isLoading ? <span>正在建立索引并搜索…</span> : search.items.length ? search.items.slice(0, 7).map((result) => <button type="button" role="option" key={`${result.entityType}-${result.entityId}`} onClick={() => selectResult(result)}><MagnifyingGlass size={15} /><span><strong>{result.title}</strong><small>{searchTypeLabels[result.entityType] || result.entityType}{result.context ? ` · ${result.context}` : ""}</small></span><CaretRight size={15} /></button>) : <span>{search.error ? `搜索失败：${search.error.message}` : "没有匹配的实体"}</span>}</div>}</div><button className="idea-button" type="button" onClick={() => onCapture(false)}><PencilSimple size={18} weight="bold" />记录想法</button><button className="icon-button mic" type="button" aria-label="语音输入" onClick={() => onCapture(true)}><Microphone size={19} /></button><div className="notification-wrap"><button className="icon-button notification" type="button" aria-label={`通知${notifications.unread ? `，${notifications.unread} 条未读` : ""}`} aria-expanded={notificationOpen} onClick={() => setNotificationOpen((value) => !value)}><Bell size={19} />{notifications.unread > 0 && <><i /><em>{notifications.unread > 9 ? "9+" : notifications.unread}</em></>}</button>{notificationOpen && <div className="notification-panel" role="dialog" aria-label="通知中心"><header><div><strong>通知中心</strong><small>{notifications.unread} 条未读 · {notifications.total} 条活跃</small></div><button type="button" disabled={!notifications.unread || notifications.isReadingAll} onClick={() => notifications.readAll().catch((error) => onToast(`标记失败：${error.message}`))}>全部已读</button></header><div className="notification-list">{notifications.isLoading ? <p>正在汇总项目提醒…</p> : notifications.items.length ? notifications.items.map((item) => <article className={`notification-item ${item.status} ${item.severity}`} key={item.id}><button type="button" className="notification-main" onClick={() => openNotification(item)}><span className="notification-dot" /><span><strong>{item.title}</strong><small>{item.body}</small></span><CaretRight size={15} /></button><div><time>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.updatedAt))}</time><button type="button" disabled={notifications.pendingId === item.id} onClick={() => snoozeNotification(item)}><Clock size={13} />明天提醒</button></div></article>) : <p>{notifications.error ? `通知加载失败：${notifications.error.message}` : "当前没有需要处理的提醒"}</p>}</div></div>}</div><div className="date">{now}</div><button className="avatar-button" type="button" aria-label="打开全局设置" onClick={() => onOpenRoute("/settings")}><img src="/assets/user-avatar.png" alt="当前用户" /><span className="online-dot" /></button></header>;
}

function QuickCapture({ voiceStart, projects, onClose, onSave, onConfigure }) {
  const [value, setValue] = useState("");
  const [mentions, setMentions] = useState([]);
  const [voiceUsed, setVoiceUsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const autoStarted = useRef(false);
  const applyTranscript = useCallback((result) => {
    setValue((current) => [current.trim(), result.text.trim()].filter(Boolean).join("\n"));
    setVoiceUsed(true);
  }, []);
  const voice = useVoiceRecorder({ onTranscript: applyTranscript });
  useEffect(() => {
    if (voiceStart && !autoStarted.current) { autoStarted.current = true; void voice.start(); }
  }, [voiceStart, voice.start]);
  const submit = async () => {
    if (!value.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(value.trim(), voiceUsed, mentions);
    } finally {
      setSaving(false);
    }
  };
  const voiceLabel = voice.status === "requesting" ? "请求麦克风…" : voice.status === "recording" ? `结束录音 ${Math.floor(voice.elapsedSeconds / 60)}:${String(voice.elapsedSeconds % 60).padStart(2, "0")}` : voice.status === "transcribing" ? "高精度转写中…" : voice.status === "done" ? "继续录一段" : voice.status === "error" ? "重试语音" : "语音输入";
  return <div className="modal-backdrop"><div className="capture-modal" role="dialog" aria-modal="true" aria-labelledby="capture-title"><button className="modal-close" type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button><span className="capture-modal-icon"><Sparkle size={23} weight="duotone" /></span><div><span className="eyebrow">全局快速记录</span><h2 id="capture-title">先把想法放下来</h2><p>可以先不分类，也可以用 @ 选择器立即建立知识关系。</p></div><textarea id="quick-capture" name="quick-capture" autoFocus={!voiceStart} value={value} onChange={(event) => setValue(event.target.value)} placeholder="输入想法，再用下方 @ 选择器关联项目实体…" /><EntityMentionPicker projects={projects} value={mentions} onChange={setMentions} compact /><div className={`capture-modal-tools voice-${voice.status}`}><button className={voice.recording ? "listening" : ""} type="button" disabled={["requesting", "transcribing"].includes(voice.status)} onClick={voice.recording ? voice.stop : voice.start}><Microphone size={17} weight={voice.recording ? "fill" : "regular"} />{voiceLabel}</button><span>{voice.error ? voice.error.message : voice.status === "recording" ? "正在本机录音，最长 2 分钟" : voice.status === "transcribing" ? "音频正在由 projectd 安全代理" : voice.status === "done" ? "转写已放入文本框，可先编辑再保存" : "支持高精度语音 API"}{voice.error?.code === "AI_API_KEY_REQUIRED" && <button type="button" className="voice-config-link" onClick={onConfigure}>打开设置</button>}</span></div><div className="capture-modal-actions"><button type="button" onClick={onClose} disabled={saving}>取消</button><button className="primary-small" type="button" disabled={saving || !value.trim()} onClick={submit}>{saving ? "保存中…" : "放入 Inbox"} <Tray size={16} /></button></div></div></div>;
}

export function App() {
  const initialLocation = useMemo(() => locationState(), []);
  const [view, setView] = useState(initialLocation.view);
  const [projectSection, setProjectSection] = useState(initialLocation.projectSection);
  const [projectId, setProjectId] = useState(initialLocation.projectId);
  const { items: inboxItems, createItem, createLinkedItem, updateItem, archiveItem, batchItems, proposeConversions, runOrganizers, isBatching: inboxBatching, error: inboxError } = useInbox();
  const { items: proposals, total: proposalCount, decide: decideProposal, pendingId: pendingProposalId } = useProposals("pending");
  const projectPortfolio = useProjects();
  const [toast, setToast] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [voiceStart, setVoiceStart] = useState(false);
  const [newProjectRequest, setNewProjectRequest] = useState(0);
  const [diagnosticFault, setDiagnosticFault] = useState(false);
  const [favoriteProjectIds, setFavoriteProjectIds] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem("pcc-favorite-projects") || "null") || ["pixelmind", "edgemind", "content-studio"]; }
    catch { return ["pixelmind", "edgemind", "content-studio"]; }
  });
  useEffect(() => window.localStorage.setItem("pcc-favorite-projects", JSON.stringify(favoriteProjectIds)), [favoriteProjectIds]);
  const toggleFavorite = (id) => setFavoriteProjectIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const moveFavorite = (id, offset) => setFavoriteProjectIds((current) => { const index = current.indexOf(id); const target = index + offset; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2600);
  };

  useEffect(() => () => window.clearTimeout(showToast.timer), []);

  useEffect(() => {
    const onPopState = () => {
      const next = locationState();
      setView(next.view);
      setProjectId(next.projectId);
      setProjectSection(next.projectSection);
    };
    window.addEventListener("popstate", onPopState);
    const canonicalPath = locationPath(initialLocation.view, initialLocation.projectId, initialLocation.projectSection);
    if (window.location.pathname !== canonicalPath) window.history.replaceState({}, "", `${canonicalPath}${window.location.search}`);
    return () => window.removeEventListener("popstate", onPopState);
  }, [initialLocation]);

  useEffect(() => {
    if (inboxError) showToast(`Inbox 服务连接失败：${inboxError.message}`);
  }, [inboxError]);

  const navigate = (nextView, section) => {
    if (nextView === "project") {
      setView("project");
      const nextSection = section || projectSection;
      setProjectSection(nextSection);
      window.history.pushState({}, "", locationPath("project", projectId, nextSection));
      return;
    }
    setView(nextView);
    window.history.pushState({}, "", locationPath(nextView, projectId, projectSection));
  };

  const openProject = (section = "overview", nextProjectId = "pixelmind") => {
    setProjectId(nextProjectId);
    setProjectSection(section);
    setView("project");
    window.history.pushState({}, "", locationPath("project", nextProjectId, section));
  };
  const changeProjectSection = (section) => {
    setProjectSection(section);
    window.history.pushState({}, "", locationPath("project", projectId, section));
  };
  const openRoute = (route) => {
    const target = new URL(route, window.location.origin);
    const next = locationState(target.pathname);
    setView(next.view);
    setProjectId(next.projectId);
    setProjectSection(next.projectSection);
    window.history.pushState({}, "", `${locationPath(next.view, next.projectId, next.projectSection)}${target.search}`);
  };

  const openCapture = (voice = false) => { setVoiceStart(voice); setCaptureOpen(true); };
  const saveCapture = async (text, isVoice = false, mentions = []) => {
    try {
      const projectId = mentions[0]?.projectId;
      const payload = { title: text, source: isVoice ? "语音" : "快捷记录", projectId, project: projectId ? projectPortfolio.items.find((project) => project.id === projectId)?.name || "未归类" : "未归类", kind: "想法" };
      if (mentions.length) await createLinkedItem({ ...payload, mentions: mentions.map(({ type, id, label }) => ({ type, id, label })) });
      else await createItem(payload);
      setCaptureOpen(false);
      showToast("已保存到总 Inbox，并写入项目事件日志");
    } catch (error) {
      showToast(`保存失败：${error.message}`);
    }
  };

  let content;
  if (view === "today") content = <TodayView projects={projectPortfolio.items} proposalCount={proposalCount} onOpenProject={openProject} onNavigate={navigate} onToast={showToast} />;
  else if (view === "inbox") content = <InboxView items={inboxItems} projects={projectPortfolio.items} onCreateItem={createItem} onCreateLinkedItem={createLinkedItem} onUpdateItem={updateItem} onArchiveItem={archiveItem} onBatchItems={batchItems} onProposeConversions={proposeConversions} onRunOrganizers={runOrganizers} batching={inboxBatching} onOpenProject={openProject} onNavigate={navigate} onToast={showToast} />;
  else if (view === "decisions") content = <DecisionCenterView items={proposals} onDecide={decideProposal} pendingId={pendingProposalId} onToast={showToast} />;
  else if (view === "projects") content = <ProjectsView projects={projectPortfolio.items} favoriteIds={favoriteProjectIds} onToggleFavorite={toggleFavorite} createSignal={newProjectRequest} onCreate={projectPortfolio.create} onUpdate={projectPortfolio.update} onArchive={projectPortfolio.archive} pending={projectPortfolio.pending} onOpenProject={openProject} onImport={() => navigate("import")} onToast={showToast} />;
  else if (view === "time") content = <TimeView projects={projectPortfolio.items} onOpenProject={openProject} onToast={showToast} />;
  else if (view === "graph") content = <KnowledgeGraphView onOpenProject={openProject} />;
  else if (view === "settings") content = <GlobalSettingsView onToast={showToast} onTestErrorBoundary={() => setDiagnosticFault(true)} />;
  else if (view === "project") content = <ProjectPage projectId={projectId} section={projectSection} onSectionChange={changeProjectSection} onBack={() => navigate("projects")} onNavigate={navigate} onToast={showToast} inboxItems={inboxItems} onCreateInbox={createItem} />;
  else if (view === "import") content = <ImportRepositoryView onBack={() => navigate("projects")} onEnterProject={(id) => openProject("overview", id)} onToast={showToast} />;

  const currentProject = projectPortfolio.items.find((project) => project.id === projectId);
  return <div className="app-shell"><Sidebar view={view} projectId={projectId} projects={projectPortfolio.items} favoriteIds={favoriteProjectIds} onToggleFavorite={toggleFavorite} onMoveFavorite={moveFavorite} onNavigate={navigate} onOpenProject={openProject} onNewProject={() => { navigate("projects"); setNewProjectRequest((value) => value + 1); }} inboxCount={inboxItems.length} proposalCount={proposalCount} /><div className="app-main"><Topbar view={view} projectSection={projectSection} projectName={currentProject?.name} onOpenRoute={openRoute} onCapture={openCapture} onToast={showToast} /><main className={`view-scroll view-${view}`}><PageErrorBoundary key={`${view}:${projectId}:${projectSection}`} onRecover={() => setDiagnosticFault(false)} onGoHome={() => { setDiagnosticFault(false); navigate("today"); }}><DiagnosticFault active={diagnosticFault}>{content}</DiagnosticFault></PageErrorBoundary></main></div>{toast && <div className="toast" role="status"><CheckCircle size={18} weight="fill" />{toast}</div>}{captureOpen && <QuickCapture voiceStart={voiceStart} projects={projectPortfolio.items} onClose={() => setCaptureOpen(false)} onSave={saveCapture} onConfigure={() => { setCaptureOpen(false); navigate("settings"); }} />}</div>;
}
