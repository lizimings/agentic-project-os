import { createHash, randomUUID } from "node:crypto";
import type { EventEnvelope } from "@pcc/contracts";
import { OrganizerRepository } from "@pcc/database";
import { CoreService } from "./core-service.js";
import { EventBroker } from "./event-broker.js";
import { InboxService } from "./inbox-service.js";
import { SandboxOrganizerAnalyzer } from "./organizer-analyzer.js";
import { SnapshotService } from "./snapshot-service.js";

export interface OrganizerCoordinatorOptions { enabled?: boolean; debounceMs?: number; }

export class OrganizerCoordinator {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly active = new Set<string>();
  private unsubscribe: (() => void) | undefined;
  private lastError: string | null = null;
  private lastSandbox: { fsRead: boolean; fsWrite: boolean; childProcess: boolean; worker: boolean } | null = null;
  private readonly enabled: boolean;
  private readonly debounceMs: number;

  constructor(
    private readonly repository: OrganizerRepository,
    private readonly snapshots: SnapshotService,
    private readonly core: CoreService,
    private readonly inbox: InboxService,
    private readonly broker: EventBroker,
    private readonly analyzer = new SandboxOrganizerAnalyzer(),
    options: OrganizerCoordinatorOptions = {},
  ) {
    this.enabled = options.enabled ?? true;
    this.debounceMs = options.debounceMs ?? 750;
  }

  start() {
    if (!this.enabled || this.unsubscribe) return;
    this.unsubscribe = this.broker.subscribe((event) => { void this.onEvent(event); });
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  status() {
    return { enabled: this.enabled, pendingProjects: [...this.timers.keys()], activeProjects: [...this.active], lastError: this.lastError, sandbox: this.lastSandbox ?? { fsRead: false, fsWrite: false, childProcess: false, worker: false } };
  }

  private isEligible(event: EventEnvelope) {
    if (event.actorId.startsWith("organizer")) return false;
    return ["inbox.item_created", "inbox.item_updated", "idea.created", "idea.updated", "task.created", "task.updated", "attention_budget.updated", "time_block.created"].includes(event.type);
  }

  private async projectFor(event: EventEnvelope) {
    if (typeof event.payload.projectId === "string") return event.payload.projectId;
    if (event.entityType === "project") return event.entityId;
    if (event.entityType === "task") return (await this.core.getTask(event.entityId)).projectId;
    if (event.entityType === "idea") return (await this.core.getIdea(event.entityId)).projectId ?? undefined;
    if (event.entityType === "inbox_item") {
      const item = (await this.inbox.list()).find((candidate) => candidate.id === event.entityId);
      if (item?.projectId) return item.projectId;
      if (item && item.project !== "未归类") return (await this.core.listProjects()).find((project) => project.name === item.project)?.id;
    }
    return undefined;
  }

  private async onEvent(event: EventEnvelope) {
    if (!this.isEligible(event)) return;
    try {
      const projectId = await this.projectFor(event);
      if (!projectId) return;
      const previous = this.timers.get(projectId);
      if (previous) clearTimeout(previous);
      this.timers.set(projectId, setTimeout(() => {
        this.timers.delete(projectId);
        void this.runNow(projectId, event.id);
      }, this.debounceMs));
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  async runNow(projectId: string, triggerEventId: string = randomUUID()) {
    if (!this.enabled || this.active.has(projectId)) return { skipped: true, proposalIds: [] as string[] };
    this.active.add(projectId);
    const runId = randomUUID();
    try {
      const snapshot = await this.snapshots.getProjectSnapshot(projectId);
      const inputHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
      if (!await this.repository.beginRun({ id: runId, triggerEventId, projectId, inputHash })) return { skipped: true, proposalIds: [] as string[] };
      const analysis = await this.analyzer.analyze(snapshot);
      this.lastSandbox = analysis.sandbox;
      if (Object.values(analysis.sandbox).some(Boolean)) throw new Error("Organizer 沙盒获得了超出只读快照范围的权限");
      const pending = await this.core.listProposals({ projectId, status: "pending" });
      const existing = new Set(pending.map((proposal) => `${proposal.kind}:${proposal.title}`));
      const proposalIds: string[] = [];
      for (const proposal of analysis.proposals) {
        const key = `${proposal.kind}:${proposal.title}`;
        if (existing.has(key)) continue;
        const created = await this.core.createProposal({ ...proposal, projectId, createdBy: "organizer:sandbox-v1" }, { type: "system", id: "organizer-host" }, randomUUID());
        proposalIds.push(created.id);
        existing.add(key);
      }
      await this.repository.completeRun(runId, proposalIds);
      this.lastError = null;
      return { skipped: false, proposalIds };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      await this.repository.failRun(runId, message).catch(() => undefined);
      throw error;
    } finally {
      this.active.delete(projectId);
    }
  }
}
