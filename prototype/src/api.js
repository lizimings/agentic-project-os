const apiBase = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

async function request(path, options = {}) {
  const headers = {
    "X-PCC-Actor-Type": "human",
    "X-PCC-Actor-Id": "local-user",
    ...options.headers,
  };
  if (options.body !== undefined && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || `请求失败（${response.status}）`);
    error.code = body.error || "HTTP_ERROR";
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

export const inboxApi = {
  list: () => request("/api/inbox"),
  create: (input) => request("/api/inbox", { method: "POST", body: JSON.stringify(input) }),
  capture: (input) => request("/api/inbox/capture", { method: "POST", body: JSON.stringify(input) }),
  update: (id, input) => request(`/api/inbox/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  archive: (id) => request(`/api/inbox/${id}`, { method: "DELETE" }),
  batch: (input) => request("/api/inbox/batch", { method: "POST", body: JSON.stringify(input) }),
};

function withQuery(path, query = {}) {
  const search = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  return search.size ? `${path}?${search}` : path;
}

export const coreApi = {
  listProjects: () => request("/api/projects"),
  createProject: (input) => request("/api/projects", { method: "POST", body: JSON.stringify(input) }),
  getProject: (id) => request(`/api/projects/${id}`),
  updateProject: (id, input) => request(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  archiveProject: (id) => request(`/api/projects/${id}`, { method: "DELETE" }),
  listMilestones: (projectId) => request(withQuery("/api/milestones", { projectId })),
  createMilestone: (input) => request("/api/milestones", { method: "POST", body: JSON.stringify(input) }),
  updateMilestone: (id, input) => request(`/api/milestones/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  archiveMilestone: (id) => request(`/api/milestones/${id}`, { method: "DELETE" }),
  listPlans: (projectId) => request(withQuery("/api/plans", { projectId })),
  createPlan: (input) => request("/api/plans", { method: "POST", body: JSON.stringify(input) }),
  updatePlan: (id, input) => request(`/api/plans/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  archivePlan: (id) => request(`/api/plans/${id}`, { method: "DELETE" }),
  listTasks: (projectId) => request(withQuery("/api/tasks", { projectId })),
  createTask: (input) => request("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
  updateTask: (id, input) => request(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  archiveTask: (id) => request(`/api/tasks/${id}`, { method: "DELETE" }),
  listIdeas: (projectId) => request(withQuery("/api/ideas", { projectId })),
  findIdeaDuplicates: (projectId) => request(withQuery("/api/ideas/duplicates", { projectId })),
  createIdea: (input) => request("/api/ideas", { method: "POST", body: JSON.stringify(input) }),
  updateIdea: (id, input) => request(`/api/ideas/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  archiveIdea: (id) => request(`/api/ideas/${id}`, { method: "DELETE" }),
  convertIdea: (id, input) => request(`/api/ideas/${id}/convert`, { method: "POST", body: JSON.stringify(input) }),
  mergeIdeas: (id, input) => request(`/api/ideas/${id}/merge`, { method: "POST", body: JSON.stringify(input) }),
  listLinks: () => request("/api/entity-links"),
  createLink: (input) => request("/api/entity-links", { method: "POST", body: JSON.stringify(input) }),
  deleteLink: (id) => request(`/api/entity-links/${id}`, { method: "DELETE" }),
};

export const actorApi = {
  list: (kind) => request(withQuery("/api/actors", { kind })),
  create: (input) => request("/api/actors", { method: "POST", body: JSON.stringify(input) }),
  update: (id, input) => request(`/api/actors/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
};

export const proposalApi = {
  list: (status, projectId) => request(withQuery("/api/proposals", { status, projectId })),
  create: (input) => request("/api/proposals", { method: "POST", body: JSON.stringify(input) }),
  decide: (id, input) => request(`/api/proposals/${id}/decide`, { method: "POST", body: JSON.stringify(input) }),
};

export const organizerApi = {
  status: () => request("/api/organizer/status"),
  runs: (projectId, limit = 10) => request(withQuery("/api/organizer/runs", { projectId, limit })),
  run: (projectId) => request(`/api/organizer/run/${projectId}`, { method: "POST" }),
};

export const workspaceApi = {
  get: (projectId) => request(`/api/projects/${projectId}/workspace`),
  bind: (projectId, input) => request(`/api/projects/${projectId}/workspace`, { method: "PUT", body: JSON.stringify(input) }),
  scan: (projectId) => request(`/api/projects/${projectId}/workspace/scan`, { method: "POST" }),
  preflightWorktree: (projectId, input) => request(`/api/projects/${projectId}/worktrees/preflight`, { method: "POST", body: JSON.stringify(input) }),
  createWorktree: (projectId, confirmationToken) => request(`/api/projects/${projectId}/worktrees`, { method: "POST", body: JSON.stringify({ confirmationToken }) }),
  unbind: (projectId) => request(`/api/projects/${projectId}/workspace`, { method: "DELETE" }),
};

export const remoteApi = {
  getConnection: (provider) => request(`/api/integrations/${provider}`),
  connect: (provider, input) => request(`/api/integrations/${provider}`, { method: "PUT", body: JSON.stringify(input) }),
  validate: (provider) => request(`/api/integrations/${provider}/validate`, { method: "POST" }),
  disconnect: (provider) => request(`/api/integrations/${provider}`, { method: "DELETE" }),
  listRepositories: (provider, query = {}) => request(withQuery(`/api/integrations/${provider}/repositories`, query)),
  previewImport: (input) => request("/api/imports/remote/preflight", { method: "POST", body: JSON.stringify(input) }),
  importProject: (input) => request("/api/imports/remote", { method: "POST", body: JSON.stringify(input) }),
  getProjectRemote: (projectId) => request(`/api/projects/${projectId}/remote`),
  bindProjectRemote: (projectId, input) => request(`/api/projects/${projectId}/remote`, { method: "PUT", body: JSON.stringify(input) }),
  unbindProjectRemote: (projectId) => request(`/api/projects/${projectId}/remote`, { method: "DELETE" }),
  syncProject: (projectId, scopes) => request(`/api/projects/${projectId}/remote/sync`, { method: "POST", body: JSON.stringify(scopes?.length ? { scopes } : {}) }),
  listSyncJobs: (projectId) => request(`/api/projects/${projectId}/remote/sync-jobs`),
  listSyncItems: (projectId, scope) => request(withQuery(`/api/projects/${projectId}/remote/items`, { scope })),
  retrySync: (projectId, jobId) => request(`/api/projects/${projectId}/remote/sync-jobs/${jobId}/retry`, { method: "POST" }),
  configureWebhook: (projectId, enabled) => request(`/api/projects/${projectId}/webhook`, { method: "PUT", body: JSON.stringify({ enabled }) }),
  listWebhookDeliveries: (projectId) => request(`/api/projects/${projectId}/webhook/deliveries`),
};

export const giteaApi = {
  getConnection: () => remoteApi.getConnection("gitea"),
  connect: (input) => remoteApi.connect("gitea", input),
  validate: () => remoteApi.validate("gitea"),
  disconnect: () => remoteApi.disconnect("gitea"),
  listRepositories: (query = {}) => remoteApi.listRepositories("gitea", query),
  importProject: remoteApi.importProject,
  getProjectRemote: remoteApi.getProjectRemote,
  bindProjectRemote: remoteApi.bindProjectRemote,
  unbindProjectRemote: remoteApi.unbindProjectRemote,
};

export const timeApi = {
  listBlocks: (query) => request(withQuery("/api/time-blocks", query)),
  getSummary: (query) => request(withQuery("/api/time-summary", query)),
  createBlock: (input) => request("/api/time-blocks", { method: "POST", body: JSON.stringify(input) }),
  updateBlock: (id, input) => request(`/api/time-blocks/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  cancelBlock: (id) => request(`/api/time-blocks/${id}`, { method: "DELETE" }),
  getCurrentFocus: () => request("/api/focus-sessions/current"),
  startFocus: (input) => request("/api/focus-sessions", { method: "POST", body: JSON.stringify(input) }),
  pauseFocus: (id) => request(`/api/focus-sessions/${id}/pause`, { method: "POST" }),
  resumeFocus: (id) => request(`/api/focus-sessions/${id}/resume`, { method: "POST" }),
  completeFocus: (id, input = {}) => request(`/api/focus-sessions/${id}/complete`, { method: "POST", body: JSON.stringify(input) }),
  listBudgets: (weekStart) => request(withQuery("/api/attention-budgets", { weekStart })),
  upsertBudget: (input) => request("/api/attention-budgets", { method: "PUT", body: JSON.stringify(input) }),
  getAttentionAnalysis: (query) => request(withQuery("/api/attention-analysis", query)),
  proposeAttentionRebalance: (input) => request("/api/attention-analysis/rebalance", { method: "POST", body: JSON.stringify(input) }),
};

export const canvasApi = {
  get: (projectId, kind) => request(`/api/projects/${projectId}/canvases/${kind}`),
  save: (projectId, kind, input) => request(`/api/projects/${projectId}/canvases/${kind}`, { method: "PUT", body: JSON.stringify(input) }),
};

export const logApi = {
  list: (query) => request(withQuery("/api/event-log", query)),
  digest: (projectId, date, utcOffsetMinutes) => request(withQuery(`/api/projects/${projectId}/digest`, { date, utcOffsetMinutes })),
  exportUrl: (projectId, format = "markdown") => `${apiBase}/api/projects/${projectId}/logs/export?format=${encodeURIComponent(format)}`,
};

export const graphApi = {
  get: (query = {}) => request(withQuery("/api/knowledge-graph", query)),
};

export const searchApi = {
  search: (query) => request(withQuery("/api/search", query)),
};

export const notificationApi = {
  list: (query = {}) => request(withQuery("/api/notifications", query)),
  update: (id, input) => request(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  readAll: () => request("/api/notifications/read-all", { method: "POST" }),
};

export const aiApi = {
  getSettings: () => request("/api/settings/ai"),
  updateSettings: (input) => request("/api/settings/ai", { method: "PUT", body: JSON.stringify(input) }),
  transcribe: (file) => {
    const body = new FormData();
    body.append("file", file, file.name || "recording.webm");
    return request("/api/voice/transcriptions", { method: "POST", body });
  },
};

export const settingsApi = {
  getProjectPolicy: (projectId) => request(`/api/projects/${projectId}/settings`),
  updateProjectPolicy: (projectId, input) => request(`/api/projects/${projectId}/settings`, { method: "PUT", body: JSON.stringify(input) }),
  getPreferences: () => request("/api/settings/preferences"),
  updatePreferences: (input) => request("/api/settings/preferences", { method: "PUT", body: JSON.stringify(input) }),
  diagnostics: () => request("/api/diagnostics"),
};

export const backupApi = {
  list: () => request("/api/backups"),
  create: (input = {}) => request("/api/backups", { method: "POST", body: JSON.stringify(input) }),
  import: (directory) => request("/api/backups/import", { method: "POST", body: JSON.stringify({ directory }) }),
  export: (backupId, directory) => request(`/api/backups/${backupId}/export`, { method: "POST", body: JSON.stringify({ directory }) }),
  preflightRestore: (backupId) => request(`/api/backups/${backupId}/restore-preflight`, { method: "POST" }),
  restore: (backupId, confirmationToken) => request(`/api/backups/${backupId}/restore`, { method: "POST", body: JSON.stringify({ confirmationToken }) }),
  delete: (backupId) => request(`/api/backups/${backupId}`, { method: "DELETE" }),
};

const projectEventTypes = [
  "inbox.item_created", "inbox.item_updated", "inbox.item_archived",
  "project.created", "project.updated", "project.archived",
  "milestone.created", "milestone.updated", "milestone.archived",
  "plan.created", "plan.updated", "plan.archived",
  "task.created", "task.updated", "task.archived",
  "idea.created", "idea.updated", "idea.converted", "idea.archived",
  "proposal.created", "proposal.accepted", "proposal.rejected", "proposal.modified",
  "workspace.bound", "workspace.scanned", "workspace.unbound",
  "integration.connected", "integration.validated", "integration.disconnected",
  "remote_repository.bound", "remote_repository.unbound",
  "time_block.created", "time_block.updated", "time_block.completed", "time_block.canceled",
  "focus_session.started", "focus_session.paused", "focus_session.resumed", "focus_session.completed",
  "attention_budget.updated", "attention_budget.canceled",
  "canvas_document.created", "canvas_document.updated",
  "notification.updated",
  "integration.updated", "integration.transcribed",
];
const projectEventSubscribers = new Set();
let projectEventSource = null;
let projectEventReconnectTimer = null;

function connectProjectEvents() {
  if (!projectEventSubscribers.size || projectEventSource) return;
  const source = new EventSource(`${apiBase}/api/events`);
  projectEventSource = source;
  const dispatch = (event) => {
    let parsed;
    try { parsed = JSON.parse(event.data); } catch { return; }
    projectEventSubscribers.forEach((subscriber) => subscriber(parsed));
  };
  projectEventTypes.forEach((type) => source.addEventListener(type, dispatch));
  source.addEventListener("error", () => {
    if (projectEventSource !== source) return;
    source.close();
    projectEventSource = null;
    window.clearTimeout(projectEventReconnectTimer);
    if (projectEventSubscribers.size) projectEventReconnectTimer = window.setTimeout(connectProjectEvents, 1_000);
  });
}

export function subscribeToProjectEvents(onEvent) {
  projectEventSubscribers.add(onEvent);
  connectProjectEvents();
  return () => {
    projectEventSubscribers.delete(onEvent);
    if (!projectEventSubscribers.size) {
      window.clearTimeout(projectEventReconnectTimer);
      projectEventReconnectTimer = null;
      projectEventSource?.close();
      projectEventSource = null;
    }
  };
}
