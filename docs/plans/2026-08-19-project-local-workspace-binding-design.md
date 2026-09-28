# 项目本地工作区绑定设计

## 目标

单个项目同时绑定远程代码仓库和本地项目文件夹。远程仓库提供 PR、Issue、Webhook 和协作状态；本地工作区提供当前分支、HEAD、未提交文件、工作树、最近文件活动和真实开发现场。

## 关系模型

```text
Project
├─ RemoteRepositoryBinding (0..n)
│  ├─ provider / instance / repository
│  └─ PR / Issue / Milestone / Webhook
└─ LocalWorkspaceBinding (0..n，1 个主工作区)
   ├─ canonicalPath
   ├─ detectedRepository / remoteOrigin
   ├─ currentBranch / HEAD / dirtyFiles / aheadBehind
   ├─ worktrees[]
   └─ lastScan / watcherStatus / syncPolicy
```

首版界面以一个主工作区为核心，同时允许自动识别该仓库下的多个 Git worktree。数据模型保留后续绑定多个仓库或子目录的能力。

## 同步架构

浏览器前端只展示状态和发出绑定、扫描、解绑等命令。本地 Agent/CLI 作为伴随进程读取文件系统和 Git：

1. 用户给项目绑定本地文件夹。
2. Agent 检测 `.git`、remote origin、默认分支和现有 worktree。
3. Agent 生成 `WorkspaceSnapshot`，写入项目记录层。
4. 文件或 Git 状态变化触发增量扫描；前端通过本地 API、WebSocket 或 MCP 获取更新。
5. 远程 Webhook 到达后，与本地 HEAD、分支和工作树快照进行关联，而不是互相覆盖。

## 前端表现

- 项目总览增加“本地工作区”状态条，显示路径、当前分支、HEAD、未提交文件、worktree 数和最近扫描时间。
- 项目设置增加“代码与本地工作区”主卡，明确展示远程仓库和本地文件夹两条连接。
- 支持自动同步开关、重新扫描、更换文件夹和解绑。
- 更换文件夹通过对话框完成，显示 Git 检测预览后才确认绑定。
- 本地 Agent 离线、路径不可访问或 Git 检测失败时保留最近一次快照，并标记为过期。

## 验收

- 总览和设置都能看见本地工作区绑定，不再只显示 Gitea。
- 重新扫描有扫描中和成功反馈。
- 更换文件夹对话框可以编辑路径、预览检测结果并确认绑定。
- 自动同步可以开启和关闭。
- 桌面、平板和窄屏无文档级横向溢出。
- 构建、Sites 测试、浏览器控制台和网络资源检查通过。
