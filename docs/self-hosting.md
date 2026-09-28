# 自部署、Gitea 与运维

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PCC_DATA_DIR` | 开发为 `.data/`；桌面为 userData 下 `data/` | 数据、密钥、日志和备份根目录 |
| `PCC_DATABASE` | `$PCC_DATA_DIR/project-command-center.sqlite` | 自定义 SQLite 文件 |
| `PCC_HOST` | `127.0.0.1` | daemon 监听地址 |
| `PCC_PORT` | `4317` | daemon 端口 |
| `PCC_DAEMON_URL` | `http://127.0.0.1:4317` | CLI、MCP、桌面连接地址 |
| `PCC_DAEMON_ENTRY` | 自动发现 | CLI 自动启动使用的 daemon 入口 |
| `PCC_DESKTOP_PORT` | `4318` | 桌面静态站点端口 |

复制 `.env.example` 后由你使用的进程管理器加载；应用不会自动读取 `.env`。

## 单机运行

```bash
pnpm install --frozen-lockfile
pnpm build
PCC_DATA_DIR=/srv/pcc/data PCC_HOST=127.0.0.1 node apps/daemon/dist/index.js
```

开发 UI 使用 `pnpm --filter @pcc/web dev`。生产桌面用户直接使用 Windows Setup 或 ZIP Portable，桌面壳会自动启动内置 daemon。

## 自托管 Gitea

1. 在 Gitea 创建只授予目标仓库读取权限的 Access Token。
2. 进入“仓库导入”，选择 Gitea，填写实例 Base URL 和令牌并验证。
3. 分页搜索仓库，选择 Commit、Branch、PR、Issue、Milestone 同步范围。
4. 查看导入预检；同名项目、重复绑定、默认分支差异或 worktree 分支占用需要显式确认。
5. 导入后在项目设置中查看同步状态、逐范围进度、错误和续跑。

## Webhook

在项目设置启用 Webhook 后，系统会返回一次性 secret 和路径：

```text
POST /api/webhooks/gitea/PROJECT_ID
POST /api/webhooks/github/PROJECT_ID
```

把完整可达 URL 与 secret 写入仓库 Webhook。Gitea 使用 `X-Gitea-Signature`，GitHub 使用 `X-Hub-Signature-256`；daemon 对原始请求字节做 HMAC-SHA256 校验，并按 Delivery ID 防重放。若 Gitea 在另一台主机，将 `PCC_HOST` 暴露到受信网络并用防火墙限制 Gitea 来源。

## 备份、迁移与恢复

- 在“设置 → 备份、恢复与跨设备迁移”创建在线一致性备份。
- 导出会生成 `PCC-backup-*` 目录，包含 `database.sqlite`、`manifest.json` 和可选 `secret.key`。
- 在新设备选择该目录导入。恢复预检会校验 SHA-256、SQLite integrity 和 Schema 版本。
- 确认恢复时先创建当前数据自动保护点；桌面版自动重启，daemon 在下次启动时原子应用并自动迁移旧 Schema。
- 数据目录的 `.restore-rollback/` 是最近一次启动恢复的本机回滚副本。

## Windows 发行

```powershell
pnpm --filter @pcc/desktop make
```

产物在 `apps/desktop/out/make/`：Squirrel Setup、完整 NuGet 包、RELEASES 清单和 ZIP Portable。未配置代码签名时 Windows 会显示未知发布者；正式分发应在构建环境注入签名配置。
