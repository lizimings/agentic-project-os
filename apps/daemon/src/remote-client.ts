import type { RemoteRepository, RemoteRepositoryPage, RemoteSyncScope } from "@pcc/contracts";

export interface RemoteIdentity {
  baseUrl: string;
  version: string | null;
  username: string;
}

export interface RemoteSyncPayload {
  scope: RemoteSyncScope;
  externalId: string;
  title: string;
  state: string;
  url: string | null;
  remoteUpdatedAt: string | null;
  payload: unknown;
}

export interface RemoteClient {
  readonly baseUrl: string;
  validate(): Promise<RemoteIdentity>;
  listRepositories(query: { q: string; page: number; limit: number }): Promise<RemoteRepositoryPage>;
  getRepository(owner: string, repo: string): Promise<RemoteRepository>;
  syncRepository(owner: string, repo: string, scopes: RemoteSyncScope[]): Promise<Map<RemoteSyncScope, RemoteSyncPayload[]>>;
}

export function syncPayloadFromApi(scope: RemoteSyncScope, payload: unknown): RemoteSyncPayload {
  const value = payload as Record<string, unknown>;
  const commit = value.commit as Record<string, unknown> | undefined;
  const author = commit?.author as Record<string, unknown> | undefined;
  const externalId = String(scope === "commits" ? value.sha ?? value.id ?? "" : scope === "branches" ? value.name ?? "" : value.number ?? value.id ?? "");
  const title = String(scope === "commits" ? commit?.message ?? value.message ?? externalId : scope === "branches" ? value.name ?? externalId : value.title ?? value.name ?? externalId).split("\n")[0]!.slice(0, 2_000);
  const state = String(scope === "commits" ? "committed" : scope === "branches" ? (value.protected ? "protected" : "active") : value.state ?? "open").slice(0, 100);
  const urlValue = value.html_url ?? value.url;
  const updatedValue = value.updated_at ?? value.created_at ?? author?.date ?? (value.committer as Record<string, unknown> | undefined)?.date;
  return {
    scope,
    externalId,
    title,
    state,
    url: typeof urlValue === "string" && /^https?:\/\//.test(urlValue) ? urlValue : null,
    remoteUpdatedAt: typeof updatedValue === "string" && !Number.isNaN(new Date(updatedValue).getTime()) ? new Date(updatedValue).toISOString() : null,
    payload,
  };
}
