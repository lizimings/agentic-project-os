import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

const repositories = [
  {
    id: 11,
    owner: { login: "acme" },
    name: "repo-a",
    full_name: "acme/repo-a",
    description: "Alpha repository",
    private: true,
    default_branch: "main",
    html_url: "http://gitea.example/acme/repo-a",
    clone_url: "http://gitea.example/acme/repo-a.git",
    ssh_url: "git@gitea.example:acme/repo-a.git",
    updated_at: "2026-08-19T12:00:00.000Z",
  },
  {
    id: 12,
    owner: { login: "acme" },
    name: "repo-b",
    full_name: "acme/repo-b",
    description: "Beta repository",
    private: false,
    default_branch: "develop",
    html_url: "http://gitea.example/acme/repo-b",
    clone_url: "http://gitea.example/acme/repo-b.git",
    ssh_url: "git@gitea.example:acme/repo-b.git",
    updated_at: "2026-08-18T12:00:00.000Z",
  },
];

describe("Gitea integration API", () => {
  let remoteServer: Server;
  let remoteBaseUrl: string;
  let authorizationHeaders: string[];
  let built: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    authorizationHeaders = [];
    remoteServer = createServer((request, response) => {
      authorizationHeaders.push(String(request.headers.authorization ?? ""));
      if (request.headers.authorization !== "token super-secret-token") {
        response.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ message: "unauthorized" }));
        return;
      }
      const url = new URL(request.url ?? "/", "http://fixture");
      response.setHeader("content-type", "application/json");
      if (url.pathname === "/api/v1/version") response.end(JSON.stringify({ version: "1.24.7" }));
      else if (url.pathname === "/api/v1/user") response.end(JSON.stringify({ login: "developer" }));
      else if (url.pathname === "/api/v1/user/repos") {
        const page = Number(url.searchParams.get("page") ?? "1");
        const limit = Number(url.searchParams.get("limit") ?? "20");
        response.setHeader("x-total-count", String(repositories.length));
        response.end(JSON.stringify(repositories.slice((page - 1) * limit, page * limit)));
      } else if (url.pathname === "/api/v1/repos/acme/repo-a") response.end(JSON.stringify(repositories[0]));
      else if (url.pathname === "/api/v1/repos/acme/repo-b") response.end(JSON.stringify(repositories[1]));
      else if (url.pathname === "/api/v1/repos/acme/repo-a/commits") response.end(JSON.stringify([{ sha: "a".repeat(40), html_url: "http://gitea.example/acme/repo-a/commit/a", commit: { message: "feat: gitea sync", author: { date: "2026-08-20T00:00:00Z" } } }]));
      else if (url.pathname === "/api/v1/repos/acme/repo-a/branches") response.end(JSON.stringify([{ name: "main", protected: true }]));
      else if (url.pathname === "/api/v1/repos/acme/repo-a/pulls") response.end(JSON.stringify([{ id: 21, number: 21, title: "Gitea PR", state: "open", html_url: "http://gitea.example/acme/repo-a/pulls/21" }]));
      else if (url.pathname === "/api/v1/repos/acme/repo-a/issues") response.end(JSON.stringify([{ id: 22, number: 22, title: "Gitea issue", state: "open", html_url: "http://gitea.example/acme/repo-a/issues/22" }]));
      else if (url.pathname === "/api/v1/repos/acme/repo-a/milestones") response.end(JSON.stringify([{ id: 23, number: 23, title: "Gitea M1", state: "open", html_url: "http://gitea.example/acme/repo-a/milestones/23" }]));
      else response.writeHead(404).end(JSON.stringify({ message: "not found" }));
    });
    await new Promise<void>((resolve) => remoteServer.listen(0, "127.0.0.1", resolve));
    remoteBaseUrl = `http://127.0.0.1:${(remoteServer.address() as AddressInfo).port}`;
    built = await buildServer({ databaseFilename: ":memory:" });
  });

  afterEach(async () => {
    await built.app.close();
    await new Promise<void>((resolve, reject) => remoteServer.close((error) => error ? reject(error) : resolve()));
  });

  it("validates Gitea, encrypts the token, lists repositories and binds one to a Project", async () => {
    const connected = await built.app.inject({
      method: "PUT",
      url: "/api/integrations/gitea",
      payload: { baseUrl: `${remoteBaseUrl}/`, token: "super-secret-token" },
    });
    expect(connected.statusCode).toBe(200);
    expect(connected.json()).toMatchObject({ provider: "gitea", baseUrl: remoteBaseUrl, username: "developer", instanceVersion: "1.24.7", tokenHint: "oken" });
    expect(JSON.stringify(connected.json())).not.toContain("super-secret-token");
    expect(authorizationHeaders).toEqual(["token super-secret-token", "token super-secret-token"]);

    const stored = await built.database.selectFrom("remote_connections").selectAll().executeTakeFirstOrThrow();
    expect(stored.encrypted_token).toMatch(/^v1\./);
    expect(stored.encrypted_token).not.toContain("super-secret-token");
    expect(stored.token_hint).toBe("oken");

    const page = await built.app.inject({ method: "GET", url: "/api/integrations/gitea/repositories?q=repo&page=1&limit=1" });
    expect(page.statusCode).toBe(200);
    expect(page.json()).toMatchObject({ page: 1, limit: 1, total: 2, hasNext: true });
    expect(page.json().items[0]).toMatchObject({ fullName: "acme/repo-a", defaultBranch: "main", private: true });

    const connectionId = connected.json().id;
    const imported = await built.app.inject({
      method: "POST",
      url: "/api/imports/gitea",
      payload: {
        connectionId,
        fullName: "acme/repo-a",
        project: { name: "Imported from Gitea", description: "真实仓库导入" },
        syncScopes: ["commits", "branches", "pull_requests", "issues", "milestones"],
      },
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json().project).toMatchObject({ name: "Imported from Gitea", description: "真实仓库导入" });
    expect(imported.json().binding).toMatchObject({ fullName: "acme/repo-a", projectId: imported.json().project.id });
    expect(imported.json().syncJob).toMatchObject({ status: "succeeded", progressCurrent: 5, progressTotal: 5 });

    const bound = await built.app.inject({
      method: "PUT",
      url: "/api/projects/pixelmind/remote",
      payload: { connectionId, fullName: "acme/repo-b" },
    });
    expect(bound.statusCode).toBe(200);
    expect(bound.json()).toMatchObject({ projectId: "pixelmind", provider: "gitea", fullName: "acme/repo-b", defaultBranch: "develop" });
    expect((await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/remote" })).json().fullName).toBe("acme/repo-b");

    const disconnected = await built.app.inject({ method: "DELETE", url: "/api/integrations/gitea" });
    expect(disconnected.statusCode).toBe(204);
    expect((await built.app.inject({ method: "GET", url: "/api/integrations/gitea" })).json()).toBeNull();
    expect((await built.app.inject({ method: "GET", url: "/api/projects/pixelmind/remote" })).json()).toBeNull();

    const eventRows = await built.database.selectFrom("event_log").select(["type", "payload_json"]).orderBy("sequence", "asc").execute();
    expect(eventRows.map((event) => event.type)).toEqual(expect.arrayContaining(["integration.connected", "remote_repository.bound", "integration.disconnected"]));
    expect(JSON.stringify(eventRows)).not.toContain("super-secret-token");
  });

  it("maps invalid credentials to an explicit authentication error", async () => {
    const response = await built.app.inject({
      method: "PUT",
      url: "/api/integrations/gitea",
      payload: { baseUrl: remoteBaseUrl, token: "wrong-token" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "REMOTE_AUTH_FAILED" });
  });
});
