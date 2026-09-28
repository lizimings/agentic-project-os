# Agentic Project OS 完整产品开发计划

## 目标

在保留当前高保真 React 前端、统一设计系统和全部现有入口的基础上，将原型实现为本地优先、可开源、可打包的项目管理系统。完成后的系统同时服务人类用户和外部 Agent：人类通过项目、时间、画布和图谱理解工作；Agent 通过 MCP/CLI 读取相同实体，并通过受控命令或 Proposal 写入。

## 不变原则

1. 核心是项目整理与管理系统，不是 Codex 专用调度中心。
2. `projectd` 是常驻事件主机；LLM 整理器由事件触发并按次运行。
3. 整理器只读项目快照，输出结构化 Proposal，不直接写数据库或文件系统。
4. UI、CLI、MCP 使用同一 Query/Command Service，所有写入生成审计事件。
5. `Workspace → Project → Milestone → Plan → Task` 是稳定层级；Worktree、Idea、Git 证据和画布通过关系连接。
6. SQLite 是首版唯一事实源；知识图谱由实体和双向链接派生。
7. 当前视觉实现是界面真值。开发阶段替换数据和交互，不进行无关视觉重做。

## 技术栈

- Node.js 22.20+ / TypeScript
- React 19、Vite、React Router、TanStack Query
- Fastify、Zod、REST Command API、SSE
- SQLite WAL、better-sqlite3、Kysely、FTS5
- MCP TypeScript SDK v2
- git CLI、chokidar、GitHub/Gitea REST connector
- React Flow、react-force-graph-3d
- Vitest、Playwright、真实临时 Git 仓库、Gitea 集成测试
- pnpm workspaces、Turborepo、Electron Forge

## 目标架构

```text
React Web / Desktop
        │ REST + SSE
        ▼
projectd
  ├─ Query Service
  ├─ Command Service
  ├─ SQLite + FTS5
  ├─ Event Store + Outbox
  ├─ Git / Gitea / Voice Connectors
  ├─ Read-only Organizer Worker
  ├─ Proposal Policy Gateway
  └─ Streamable HTTP MCP

Codex / Agent ──STDIO──> projectctl mcp ──> projectd
```

## 实施顺序

### P0：范围冻结与可追踪验收

- 维护 `docs/feature-matrix.md`，为全部现有和缺失功能分配 Feature ID。
- 所有可点击入口关联 Query、Command、事件、错误态和自动化测试。
- 保留当前截图为视觉回归基线。

完成门槛：Feature Matrix 覆盖所有页面和入口，不存在没有归属的按钮。

### P1：工程底座与首条持久化链

- 建立 pnpm/Turborepo TypeScript monorepo。
- 建立 `contracts`、`domain`、`database`、`daemon`、`cli`、`mcp` 模块。
- SQLite 迁移、事件日志、SSE、健康检查和本地数据目录。
- 打通“快速记录 → Inbox API → SQLite → 页面刷新恢复 → 事件日志”。
- `projectctl mcp` 检查并自动启动 daemon。

完成门槛：一条 Inbox 内容可从 UI 或 MCP 写入，重启后仍存在，且有事件记录。

### P2：项目核心实体

- Project、Milestone、Plan、Task、InboxItem、Idea、EntityLink、EventLog。
- 项目组合、项目总览、里程碑、任务层级/看板、项目 Inbox、独立想法库。
- 新建、编辑、归档、转化、拖动状态、批量操作和反向链接。

完成门槛：Idea 可保留来源并转为 Milestone/Plan/Task；各页面读到同一实体状态。

### P3：Git、工作区与仓库导入

- 本地文件夹绑定、路径授权、Git 快照、增量监听和失效状态。
- Worktree 发现、任务/Agent 关联、产出、阻塞和提交证据。
- GitHub/Gitea 连接、仓库搜索、导入范围、映射预览、Webhook、重试和续传。
- Worktree 创建属于确认型命令，执行前展示分支、路径和实际操作。

完成门槛：真实临时 Git 仓库和真实 Gitea 测试实例通过端到端验收。

### P4：ADHD 时间系统

- Today、Now/Next/Later、时间盒、FocusSession、日/周视图。
- 项目时间预算、实际投入、能量反馈、失速检测和最小推进频率。
- 重新平衡生成 Proposal；接受后写入时间块和日志。

完成门槛：完成一个 FocusSession 会同步任务、时间统计、里程碑和项目健康度。

### P5：知识空间

- 思维导图节点/连线、编辑、自动保存和实体选择器；白板于 2026-08-20 暂缓进入首版界面。
- 思维导图节点增删改、折叠、重排、关联、版本冲突处理。
- 全局图谱与项目图谱共享实体和链接，支持搜索、邻居展开、详情跳转和布局缓存。
- FTS5 搜索和 `@` 自动补全。

完成门槛：在脑图创建的关系会同时出现在实体详情和图谱中。

### P6：Organizer、Proposal、MCP 与语音

- 事件去重、debounce、correlationId、idempotency key、触发深度限制。
- 只读快照构建、Organizer Worker、结构化 Proposal 校验。
- 低风险自动应用；结构变化进入待决策中心。
- MCP 读工具、低风险写工具和 Proposal 工具。
- 高精度语音转写、增量状态、人工修订和原始录音保留策略。

完成门槛：Codex 可读取项目快照、捕获 Inbox、创建链接并提交结构变更建议；所有动作可追踪。

### P7：桌面、打包与开源发行

- 薄 Electron 桌面壳、原生目录选择、托盘、开机启动和 daemon 生命周期。
- Windows 安装版与 Portable；CI 保持 macOS/Linux 可构建。
- 数据备份/恢复、迁移、诊断、版本升级和崩溃恢复。
- README、CONTRIBUTING、架构文档、Demo 数据、环境变量示例和发布流程。

完成门槛：干净 Windows 环境安装后，启动应用即可使用 UI，Codex 调用 MCP 时无需手动启动服务。

### P8：功能完整验收

- 每个 Feature ID 至少有一个自动化或明确人工验收用例。
- 页面刷新、应用重启、离线、令牌过期、Git 锁、Webhook 重放、Agent 超时均有恢复路径。
- 1440、1180、980、720 四档视觉回归。
- 3D 图谱和画布按路由懒加载，首屏包体受控。

完成门槛：`docs/feature-matrix.md` 全部为 `done`，不存在生产模式 mock、toast-only 行为或未测试写入口。

## 发布门槛

1. `pnpm check` 全绿。
2. UI、CLI、MCP 修改同一实体时结果一致。
3. 所有写入均包含 actor、来源、correlationId 和事件日志。
4. SQLite 升级保留用户数据，备份可恢复。
5. Gitea、Git、本地目录和语音均使用真实集成证据。
6. 安装包在干净机器完成安装、启动、升级和卸载保留数据测试。
