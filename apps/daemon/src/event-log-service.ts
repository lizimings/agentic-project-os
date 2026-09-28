import type { ProjectDailyDigest, ProjectEventLogItem, ProjectEventLogQuery } from "@pcc/contracts";
import { CoreRepository, EventLogRepository } from "@pcc/database";
import { EntityNotFoundError } from "./inbox-service.js";

const eventActionLabels: Record<string, string> = {
  created: "创建", updated: "更新", archived: "归档", linked: "建立关系", unlinked: "移除关系",
  converted: "转化", accepted: "接受", rejected: "拒绝", modified: "修改后接受", bound: "绑定",
  scanned: "扫描", unbound: "解除绑定", connected: "连接", validated: "验证", disconnected: "断开",
  started: "开始", paused: "暂停", resumed: "继续", completed: "完成", canceled: "取消",
};

export function describeEvent(event: ProjectEventLogItem) {
  const action = event.type.split(".").at(-1) || event.type;
  return `${eventActionLabels[action] || action} ${event.entityType} · ${event.entityId}`;
}

export class EventLogService {
  constructor(private readonly repository: EventLogRepository, private readonly core: CoreRepository) {}

  list(query: ProjectEventLogQuery) {
    return this.repository.list(query);
  }

  async digest(projectId: string, date: string, utcOffsetMinutes: number): Promise<ProjectDailyDigest> {
    if (!await this.core.getProject(projectId)) throw new EntityNotFoundError("Project", projectId);
    const localMidnightAsUtc = Date.parse(`${date}T00:00:00.000Z`);
    const from = new Date(localMidnightAsUtc - utcOffsetMinutes * 60_000).toISOString();
    const to = new Date(localMidnightAsUtc + 86_400_000 - utcOffsetMinutes * 60_000).toISOString();
    const result = await this.repository.list({ projectId, from, to, limit: 500 });
    const humanEvents = result.items.filter((item) => item.actorType === "human").length;
    const agentEvents = result.items.filter((item) => item.actorType === "agent" || item.actorId.includes("organizer")).length;
    const gitEvents = result.items.filter((item) => ["commit", "worktree", "workspace", "remote_repository"].includes(item.entityType)).length;
    const completedEvents = result.items.filter((item) => item.type.endsWith(".completed") || item.type.endsWith(".accepted")).length;
    const highlights = result.items.filter((item) => item.type.endsWith(".completed") || item.type.endsWith(".created") || item.type.endsWith(".accepted") || item.type.endsWith(".linked")).slice(0, 8);
    const parts = [];
    if (result.total) parts.push(`记录 ${result.total} 条可审计活动`);
    if (humanEvents) parts.push(`其中用户操作 ${humanEvents} 条`);
    if (agentEvents) parts.push(`Agent 相关 ${agentEvents} 条`);
    if (completedEvents) parts.push(`形成 ${completedEvents} 个完成或决策结果`);
    return { projectId, date, from, to, totalEvents: result.total, humanEvents, agentEvents, gitEvents, completedEvents, highlights, summary: parts.length ? `${parts.join("，")}。` : "今天还没有项目活动；日志会在产生真实变更后自动出现。" };
  }

  async export(projectId: string, query: ProjectEventLogQuery, format: "json" | "markdown") {
    if (!await this.core.getProject(projectId)) throw new EntityNotFoundError("Project", projectId);
    const result = await this.repository.list({ ...query, projectId, limit: 500 });
    if (format === "json") return JSON.stringify({ exportedAt: new Date().toISOString(), projectId, ...result }, null, 2);
    const lines = [`# 项目日志`, "", `- Project: ${projectId}`, `- Exported at: ${new Date().toISOString()}`, `- Events: ${result.total}`, ""];
    result.items.forEach((event) => {
      lines.push(`## ${event.occurredAt} · ${describeEvent(event)}`, "", `- Actor: ${event.actorType}:${event.actorId}`, `- Entity: ${event.entityType}:${event.entityId}`, `- Correlation: ${event.correlationId}`, "", "```json", JSON.stringify(event.payload, null, 2), "```", "");
    });
    return lines.join("\n");
  }
}
