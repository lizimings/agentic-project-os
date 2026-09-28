import { useEffect, useMemo, useState } from "react";
import { ArrowsClockwise, CaretRight, Code, FileText, GitBranch, GitCommit, Lightning, LinkSimple, Plus, Robot, Warning, X } from "@phosphor-icons/react";

function formatDate(value, fallback = "刚刚") {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function initialSelectedId(binding) {
  const focus = new URLSearchParams(window.location.search).get("focus");
  if (!focus) return binding?.worktrees?.[0]?.id ?? null;
  if (binding?.worktrees?.some((tree) => tree.id === focus)) return focus;
  return binding?.commits?.find((commit) => commit.id === focus)?.worktreeId ?? binding?.worktrees?.[0]?.id ?? null;
}

function WorktreeCreationModal({ binding, onPreflight, onCreate, onCreated, onClose }) {
  const [draft, setDraft] = useState({ branch: "feature/", baseRef: binding.branch || "HEAD", targetPath: `${binding.path}-worktree` });
  const [preflight, setPreflight] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { setPreflight(await onPreflight(draft)); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!preflight) return;
    setBusy(true);
    setError("");
    try { onCreated(await onCreate(preflight.confirmationToken)); }
    catch (requestError) { setError(requestError.message); setPreflight(null); }
    finally { setBusy(false); }
  };
  const commandText = preflight?.command.map((part) => /\s/.test(part) ? `"${part}"` : part).join(" ");
  return <div className="modal-backdrop"><form className="worktree-create-modal" role="dialog" aria-modal="true" aria-labelledby="worktree-create-title" onSubmit={preview}><button className="modal-close" type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button><span className="capture-modal-icon"><GitBranch size={23} weight="duotone" /></span><div><span className="eyebrow">确认型 Git 命令</span><h2 id="worktree-create-title">创建 Worktree</h2><p>先完成只读预检并展示将执行的命令，确认后才会修改 Git 仓库。</p></div>
    <label><span>分支名称</span><input aria-label="新 Worktree 分支" required disabled={Boolean(preflight)} value={draft.branch} onChange={(event) => setDraft({ ...draft, branch: event.target.value })} placeholder="feature/new-capability" /></label>
    <label><span>基准引用</span><input aria-label="Worktree 基准引用" required disabled={Boolean(preflight)} value={draft.baseRef} onChange={(event) => setDraft({ ...draft, baseRef: event.target.value })} placeholder="HEAD 或 main" /></label>
    <label><span>目标绝对路径</span><input aria-label="Worktree 目标路径" required disabled={Boolean(preflight)} value={draft.targetPath} onChange={(event) => setDraft({ ...draft, targetPath: event.target.value })} /><small>目标需位于主工作区之外，父目录必须已经存在。</small></label>
    {error && <div className="worktree-command-error"><Warning size={17} />{error}</div>}
    {preflight && <div className="worktree-command-preview"><div><strong>预检通过</strong><em>{preflight.branchExists ? "检出现有分支" : "创建新分支"}</em></div><code>{commandText}</code>{preflight.warnings.map((warning) => <span key={warning}><Warning size={14} />{warning}</span>)}<small>确认有效期至 {formatDate(preflight.expiresAt)}；HEAD 或路径状态变化后会要求重新预检。</small></div>}
    <div className="capture-modal-actions"><button type="button" onClick={preflight ? () => setPreflight(null) : onClose} disabled={busy}>{preflight ? "返回修改" : "取消"}</button>{preflight ? <button className="primary-small" type="button" disabled={busy} onClick={confirm}>{busy ? "创建中…" : "确认创建 Worktree"}</button> : <button className="primary-small" type="submit" disabled={busy || !draft.branch.trim() || !draft.targetPath.trim()}>{busy ? "预检中…" : "预检实际命令"}</button>}</div>
  </form></div>;
}

export function WorktreeManagementView({ binding, tasks, actors, links, onScan, onPreflightWorktree, onCreateWorktree, onCreateLink, onDeleteLink, onSectionChange, pending, onToast }) {
  const trees = binding?.worktrees ?? [];
  const commits = binding?.commits ?? [];
  const activeTasks = tasks.filter((task) => task.status !== "archived");
  const [selectedId, setSelectedId] = useState(() => initialSelectedId(binding));
  useEffect(() => { if (!trees.some((tree) => tree.id === selectedId)) setSelectedId(initialSelectedId(binding)); }, [binding, trees, selectedId]);
  const selected = trees.find((tree) => tree.id === selectedId) ?? null;
  const selectedCommits = selected ? commits.filter((commit) => commit.worktreeId === selected.id).slice(0, 8) : [];
  const associations = useMemo(() => Object.fromEntries(trees.map((tree) => {
    const taskLink = links.find((link) => link.sourceType === "worktree" && link.sourceId === tree.id && link.targetType === "task" && link.label === "worktree:task");
    const actorLink = links.find((link) => link.sourceType === "actor" && link.targetType === "worktree" && link.targetId === tree.id && link.label === "worktree:actor");
    return [tree.id, { taskLink, actorLink, task: activeTasks.find((task) => task.id === taskLink?.targetId), actor: actors.find((actor) => actor.id === actorLink?.sourceId) }];
  })), [trees, links, activeTasks, actors]);
  const selectedAssociation = selected ? associations[selected.id] ?? {} : {};
  const [taskId, setTaskId] = useState("");
  const [actorId, setActorId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => { setTaskId(selectedAssociation.taskLink?.targetId ?? ""); setActorId(selectedAssociation.actorLink?.sourceId ?? ""); }, [selectedId, selectedAssociation.taskLink?.id, selectedAssociation.actorLink?.id]);

  const rescan = async () => {
    try {
      const result = await onScan();
      onToast(`已刷新 ${result.worktrees.length} 个 Worktree 与 ${result.commits.length} 条提交证据`);
    } catch (error) { onToast(`扫描失败：${error.message}`); }
  };

  const saveAssociations = async () => {
    if (!selected) return;
    try {
      const operations = [];
      if (selectedAssociation.taskLink && selectedAssociation.taskLink.targetId !== taskId) operations.push(onDeleteLink(selectedAssociation.taskLink.id));
      if (selectedAssociation.actorLink && selectedAssociation.actorLink.sourceId !== actorId) operations.push(onDeleteLink(selectedAssociation.actorLink.id));
      await Promise.all(operations);
      if (taskId && selectedAssociation.taskLink?.targetId !== taskId) await onCreateLink({ sourceType: "worktree", sourceId: selected.id, targetType: "task", targetId: taskId, relation: "implements", label: "worktree:task" });
      if (actorId && selectedAssociation.actorLink?.sourceId !== actorId) await onCreateLink({ sourceType: "actor", sourceId: actorId, targetType: "worktree", targetId: selected.id, relation: "implements", label: "worktree:actor" });
      onToast("工作树已关联任务和负责人；这里只观察与归档关系，不会隐式调度 Agent");
    } catch (error) { onToast(`关联失败：${error.message}`); }
  };

  return <div className="project-content worktrees-view">
    <div className="view-heading"><div><span className="eyebrow">代码执行现场 · 稳定 Worktree 实体</span><h2>工作树</h2><p>分支、改动、提交与同步差异来自 Git 实扫；任务和 Actor 通过 EntityLink 关联，重新扫描后仍然保持。</p></div><div className="worktree-heading-actions">{binding?.watchEnabled && <span className="watch-status"><Lightning size={14} weight="fill" />自动监听中</span>}{binding?.status === "ready" && <button className="quiet-button" type="button" onClick={() => setCreateOpen(true)}><Plus size={16} />创建 Worktree</button>}<button className="primary-small" type="button" onClick={binding ? rescan : () => onSectionChange("settings")} disabled={pending}><ArrowsClockwise size={17} className={pending ? "spin" : ""} />{binding ? "重新扫描" : "绑定工作区"}</button></div></div>
    {binding?.status !== "ready" ? <section className="entity-empty card-surface worktree-empty"><GitBranch size={28} /><strong>{binding ? binding.lastError : "尚未绑定本地工作区"}</strong><span>在项目设置中绑定一个 Git 仓库后，Local Agent 会发现所有 worktree。</span><button className="primary-small" type="button" onClick={() => onSectionChange("settings")}>打开工作区设置</button></section> : <section className="worktree-layout">
      <div className="worktree-table card-surface"><div className="tree-table-head"><span>工作树 / 当前任务</span><span>负责人</span><span>状态与活动</span><span>产出 / 阻塞</span></div>{trees.map((tree) => {
        const blocker = tree.lockedReason || tree.prunableReason;
        const association = associations[tree.id] ?? {};
        return <button type="button" className={`tree-table-row ${selectedId === tree.id ? "selected" : ""}`} key={tree.id} onClick={() => setSelectedId(tree.id)}><span className="tree-branch"><i className={tree.isCurrent ? "running" : "idle"} /><span><strong>{tree.branch || (tree.isDetached ? "detached HEAD" : "bare")}</strong><small>{association.task?.title || "尚未关联任务"} · {tree.path}</small></span></span><span className="tree-agent"><Robot size={17} />{association.actor?.name || "未关联"}</span><span><em className={tree.dirtyFiles ? "amber" : tree.isCurrent ? "running" : "idle"}>{tree.dirtyFiles ? `${tree.dirtyFiles} 项改动` : tree.isCurrent ? "当前工作区" : "工作区干净"}</em><small>{tree.lastCommit ? `${formatDate(tree.lastCommit.committedAt)} 提交` : `${formatDate(tree.scannedAt)} 扫描`}</small></span><span><strong>{tree.lastCommit?.subject || tree.head}</strong><small className={blocker ? "has-blocker" : "no-blocker"}>{blocker || `${tree.ahead} ahead · ${tree.behind} behind`}</small></span><CaretRight size={16} /></button>;
      })}</div>
      {selected && <aside className="tree-detail card-surface"><div className="tree-detail-head"><span className={`tree-state ${selected.isCurrent ? "running" : "idle"}`}><GitBranch size={20} /></span><div><span>{selected.isCurrent ? "当前工作树" : "已发现工作树"}</span><h2>{selected.branch || "detached HEAD"}</h2></div></div><code>{selected.path}</code><div className="tree-detail-state"><span><Robot size={17} /><strong>{selectedAssociation.actor?.name || "尚未关联负责人"}</strong></span><em className={selected.dirtyFiles ? "amber" : "running"}>{selected.dirtyFiles ? `${selected.dirtyFiles} 项未提交改动` : "Git 状态干净"}</em></div>
        <div className="worktree-association-editor"><label><span>当前任务</span><select aria-label="工作树关联任务" value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">不关联任务</option>{activeTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label><span>负责人 / Agent</span><select aria-label="工作树关联负责人" value={actorId} onChange={(event) => setActorId(event.target.value)}><option value="">不关联负责人</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name} · {actor.kind} · {actor.status}</option>)}</select></label><button type="button" disabled={pending || (taskId === (selectedAssociation.taskLink?.targetId ?? "") && actorId === (selectedAssociation.actorLink?.sourceId ?? ""))} onClick={saveAssociations}><LinkSimple size={15} />保存显式关联</button></div>
        <div className="tree-metrics"><span><small>未提交</small><strong>{selected.dirtyFiles}</strong></span><span><small>Ahead / Behind</small><strong>{selected.ahead} / {selected.behind}</strong></span><span><small>阻塞</small><strong>{selected.lockedReason || selected.prunableReason || "无"}</strong></span></div>
        {selected.changedFiles.length > 0 && <div className="changed-file-list"><strong>当前改动</strong>{selected.changedFiles.slice(0, 6).map((file) => <span key={file}><FileText size={14} />{file}</span>)}</div>}
        <div className="commit-list"><strong>最近提交证据</strong>{selectedCommits.length ? selectedCommits.map((commit) => <button type="button" key={commit.id} title={commit.hash} onClick={() => navigator.clipboard?.writeText(commit.hash).then(() => onToast("提交哈希已复制"))}><GitCommit size={15} /><code>{commit.shortHash}</code><span><b>{commit.subject}</b><small>{commit.author} · {formatDate(commit.committedAt)}</small></span></button>) : <span className="commit-empty">这个工作树还没有可读取的提交</span>}</div>
        <div className="tree-actions"><button type="button" onClick={() => navigator.clipboard?.writeText(selected.path).then(() => onToast("工作树路径已复制")).catch(() => onToast(`本地路径：${selected.path}`))}><Code size={17} />复制路径</button></div>
      </aside>}
    </section>}
    {createOpen && binding && <WorktreeCreationModal binding={binding} onPreflight={onPreflightWorktree} onCreate={onCreateWorktree} onClose={() => setCreateOpen(false)} onCreated={(result) => { setSelectedId(result.worktree.id); setCreateOpen(false); onToast(`Worktree ${result.worktree.branch || result.worktree.head} 已创建并完成扫描`); }} />}
  </div>;
}
