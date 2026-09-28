import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inboxApi, organizerApi, proposalApi, subscribeToProjectEvents } from "./api.js";

const queryKey = ["inbox"];

export function useInbox() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: inboxApi.list,
    placeholderData: { items: [], total: 0 },
  });

  useEffect(() => subscribeToProjectEvents(() => {
    void queryClient.invalidateQueries({ queryKey });
  }), [queryClient]);

  const createMutation = useMutation({
    mutationFn: inboxApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const linkedCaptureMutation = useMutation({
    mutationFn: inboxApi.capture,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }) => inboxApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const archiveMutation = useMutation({
    mutationFn: inboxApi.archive,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const batchMutation = useMutation({
    mutationFn: inboxApi.batch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const proposalMutation = useMutation({
    mutationFn: ({ items, projectId, targetType, milestoneId, planId }) => Promise.all(items.map((item) => proposalApi.create({
      projectId,
      title: `把 Inbox 转为${({ idea: "想法", milestone: "里程碑", plan: "计划", task: "任务" })[targetType]}：${item.title}`,
      summary: "保留 Inbox 原文；确认后原子创建结构实体、建立 derivedFrom 来源关系并归档原始条目。",
      kind: "convert",
      risk: "low",
      evidence: [`Inbox ${item.id} · ${item.kind} · ${item.source}`],
      changes: [
        { entityType: targetType, entityId: null, action: "create", summary: `创建结构实体：${item.title}` },
        { entityType: "entity_link", entityId: null, action: "create", summary: "建立 derivedFrom Inbox 来源关系" },
      ],
      command: { type: "convert_inbox_to_entity", inboxItemId: item.id, targetType, projectId, ...(milestoneId ? { milestoneId } : {}), ...(planId ? { planId } : {}) },
      createdBy: "human:global-inbox",
    }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proposals"] }),
  });
  const organizerMutation = useMutation({
    mutationFn: (projectIds) => Promise.all(projectIds.map((projectId) => organizerApi.run(projectId))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proposals"] }),
  });

  const setItemsLocally = (updater) => {
    queryClient.setQueryData(queryKey, (current = { items: [], total: 0 }) => {
      const items = typeof updater === "function" ? updater(current.items) : updater;
      return { items, total: items.length };
    });
  };

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    createItem: createMutation.mutateAsync,
    createLinkedItem: linkedCaptureMutation.mutateAsync,
    updateItem: (id, input) => updateMutation.mutateAsync({ id, input }),
    archiveItem: archiveMutation.mutateAsync,
    batchItems: batchMutation.mutateAsync,
    proposeConversions: proposalMutation.mutateAsync,
    runOrganizers: organizerMutation.mutateAsync,
    isBatching: batchMutation.isPending || proposalMutation.isPending || organizerMutation.isPending,
    setItemsLocally,
  };
}
