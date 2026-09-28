# 安全模型

## 本地默认边界

- `projectd`、桌面静态站点和 MCP client 默认只连接回环地址。
- daemon 的浏览器 CORS 只接受 `localhost` / `127.0.0.1` 来源；Webhook 是服务端入口，不依赖浏览器 CORS。
- Electron renderer 启用隔离与 sandbox，IPC 会校验调用来源，只暴露窄能力。
- 本地工作区扫描只读取 Git 元数据；Organizer 快照不包含源文件正文、令牌或 `secret.key`。

## 凭据

- GitHub、Gitea、Webhook 与语音 API 凭据使用随机 32 字节本机主密钥，通过 AES-256-GCM 加密后写入 SQLite。
- 主密钥位于数据目录的 `secret.key`，不会返回给 UI、MCP 或事件日志。
- 备份若包含加密凭据，会同时包含该主密钥并在清单中单独校验。因此迁移包应按敏感文件保存。
- UI 只显示“是否配置”和末位提示。日志不记录完整令牌、API Key、Webhook secret 或音频内容。

## Agent 权限

- MCP 读工具带只读注解；普通 Inbox/Idea 捕获和显式链接属于低风险写入。
- 结构变化通过 `project_proposal_submit` 进入待决策中心。
- Organizer 是事件驱动的只读分析器，只能返回经过 Schema 校验的 Proposal；它没有数据库写句柄、文件写入或子进程能力。
- 所有写入带 actor、correlationId 与 EventLog，可追踪到 UI、CLI、MCP、Connector 或 Organizer。

## 网络暴露

把 `PCC_HOST` 设置为 `0.0.0.0` 会让 API 可被局域网访问。启用前应使用主机防火墙限制来源；跨不可信网络时放在带 TLS 和访问控制的反向代理后。Webhook secret 只在启用时显示一次，应立即写入 GitHub/Gitea 配置。

## 漏洞报告

请不要在公开 Issue 中提交有效令牌、数据库、迁移包或真实仓库路径。报告流程见根目录 [SECURITY.md](../SECURITY.md)。
