import { useEffect, useState } from "react";
import { Archive, ArrowCounterClockwise, ArrowsClockwise, CalendarBlank, CheckCircle, Database, Desktop, DownloadSimple, FolderOpen, Key, LockKey, Microphone, Power, Pulse, Robot, ShieldCheck, TerminalWindow, Trash, UploadSimple, Waveform, Warning } from "@phosphor-icons/react";
import { backupApi } from "./api.js";
import { desktopBridge } from "./desktopBridge.js";
import { useAiSettings, useGlobalPreferences } from "./useCoreData.js";

const defaults = { provider: "openai", baseUrl: "https://api.openai.com/v1", transcriptionModel: "gpt-transcribe", apiKey: "" };

export function GlobalSettingsView({ onToast, onTestErrorBoundary }) {
  const ai = useAiSettings();
  const runtime = useGlobalPreferences();
  const [desktopRuntime, setDesktopRuntime] = useState(null);
  const [draft, setDraft] = useState(defaults);
  const [backups, setBackups] = useState({ items: [], pendingRestore: null, lastRestore: null });
  const [backupPending, setBackupPending] = useState(false);
  const [backupError, setBackupError] = useState(null);
  const [restorePlan, setRestorePlan] = useState(null);
  useEffect(() => {
    if (ai.settings) setDraft({ provider: ai.settings.provider, baseUrl: ai.settings.baseUrl, transcriptionModel: ai.settings.transcriptionModel, apiKey: "" });
  }, [ai.settings]);
  useEffect(() => { void desktopBridge.getRuntimeInfo().then(setDesktopRuntime); }, []);
  const refreshBackups = async () => {
    try { setBackupError(null); setBackups(await backupApi.list()); }
    catch (error) { setBackupError(error); }
  };
  useEffect(() => { void refreshBackups(); }, []);

  const save = async (event) => {
    event.preventDefault();
    try {
      await ai.update({
        provider: draft.provider,
        baseUrl: draft.baseUrl.trim(),
        transcriptionModel: draft.transcriptionModel.trim(),
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
      });
      setDraft((value) => ({ ...value, apiKey: "" }));
      onToast("AI 与语音设置已加密保存");
    } catch (error) { onToast(`设置保存失败：${error.message}`); }
  };

  const clearKey = async () => {
    try {
      await ai.update({ provider: draft.provider, baseUrl: draft.baseUrl.trim(), transcriptionModel: draft.transcriptionModel.trim(), clearApiKey: true });
      setDraft((value) => ({ ...value, apiKey: "" }));
      onToast("本机保存的 API Key 已清除");
    } catch (error) { onToast(`清除失败：${error.message}`); }
  };

  const updatePreference = async (input, message) => {
    try {
      await runtime.update(input);
      if (input.launchAtLogin !== undefined) {
        const result = await desktopBridge.setLaunchAtLogin(input.launchAtLogin);
        onToast(result.applied ? message : `${message}；开机启动将在桌面版中生效`);
      } else if (input.minimizeToTray !== undefined) {
        const result = await desktopBridge.setMinimizeToTray(input.minimizeToTray);
        onToast(result.applied ? message : `${message}；托盘行为将在桌面版中生效`);
      } else onToast(message);
    } catch (error) { onToast(`偏好保存失败：${error.message}`); }
  };

  const openDataDirectory = async () => {
    const directory = runtime.diagnostics?.data.dataDirectory;
    if (!directory) return;
    if (desktopBridge.available) {
      const result = await desktopBridge.openPath(directory);
      onToast(result.opened ? "已在系统文件管理器中打开数据目录" : `打开失败：${result.error || "系统未响应"}`);
    } else {
      await navigator.clipboard.writeText(directory);
      onToast("数据目录已复制到剪贴板");
    }
  };

  const chooseDirectory = async (defaultPath = "") => {
    if (desktopBridge.available) {
      const result = await desktopBridge.selectDirectory(defaultPath);
      return result?.canceled ? null : result?.path;
    }
    return window.prompt("请输入本机绝对目录路径", defaultPath) || null;
  };

  const createBackup = async () => {
    setBackupPending(true);
    try {
      const created = await backupApi.create({ label: `手动备份 · ${new Date().toLocaleString("zh-CN", { hour12: false })}` });
      await refreshBackups();
      onToast(`备份已完成：${created.label}`);
    } catch (error) { onToast(`备份失败：${error.message}`); }
    finally { setBackupPending(false); }
  };

  const importBackup = async () => {
    const directory = await chooseDirectory(runtime.diagnostics?.data.dataDirectory || "");
    if (!directory) return;
    setBackupPending(true);
    try { const imported = await backupApi.import(directory); await refreshBackups(); onToast(`已导入迁移备份：${imported.label}`); }
    catch (error) { onToast(`导入失败：${error.message}`); }
    finally { setBackupPending(false); }
  };

  const exportBackup = async (backup) => {
    const directory = await chooseDirectory(runtime.diagnostics?.data.dataDirectory || "");
    if (!directory) return;
    setBackupPending(true);
    try {
      const exported = await backupApi.export(backup.id, directory);
      onToast(`迁移包已导出到 ${exported.directory}`);
      if (desktopBridge.available) await desktopBridge.openPath(exported.directory);
    } catch (error) { onToast(`导出失败：${error.message}`); }
    finally { setBackupPending(false); }
  };

  const prepareRestore = async (backup) => {
    setBackupPending(true);
    try { setRestorePlan(await backupApi.preflightRestore(backup.id)); }
    catch (error) { onToast(`恢复预检失败：${error.message}`); }
    finally { setBackupPending(false); }
  };

  const confirmRestore = async () => {
    if (!restorePlan) return;
    setBackupPending(true);
    try {
      await backupApi.restore(restorePlan.backup.id, restorePlan.confirmationToken);
      setRestorePlan(null);
      await refreshBackups();
      if (desktopBridge.available) {
        onToast("恢复计划已写入，正在重启并原子恢复数据…");
        await desktopBridge.restartApp();
      } else onToast("恢复计划已写入；请重启 projectd，启动时会自动恢复并迁移数据");
    } catch (error) { onToast(`安排恢复失败：${error.message}`); }
    finally { setBackupPending(false); }
  };

  const deleteBackup = async (backup) => {
    if (!window.confirm(`删除备份“${backup.label}”？该操作只删除备份，不影响当前项目数据。`)) return;
    setBackupPending(true);
    try { await backupApi.delete(backup.id); await refreshBackups(); onToast("备份已删除"); }
    catch (error) { onToast(`删除失败：${error.message}`); }
    finally { setBackupPending(false); }
  };

  const formatBytes = (bytes = 0) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  return <div className="product-page global-settings-page">
    <header className="page-intro"><div><span className="eyebrow">本地运行时 · 全局设置</span><h1>模型、语音与 Agent 接入</h1><p>敏感凭据由 projectd 使用本机 AES-256-GCM 密钥加密；浏览器、事件日志和 MCP 输出只看到配置状态。</p></div></header>
    <section className="global-settings-layout">
      <form className="settings-form card-surface" onSubmit={save}>
        <div className="settings-form-title"><span><Waveform size={24} weight="duotone" /></span><div><h2>高精度语音转写</h2><p>录音在本机浏览器完成，再由 daemon 代理到 OpenAI Transcription API。</p></div>{ai.settings?.apiKeyConfigured && <em><CheckCircle size={15} weight="fill" />已配置</em>}</div>
        {ai.error && <div className="settings-error">设置服务加载失败：{ai.error.message}</div>}
        <div className="settings-field-grid">
          <label><span>服务提供方</span><select aria-label="AI 服务提供方" value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })}><option value="openai">OpenAI</option><option value="openai_compatible">OpenAI-compatible</option></select><small>首版默认 OpenAI，也支持相同接口协议的本地或第三方服务。</small></label>
          <label><span>转写模型</span><input aria-label="语音转写模型" list="transcription-models" value={draft.transcriptionModel} onChange={(event) => setDraft({ ...draft, transcriptionModel: event.target.value })} /><datalist id="transcription-models"><option value="gpt-transcribe" /><option value="gpt-4o-transcribe" /><option value="gpt-4o-mini-transcribe" /></datalist><small>默认使用高精度 `gpt-transcribe`，也可填写兼容服务模型名。</small></label>
        </div>
        <label><span>API Base URL</span><input aria-label="AI API Base URL" type="url" required value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" /><small>daemon 会在该地址后调用 `/audio/transcriptions`；支持 HTTP 本地服务与 HTTPS 远程服务。</small></label>
        <label><span>API Key</span><div className="secret-input"><Key size={18} /><input aria-label="AI API Key" type="password" autoComplete="off" value={draft.apiKey} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder={ai.settings?.apiKeyConfigured ? `已加密保存 · 尾号 ${ai.settings.apiKeyHint}` : "输入新的 API Key"} /></div><small>{ai.settings?.apiKeyConfigured ? "留空会保留现有密钥；只有输入新值才会替换。" : "密钥只发送给本机 projectd，不进入前端持久化。"}</small></label>
        <div className="settings-security"><LockKey size={19} weight="duotone" /><span><strong>本机密钥隔离</strong><small>数据库保存密文；加密主密钥与数据库分离，日志只记录模型、音频字节数和转写字符数。</small></span></div>
        <div className="settings-form-actions">{ai.settings?.apiKeyConfigured && <button type="button" className="danger-quiet" disabled={ai.pending} onClick={clearKey}>清除 API Key</button>}<button className="primary-small" type="submit" disabled={ai.pending || !draft.baseUrl.trim() || !draft.transcriptionModel.trim()}>{ai.pending ? "保存中…" : "保存语音配置"}</button></div>
      </form>
      <aside className="runtime-settings card-surface">
        <div className="settings-form-title"><span><Robot size={23} weight="duotone" /></span><div><h2>运行时边界</h2><p>管理界面、整理 Agent 与执行 Agent 各自保持清晰职责。</p></div></div>
        <article><span className="runtime-icon green"><ShieldCheck size={20} /></span><div><strong>整理 Agent</strong><small>事件驱动 · 只读沙盒 · 仅生成 Proposal</small></div><em>运行中</em></article>
        <article><span className="runtime-icon blue"><TerminalWindow size={20} /></span><div><strong>CLI / MCP</strong><small>跟随本地 daemon 启动，提供实体读写与快照能力</small></div><em>已接入</em></article>
        <article><span className="runtime-icon purple"><Microphone size={20} /></span><div><strong>语音入口</strong><small>MediaRecorder → daemon → 可配置转写 API</small></div><em>{ai.settings?.apiKeyConfigured ? "可用" : "待配置"}</em></article>
        <article><span className="runtime-icon amber"><Pulse size={20} /></span><div><strong>页面恢复诊断</strong><small>触发一次受控页面异常，验证外壳不会整体崩溃</small></div><button type="button" onClick={onTestErrorBoundary}>运行测试</button></article>
        <div className="runtime-note"><strong>为什么不在浏览器直连模型？</strong><p>这样 API Key 不会出现在前端网络配置或构建产物中，也能统一审计、超时和服务适配。</p></div>
      </aside>
    </section>
    <section className="global-preferences-grid">
      <article className="settings-form card-surface preference-panel">
        <div className="settings-form-title"><span><Power size={23} weight="duotone" /></span><div><h2>桌面与启动</h2><p>偏好保存在本地数据库；桌面壳负责应用到 Windows。</p></div>{desktopBridge.available ? <em><CheckCircle size={15} weight="fill" />桌面版</em> : <em>浏览器模式</em>}</div>
        <label className="preference-row"><span><strong>登录时启动</strong><small>进入系统后自动打开 Agentic Project OS</small></span><span className="switch-label"><input aria-label="登录时启动" type="checkbox" disabled={runtime.pending || !runtime.preferences} checked={runtime.preferences?.launchAtLogin ?? false} onChange={(event) => void updatePreference({ launchAtLogin: event.target.checked }, event.target.checked ? "已开启登录时启动" : "已关闭登录时启动")} /><span className="switch"><span /></span></span></label>
        <label className="preference-row"><span><strong>关闭窗口时最小化到托盘</strong><small>保持 daemon、MCP 和事件监听持续运行</small></span><span className="switch-label"><input aria-label="最小化到托盘" type="checkbox" disabled={runtime.pending || !runtime.preferences} checked={runtime.preferences?.minimizeToTray ?? true} onChange={(event) => void updatePreference({ minimizeToTray: event.target.checked }, "托盘偏好已保存")} /><span className="switch"><span /></span></span></label>
        <div className="preference-row preference-fixed"><span><strong>daemon 与 MCP 自动就绪</strong><small>桌面启动时检查 projectd；缺失时自动拉起，MCP/CLI 复用同一服务</small></span><em><CheckCircle size={15} weight="fill" />强制启用</em></div>
        <div className="preference-selects"><label><span><CalendarBlank size={15} />每周起始日</span><select aria-label="每周起始日" disabled={runtime.pending || !runtime.preferences} value={runtime.preferences?.weekStartsOn || "monday"} onChange={(event) => void updatePreference({ weekStartsOn: event.target.value }, "时间视图偏好已保存")}><option value="monday">星期一</option><option value="sunday">星期日</option></select></label><span className="desktop-runtime-state"><Desktop size={15} /><span><strong>{desktopBridge.available ? "Electron 桌面运行时" : "Web 浏览器运行时"}</strong><small>{desktopRuntime?.version ? `v${desktopRuntime.version}` : desktopRuntime?.platform || navigator.platform}</small></span></span></div>
      </article>
      <article className="settings-form card-surface preference-panel diagnostics-panel">
        <div className="settings-form-title"><span><Database size={23} weight="duotone" /></span><div><h2>本地数据与诊断</h2><p>读取当前 daemon、数据库、迁移和后台服务的实时状态。</p></div><em className={runtime.diagnostics?.data.writable ? "" : "failed"}>{runtime.diagnostics?.data.writable ? "可写" : "需处理"}</em></div>
        {runtime.error && <div className="settings-error">诊断加载失败：{runtime.error.message}</div>}
        <div className="diagnostic-metrics"><span><small>daemon</small><strong>{runtime.diagnostics ? `${runtime.diagnostics.daemon.version} · PID ${runtime.diagnostics.daemon.pid}` : "读取中…"}</strong></span><span><small>数据库大小</small><strong>{formatBytes(runtime.diagnostics?.data.databaseBytes)}</strong></span><span><small>Schema</small><strong>{runtime.diagnostics?.data.migration || "—"}</strong></span><span><small>MCP / Organizer</small><strong>{runtime.diagnostics ? `${runtime.diagnostics.services.mcp} / ${runtime.diagnostics.services.organizer}` : "—"}</strong></span></div>
        <label className="diagnostic-path"><span><FolderOpen size={15} />数据目录</span><code>{runtime.diagnostics?.data.dataDirectory || "正在读取本地数据目录…"}</code></label>
        <div className="diagnostic-runtime"><span>Node {runtime.diagnostics?.daemon.nodeVersion || "—"}</span><span>{runtime.diagnostics?.daemon.platform || desktopRuntime?.platform || "—"}</span><span>运行 {runtime.diagnostics ? Math.floor(runtime.diagnostics.daemon.uptimeSeconds / 60) : 0} 分钟</span></div>
        <div className="settings-form-actions"><button type="button" onClick={() => void runtime.refreshDiagnostics()}><ArrowsClockwise size={15} />重新诊断</button><button type="button" onClick={openDataDirectory} disabled={!runtime.diagnostics}><FolderOpen size={15} />{desktopBridge.available ? "打开数据目录" : "复制数据目录"}</button><button type="button" onClick={onTestErrorBoundary}><Pulse size={15} />页面恢复测试</button></div>
      </article>
    </section>
    <section className="settings-form card-surface data-management-card">
      <div className="settings-form-title"><span><Archive size={24} weight="duotone" /></span><div><h2>备份、恢复与跨设备迁移</h2><p>使用 SQLite 在线一致性快照；每个迁移包都有 Schema、完整性检查和 SHA-256 清单。</p></div><em>{backups.items.length} 个保护点</em></div>
      {backupError && <div className="settings-error">备份服务加载失败：{backupError.message}</div>}
      {backups.pendingRestore && <div className="restore-pending-banner"><ArrowCounterClockwise size={18} /><span><strong>恢复已排队</strong><small>目标 {backups.pendingRestore.backupId} · 下次启动自动应用；恢复前保护点 {backups.pendingRestore.recoveryBackupId}</small></span></div>}
      {backups.lastRestore?.status === "applied" && !backups.pendingRestore && <div className="restore-last-banner"><CheckCircle size={17} weight="fill" /><span>最近一次恢复已于 {new Date(backups.lastRestore.restoredAt).toLocaleString("zh-CN", { hour12: false })} 完成，启动迁移已校验。</span></div>}
      <div className="backup-toolbar"><span><strong>本机备份库</strong><small>导出的 `PCC-backup-*` 目录可复制到另一台设备后再导入。</small></span><div><button type="button" disabled={backupPending} onClick={importBackup}><UploadSimple size={15} />导入迁移包</button><button type="button" className="primary-small" disabled={backupPending} onClick={createBackup}><Archive size={15} />{backupPending ? "处理中…" : "立即备份"}</button></div></div>
      <div className="backup-list">
        {backups.items.length === 0 && <div className="backup-empty"><Database size={26} /><strong>还没有本地保护点</strong><small>首次完成重要配置后建议立即创建一个备份。</small></div>}
        {backups.items.slice(0, 8).map((backup) => <article key={backup.id} className="backup-row">
          <span className={`backup-kind ${backup.kind}`}><Archive size={18} weight="duotone" /></span>
          <div><strong>{backup.label}</strong><small>{new Date(backup.createdAt).toLocaleString("zh-CN", { hour12: false })} · {formatBytes(backup.sizeBytes)} · {backup.schemaVersion} · {backup.includesSecrets ? "含加密凭据密钥" : "仅项目数据"}</small><code>{backup.databaseSha256.slice(0, 18)}…</code></div>
          <div className="backup-actions"><button type="button" disabled={backupPending} onClick={() => void exportBackup(backup)} title="导出迁移包"><DownloadSimple size={15} /></button><button type="button" disabled={backupPending || Boolean(backups.pendingRestore)} onClick={() => void prepareRestore(backup)} title="恢复到此保护点"><ArrowCounterClockwise size={15} /></button><button type="button" className="danger-quiet" disabled={backupPending} onClick={() => void deleteBackup(backup)} title="删除备份"><Trash size={15} /></button></div>
        </article>)}
      </div>
      <div className="backup-integrity-note"><ShieldCheck size={17} /><span><strong>恢复边界</strong><small>运行中的数据库不会被覆盖。确认后先创建自动保护点，重启时校验备份、原子替换，再由迁移器升级旧 Schema；失败会回滚。</small></span></div>
    </section>
    {restorePlan && <div className="backup-restore-overlay" role="dialog" aria-modal="true" aria-label="确认恢复备份"><article className="backup-restore-dialog card-surface"><span className="restore-warning-icon"><Warning size={26} weight="fill" /></span><div><span className="eyebrow">恢复预检已通过</span><h2>恢复“{restorePlan.backup.label}”</h2><p>恢复发生在下一次启动，不会在当前进程中覆盖正在使用的数据库。</p><ul>{restorePlan.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><small>确认令牌有效至 {new Date(restorePlan.expiresAt).toLocaleTimeString("zh-CN", { hour12: false })}</small></div><footer><button type="button" disabled={backupPending} onClick={() => setRestorePlan(null)}>取消</button><button type="button" className="primary-small restore-confirm" disabled={backupPending} onClick={confirmRestore}><ArrowCounterClockwise size={15} />创建保护点并恢复</button></footer></article></div>}
  </div>;
}
