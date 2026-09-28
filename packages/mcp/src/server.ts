import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  CreateEntityLinkSchema,
  CreateIdeaSchema,
  CreateInboxItemSchema,
  CreateProposalSchema,
  EntityLinkSchema,
  IdeaSchema,
  InboxItemSchema,
  InboxKindSchema,
  ProjectSchema,
  ProjectSearchResponseSchema,
  ProjectSnapshotSchema,
  ProposalSchema,
  ProposalStatusSchema,
  SnapshotQuerySchema,
  UpdateInboxItemSchema,
  WorkspaceBindingSchema,
} from "@pcc/contracts";
import { z } from "zod";
import { DaemonClient } from "./daemon-client.js";
import { searchProjectData } from "./search.js";

const listOutputSchema = z.object({
  items: z.array(InboxItemSchema),
  total: z.number().int().nonnegative(),
});

const projectsOutputSchema = z.object({ items: z.array(ProjectSchema), total: z.number().int().nonnegative() });
const proposalsOutputSchema = z.object({ items: z.array(ProposalSchema), total: z.number().int().nonnegative() });
const worktreeOutputSchema = z.object({ projectId: z.string(), workspace: WorkspaceBindingSchema.nullable() });

const toolError = (error: unknown) => ({
  isError: true as const,
  content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
});

export function createProjectMcpServer(client = new DaemonClient()) {
  const server = new McpServer(
    { name: "project-command-center", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: "读取和整理本地 Project Command Center。普通捕获和标签可直接写入；里程碑、任务移动、期限等结构变化应提交 Proposal。",
    },
  );

  server.registerTool(
    "project_inbox_list",
    {
      title: "读取项目 Inbox",
      description: "列出总 Inbox，可按项目名称或条目类型过滤。",
      inputSchema: z.object({
        project: z.string().optional().describe("项目名称；省略时返回全部"),
        kind: InboxKindSchema.optional().describe("想法、需求、风险或备注"),
      }),
      outputSchema: listOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ project, kind }) => {
      try {
        const result = await client.listInbox();
        const items = result.items.filter((item) => (!project || item.project === project) && (!kind || item.kind === kind));
        const output = { items, total: items.length };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "project_list",
    {
      title: "列出项目",
      description: "读取所有项目的名称、愿景、状态和更新时间。",
      inputSchema: z.object({ includeArchived: z.boolean().default(false) }),
      outputSchema: projectsOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ includeArchived }) => {
      try {
        const result = await client.listProjects();
        const items = includeArchived ? result.items : result.items.filter((project) => project.status !== "archived");
        const output = { items, total: items.length };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output };
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "project_snapshot_read",
    {
      title: "读取项目快照",
      description: "读取一个项目的里程碑、计划、任务、想法、双向链接、Git 工作区、工作树、远程仓库和当前周时间事实。快照不包含令牌或文件内容。",
      inputSchema: z.object({ projectId: z.string().min(1).max(200), range: SnapshotQuerySchema.optional() }),
      outputSchema: ProjectSnapshotSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ projectId, range }) => {
      try {
        const output = await client.getProjectSnapshot(projectId, range ?? {});
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output };
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "project_worktree_list",
    {
      title: "读取项目工作树",
      description: "读取项目绑定的本地 Git 工作区及其 worktree、分支、HEAD、dirty/ahead/behind 状态。只返回 Git 元数据。",
      inputSchema: z.object({ projectId: z.string().min(1).max(200) }),
      outputSchema: worktreeOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ projectId }) => {
      try {
        const output = { projectId, workspace: await client.getWorkspace(projectId) };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output };
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "project_search",
    {
      title: "搜索项目实体",
      description: "在项目、里程碑、计划、任务、想法、Inbox 和 worktree 元数据中搜索。",
      inputSchema: z.object({ query: z.string().trim().min(1).max(200), projectId: z.string().min(1).max(200).optional(), limit: z.number().int().min(1).max(100).default(20) }),
      outputSchema: ProjectSearchResponseSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ query, projectId, limit }) => {
      try {
        const output = await searchProjectData(client, query, projectId, limit);
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output };
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "project_proposal_list",
    {
      title: "读取整理建议",
      description: "列出待决策或已处理的结构化 Proposal。",
      inputSchema: z.object({ projectId: z.string().min(1).max(200).optional(), status: ProposalStatusSchema.optional() }),
      outputSchema: proposalsOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ projectId, status }) => {
      try {
        const output = await client.listProposals(projectId, status);
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output };
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "project_inbox_capture",
    {
      title: "捕获 Inbox 条目",
      description: "把尚未整理的想法、需求、风险或备注写入总 Inbox，并产生项目事件日志。",
      inputSchema: CreateInboxItemSchema,
      outputSchema: InboxItemSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        const item = await client.captureInbox(input);
        return { content: [{ type: "text", text: `已捕获：${item.title}` }], structuredContent: item };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "project_idea_capture",
    {
      title: "记录项目想法",
      description: "把已明确的想法直接写入想法库。将想法升级为里程碑、计划或任务时应另行提交 Proposal。",
      inputSchema: CreateIdeaSchema,
      outputSchema: IdeaSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        const output = await client.createIdea(input);
        return { content: [{ type: "text", text: `已记录想法：${output.title}` }], structuredContent: output };
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "project_link_create",
    {
      title: "建立实体双向链接",
      description: "按用户明确给出的两个实体建立关系链接；不会修改被链接实体本身。",
      inputSchema: CreateEntityLinkSchema,
      outputSchema: EntityLinkSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        const output = await client.createLink(input);
        return { content: [{ type: "text", text: `已建立 ${output.sourceType} → ${output.targetType} 链接` }], structuredContent: output };
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "project_proposal_submit",
    {
      title: "提交结构化整理建议",
      description: "对里程碑、计划、任务、期限、排程或批量整理等结构变化提交 Proposal，等待人类在待决策中心确认。此工具不执行 changes。",
      inputSchema: CreateProposalSchema,
      outputSchema: ProposalSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        const output = await client.createProposal(input);
        return { content: [{ type: "text", text: `已提交待决策建议：${output.title}` }], structuredContent: output };
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "project_inbox_update",
    {
      title: "更新 Inbox 条目",
      description: "修改 Inbox 条目的文本、项目归属或类型。结构性转化应使用后续 Proposal 工具。",
      inputSchema: z.object({ id: z.string().uuid(), changes: UpdateInboxItemSchema }),
      outputSchema: InboxItemSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id, changes }) => {
      try {
        const item = await client.updateInbox(id, changes);
        return { content: [{ type: "text", text: `已更新：${item.title}` }], structuredContent: item };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "project_inbox_archive",
    {
      title: "归档 Inbox 条目",
      description: "从活动 Inbox 归档一个条目；归档事件仍保留在审计日志中。",
      inputSchema: z.object({ id: z.string().uuid() }),
      outputSchema: z.object({ archived: z.literal(true), id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ id }) => {
      try {
        await client.archiveInbox(id);
        const output = { archived: true as const, id };
        return { content: [{ type: "text", text: `已归档 Inbox 条目 ${id}` }], structuredContent: output };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

export function serveProjectMcpStdio(client = new DaemonClient()) {
  return serveStdio(() => createProjectMcpServer(client), {
    onerror: (error) => console.error(`[projectctl:mcp] ${error.message}`),
  });
}
