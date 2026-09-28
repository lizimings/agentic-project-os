# Contributing

感谢参与 Agentic Project OS。项目优先保证本地数据真实、Agent 边界清晰，以及现有高保真界面的一致性。

项目代码采用 `Apache-2.0`。提交 Pull Request 表示你有权提交该代码，并同意你的贡献按同一协议进入项目；第三方代码或素材须注明来源和原许可。

## 本地开发

1. 安装 Node.js 22.20+、pnpm 10.28+ 和 Git。
2. 运行 `pnpm install --frozen-lockfile`。
3. 运行 `pnpm dev`，打开 `http://127.0.0.1:4173`。
4. 提交前运行 `pnpm check`。

## 变更约定

- 契约先进入 `packages/contracts`，领域规则进入 `packages/domain`，持久化进入 `packages/database`。
- UI、CLI、MCP 共用 daemon 的 Query/Command 路径，不在前端复制业务事实。
- 数据库变更追加顺序迁移，不修改已经发布的迁移。
- 结构变化保留 Proposal 边界；Organizer 不获得数据库、文件写入或子进程能力。
- Git/工作区测试使用临时仓库，不依赖开发者的真实项目目录。
- 新增可点击入口必须覆盖成功、空态、加载、错误、冲突/确认和持久化重载。
- 涉及视觉的变更附 1440 或更宽截图，并至少检查 1180、980、720 的响应式行为。

## Pull Request

PR 描述应包含：问题、方案、数据/安全边界、测试命令、截图或 API 证据、迁移与回滚方式。不要提交 `.data`、`.tmp`、数据库、令牌、`secret.key` 或真实工作区路径。

功能状态同步更新 `docs/feature-matrix.md`。只有真实持久化、错误处理和验收用例齐全时标记为 `done`。
