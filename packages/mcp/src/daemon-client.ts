import type {
  CreateEntityLinkInput,
  CreateIdeaInput,
  CreateInboxItemInput,
  CreateProposalInput,
  EntityLink,
  Idea,
  InboxItem,
  Milestone,
  Plan,
  Project,
  ProjectSnapshot,
  Proposal,
  SnapshotQuery,
  Task,
  UpdateInboxItemInput,
  WorkspaceBinding,
} from "@pcc/contracts";

export interface DaemonClientOptions {
  baseUrl?: string;
  actorId?: string;
}

export class DaemonClient {
  readonly baseUrl: string;
  private readonly actorId: string;

  constructor(options: DaemonClientOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.PCC_DAEMON_URL || "http://127.0.0.1:4317").replace(/\/$/, "");
    this.actorId = options.actorId || "mcp-client";
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-PCC-Actor-Type": "agent",
        "X-PCC-Actor-Id": this.actorId,
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(body.message || `projectd 请求失败（${response.status}）`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async health() {
    return this.request<{ status: string; service: string }>("/health");
  }

  private withQuery(path: string, query: Record<string, string | number | undefined>) {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== "") search.set(key, String(value)); });
    return search.size ? `${path}?${search.toString()}` : path;
  }

  async listInbox() {
    return this.request<{ items: InboxItem[]; total: number }>("/api/inbox");
  }

  async captureInbox(input: CreateInboxItemInput) {
    return this.request<InboxItem>("/api/inbox", { method: "POST", body: JSON.stringify(input) });
  }

  async updateInbox(id: string, input: UpdateInboxItemInput) {
    return this.request<InboxItem>(`/api/inbox/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  }

  async archiveInbox(id: string) {
    await this.request<void>(`/api/inbox/${id}`, { method: "DELETE" });
  }

  listProjects() {
    return this.request<{ items: Project[]; total: number }>("/api/projects");
  }

  getProjectSnapshot(projectId: string, query: SnapshotQuery = {}) {
    return this.request<ProjectSnapshot>(this.withQuery(`/api/projects/${encodeURIComponent(projectId)}/snapshot`, query));
  }

  listMilestones(projectId?: string) {
    return this.request<{ items: Milestone[]; total: number }>(this.withQuery("/api/milestones", { projectId }));
  }

  listPlans(projectId?: string) {
    return this.request<{ items: Plan[]; total: number }>(this.withQuery("/api/plans", { projectId }));
  }

  listTasks(projectId?: string) {
    return this.request<{ items: Task[]; total: number }>(this.withQuery("/api/tasks", { projectId }));
  }

  listIdeas(projectId?: string) {
    return this.request<{ items: Idea[]; total: number }>(this.withQuery("/api/ideas", { projectId }));
  }

  listLinks(entityType?: string, entityId?: string) {
    return this.request<{ items: EntityLink[]; total: number }>(this.withQuery("/api/entity-links", { entityType, entityId }));
  }

  listProposals(projectId?: string, status?: Proposal["status"]) {
    return this.request<{ items: Proposal[]; total: number }>(this.withQuery("/api/proposals", { projectId, status }));
  }

  getWorkspace(projectId: string) {
    return this.request<WorkspaceBinding | null>(`/api/projects/${encodeURIComponent(projectId)}/workspace`);
  }

  createIdea(input: CreateIdeaInput) {
    return this.request<Idea>("/api/ideas", { method: "POST", body: JSON.stringify(input) });
  }

  createLink(input: CreateEntityLinkInput) {
    return this.request<EntityLink>("/api/entity-links", { method: "POST", body: JSON.stringify(input) });
  }

  createProposal(input: CreateProposalInput) {
    return this.request<Proposal>("/api/proposals", { method: "POST", body: JSON.stringify(input) });
  }
}
