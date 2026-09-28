import { spawn } from "node:child_process";
import { CreateProposalSchema, type CreateProposalInput, type ProjectSnapshot } from "@pcc/contracts";
import { z } from "zod";

const SandboxStateSchema = z.object({ fsRead: z.boolean(), fsWrite: z.boolean(), childProcess: z.boolean(), worker: z.boolean() });
const OrganizerAnalysisSchema = z.object({ proposals: z.array(CreateProposalSchema).max(5), sandbox: SandboxStateSchema });

const ORGANIZER_SOURCE = String.raw`
const chunks = [];
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const input = JSON.parse(chunks.join(""));
  const snapshot = input.snapshot;
  const proposals = [];
  const linkedInbox = new Set(snapshot.ideas.filter((idea) => idea.sourceType === "inbox_item" && idea.sourceId).map((idea) => idea.sourceId));
  for (const item of snapshot.inbox) {
    if (linkedInbox.has(item.id) || proposals.length >= 3) continue;
    proposals.push({
      projectId: snapshot.project.id,
      title: "整理 Inbox：" + item.title,
      summary: "该条目已经归属项目，但尚未进入想法、计划或任务层级。建议先保留原文转为 Idea，并建立 derivedFrom 来源关系。",
      kind: "convert",
      risk: "low",
      evidence: ["Inbox " + item.id + " · " + item.kind + " · 来源 " + item.source, "项目 " + snapshot.project.name + " 当前想法库未引用该条目"],
      changes: [
        { entityType: "idea", entityId: null, action: "create", summary: "从 Inbox 原文创建 Idea：" + item.title },
        { entityType: "entity_link", entityId: null, action: "create", summary: "建立 Idea derivedFrom Inbox 的来源链接" }
      ],
      command: { type: "convert_inbox_to_idea", inboxItemId: item.id, projectId: snapshot.project.id, title: item.title, body: item.note },
      createdBy: "organizer:sandbox-v1"
    });
  }
  const budget = snapshot.attentionBudget;
  if (budget) {
    const scheduled = snapshot.timeBlocks.filter((block) => block.status !== "canceled").reduce((total, block) => total + Math.max(0, Math.round((Date.parse(block.endAt) - Date.parse(block.startAt)) / 60000)), 0);
    const missing = Math.max(0, budget.minimumMinutes - scheduled);
    if (missing > 0 && proposals.length < 5) proposals.push({
      projectId: snapshot.project.id,
      title: "补足 " + snapshot.project.name + " 本周最低注意力保障",
      summary: "本周已安排时间低于项目最低保障，建议新增一个小而明确的时间块；不会自动改动现有日程。",
      kind: "schedule",
      risk: "medium",
      evidence: ["最低保障 " + budget.minimumMinutes + " 分钟", "已安排 " + scheduled + " 分钟", "缺口 " + missing + " 分钟"],
      changes: [{ entityType: "time_block", entityId: null, action: "create", summary: "为 " + snapshot.project.name + " 安排不超过 " + missing + " 分钟的最小推进时间块" }],
      createdBy: "organizer:sandbox-v1"
    });
  }
  const hasPermission = (scope) => Boolean(process.permission && process.permission.has(scope));
  process.stdout.write(JSON.stringify({ proposals, sandbox: { fsRead: hasPermission("fs.read"), fsWrite: hasPermission("fs.write"), childProcess: hasPermission("child"), worker: hasPermission("worker") } }));
});
`;

export interface OrganizerAnalysis {
  proposals: CreateProposalInput[];
  sandbox: z.infer<typeof SandboxStateSchema>;
}

export class SandboxOrganizerAnalyzer {
  async analyze(snapshot: ProjectSnapshot, timeoutMs = 5_000): Promise<OrganizerAnalysis> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--permission", "--input-type=module", "--eval", ORGANIZER_SOURCE], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: {},
      });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => { child.kill(); reject(new Error("Organizer 沙盒分析超时")); }, timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.length > 1_000_000) { child.kill(); reject(new Error("Organizer 沙盒输出超过限制")); }
      });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code !== 0) { reject(new Error(`Organizer 沙盒退出码 ${code}：${stderr.slice(-1_000)}`)); return; }
        try { resolve(OrganizerAnalysisSchema.parse(JSON.parse(stdout))); }
        catch (error) { reject(error); }
      });
      child.stdin.end(JSON.stringify({ snapshot }));
    });
  }
}
