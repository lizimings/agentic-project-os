import type { RemoteRepository, RemoteRepositoryPage, RemoteSyncScope } from "@pcc/contracts";
import { RemoteApiError } from "./gitea-client.js";
import type { RemoteClient } from "./remote-client.js";
import { syncPayloadFromApi } from "./remote-client.js";

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new RemoteApiError("GitHub API 地址仅支持 HTTP 或 HTTPS", 400, "INVALID_REMOTE_URL");
  if (url.username || url.password || url.search || url.hash) throw new RemoteApiError("GitHub API 地址不应包含账号、查询参数或片段", 400, "INVALID_REMOTE_URL");
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function repositoryFromPayload(payload: unknown): RemoteRepository {
  const value = payload as Record<string, unknown>;
  const owner = value.owner as Record<string, unknown> | undefined;
  const id = Number(value.id);
  const ownerName = String(owner?.login ?? "");
  const name = String(value.name ?? "");
  const fullName = String(value.full_name ?? (ownerName && name ? `${ownerName}/${name}` : ""));
  const htmlUrl = String(value.html_url ?? "");
  const cloneUrl = String(value.clone_url ?? "");
  if (!Number.isSafeInteger(id) || id < 0 || !ownerName || !name || !fullName || !htmlUrl || !cloneUrl) throw new RemoteApiError("GitHub 返回了不完整的仓库数据", 502, "REMOTE_RESPONSE_INVALID");
  return { id, owner: ownerName, name, fullName, description: String(value.description ?? ""), private: Boolean(value.private), defaultBranch: String(value.default_branch ?? ""), htmlUrl, cloneUrl, sshUrl: String(value.ssh_url ?? ""), updatedAt: typeof value.updated_at === "string" ? value.updated_at : null };
}

export class GitHubClient implements RemoteClient {
  readonly baseUrl: string;

  constructor(baseUrl: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async get(pathname: string) {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${pathname}`, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.token}`, "X-GitHub-Api-Version": "2022-11-28" }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new RemoteApiError(error instanceof Error && error.name === "TimeoutError" ? "连接 GitHub 超时" : "连接 GitHub 失败", 502, "REMOTE_UNREACHABLE");
    }
    if (response.status === 401 || response.status === 403) throw new RemoteApiError("GitHub 令牌无效或权限不足", response.status, "REMOTE_AUTH_FAILED");
    if (response.status >= 300 && response.status < 400) throw new RemoteApiError("GitHub API 返回了重定向", 502, "REMOTE_REDIRECT_REJECTED");
    if (!response.ok) throw new RemoteApiError(`GitHub API 请求失败（${response.status}）`, 502, "REMOTE_API_ERROR");
    try { return { body: await response.json() as unknown, headers: response.headers }; }
    catch { throw new RemoteApiError("GitHub 返回的不是有效 JSON", 502, "REMOTE_RESPONSE_INVALID"); }
  }

  async validate() {
    const result = await this.get("/user");
    const username = (result.body as Record<string, unknown>)?.login;
    if (typeof username !== "string" || !username) throw new RemoteApiError("GitHub 返回了不完整的用户数据", 502, "REMOTE_RESPONSE_INVALID");
    return { baseUrl: this.baseUrl, version: result.headers.get("x-github-api-version-selected") ?? "2022-11-28", username };
  }

  private async repositoryBatch(page: number, limit: number) {
    const result = await this.get(`/user/repos?page=${page}&per_page=${Math.min(100, limit)}&visibility=all&affiliation=owner,collaborator,organization_member&sort=updated`);
    if (!Array.isArray(result.body)) throw new RemoteApiError("GitHub 返回了不完整的仓库列表", 502, "REMOTE_RESPONSE_INVALID");
    return { items: result.body.map(repositoryFromPayload), hasNext: /rel="next"/.test(result.headers.get("link") ?? "") };
  }

  async listRepositories(query: { q: string; page: number; limit: number }): Promise<RemoteRepositoryPage> {
    if (!query.q) {
      const batch = await this.repositoryBatch(query.page, query.limit);
      const total = (query.page - 1) * query.limit + batch.items.length + (batch.hasNext ? 1 : 0);
      return { items: batch.items, page: query.page, limit: query.limit, total, hasNext: batch.hasNext };
    }
    const all: RemoteRepository[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const batch = await this.repositoryBatch(page, 100);
      all.push(...batch.items);
      if (!batch.hasNext) break;
    }
    const needle = query.q.toLocaleLowerCase();
    const matched = all.filter((repository) => `${repository.fullName} ${repository.description}`.toLocaleLowerCase().includes(needle));
    const start = (query.page - 1) * query.limit;
    return { items: matched.slice(start, start + query.limit), page: query.page, limit: query.limit, total: matched.length, hasNext: start + query.limit < matched.length };
  }

  async getRepository(owner: string, repo: string) {
    return repositoryFromPayload((await this.get(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)).body);
  }

  async syncRepository(owner: string, repo: string, scopes: RemoteSyncScope[]) {
    const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const paths: Record<RemoteSyncScope, string> = { commits: `${root}/commits?per_page=50`, branches: `${root}/branches?per_page=100`, pull_requests: `${root}/pulls?state=all&per_page=50`, issues: `${root}/issues?state=all&per_page=50`, milestones: `${root}/milestones?state=all&per_page=50` };
    const result = new Map<RemoteSyncScope, ReturnType<typeof syncPayloadFromApi>[]>();
    for (const scope of scopes) {
      const response = await this.get(paths[scope]);
      if (!Array.isArray(response.body)) throw new RemoteApiError(`GitHub ${scope} 返回格式无效`, 502, "REMOTE_RESPONSE_INVALID");
      const values = scope === "issues" ? response.body.filter((item) => !(item as Record<string, unknown>).pull_request) : response.body;
      result.set(scope, values.map((item) => syncPayloadFromApi(scope, item)).filter((item) => item.externalId));
    }
    return result;
  }
}
