import type { RemoteRepository, RemoteRepositoryPage, RemoteSyncScope } from "@pcc/contracts";
import type { RemoteClient } from "./remote-client.js";
import { syncPayloadFromApi } from "./remote-client.js";

export class RemoteApiError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message);
    this.name = "RemoteApiError";
  }
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new RemoteApiError("Gitea 地址仅支持 HTTP 或 HTTPS", 400, "INVALID_REMOTE_URL");
  if (url.username || url.password || url.search || url.hash) throw new RemoteApiError("Gitea 地址不应包含账号、查询参数或片段", 400, "INVALID_REMOTE_URL");
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function repositoryFromPayload(payload: unknown): RemoteRepository {
  const value = payload as Record<string, unknown>;
  const owner = value.owner as Record<string, unknown> | undefined;
  const id = Number(value.id);
  const ownerName = String(owner?.login ?? owner?.username ?? "");
  const name = String(value.name ?? "");
  const fullName = String(value.full_name ?? (ownerName && name ? `${ownerName}/${name}` : ""));
  const htmlUrl = String(value.html_url ?? "");
  const cloneUrl = String(value.clone_url ?? "");
  if (!Number.isSafeInteger(id) || id < 0 || !ownerName || !name || !fullName || !htmlUrl || !cloneUrl) {
    throw new RemoteApiError("Gitea 返回了不完整的仓库数据", 502, "REMOTE_RESPONSE_INVALID");
  }
  return {
    id,
    owner: ownerName,
    name,
    fullName,
    description: String(value.description ?? ""),
    private: Boolean(value.private),
    defaultBranch: String(value.default_branch ?? ""),
    htmlUrl,
    cloneUrl,
    sshUrl: String(value.ssh_url ?? ""),
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : null,
  };
}

export class GiteaClient implements RemoteClient {
  readonly baseUrl: string;

  constructor(baseUrl: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async get(pathname: string) {
    const url = `${this.baseUrl}/api/v1${pathname}`;
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { Accept: "application/json", Authorization: `token ${this.token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const message = error instanceof Error && error.name === "TimeoutError" ? "连接 Gitea 超时" : "连接 Gitea 失败";
      throw new RemoteApiError(message, 502, "REMOTE_UNREACHABLE");
    }
    if (response.status === 401 || response.status === 403) throw new RemoteApiError("Gitea 令牌无效或权限不足", response.status, "REMOTE_AUTH_FAILED");
    if (response.status >= 300 && response.status < 400) throw new RemoteApiError("Gitea API 返回了跨地址重定向", 502, "REMOTE_REDIRECT_REJECTED");
    if (!response.ok) throw new RemoteApiError(`Gitea API 请求失败（${response.status}）`, 502, "REMOTE_API_ERROR");
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new RemoteApiError("Gitea 返回的不是有效 JSON", 502, "REMOTE_RESPONSE_INVALID");
    }
    return { body, headers: response.headers };
  }

  async validate() {
    const [versionResult, userResult] = await Promise.all([this.get("/version"), this.get("/user")]);
    const version = (versionResult.body as Record<string, unknown>)?.version;
    const username = (userResult.body as Record<string, unknown>)?.login ?? (userResult.body as Record<string, unknown>)?.username;
    if (typeof username !== "string" || !username) throw new RemoteApiError("Gitea 返回了不完整的用户数据", 502, "REMOTE_RESPONSE_INVALID");
    return { baseUrl: this.baseUrl, version: typeof version === "string" ? version : null, username };
  }

  private async repositoryBatch(page: number, limit: number) {
    const result = await this.get(`/user/repos?page=${page}&limit=${limit}`);
    if (!Array.isArray(result.body)) throw new RemoteApiError("Gitea 返回了不完整的仓库列表", 502, "REMOTE_RESPONSE_INVALID");
    return {
      items: result.body.map(repositoryFromPayload),
      total: Number(result.headers.get("x-total-count")) || null,
    };
  }

  async listRepositories(query: { q: string; page: number; limit: number }): Promise<RemoteRepositoryPage> {
    if (!query.q) {
      const result = await this.repositoryBatch(query.page, query.limit);
      const total = result.total ?? ((query.page - 1) * query.limit + result.items.length + (result.items.length === query.limit ? 1 : 0));
      return { items: result.items, page: query.page, limit: query.limit, total, hasNext: query.page * query.limit < total };
    }

    const all: RemoteRepository[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const batch = await this.repositoryBatch(page, 50);
      all.push(...batch.items);
      if (batch.items.length < 50 || (batch.total !== null && all.length >= batch.total)) break;
    }
    const needle = query.q.toLocaleLowerCase();
    const matched = all.filter((repository) => `${repository.fullName} ${repository.description}`.toLocaleLowerCase().includes(needle));
    const start = (query.page - 1) * query.limit;
    return { items: matched.slice(start, start + query.limit), page: query.page, limit: query.limit, total: matched.length, hasNext: start + query.limit < matched.length };
  }

  async getRepository(owner: string, repo: string) {
    const result = await this.get(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    return repositoryFromPayload(result.body);
  }

  async syncRepository(owner: string, repo: string, scopes: RemoteSyncScope[]) {
    const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const paths: Record<RemoteSyncScope, string> = { commits: `${root}/commits?limit=50`, branches: `${root}/branches?limit=50`, pull_requests: `${root}/pulls?state=all&limit=50`, issues: `${root}/issues?state=all&type=issues&limit=50`, milestones: `${root}/milestones?state=all&limit=50` };
    const result = new Map<RemoteSyncScope, ReturnType<typeof syncPayloadFromApi>[]>();
    for (const scope of scopes) {
      const response = await this.get(paths[scope]);
      if (!Array.isArray(response.body)) throw new RemoteApiError(`Gitea ${scope} 返回格式无效`, 502, "REMOTE_RESPONSE_INVALID");
      result.set(scope, response.body.map((item) => syncPayloadFromApi(scope, item)).filter((item) => item.externalId));
    }
    return result;
  }
}
