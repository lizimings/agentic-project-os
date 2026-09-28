# MCP 与 CLI

## CLI

开发模式：

```bash
pnpm --filter @pcc/cli dev -- start
pnpm --filter @pcc/cli dev -- status
pnpm --filter @pcc/cli dev -- projects
pnpm --filter @pcc/cli dev -- project snapshot pixelmind
pnpm --filter @pcc/cli dev -- search "Webhook" --project pixelmind
pnpm --filter @pcc/cli dev -- inbox add "整理 Gitea 导入错误态"
pnpm --filter @pcc/cli dev -- idea add pixelmind "把周预算与里程碑关联"
pnpm --filter @pcc/cli dev -- proposal submit proposal.json
```

构建后把前缀换为 `node apps/cli/dist/index.js`。除 `status` 外，CLI 会在 daemon 未运行时自动发现并启动它。

## Codex 注册

构建后执行：

```bash
node apps/cli/dist/index.js integrate codex
```

等价手动命令：

```bash
codex mcp add project-manager -- node ABSOLUTE_PATH/apps/cli/dist/index.js mcp
```

若 daemon 使用自定义地址，在 MCP 配置中设置 `PCC_DAEMON_URL`。若需要让 CLI 拉起自定义构建，设置 `PCC_DAEMON_ENTRY`。

## MCP 工具

| 工具 | 边界 |
|---|---|
| `project_list` | 只读项目列表 |
| `project_snapshot_read` | 只读里程碑、任务、Idea、链接、Git、远程与时间快照 |
| `project_worktree_list` | 只读工作区和 worktree Git 元数据 |
| `project_search` | 只读跨实体 FTS 搜索 |
| `project_proposal_list` | 只读建议列表 |
| `project_inbox_list` | 只读 Inbox |
| `project_inbox_capture` / `update` / `archive` | 明确的 Inbox 写入 |
| `project_idea_capture` | 明确的 Idea 捕获 |
| `project_link_create` | 按用户意图建立实体链接 |
| `project_proposal_submit` | 提交结构变化建议，不执行 changes |

推荐 Agent 工作流：先调用 `project_snapshot_read`，把新想法写入 Inbox/Idea；涉及层级、期限、移动、合并或排程时提交 Proposal，让人类在待决策中心确认。
