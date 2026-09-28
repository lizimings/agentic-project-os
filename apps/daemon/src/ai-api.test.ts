import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

function audioMultipart() {
  const boundary = "----pcc-voice-test";
  const payload = Buffer.from([
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="idea.webm"\r\n`,
    `Content-Type: audio/webm\r\n\r\n`,
    "synthetic-audio-bytes\r\n",
    `--${boundary}--\r\n`,
  ].join(""));
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(payload.byteLength) } };
}

describe("AI settings and voice transcription API", () => {
  let upstream: Server;
  let upstreamBaseUrl: string;
  let built: Awaited<ReturnType<typeof buildServer>>;
  let received = { authorization: "", contentType: "", body: "", path: "" };

  beforeEach(async () => {
    received = { authorization: "", contentType: "", body: "", path: "" };
    upstream = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        received = {
          authorization: String(request.headers.authorization ?? ""),
          contentType: String(request.headers["content-type"] ?? ""),
          body: Buffer.concat(chunks).toString("utf8"),
          path: request.url ?? "",
        };
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ text: "把语音想法放入 Inbox", languages: [{ code: "zh" }] }));
      });
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    upstreamBaseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1`;
    built = await buildServer({ databaseFilename: ":memory:" });
  });

  afterEach(async () => {
    if (built) await built.app.close();
    await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  });

  it("encrypts the API key and proxies an audio file without exposing the secret", async () => {
    const initial = await built.app.inject({ method: "GET", url: "/api/settings/ai" });
    expect(initial.json()).toMatchObject({ provider: "openai", transcriptionModel: "gpt-transcribe", apiKeyConfigured: false });

    const missingKey = await built.app.inject({ method: "POST", url: "/api/voice/transcriptions", ...audioMultipart() });
    expect(missingKey.statusCode, missingKey.body).toBe(409);
    expect(missingKey.json()).toMatchObject({ error: "AI_API_KEY_REQUIRED" });

    const updated = await built.app.inject({
      method: "PUT",
      url: "/api/settings/ai",
      payload: { provider: "openai_compatible", baseUrl: `${upstreamBaseUrl}/`, transcriptionModel: "gpt-transcribe", apiKey: "sk-local-voice-secret" },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({ provider: "openai_compatible", baseUrl: upstreamBaseUrl, transcriptionModel: "gpt-transcribe", apiKeyConfigured: true, apiKeyHint: "cret" });
    expect(updated.body).not.toContain("sk-local-voice-secret");

    const stored = await built.database.selectFrom("ai_settings").selectAll().executeTakeFirstOrThrow();
    expect(stored.encrypted_api_key).toMatch(/^v1\./);
    expect(stored.encrypted_api_key).not.toContain("sk-local-voice-secret");

    const transcription = await built.app.inject({ method: "POST", url: "/api/voice/transcriptions", ...audioMultipart() });
    expect(transcription.statusCode, transcription.body).toBe(200);
    expect(transcription.json()).toEqual({ text: "把语音想法放入 Inbox", model: "gpt-transcribe", provider: "openai_compatible", languages: [{ code: "zh" }] });
    expect(received.path).toBe("/v1/audio/transcriptions");
    expect(received.authorization).toBe("Bearer sk-local-voice-secret");
    expect(received.contentType).toContain("multipart/form-data; boundary=");
    expect(received.body).toContain('name="model"');
    expect(received.body).toContain("gpt-transcribe");
    expect(received.body).toContain('filename="idea.webm"');

    const events = await built.database.selectFrom("event_log").select(["type", "payload_json"]).where("entity_id", "in", ["ai-settings", "voice-transcription"]).execute();
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["integration.updated", "integration.transcribed"]));
    expect(JSON.stringify(events)).not.toContain("sk-local-voice-secret");
    expect(JSON.stringify(events)).not.toContain("把语音想法放入 Inbox");
  });
});
