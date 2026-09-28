# Agentic Project OS 功能验收矩阵

状态值：`todo`、`in_progress`、`done`、`blocked`、`deferred`。只有真实持久化、错误处理和验收用例齐全才标记 `done`；`deferred` 表示功能保留兼容实现，但不进入当前首版产品界面。

| ID | 范围 | 功能 | 当前 | 目标验证 |
|---|---|---|---|---|
| SHELL-001 | 应用外壳 | URL 路由、深链接、刷新恢复 | done | 全局/项目视图直达、刷新、前进后退和 URL 状态恢复均通过浏览器验收 |
| SHELL-002 | 应用外壳 | 项目切换与常用项目 | done | 项目切换、侧栏高亮、URL、设为/取消常用、上下排序及 local-first 重载持久化均通过浏览器验收 |
| SHELL-003 | 应用外壳 | 动态日期、快捷键、错误边界 | done | 动态日期、Ctrl/Cmd+K 与搜索跳转已验收；页面级错误边界保留应用外壳并提供原页恢复/回到今天，诊断入口通过浏览器专项测试 |
| SEARCH-001 | 搜索 | 全实体 FTS 搜索 | done | SQLite FTS5 已覆盖项目层级、想法、Inbox、Worktree、Git 提交、画布、Proposal、时间、远程与日志，精确跳转已通过 API/浏览器验收 |
| CAPTURE-001 | 快速记录 | 文本捕获到总 Inbox | done | API 写入、重启保留、事件存在 |
| CAPTURE-002 | 快速记录 | 语音捕获、转写和修订 | done | MediaRecorder、daemon multipart 代理、OpenAI/OpenAI-compatible 配置、AES-256-GCM 凭据、可编辑确认和隔离上游/API/浏览器验收已通过；运营者可在全局设置换入真实服务凭据 |
| CAPTURE-003 | 快速记录 | @ 实体选择和双向链接 | done | 顶栏快速记录与总 Inbox 均支持项目/里程碑/计划/任务/想法多选；Inbox 与 mentions EntityLink 同事务写入，知识图谱一跳边和浏览器 UI 均已验收 |
| NOTICE-001 | 通知 | 通知列表、已读、稍后处理 | done | Proposal、到期、工作区异常和注意力饥饿由真实状态派生；已读/明天提醒/来源跳转持久化并通过 API 与浏览器验收 |
| DECISION-001 | 决策中心 | Proposal 列表和影响预览 | done | 展示证据、差异和风险等级 |
| DECISION-002 | 决策中心 | 接受、修改后接受、拒绝 | done | 三种决策均持久化并审计；修改模式可编辑变更摘要和类型化执行参数，修改后的 Milestone 命令已通过真实浏览器原子执行验收 |
| TODAY-001 | 今天 | Now/Next/Later 执行队列 | done | 当前 Focus 为 NOW、首个已排期时间块为 NEXT，其余时间块和未排期活跃任务按 urgent/high/medium/low 自动进入 LATER；Later 可一键转为关联任务的 NOW |
| TODAY-002 | 今天 | 持久化专注计时器 | done | 开始/暂停/继续/完成、页面重载恢复和浏览器闭环均已通过 |
| TODAY-003 | 今天 | 完成任务联动 | done | 用户明确“完成任务并留证”后，同一事务完成 FocusSession、TimeBlock、Task，并在全部子项完成时收口 Plan/Milestone；写入 focus_session → task 的 evidenceFor 关系及事件链 |
| TODAY-004 | 今天 | 能量反馈和重新平衡 | done | 低/中/高精力会结合饥饿项目、任务优先级和估时生成 create_time_block Proposal；接受前不改日程 |
| INBOX-001 | 总 Inbox | 列表、筛选、排序、搜索 | done | SQLite 实时列表、类型/归属/今天/本周筛选、全文前端检索、最新/最早排序与空态均通过浏览器验收 |
| INBOX-002 | 总 Inbox | 新建、编辑、归档 | done | UI 与 MCP 写入结果一致 |
| INBOX-003 | 总 Inbox | 批量 Agent 整理 | done | 批量选择、全选、跨项目原子归类/归档与项目边界内 Organizer 分析均已实现，Agent 仅输出 Proposal |
| INBOX-004 | 总 Inbox | 移到项目和类型转换 | done | 支持跨项目生成 Idea/Milestone/Plan/Task 可执行 Proposal；确认后原子创建、归档原始 Inbox 并建立 derivedFrom，四种类型 API 与 Task 浏览器闭环通过 |
| PROJECT-001 | 项目组合 | 项目列表、筛选和健康度 | done | 列表/筛选/里程碑任务聚合、周真实专注、全层级最近活动、阻塞与失速健康度已接入；无投入/有投入和浏览器卡片均读取实时值 |
| PROJECT-002 | 项目组合 | 空白项目新建 | done | 新建向导、校验、SQLite 持久化和浏览器闭环通过 |
| PROJECT-003 | 项目组合 | 编辑、收藏、归档和恢复 | done | 编辑/归档/恢复与审计、常用项目持久化排序均已完成；归档后提供 8 秒撤销并恢复原状态，浏览器闭环通过 |
| IMPORT-001 | 仓库导入 | GitHub/Gitea 连接和令牌 | done | GitHub Bearer 与 Gitea token 连接均经本地 HTTP fixture 验证；令牌 AES-256-GCM 加密、末位提示、断连级联和错误映射通过 API 测试 |
| IMPORT-002 | 仓库导入 | 仓库分页搜索和同步范围 | done | 两种提供方共享分页搜索/刷新；Commit、Branch、PR、Issue、Milestone 五范围均可选择、持久化和同步，GitHub/Gitea 接口测试与浏览器 UI 通过 |
| IMPORT-003 | 仓库导入 | 映射预览和冲突检测 | done | 原子导入前检查同名项目、远程重复绑定、项目已有绑定、本地默认分支差异与 Worktree 分支占用；阻塞项需显式确认，浏览器预检通过 |
| IMPORT-004 | 仓库导入 | Webhook、进度、失败重试 | done | GitHub/Gitea HMAC-SHA256 原始字节签名、Delivery ID 防重放、拒绝审计、逐范围进度、保留已完成范围并从失败范围续跑均通过接口测试；一次性密钥、状态、重试和 delivery UI 经浏览器验收 |
| TIME-001 | 时间 | 日/周视图和时间块 CRUD | done | 07:00–22:00 日/周日历画布、创建/编辑/取消、跨日拖动、底部拉伸、15 分钟吸附和键盘等价操作均写入 SQLite；API 与浏览器持久化验收通过 |
| TIME-002 | 时间 | 项目时间预算和实际投入 | done | 周预算与可恢复 FocusSession 已持久化；time-summary 按范围、项目与本地日期聚合真实专注秒数/会话数，今天与历史时间视图均读取真实值 |
| TIME-003 | 时间 | 项目饥饿和注意力失衡 | done | 服务端同时比较最低/计划/最高阈值、实际 Focus 与周排程，区分未配置/饥饿/待兑现/平衡/过载并给出解释；重平衡只生成可审计 create_time_block Proposal，接受后才落日程，API/浏览器通过 |
| GRAPH-001 | 全局图谱 | 动态实体、关系和筛选 | done | 项目层级、Worktree、CanvasNode、Agent 分配和 EntityLink 实时组图，类型筛选浏览器验收通过 |
| GRAPH-002 | 全局图谱 | 搜索、聚焦、邻居和跳转 | done | 可访问搜索结果、一跳/二跳、邻居选择和进入所属项目的 3D 图谱闭环通过 |
| OVERVIEW-001 | 项目总览 | 里程碑、下一步、执行和证据聚合 | done | 项目/里程碑/任务/想法/工作区来自真实查询；Worktree、dirty 状态、最近 Commit 及 Git actor 已进入执行层、证据层和活动流 |
| MILESTONE-001 | 里程碑 | CRUD、排序、状态和期限 | done | CRUD/状态/期限已持久化；HTML5 拖放重排会批量更新 position，API 顺序与浏览器重载验收通过 |
| MILESTONE-002 | 里程碑 | Plan/Task、依赖和完成证据 | done | 自动进度、Task dependsOn/blocks 汇总、FocusSession evidenceFor 证据和经 Worktree 关联的真实 Git Commit 均已接入 |
| TASK-001 | 任务 | 层级视图、详情和 CRUD | done | 层级、完整详情、CRUD、父任务、预估和归档均持久化并通过浏览器闭环 |
| TASK-002 | 任务 | 看板拖动、批量操作和阻塞 | done | 四列拖动、乐观更新回滚、批量状态/归档和真实依赖阻塞提示均已验收 |
| TASK-003 | 任务 | 负责人、Agent、期限和依赖 | done | Actor 注册表、稳定负责人实体、任务分配 EntityLink、期限和 dependsOn 关系均通过 API/浏览器验收 |
| WORKSPACE-001 | 本地工作区 | 目录选择、绑定和路径授权 | done | 绝对路径校验、绑定/解绑与 Electron 原生目录选择均通过；IPC 仅信任本地 renderer 来源并拒绝相对路径 |
| WORKSPACE-002 | 本地工作区 | Git 快照和文件监听 | done | branch/HEAD/dirty/ahead/behind、改动文件、提交证据与 Chokidar 防抖常驻监听均通过真实临时仓库验收 |
| WORKTREE-001 | 工作树 | 发现、列表、活动、产出和阻塞 | done | 稳定 Worktree、改动文件、ahead/behind、提交作者/时间、locked/prunable 阻塞和浏览器视图均通过验收 |
| WORKTREE-002 | 工作树 | 任务与外部 Agent 关联 | done | 稳定 Worktree ID、任务/Actor EntityLink、重扫保留与浏览器验收通过；只观察和关联，不隐式调度 Agent |
| WORKTREE-003 | 工作树 | 确认型创建流程 | done | 绝对路径/分支/基准/占用冲突只读预检、一次性限时确认、Git 状态再校验、明确命令预览和创建后实扫均通过 API/浏览器验收 |
| PINBOX-001 | 项目 Inbox | 项目捕获、整理和转换 | done | 项目捕获、事件驱动沙盒 Organizer、里程碑/计划目标选择，以及 Task/Plan/Milestone 可执行 Proposal 均已接通；确认后使用统一原子转换和 derivedFrom 来源链 |
| IDEA-001 | 想法库 | 独立页面和生命周期 | done | 草稿/发展中/已验证/已转化/归档 |
| IDEA-002 | 想法库 | 去重、合并和升级 | done | 升级与 derivedFrom 已完成；服务端按归一化标题/文本相似度提供可解释去重，合并会原子汇总正文与生命周期、归档来源并建立 idea→idea derivedFrom，API/浏览器通过 |
| BOARD-001 | 白板 | 节点/连线 CRUD 和布局保存 | deferred | 2026-08-20 从首版界面撤下；SQLite 数据、迁移和兼容 API 保留，旧白板深链回到项目总览 |
| BOARD-002 | 白板 | 撤销/重做、实体链接和并行编辑保护 | deferred | 已实现能力作为兼容层保留，不计入当前首版导航与验收范围 |
| MIND-001 | 思维导图 | 节点 CRUD、折叠、重排和保存 | done | 增删改、折叠/展开、父节点重挂、布局持久化和循环校验均已实现；浏览器专项验收覆盖刷新后折叠状态、后代过滤、边重建和 revision 保存 |
| MIND-002 | 思维导图 | 实体选择和 Agent 整理 | done | 多实体选择与 EntityLink 闭环已通过；只读整理 Agent 生成 create/move/update/merge/delete 明确命令，待决策中心逐项展示，接受后按 revision 原子执行，过期整单回滚；API 与浏览器验收通过 |
| PGRAPH-001 | 项目图谱 | 项目范围一跳/二跳图谱 | done | 项目作用域实时实体/EntityLink、搜索筛选、显式一跳/二跳聚焦和来源跳转通过浏览器验收 |
| LOG-001 | 项目日志 | 实时事件、筛选、搜索和跳转 | done | event_log project_id 迁移、SSE 刷新、来源/全文筛选和实体跳转浏览器闭环通过 |
| LOG-002 | 项目日志 | 日报和 Markdown/JSON 导出 | done | 基于当日真实事件的可解释摘要与 Markdown/JSON 下载均通过 API/浏览器验收 |
| SETTINGS-001 | 项目设置 | 远程、本地、Agent、关系和日志策略 | done | 远程同步、Webhook、本地工作区、Agent 写入、关系捕获、自动日志和保留周期均持久化，并通过重载浏览器验收 |
| SETTINGS-002 | 全局设置 | MCP、模型、语音、数据和启动设置 | done | 模型/语音、加密凭据、开机启动、托盘、周起始日、数据路径、迁移版本、后台服务诊断与页面恢复入口均已接通并通过桌面/浏览器验收 |
| MCP-001 | MCP | STDIO 自动启动 daemon | done | Codex 启动后初始化和健康检查通过 |
| MCP-002 | MCP | 项目、Inbox、Worktree、搜索只读工具 | done | 项目快照、Inbox、Worktree、跨实体搜索 schema 和 MCP E2E 已通过 |
| MCP-003 | MCP | 低风险写入与 Proposal 工具 | done | Inbox/Idea/Link 低风险写入与结构变更 Proposal 边界均通过 MCP/CLI E2E |
| AGENT-001 | Organizer | 事件驱动只读快照 | done | 单一事件流触发有边界快照；权限沙盒实测无文件读写、子进程和 Worker 权限 |
| AGENT-002 | Organizer | Proposal 校验、去重和循环保护 | done | Zod 校验、事件 debounce、运行幂等、待处理建议去重和自身事件隔离测试通过 |
| PACKAGE-001 | 发行 | pnpm dev 一键开发 | done | Web、daemon、MCP 开发链同时可用 |
| PACKAGE-002 | 发行 | Windows 安装版和 Portable | done | Squirrel Setup、full.nupkg、RELEASES 与 ZIP Portable 已生成并做 SHA-256/结构校验；隔离数据目录的 packaged Electron 自动拉起内置 daemon，静态 UI、SQLite、IPC 与诊断 smoke 通过 |
| PACKAGE-003 | 发行 | 备份、恢复、迁移和升级 | done | SQLite 在线一致性备份、目录式迁移包导入导出、哈希/integrity/Schema 预检、恢复前保护点、启动原子恢复、失败回滚与旧 Schema 自动迁移通过 API 和隔离浏览器验收 |
| OSS-001 | 开源 | README、CONTRIBUTING、示例和 CI | done | 快速开始、架构、安全、自部署/Gitea/Webhook、MCP/CLI、环境变量、贡献/安全政策、Apache-2.0 与 GitHub Actions Linux 全检/Windows 打包流程已补齐 |
| QUALITY-001 | 后续里程碑 | 完整测试与 Playwright 端到端覆盖 | todo | 隔离样例数据、关键流程和错误态、截图/Trace 证据进入 CI |
| TEAM-001 | 后续里程碑 | 团队与项目级权限 | todo | 成员/角色/Agent 身份、项目读写和审批权限、审计归属端到端验收 |
| HARNESS-001 | 后续里程碑 | Pi Agent、WorkBuddy、Claude Code、OpenClaw 等适配 | todo | 多 harness 会话/状态、看板交接和产出回写经过真实端到端验收 |
