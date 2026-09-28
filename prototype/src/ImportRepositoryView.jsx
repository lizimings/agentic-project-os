import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, ArrowsClockwise, Check, CheckCircle, CheckSquare,
  Eye, EyeSlash, FolderSimple, GitBranch, Info, LockSimple, MagnifyingGlass,
  Pulse, Robot, Sparkle, Warning, X,
} from "@phosphor-icons/react";
import { SiGitea, SiGithub } from "react-icons/si";
import { remoteApi } from "./api.js";
import { useRemoteIntegration } from "./useCoreData.js";

const scopeLabels = {
  commits: ["提交历史", "同步最近 50 条提交证据"],
  branches: ["分支", "同步分支与保护状态"],
  pull_requests: ["Pull Request", "同步开放与已关闭 PR"],
  issues: ["Issue", "排除 PR 伪装的 Issue"],
  milestones: ["Milestone", "同步远程里程碑状态"],
};
const providerLabels = { gitea: "Gitea", github: "GitHub" };

function ProviderTabs({ provider, onChange }) {
  return <div className="provider-tabs" role="tablist" aria-label="代码托管平台">
    <button type="button" role="tab" aria-selected={provider === "github"} className={provider === "github" ? "selected" : ""} onClick={() => onChange("github")}><SiGithub size={21} />GitHub</button>
    <button type="button" role="tab" aria-selected={provider === "gitea"} className={provider === "gitea" ? "selected" : ""} onClick={() => onChange("gitea")}><SiGitea size={23} className="gitea-icon" />Gitea · 自建</button>
  </div>;
}

function ConnectionPanel({ provider, setProvider, integration, search, setSearch, selectedRepo, setSelectedRepo, scopes, setScopes, onToast }) {
  const [tokenVisible, setTokenVisible] = useState(false);
  const [baseUrl, setBaseUrl] = useState(provider === "github" ? "https://api.github.com" : "");
  const [token, setToken] = useState("");
  const [scopeOpen, setScopeOpen] = useState(true);
  const label = providerLabels[provider];

  useEffect(() => { setBaseUrl(integration.connection?.baseUrl || (provider === "github" ? "https://api.github.com" : "")); }, [provider, integration.connection?.baseUrl]);
  useEffect(() => {
    if (!selectedRepo && integration.repositories.length) setSelectedRepo(integration.repositories[0].fullName);
    if (selectedRepo && !integration.repositories.some((repository) => repository.fullName === selectedRepo)) setSelectedRepo(integration.repositories[0]?.fullName ?? "");
  }, [integration.repositories, selectedRepo, setSelectedRepo]);

  const testConnection = async () => {
    try {
      if (token.trim()) {
        const result = await integration.connect({ baseUrl, token: token.trim() });
        setToken("");
        onToast(`${label} 连接正常，用户 ${result.username}`);
      } else if (integration.connection) {
        const result = await integration.validate();
        onToast(`${label} 连接已复验：${result.username}`);
      } else onToast("首次连接需要填写访问令牌");
    } catch (error) { onToast(`连接失败：${error.message}`); }
  };

  const connection = integration.connection;
  const state = integration.pending ? "testing" : connection ? "connected" : "idle";
  return <form className="panel connection-panel" aria-labelledby="connection-title" onSubmit={(event) => { event.preventDefault(); void testConnection(); }}>
    <div className="section-heading"><h2 id="connection-title">连接代码托管</h2><p>GitHub 与自部署 Gitea 使用同一套导入、同步和审计流程</p></div>
    <ProviderTabs provider={provider} onChange={(next) => { setProvider(next); setSelectedRepo(""); setSearch(""); }} />
    <div className="form-group"><label htmlFor="instance-url">API 地址</label><div className="input-with-state"><input id="instance-url" name="instance-url" autoComplete="url" required value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={provider === "github" ? "https://api.github.com" : "https://gitea.example.com"} />{connection && <CheckCircle size={19} weight="fill" />}</div></div>
    <div className="form-group"><label htmlFor="access-token">访问令牌</label><div className="input-with-action"><input id="access-token" name="access-token" autoComplete="new-password" type={tokenVisible ? "text" : "password"} value={token} onChange={(event) => setToken(event.target.value)} placeholder={connection ? `已安全保存 · ••••${connection.tokenHint}` : "至少 8 个字符"} /><button type="button" aria-label={tokenVisible ? "隐藏令牌" : "显示令牌"} onClick={() => setTokenVisible(!tokenVisible)}>{tokenVisible ? <EyeSlash size={18} /> : <Eye size={18} />}</button></div><div className="helper-row"><span>令牌以本机密钥 AES‑256‑GCM 加密，API 只返回末位提示</span><span>使用只读仓库权限即可</span></div></div>
    <div className={`connection-state ${state}`} aria-live="polite"><span className="state-main">{state === "testing" ? <ArrowsClockwise size={19} className="spin" /> : connection ? <CheckCircle size={19} weight="fill" /> : <Info size={19} weight="fill" />}<strong>{state === "testing" ? "正在验证" : connection ? "连接正常" : "尚未连接"}</strong></span><span className="state-result">{connection ? `${connection.username} · ${label} ${connection.instanceVersion || "API"}` : "填写地址和令牌后验证"}</span><button type="submit" disabled={integration.pending || !baseUrl.trim()}><ArrowsClockwise size={16} />{connection && !token ? "重新测试" : "连接并验证"}</button></div>
    {connection && <div className="helper-row"><span>最近验证：{connection.lastValidatedAt ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(connection.lastValidatedAt)) : "未记录"}</span><button type="button" onClick={async () => { try { await integration.disconnect(); setSelectedRepo(""); onToast(`${label} 连接已断开`); } catch (error) { onToast(`断开失败：${error.message}`); } }}>断开连接</button></div>}
    <div className="repo-section"><div className="repo-header"><label htmlFor="repo-search">选择仓库</label><span>{connection ? `${integration.repositoryTotal} 个匹配` : "连接后加载"}</span></div><div className="repo-search-row"><label className="repo-search"><MagnifyingGlass size={18} /><input id="repo-search" name="repo-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索所有者、名称或描述…" disabled={!connection} /></label><button type="button" className="refresh-button" disabled={!connection || integration.isLoadingRepositories} onClick={() => integration.refreshRepositories()}><ArrowsClockwise size={17} className={integration.isLoadingRepositories ? "spin" : ""} />刷新</button></div><div className="repo-list" role="radiogroup">
      {integration.repositories.map((repo) => <label className={`repo-row ${selectedRepo === repo.fullName ? "selected" : ""}`} key={repo.id}><input type="radio" name="repo" checked={selectedRepo === repo.fullName} onChange={() => setSelectedRepo(repo.fullName)} /><span className="radio-visual"><span /></span>{repo.private ? <LockSimple size={17} /> : <FolderSimple size={17} />}<span className="repo-copy"><span><strong>{repo.fullName}</strong><em>{repo.private ? "私有" : "公开"}</em></span><small>默认分支：{repo.defaultBranch || "未设置"}<i />更新：{repo.updatedAt ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short" }).format(new Date(repo.updatedAt)) : "未知"}</small></span></label>)}
      {connection && !integration.isLoadingRepositories && !integration.repositories.length && <div className="portfolio-empty"><FolderSimple size={24} /><strong>没有匹配的仓库</strong><span>清空搜索词或检查令牌权限</span></div>}
    </div></div>
    <div className="scope-section"><button className="scope-toggle" type="button" aria-expanded={scopeOpen} onClick={() => setScopeOpen(!scopeOpen)}><span>同步范围 <small>（可按项目选择）</small></span><ArrowRight size={16} /></button>{scopeOpen && <div className="scope-grid">{Object.entries(scopeLabels).map(([key, [scopeLabel, note]]) => <label className="scope-item" key={key}><input type="checkbox" name={`scope-${key}`} checked={scopes.includes(key)} onChange={() => setScopes(scopes.includes(key) ? scopes.filter((scope) => scope !== key) : [...scopes, key])} /><span className="checkbox-visual"><Check size={12} weight="bold" /></span><span><strong>{scopeLabel}</strong><small>{note}</small></span></label>)}</div>}</div>
  </form>;
}

function ImportPreview({ provider, repository, projectName, setProjectName, preview, previewing, acknowledged, setAcknowledged, webhookEnabled, setWebhookEnabled }) {
  const rows = useMemo(() => repository ? [
    { icon: FolderSimple, source: "仓库", sourceMeta: repository.fullName, targetIcon: FolderSimple, target: "项目", targetMeta: projectName || "等待命名" },
    { icon: GitBranch, source: "默认分支", sourceMeta: repository.defaultBranch || "未设置", targetIcon: GitBranch, target: "远程代码源", targetMeta: "绑定到项目设置" },
    { icon: Pulse, source: "协作实体", sourceMeta: "Commit · Branch · PR · Issue · Milestone", targetIcon: CheckSquare, target: "可审计证据", targetMeta: "按范围持续同步" },
  ] : [], [repository, projectName]);
  const conflicts = preview?.conflicts ?? [];
  return <section className="panel preview-panel" aria-labelledby="preview-title"><div className="section-heading"><h2 id="preview-title">导入预览</h2><p>预检名称、远程绑定、本地默认分支和工作树冲突，再原子创建项目</p></div>
    <div className="mapping-list">{rows.map((row) => { const SourceIcon = row.icon; const TargetIcon = row.targetIcon; return <div className="mapping-row" key={row.source}><div className="mapping-side source"><SourceIcon size={23} /><span><strong>{row.source}</strong><small>{row.sourceMeta}</small></span></div><ArrowRight size={17} className="map-arrow" /><div className="mapping-side target"><TargetIcon size={23} /><span><strong>{row.target}</strong><small>{row.targetMeta}</small></span></div></div>; })}{!repository && <div className="portfolio-empty"><GitBranch size={28} /><h2>先连接并选择仓库</h2><p>这里会显示仓库到项目实体的真实映射。</p></div>}</div>
    <div className="alerts">
      {previewing && <div><span><ArrowsClockwise size={18} className="spin" />正在检查导入冲突…</span></div>}
      {!previewing && repository && !conflicts.length && <div><span><CheckCircle size={18} weight="fill" />预检通过：没有名称、远程绑定或分支冲突</span></div>}
      {conflicts.map((conflict) => <div className={conflict.severity === "blocking" ? "warning" : ""} key={conflict.id}><span><Warning size={18} weight="fill" />{conflict.message}</span>{conflict.severity === "blocking" && <label className="conflict-ack"><input type="checkbox" checked={acknowledged.includes(conflict.id)} onChange={() => setAcknowledged(acknowledged.includes(conflict.id) ? acknowledged.filter((id) => id !== conflict.id) : [...acknowledged, conflict.id])} />我已了解并继续</label>}</div>)}
      {repository?.private && <div><span><Info size={18} weight="fill" />私有仓库同步始终沿用当前加密令牌权限</span></div>}
    </div>
    <div className="webhook-box"><div className="webhook-heading"><strong>Webhook 设置</strong><label className="switch-label"><span>导入后生成签名配置</span><input type="checkbox" name="webhook-enabled" checked={webhookEnabled} onChange={(event) => setWebhookEnabled(event.target.checked)} /><span className="switch"><span /></span></label></div><div className="webhook-grid"><div><span>提供方</span><strong className="enabled">{providerLabels[provider]}</strong></div><div><span>签名验证</span><strong className="enabled">HMAC-SHA256</strong></div><div><span>防重放</span><strong className="enabled">Delivery ID</strong></div></div></div>
    <div className="project-fields"><div className="form-group"><label htmlFor="project-name">项目名称</label><div className="input-with-state"><input id="project-name" name="project-name" required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="项目名称" />{projectName.trim() && <CheckCircle size={19} weight="fill" />}</div><small>导入会原子创建项目和 {providerLabels[provider]} 绑定</small></div><div className="form-group"><label>本地工作区</label><div className="input-with-state"><input value="进入项目后绑定本地文件夹" readOnly /><FolderSimple size={18} /></div><small>本地路径与远程仓库可分别解绑</small></div></div>
  </section>;
}

function SuccessModal({ result, onClose, onEnter }) {
  const failed = result.syncJob?.status === "failed";
  return <div className="modal-backdrop"><div className="success-modal" role="dialog" aria-modal="true" aria-labelledby="success-title"><button className="modal-close" type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button><span className="success-icon"><Sparkle size={26} weight="fill" /></span><h2 id="success-title">{result.project.name} 已接入指挥中心</h2><p>{result.binding.fullName} 已成为项目的远程代码源，导入与同步任务均写入审计日志。</p><div className="import-progress"><span><CheckCircle size={17} weight="fill" />项目与远程绑定完成</span><span className={failed ? "failed" : ""}>{failed ? <Warning size={17} weight="fill" /> : <CheckCircle size={17} weight="fill" />}{failed ? `首次同步待重试：${result.syncJob.error}` : `${result.syncJob?.progressCurrent ?? 0}/${result.syncJob?.progressTotal ?? 0} 个同步范围完成`}</span>{result.webhookConfiguration && <span><CheckCircle size={17} weight="fill" />Webhook 签名配置已生成</span>}</div>{result.webhookConfiguration?.secret && <div className="webhook-secret"><small>密钥只显示这一次，请保存到远程 Webhook 设置</small><code>{result.webhookConfiguration.secret}</code><span>回调路径：{result.webhookConfiguration.endpointPath}</span></div>}<button type="button" onClick={() => onEnter(result.project.id)}>进入项目总览</button></div></div>;
}

export function ImportRepositoryView({ onBack, onEnterProject, onToast }) {
  const [provider, setProvider] = useState("gitea");
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [projectName, setProjectName] = useState("");
  const [scopes, setScopes] = useState(Object.keys(scopeLabels));
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [acknowledged, setAcknowledged] = useState([]);
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const integration = useRemoteIntegration(provider, repoSearch);
  const repository = integration.repositories.find((item) => item.fullName === selectedRepo) ?? null;

  useEffect(() => { if (repository) setProjectName(repository.name); }, [repository?.fullName]);
  useEffect(() => {
    setAcknowledged([]);
    if (!repository || !integration.connection || !projectName.trim() || !scopes.length) { setPreview(null); return undefined; }
    let canceled = false;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const next = await remoteApi.previewImport({ connectionId: integration.connection.id, fullName: repository.fullName, projectName: projectName.trim(), syncScopes: scopes });
        if (!canceled) setPreview(next);
      } catch (error) { if (!canceled) { setPreview(null); onToast(`导入预检失败：${error.message}`); } }
      finally { if (!canceled) setPreviewing(false); }
    }, 250);
    return () => { canceled = true; clearTimeout(timer); };
  }, [integration.connection?.id, repository?.fullName, projectName, scopes.join("|")]);

  const outstanding = (preview?.conflicts ?? []).filter((conflict) => conflict.severity === "blocking" && !acknowledged.includes(conflict.id));
  const startImport = async () => {
    if (!repository || !integration.connection || !projectName.trim() || !scopes.length || importing || outstanding.length) return;
    setImporting(true);
    try {
      const imported = await remoteApi.importProject({ connectionId: integration.connection.id, fullName: repository.fullName, project: { name: projectName.trim(), description: repository.description || `从 ${repository.fullName} 导入`, vision: "", color: "#4057f4", status: "active" }, syncScopes: scopes, acknowledgedConflictIds: acknowledged });
      const webhookConfiguration = webhookEnabled ? await remoteApi.configureWebhook(imported.project.id, true) : null;
      setResult({ ...imported, webhookConfiguration });
      onToast(`项目已导入，首次同步${imported.syncJob.status === "succeeded" ? "完成" : "可在项目设置中重试"}`);
    } catch (error) { onToast(`导入失败：${error.message}`); }
    finally { setImporting(false); }
  };

  return <div className="import-page"><header className="import-header"><button type="button" onClick={onBack}><ArrowLeft size={17} />返回项目组合</button><div><span className="eyebrow">新建项目 · 远程连接</span><h1>从代码仓库导入</h1><p>连接 GitHub 或自部署 Gitea，预检冲突，并同步提交、分支、PR、Issue 与里程碑。</p></div></header><main className="import-workspace"><ConnectionPanel provider={provider} setProvider={setProvider} integration={integration} search={repoSearch} setSearch={setRepoSearch} selectedRepo={selectedRepo} setSelectedRepo={setSelectedRepo} scopes={scopes} setScopes={setScopes} onToast={onToast} /><ImportPreview provider={provider} repository={repository} projectName={projectName} setProjectName={setProjectName} preview={preview} previewing={previewing} acknowledged={acknowledged} setAcknowledged={setAcknowledged} webhookEnabled={webhookEnabled} setWebhookEnabled={setWebhookEnabled} /></main><footer className="action-bar"><button className="cancel-button" type="button" onClick={onBack}>取消</button><div><button className="secondary-action" type="button" onClick={onBack}>仅保存连接</button><button className="primary-action" type="button" disabled={importing || previewing || !repository || !projectName.trim() || !scopes.length || outstanding.length > 0} onClick={startImport}>{importing ? <ArrowsClockwise size={17} className="spin" /> : <Robot size={18} weight="fill" />}{importing ? "正在导入并同步…" : "预检通过，导入项目"}</button></div></footer>{result && <SuccessModal result={result} onClose={() => setResult(null)} onEnter={onEnterProject} />}</div>;
}
