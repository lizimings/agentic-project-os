export const viewLabels = { today: "今天", inbox: "总 Inbox", decisions: "待决策中心", projects: "项目", time: "时间", graph: "知识图谱", settings: "全局设置", import: "导入仓库" };

export const projectSectionLabels = { overview: "总览", milestones: "里程碑", worktrees: "工作树", tasks: "任务", inbox: "Inbox", ideas: "想法库", projectGraph: "关系图", mindmap: "思维导图", logs: "日志", settings: "设置" };

const globalViews = new Set(Object.keys(viewLabels));

export function locationState(pathname = window.location.pathname) {
  const parts = pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts[0] === "projects" && parts[1]) return { view: "project", projectId: parts[1], projectSection: projectSectionLabels[parts[2]] ? parts[2] : "overview" };
  if (parts[0] && globalViews.has(parts[0])) return { view: parts[0], projectId: "pixelmind", projectSection: "overview" };
  return { view: "today", projectId: "pixelmind", projectSection: "overview" };
}

export function locationPath(view, projectId, projectSection) {
  if (view === "project") return `/projects/${encodeURIComponent(projectId)}/${projectSection}`;
  return `/${view}`;
}
