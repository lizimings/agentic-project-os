# 架构与领域边界

## 设计目标

Agentic Project OS 是 Agent 原生的管理与整理系统，不绑定单一 Agent 产品。人类界面负责理解、取舍和确认；Agent 接口负责读取同一事实、低风险捕获以及提交结构化 Proposal。

## 进程

| 进程 | 职责 | 默认地址/协议 |
|---|---|---|
| React Web | 路由、查询、命令、SSE 更新、思维导图和图谱 | `127.0.0.1:4173` |
| Electron | 本地静态站点、daemon 生命周期、目录选择、托盘和启动偏好 | `127.0.0.1:4318` |
| `projectd` | 唯一业务 API、事件流、数据库、连接器、备份 | `127.0.0.1:4317` |
| `projectctl` | CLI 与 MCP STDIO 入口，自动检查/启动 daemon | STDIO + 本地 HTTP |
| Organizer | 事件触发、只读快照分析、Proposal 输出 | daemon 内受限 Worker |

Electron 的 renderer 开启 `contextIsolation` 和 sandbox，不启用 Node integration；只通过受信本地来源的窄 IPC 调用访问目录选择、系统路径、启动偏好和应用重启。

## 事实模型

稳定层级是：

```text
Workspace
└─ Project
   └─ Milestone
      └─ Plan
         └─ Task
```

Idea、InboxItem、Worktree、GitCommit、Actor、CanvasNode、TimeBlock、FocusSession 和 Proposal 不是额外树层级，而是通过 `EntityLink` 连接。知识图谱是实体与链接的派生读模型，不是第二套数据库。

## 写入路径

1. UI、CLI 或 MCP 提交经过 Zod 校验的命令。
2. Command Service 在 SQLite 事务内更新实体并追加 EventLog。
3. 事务提交后 EventBroker 发布事件，SSE 刷新人类界面。
4. Organizer 对相关事件去重、防抖并读取项目边界快照。
5. 低风险明确捕获可以直接写入；里程碑、任务移动、期限、批量结构调整进入 Proposal。
6. 人类在待决策中心接受、修改后接受或拒绝；执行结果继续进入同一事件链。

## 数据与升级

- SQLite 使用 WAL、外键、busy timeout 和 Kysely 顺序迁移。
- FTS5 索引覆盖项目层级、想法、Inbox、工作树、Git、远程数据、画布和日志。
- 启动时先检查 `pending-restore.json`，完成哈希/完整性校验与原子恢复，再执行数据库迁移。
- 备份由 SQLite 在线 backup API 创建，不复制正在变化的裸数据库文件。

## 关键目录

```text
prototype/          React/Vite Web
apps/daemon/        projectd、服务与 REST/SSE
apps/cli/           projectctl
apps/desktop/       Electron 与 Windows 打包
packages/contracts/ Zod 契约
packages/domain/    领域规则和事件
packages/database/  SQLite、Kysely、迁移、仓储
packages/mcp/       MCP Server 和 daemon client
docs/               设计、运维与验收文档
```
