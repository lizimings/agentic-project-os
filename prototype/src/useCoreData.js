import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { actorApi, aiApi, canvasApi, coreApi, graphApi, logApi, notificationApi, organizerApi, proposalApi, remoteApi, searchApi, settingsApi, subscribeToProjectEvents, timeApi, workspaceApi } from "./api.js";

const emptyCore = { project: null, milestones: [], plans: [], tasks: [], ideas: [], ideaDuplicates: [], links: [] };

export function useAiSettings() {
  const queryClient = useQueryClient();
  const queryKey = ["ai-settings"];
  const query = useQuery({ queryKey, queryFn: aiApi.getSettings, retry: false });
  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType === "integration" && event.entityId === "ai-settings") void queryClient.invalidateQueries({ queryKey });
  }), [queryClient]);
  const update = useMutation({ mutationFn: aiApi.updateSettings, onSuccess: (settings) => queryClient.setQueryData(queryKey, settings) });
  return { settings: query.data ?? null, isLoading: query.isLoading, error: query.error, update: update.mutateAsync, pending: update.isPending };
}

export function useProjectPolicy(projectId) {
  const queryClient = useQueryClient();
  const queryKey = ["project-policy", projectId];
  const query = useQuery({ queryKey, enabled: Boolean(projectId), queryFn: () => settingsApi.getProjectPolicy(projectId) });
  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType === "project" && event.entityId === projectId && event.payload?.settings) void queryClient.invalidateQueries({ queryKey });
  }), [projectId, queryClient]);
  const update = useMutation({ mutationFn: (input) => settingsApi.updateProjectPolicy(projectId, input), onSuccess: (policy) => queryClient.setQueryData(queryKey, policy) });
  return { policy: query.data ?? null, isLoading: query.isLoading, error: query.error, update: update.mutateAsync, pending: update.isPending };
}

export function useGlobalPreferences() {
  const queryClient = useQueryClient();
  const preferencesKey = ["global-preferences"];
  const diagnosticsKey = ["runtime-diagnostics"];
  const preferences = useQuery({ queryKey: preferencesKey, queryFn: settingsApi.getPreferences });
  const diagnostics = useQuery({ queryKey: diagnosticsKey, queryFn: settingsApi.diagnostics, refetchInterval: 30_000 });
  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType === "integration" && event.entityId === "global-preferences") void queryClient.invalidateQueries({ queryKey: preferencesKey });
  }), [queryClient]);
  const update = useMutation({ mutationFn: settingsApi.updatePreferences, onSuccess: (value) => queryClient.setQueryData(preferencesKey, value) });
  return {
    preferences: preferences.data ?? null,
    diagnostics: diagnostics.data ?? null,
    isLoading: preferences.isLoading || diagnostics.isLoading,
    error: preferences.error || diagnostics.error,
    update: update.mutateAsync,
    refreshDiagnostics: () => queryClient.invalidateQueries({ queryKey: diagnosticsKey }),
    pending: update.isPending,
  };
}

export function useProjects() {
  const queryClient = useQueryClient();
  const queryKey = ["project-portfolio"];
  const query = useQuery({
    queryKey,
    placeholderData: { items: [], total: 0 },
    queryFn: async () => {
      const projects = await coreApi.listProjects();
      const items = await Promise.all(projects.items.map(async (project) => {
        const [milestones, plans, tasks] = await Promise.all([
          coreApi.listMilestones(project.id),
          coreApi.listPlans(project.id),
          coreApi.listTasks(project.id),
        ]);
        return { ...project, milestones: milestones.items, plans: plans.items, tasks: tasks.items };
      }));
      return { items, total: items.length };
    },
  });

  useEffect(() => subscribeToProjectEvents((event) => {
    if (["project", "milestone", "plan", "task"].includes(event.entityType)) void queryClient.invalidateQueries({ queryKey });
  }), [queryClient]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const create = useMutation({ mutationFn: coreApi.createProject, onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, input }) => coreApi.updateProject(id, input), onSuccess: invalidate });
  const archive = useMutation({ mutationFn: coreApi.archiveProject, onSuccess: invalidate });

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    create: create.mutateAsync,
    update: (id, input) => update.mutateAsync({ id, input }),
    archive: archive.mutateAsync,
    pending: create.isPending || update.isPending || archive.isPending,
  };
}

export function useProjectCore(projectId) {
  const queryClient = useQueryClient();
  const queryKey = ["project-core", projectId];
  const query = useQuery({
    queryKey,
    enabled: Boolean(projectId),
    placeholderData: emptyCore,
    queryFn: async () => {
      const [project, milestones, plans, tasks, ideas, ideaDuplicates, links] = await Promise.all([
        coreApi.getProject(projectId),
        coreApi.listMilestones(projectId),
        coreApi.listPlans(projectId),
        coreApi.listTasks(projectId),
        coreApi.listIdeas(projectId),
        coreApi.findIdeaDuplicates(projectId),
        coreApi.listLinks(),
      ]);
      return {
        project,
        milestones: milestones.items,
        plans: plans.items,
        tasks: tasks.items,
        ideas: ideas.items,
        ideaDuplicates: ideaDuplicates.items,
        links: links.items,
      };
    },
  });

  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType !== "inbox_item" && event.entityType !== "proposal") {
      void queryClient.invalidateQueries({ queryKey });
    }
  }), [queryClient, projectId]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const createIdea = useMutation({ mutationFn: coreApi.createIdea, onSuccess: invalidate });
  const updateIdea = useMutation({ mutationFn: ({ id, input }) => coreApi.updateIdea(id, input), onSuccess: invalidate });
  const archiveIdea = useMutation({ mutationFn: coreApi.archiveIdea, onSuccess: invalidate });
  const convertIdea = useMutation({ mutationFn: ({ id, input }) => coreApi.convertIdea(id, input), onSuccess: invalidate });
  const mergeIdeas = useMutation({ mutationFn: ({ id, input }) => coreApi.mergeIdeas(id, input), onSuccess: invalidate });
  const createMilestone = useMutation({ mutationFn: coreApi.createMilestone, onSuccess: invalidate });
  const updateMilestone = useMutation({ mutationFn: ({ id, input }) => coreApi.updateMilestone(id, input), onSuccess: invalidate });
  const archiveMilestone = useMutation({ mutationFn: coreApi.archiveMilestone, onSuccess: invalidate });
  const createPlan = useMutation({ mutationFn: coreApi.createPlan, onSuccess: invalidate });
  const updatePlan = useMutation({ mutationFn: ({ id, input }) => coreApi.updatePlan(id, input), onSuccess: invalidate });
  const archivePlan = useMutation({ mutationFn: coreApi.archivePlan, onSuccess: invalidate });
  const createTask = useMutation({ mutationFn: coreApi.createTask, onSuccess: invalidate });
  const updateTask = useMutation({
    mutationFn: ({ id, input }) => coreApi.updateTask(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (current) => current ? { ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, ...input } : task) } : current);
      return { previous };
    },
    onError: (_error, _variables, context) => { if (context?.previous) queryClient.setQueryData(queryKey, context.previous); },
    onSettled: invalidate,
  });
  const archiveTask = useMutation({ mutationFn: coreApi.archiveTask, onSuccess: invalidate });
  const createLink = useMutation({ mutationFn: coreApi.createLink, onSuccess: invalidate });
  const deleteLink = useMutation({ mutationFn: coreApi.deleteLink, onSuccess: invalidate });
  const pendingMutations = [createIdea, updateIdea, archiveIdea, convertIdea, mergeIdeas, createMilestone, updateMilestone, archiveMilestone, createPlan, updatePlan, archivePlan, createTask, updateTask, archiveTask, createLink, deleteLink];

  return {
    ...emptyCore,
    ...query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    createIdea: createIdea.mutateAsync,
    updateIdea: (id, input) => updateIdea.mutateAsync({ id, input }),
    archiveIdea: archiveIdea.mutateAsync,
    convertIdea: (id, input) => convertIdea.mutateAsync({ id, input }),
    mergeIdeas: (id, input) => mergeIdeas.mutateAsync({ id, input }),
    createMilestone: createMilestone.mutateAsync,
    updateMilestone: (id, input) => updateMilestone.mutateAsync({ id, input }),
    archiveMilestone: archiveMilestone.mutateAsync,
    createPlan: createPlan.mutateAsync,
    updatePlan: (id, input) => updatePlan.mutateAsync({ id, input }),
    archivePlan: archivePlan.mutateAsync,
    createTask: createTask.mutateAsync,
    updateTask: (id, input) => updateTask.mutateAsync({ id, input }),
    archiveTask: archiveTask.mutateAsync,
    createLink: createLink.mutateAsync,
    deleteLink: deleteLink.mutateAsync,
    pending: pendingMutations.some((mutation) => mutation.isPending),
  };
}

export function useActors() {
  const queryClient = useQueryClient();
  const queryKey = ["actors"];
  const query = useQuery({ queryKey, queryFn: () => actorApi.list(), placeholderData: { items: [], total: 0 } });
  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType === "actor") void queryClient.invalidateQueries({ queryKey });
  }), [queryClient]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const create = useMutation({ mutationFn: actorApi.create, onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, input }) => actorApi.update(id, input), onSuccess: invalidate });
  return { items: query.data?.items ?? [], total: query.data?.total ?? 0, isLoading: query.isLoading, error: query.error, create: create.mutateAsync, update: (id, input) => update.mutateAsync({ id, input }), pending: create.isPending || update.isPending };
}

export function useProposals(status = "pending") {
  const queryClient = useQueryClient();
  const queryKey = ["proposals", status];
  const query = useQuery({ queryKey, queryFn: () => proposalApi.list(status), placeholderData: { items: [], total: 0 } });

  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType === "proposal") void queryClient.invalidateQueries({ queryKey: ["proposals"] });
  }), [queryClient]);

  const decide = useMutation({
    mutationFn: ({ id, input }) => proposalApi.decide(id, input),
    onSuccess: async (proposal) => {
      const invalidations = [queryClient.invalidateQueries({ queryKey: ["proposals"] })];
      if (proposal.executionStatus === "applied") {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: ["project-core"] }),
          queryClient.invalidateQueries({ queryKey: ["inbox"] }),
          queryClient.invalidateQueries({ queryKey: ["time-blocks"] }),
          queryClient.invalidateQueries({ queryKey: ["project-portfolio"] }),
        );
      }
      await Promise.all(invalidations);
    },
  });

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    error: query.error,
    isLoading: query.isLoading,
    decide: (id, input) => decide.mutateAsync({ id, input }),
    pendingId: decide.isPending ? decide.variables?.id ?? null : null,
    isDeciding: decide.isPending,
  };
}

export function useCanvasDocument(projectId, kind) {
  const queryClient = useQueryClient();
  const queryKey = ["canvas-document", projectId, kind];
  const query = useQuery({
    queryKey,
    enabled: Boolean(projectId && kind),
    queryFn: () => canvasApi.get(projectId, kind),
  });
  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType === "canvas_document" && event.payload?.projectId === projectId && event.payload?.kind === kind) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }), [kind, projectId, queryClient]);
  const saveMutation = useMutation({
    mutationFn: (input) => canvasApi.save(projectId, kind, input),
    onSuccess: (document) => queryClient.setQueryData(queryKey, document),
  });
  return {
    document: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error || saveMutation.error,
    save: saveMutation.mutateAsync,
    reload: async () => (await query.refetch()).data ?? null,
    isSaving: saveMutation.isPending,
  };
}

export function useProjectLogs(projectId, filters = {}) {
  const queryClient = useQueryClient();
  const queryKey = ["project-event-log", projectId, filters];
  const date = new Date().toLocaleDateString("en-CA");
  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const logs = useQuery({ queryKey, enabled: Boolean(projectId), queryFn: () => logApi.list({ projectId, limit: 200, ...filters }), placeholderData: { items: [], total: 0, nextBeforeSequence: null } });
  const digest = useQuery({ queryKey: ["project-digest", projectId, date, utcOffsetMinutes], enabled: Boolean(projectId), queryFn: () => logApi.digest(projectId, date, utcOffsetMinutes) });
  useEffect(() => subscribeToProjectEvents(() => {
    void queryClient.invalidateQueries({ queryKey: ["project-event-log", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["project-digest", projectId] });
  }), [projectId, queryClient]);
  return {
    items: logs.data?.items ?? [],
    total: logs.data?.total ?? 0,
    digest: digest.data ?? null,
    isLoading: logs.isLoading || digest.isLoading,
    error: logs.error || digest.error,
  };
}

export function useKnowledgeGraph(query = {}) {
  const queryClient = useQueryClient();
  const queryKey = ["knowledge-graph", query];
  const result = useQuery({ queryKey, queryFn: () => graphApi.get(query), placeholderData: { nodes: [], links: [], totalNodes: 0, totalLinks: 0, generatedAt: null } });
  useEffect(() => subscribeToProjectEvents(() => {
    void queryClient.invalidateQueries({ queryKey: ["knowledge-graph"] });
  }), [queryClient]);
  return { ...result.data, isLoading: result.isLoading, error: result.error };
}

export function useGlobalSearch(query, options = {}) {
  const normalized = query.trim();
  const result = useQuery({
    queryKey: ["global-search", normalized, options.projectId ?? null, options.types ?? null],
    enabled: normalized.length > 0,
    queryFn: () => searchApi.search({ q: normalized, limit: 20, ...options }),
    placeholderData: { items: [], total: 0, indexedAt: null },
    staleTime: 5_000,
  });
  return {
    items: result.data?.items ?? [],
    total: result.data?.total ?? 0,
    indexedAt: result.data?.indexedAt ?? null,
    isLoading: result.isFetching,
    error: result.error,
  };
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const queryKey = ["notifications"];
  const query = useQuery({ queryKey, queryFn: () => notificationApi.list(), placeholderData: { items: [], total: 0, unread: 0, generatedAt: null }, refetchInterval: 60_000 });
  useEffect(() => subscribeToProjectEvents((event) => {
    if (["notification", "proposal", "task", "milestone", "workspace", "attention_budget", "focus_session"].includes(event.entityType)) void queryClient.invalidateQueries({ queryKey });
  }), [queryClient]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const update = useMutation({ mutationFn: ({ id, input }) => notificationApi.update(id, input), onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: notificationApi.readAll, onSuccess: invalidate });
  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    unread: query.data?.unread ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    update: (id, input) => update.mutateAsync({ id, input }),
    readAll: readAll.mutateAsync,
    pendingId: update.isPending ? update.variables?.id ?? null : null,
    isReadingAll: readAll.isPending,
  };
}

export function useOrganizer(projectId) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: ["organizer-status"], queryFn: organizerApi.status });
  const runsQuery = useQuery({ queryKey: ["organizer-runs", projectId], enabled: Boolean(projectId), queryFn: () => organizerApi.runs(projectId), placeholderData: { items: [], total: 0 } });
  const proposalsQuery = useQuery({ queryKey: ["organizer-proposals", projectId], enabled: Boolean(projectId), queryFn: () => proposalApi.list("pending", projectId), placeholderData: { items: [], total: 0 } });
  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType === "proposal") {
      void queryClient.invalidateQueries({ queryKey: ["organizer-proposals", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["organizer-runs", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["organizer-status"] });
    }
  }), [projectId, queryClient]);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["organizer-status"] }),
      queryClient.invalidateQueries({ queryKey: ["organizer-runs", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["organizer-proposals", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["proposals"] }),
    ]);
  };
  const run = useMutation({ mutationFn: () => organizerApi.run(projectId), onSuccess: refresh });
  const submit = useMutation({ mutationFn: proposalApi.create, onSuccess: refresh });
  return {
    status: statusQuery.data ?? null,
    runs: runsQuery.data?.items ?? [],
    proposals: proposalsQuery.data?.items ?? [],
    error: statusQuery.error || runsQuery.error || proposalsQuery.error,
    runNow: run.mutateAsync,
    submitProposal: submit.mutateAsync,
    pending: run.isPending || submit.isPending,
  };
}

export function useWorkspace(projectId) {
  const queryClient = useQueryClient();
  const queryKey = ["workspace", projectId];
  const query = useQuery({ queryKey, enabled: Boolean(projectId), queryFn: () => workspaceApi.get(projectId), placeholderData: null, retry: false });

  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType === "workspace" && event.entityId === projectId) void queryClient.invalidateQueries({ queryKey });
  }), [projectId, queryClient]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const bind = useMutation({ mutationFn: (input) => workspaceApi.bind(projectId, input), onSuccess: invalidate });
  const scan = useMutation({ mutationFn: () => workspaceApi.scan(projectId), onSuccess: invalidate });
  const preflightWorktree = useMutation({ mutationFn: (input) => workspaceApi.preflightWorktree(projectId, input) });
  const createWorktree = useMutation({ mutationFn: (confirmationToken) => workspaceApi.createWorktree(projectId, confirmationToken), onSuccess: invalidate });
  const unbind = useMutation({ mutationFn: () => workspaceApi.unbind(projectId), onSuccess: invalidate });

  return {
    binding: query.data ?? null,
    error: query.error,
    isLoading: query.isLoading,
    bind: bind.mutateAsync,
    scan: scan.mutateAsync,
    preflightWorktree: preflightWorktree.mutateAsync,
    createWorktree: createWorktree.mutateAsync,
    unbind: unbind.mutateAsync,
    pending: bind.isPending || scan.isPending || preflightWorktree.isPending || createWorktree.isPending || unbind.isPending,
  };
}

export function useRemoteIntegration(provider = "gitea", search = "") {
  const queryClient = useQueryClient();
  const connectionKey = ["remote-connection", provider];
  const connectionQuery = useQuery({ queryKey: connectionKey, queryFn: () => remoteApi.getConnection(provider), placeholderData: null, retry: false });
  const repositoryKey = ["remote-repositories", provider, search];
  const repositoriesQuery = useQuery({
    queryKey: repositoryKey,
    enabled: Boolean(connectionQuery.data),
    queryFn: () => remoteApi.listRepositories(provider, { q: search, page: 1, limit: 50 }),
    placeholderData: { items: [], page: 1, limit: 50, total: 0, hasNext: false },
    retry: false,
  });

  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType === "integration") {
      void queryClient.invalidateQueries({ queryKey: connectionKey });
      void queryClient.invalidateQueries({ queryKey: ["remote-repositories", provider] });
    }
  }), [provider, queryClient]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: connectionKey });
    await queryClient.invalidateQueries({ queryKey: ["remote-repositories", provider] });
  };
  const connect = useMutation({ mutationFn: (input) => remoteApi.connect(provider, input), onSuccess: refresh });
  const validate = useMutation({ mutationFn: () => remoteApi.validate(provider), onSuccess: refresh });
  const disconnect = useMutation({ mutationFn: () => remoteApi.disconnect(provider), onSuccess: refresh });

  return {
    connection: connectionQuery.data ?? null,
    repositories: repositoriesQuery.data?.items ?? [],
    repositoryTotal: repositoriesQuery.data?.total ?? 0,
    isLoading: connectionQuery.isLoading,
    isLoadingRepositories: repositoriesQuery.isFetching,
    error: connectionQuery.error || repositoriesQuery.error,
    connect: connect.mutateAsync,
    validate: validate.mutateAsync,
    disconnect: disconnect.mutateAsync,
    refreshRepositories: () => queryClient.invalidateQueries({ queryKey: ["remote-repositories", provider] }),
    pending: connect.isPending || validate.isPending || disconnect.isPending,
  };
}

export function useGiteaIntegration(search = "") {
  return useRemoteIntegration("gitea", search);
}

export function useProjectRemote(projectId) {
  const queryClient = useQueryClient();
  const queryKey = ["project-remote", projectId];
  const jobsKey = ["project-remote-jobs", projectId];
  const deliveriesKey = ["project-webhook-deliveries", projectId];
  const query = useQuery({ queryKey, enabled: Boolean(projectId), queryFn: () => remoteApi.getProjectRemote(projectId), placeholderData: null, retry: false });
  const jobsQuery = useQuery({ queryKey: jobsKey, enabled: Boolean(projectId && query.data), queryFn: () => remoteApi.listSyncJobs(projectId), placeholderData: { items: [] }, retry: false });
  const deliveriesQuery = useQuery({ queryKey: deliveriesKey, enabled: Boolean(projectId && query.data?.webhookEnabled), queryFn: () => remoteApi.listWebhookDeliveries(projectId), placeholderData: { items: [] }, retry: false });
  useEffect(() => subscribeToProjectEvents((event) => {
    if ((event.entityType === "remote_repository" && event.entityId === projectId) || event.entityType === "integration") {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: jobsKey });
    }
  }), [projectId, queryClient]);
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: jobsKey });
    await queryClient.invalidateQueries({ queryKey: deliveriesKey });
  };
  const bind = useMutation({ mutationFn: (input) => remoteApi.bindProjectRemote(projectId, input), onSuccess: invalidate });
  const unbind = useMutation({ mutationFn: () => remoteApi.unbindProjectRemote(projectId), onSuccess: invalidate });
  const sync = useMutation({ mutationFn: (scopes) => remoteApi.syncProject(projectId, scopes), onSuccess: invalidate });
  const retry = useMutation({ mutationFn: (jobId) => remoteApi.retrySync(projectId, jobId), onSuccess: invalidate });
  const configureWebhook = useMutation({ mutationFn: (enabled) => remoteApi.configureWebhook(projectId, enabled), onSuccess: invalidate });
  return {
    binding: query.data ?? null,
    jobs: jobsQuery.data?.items ?? [],
    deliveries: deliveriesQuery.data?.items ?? [],
    error: query.error || jobsQuery.error || deliveriesQuery.error,
    isLoading: query.isLoading,
    bind: bind.mutateAsync,
    unbind: unbind.mutateAsync,
    sync: sync.mutateAsync,
    retry: retry.mutateAsync,
    configureWebhook: configureWebhook.mutateAsync,
    pending: bind.isPending || unbind.isPending || sync.isPending || retry.isPending || configureWebhook.isPending,
  };
}

export function useTimeSystem({ from, to, weekStart, projectId, summaryFrom = from, summaryTo = to } = {}) {
  const queryClient = useQueryClient();
  const weekRange = (() => {
    if (!weekStart) return null;
    const start = new Date(`${weekStart}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { from: start.toISOString(), to: end.toISOString() };
  })();
  const blocksKey = ["time-blocks", from, to, projectId ?? null];
  const weekBlocksKey = ["time-blocks-week", weekStart, projectId ?? null];
  const focusKey = ["focus-session-current"];
  const budgetsKey = ["attention-budgets", weekStart];
  const attentionKey = ["attention-analysis", weekStart];
  const summaryKey = ["time-summary", summaryFrom, summaryTo, projectId ?? null];
  const blocksQuery = useQuery({ queryKey: blocksKey, enabled: Boolean(from && to), queryFn: () => timeApi.listBlocks({ from, to, projectId }), placeholderData: { items: [], total: 0 } });
  const weekBlocksQuery = useQuery({ queryKey: weekBlocksKey, enabled: Boolean(weekRange), queryFn: () => timeApi.listBlocks({ ...weekRange, projectId }), placeholderData: { items: [], total: 0 } });
  const focusQuery = useQuery({ queryKey: focusKey, queryFn: timeApi.getCurrentFocus, placeholderData: null, retry: false });
  const budgetsQuery = useQuery({ queryKey: budgetsKey, enabled: Boolean(weekStart), queryFn: () => timeApi.listBudgets(weekStart), placeholderData: { items: [], total: 0 } });
  const attentionQuery = useQuery({ queryKey: attentionKey, enabled: Boolean(weekStart), queryFn: () => timeApi.getAttentionAnalysis({ weekStart, utcOffsetMinutes: -new Date().getTimezoneOffset() }), placeholderData: { weekStart, items: [], starvingCount: 0, atRiskCount: 0, overfocusedCount: 0 }, retry: false });
  const summaryQuery = useQuery({ queryKey: summaryKey, enabled: Boolean(summaryFrom && summaryTo), queryFn: () => timeApi.getSummary({ from: summaryFrom, to: summaryTo, projectId, utcOffsetMinutes: -new Date().getTimezoneOffset() }), placeholderData: { focusSeconds: 0, sessionCount: 0, completedSessionCount: 0, byProject: [], byDay: [] } });
  const weeklySummaryQuery = useQuery({ queryKey: ["time-summary-week", weekStart, projectId ?? null], enabled: Boolean(weekRange), queryFn: () => timeApi.getSummary({ ...weekRange, projectId, utcOffsetMinutes: -new Date().getTimezoneOffset() }), placeholderData: { focusSeconds: 0, sessionCount: 0, completedSessionCount: 0, byProject: [], byDay: [] } });

  useEffect(() => subscribeToProjectEvents((event) => {
    if (event.entityType === "time_block") { void queryClient.invalidateQueries({ queryKey: ["time-blocks"] }); void queryClient.invalidateQueries({ queryKey: ["attention-analysis"] }); }
    if (event.entityType === "focus_session") {
      void queryClient.invalidateQueries({ queryKey: focusKey });
      void queryClient.invalidateQueries({ queryKey: ["time-blocks"] });
      void queryClient.invalidateQueries({ queryKey: ["time-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["time-summary-week"] });
      void queryClient.invalidateQueries({ queryKey: ["attention-analysis"] });
    }
    if (event.entityType === "attention_budget") { void queryClient.invalidateQueries({ queryKey: ["attention-budgets"] }); void queryClient.invalidateQueries({ queryKey: ["attention-analysis"] }); }
  }), [queryClient]);

  const invalidateBlocks = () => queryClient.invalidateQueries({ queryKey: ["time-blocks"] });
  const invalidateFocus = () => queryClient.invalidateQueries({ queryKey: focusKey });
  const invalidateBudgets = async () => { await queryClient.invalidateQueries({ queryKey: ["attention-budgets"] }); await queryClient.invalidateQueries({ queryKey: ["attention-analysis"] }); };
  const createBlock = useMutation({ mutationFn: timeApi.createBlock, onSuccess: invalidateBlocks });
  const updateBlock = useMutation({ mutationFn: ({ id, input }) => timeApi.updateBlock(id, input), onSuccess: invalidateBlocks });
  const cancelBlock = useMutation({ mutationFn: timeApi.cancelBlock, onSuccess: invalidateBlocks });
  const startFocus = useMutation({ mutationFn: timeApi.startFocus, onSuccess: async () => { await invalidateFocus(); await invalidateBlocks(); } });
  const pauseFocus = useMutation({ mutationFn: timeApi.pauseFocus, onSuccess: invalidateFocus });
  const resumeFocus = useMutation({ mutationFn: timeApi.resumeFocus, onSuccess: invalidateFocus });
  const completeFocus = useMutation({ mutationFn: ({ id, input }) => timeApi.completeFocus(id, input), onSuccess: async () => { await invalidateFocus(); await invalidateBlocks(); await queryClient.invalidateQueries({ queryKey: ["time-summary"] }); await queryClient.invalidateQueries({ queryKey: ["time-summary-week"] }); } });
  const upsertBudget = useMutation({ mutationFn: timeApi.upsertBudget, onSuccess: invalidateBudgets });
  const proposeAttentionRebalance = useMutation({ mutationFn: timeApi.proposeAttentionRebalance, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proposals"] }) });

  return {
    blocks: blocksQuery.data?.items ?? [],
    weeklyBlocks: weekBlocksQuery.data?.items ?? [],
    currentFocus: focusQuery.data ?? null,
    budgets: budgetsQuery.data?.items ?? [],
    summary: summaryQuery.data ?? { focusSeconds: 0, sessionCount: 0, completedSessionCount: 0, byProject: [], byDay: [] },
    weeklySummary: weeklySummaryQuery.data ?? { focusSeconds: 0, sessionCount: 0, completedSessionCount: 0, byProject: [], byDay: [] },
    attention: attentionQuery.data,
    error: blocksQuery.error || weekBlocksQuery.error || focusQuery.error || budgetsQuery.error || summaryQuery.error || weeklySummaryQuery.error || attentionQuery.error,
    isLoading: blocksQuery.isLoading || weekBlocksQuery.isLoading || focusQuery.isLoading,
    createBlock: createBlock.mutateAsync,
    updateBlock: (id, input) => updateBlock.mutateAsync({ id, input }),
    cancelBlock: cancelBlock.mutateAsync,
    startFocus: startFocus.mutateAsync,
    pauseFocus: pauseFocus.mutateAsync,
    resumeFocus: resumeFocus.mutateAsync,
    completeFocus: (id, input = {}) => completeFocus.mutateAsync({ id, input }),
    upsertBudget: upsertBudget.mutateAsync,
    proposeAttentionRebalance: proposeAttentionRebalance.mutateAsync,
    pending: [createBlock, updateBlock, cancelBlock, startFocus, pauseFocus, resumeFocus, completeFocus, upsertBudget, proposeAttentionRebalance].some((mutation) => mutation.isPending),
  };
}
