import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

const repository = {
  id: 91,
  owner: { login: "acme" },
  name: "orbit",
  full_name: "acme/orbit",
  description: "Remote synchronization fixture",
  private: true,
  default_branch: "main",
  html_url: "https://github.example/acme/orbit",
  clone_url: "https://github.example/acme/orbit.git",
  ssh_url: "git@github.example:acme/orbit.git",
  updated_at: "2026-08-20T00:00:00.000Z",
};

const scopePayloads: Record<string, unknown[]> = {
  commits: [{ sha: "a".repeat(40), html_url: `${repository.html_url}/commit/${"a".repeat(40)}`, commit: { message: "feat: remote sync", author: { date: "2026-08-20T00:00:00Z" } } }],
  branches: [{ name: "main", protected: true, commit: { sha: "a".repeat(40) } }],
  pulls: [{ id: 3, number: 3, title: "Ship remote sync", state: "open", html_url: `${repository.html_url}/pull/3`, updated_at: "2026-08-20T01:00:00Z" }],
  issues: [
    { id: 4, number: 4, title: "Review webhook", state: "open", html_url: `${repository.html_url}/issues/4`, updated_at: "2026-08-20T02:00:00Z" },
    { id: 5, number: 5, title: "PR-shaped issue", state: "open", pull_request: {}, html_url: `${repository.html_url}/issues/5` },
  ],
  milestones: [{ id: 6, number: 6, title: "M1", state: "open", html_url: `${repository.html_url}/milestone/6`, updated_at: "2026-08-20T03:00:00Z" }],
};

describe("GitHub remote import, sync and webhook API", () => {
  let fixture: Server;
  let baseUrl: string;
  let built: Awaited<ReturnType<typeof buildServer>>;
  let failNextIssues: boolean;

  beforeEach(async () => {
    failNextIssues = false;
    fixture = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.headers.authorization !== "Bearer github-secret-token") {
        response.writeHead(401).end(JSON.stringify({ message: "unauthorized" }));
        return;
      }
      const url = new URL(request.url ?? "/", "http://fixture");
      if (url.pathname === "/user") {
        response.setHeader("x-github-api-version-selected", "2022-11-28");
        response.end(JSON.stringify({ login: "octo-dev" }));
      } else if (url.pathname === "/user/repos") {
        response.end(JSON.stringify([repository]));
      } else if (url.pathname === "/repos/acme/orbit") {
        response.end(JSON.stringify(repository));
      } else {
        const scope = Object.keys(scopePayloads).find((name) => url.pathname === `/repos/acme/orbit/${name}`);
        if (scope === "issues" && failNextIssues) {
          failNextIssues = false;
          response.writeHead(503).end(JSON.stringify({ message: "temporary" }));
        } else if (scope) {
          response.end(JSON.stringify(scopePayloads[scope]));
        } else {
          response.writeHead(404).end(JSON.stringify({ message: "not found" }));
        }
      }
    });
    await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
    built = await buildServer({ databaseFilename: ":memory:", seed: true });
  });

  afterEach(async () => {
    await built.app.close();
    await new Promise<void>((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  });

  async function connectAndImport() {
    const connected = await built.app.inject({ method: "PUT", url: "/api/integrations/github", payload: { baseUrl, token: "github-secret-token" } });
    expect(connected.statusCode).toBe(200);
    expect(connected.json()).toMatchObject({ provider: "github", username: "octo-dev" });
    const connectionId = connected.json().id as string;
    const scopes = ["commits", "branches", "pull_requests", "issues", "milestones"];
    const preview = await built.app.inject({ method: "POST", url: "/api/imports/remote/preflight", payload: { connectionId, fullName: "acme/orbit", projectName: "Orbit", syncScopes: scopes } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ provider: "github", canImport: true, conflicts: [] });
    const imported = await built.app.inject({ method: "POST", url: "/api/imports/remote", payload: { connectionId, fullName: "acme/orbit", project: { name: "Orbit" }, syncScopes: scopes } });
    expect(imported.statusCode).toBe(201);
    expect(imported.json().syncJob).toMatchObject({ status: "succeeded", progressCurrent: 5, progressTotal: 5 });
    return { projectId: imported.json().project.id as string, connectionId, scopes };
  }

  it("imports all scopes, detects conflicts, persists progress and retries a transient failure", async () => {
    const { projectId, connectionId, scopes } = await connectAndImport();
    const items = await built.app.inject({ method: "GET", url: `/api/projects/${projectId}/remote/items` });
    expect(items.statusCode).toBe(200);
    expect(items.json().items).toHaveLength(5);
    expect(new Set(items.json().items.map((item: { scope: string }) => item.scope))).toEqual(new Set(scopes));

    const conflict = await built.app.inject({ method: "POST", url: "/api/imports/remote/preflight", payload: { connectionId, fullName: "acme/orbit", projectName: "Orbit", syncScopes: scopes } });
    expect(conflict.json().canImport).toBe(false);
    expect(conflict.json().conflicts.map((item: { type: string }) => item.type)).toEqual(expect.arrayContaining(["project_name", "remote_already_bound"]));

    failNextIssues = true;
    const failed = await built.app.inject({ method: "POST", url: `/api/projects/${projectId}/remote/sync`, payload: { scopes: ["commits", "issues"] } });
    expect(failed.statusCode).toBe(200);
    expect(failed.json()).toMatchObject({ status: "failed", attempt: 1, progressCurrent: 1, progressTotal: 2, error: expect.stringContaining("503") });
    const retried = await built.app.inject({ method: "POST", url: `/api/projects/${projectId}/remote/sync-jobs/${failed.json().id}/retry` });
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toMatchObject({ status: "succeeded", attempt: 2, trigger: "retry", scopes: ["issues"], progressCurrent: 1, progressTotal: 1 });
    const jobs = await built.app.inject({ method: "GET", url: `/api/projects/${projectId}/remote/sync-jobs` });
    expect(jobs.json().items.map((job: { status: string }) => job.status)).toEqual(expect.arrayContaining(["failed", "succeeded"]));
  });

  it("validates the exact raw webhook body, records rejection and deduplicates delivery IDs", async () => {
    const { projectId } = await connectAndImport();
    const configured = await built.app.inject({ method: "PUT", url: `/api/projects/${projectId}/webhook`, payload: { enabled: true } });
    expect(configured.statusCode).toBe(200);
    const secret = configured.json().secret as string;
    expect(secret).toHaveLength(64);
    const raw = JSON.stringify({ ref: "refs/heads/main", after: "b".repeat(40) });
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    const headers = { "content-type": "application/json", "x-github-delivery": "delivery-1", "x-github-event": "push", "x-hub-signature-256": signature };
    const accepted = await built.app.inject({ method: "POST", url: `/api/webhooks/github/${projectId}`, headers, payload: raw });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ duplicate: false, delivery: { status: "accepted", signatureValid: true }, syncJob: { trigger: "webhook", status: "succeeded" } });
    const duplicate = await built.app.inject({ method: "POST", url: `/api/webhooks/github/${projectId}`, headers, payload: raw });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ duplicate: true, delivery: { status: "duplicate" } });

    const rejected = await built.app.inject({ method: "POST", url: `/api/webhooks/github/${projectId}`, headers: { ...headers, "x-github-delivery": "delivery-2", "x-hub-signature-256": `sha256=${"0".repeat(64)}` }, payload: raw });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json()).toMatchObject({ error: "INVALID_WEBHOOK_SIGNATURE" });
    const deliveries = await built.app.inject({ method: "GET", url: `/api/projects/${projectId}/webhook/deliveries` });
    expect(deliveries.json().items).toHaveLength(2);
    expect(deliveries.json().items).toEqual(expect.arrayContaining([expect.objectContaining({ deliveryId: "delivery-2", status: "rejected", signatureValid: false })]));
  });
});
