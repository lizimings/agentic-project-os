import type { AiSettings, EventEnvelope, UpdateAiSettingsInput, VoiceTranscription } from "@pcc/contracts";
import { AiSettingsRepository, CoreRepository } from "@pcc/database";
import { createCoreEvent, type CoreActor } from "@pcc/domain";
import { EventBroker } from "./event-broker.js";
import type { SecretCipher } from "./secret-cipher.js";

export class AiServiceError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message);
  }
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new AiServiceError("AI 服务地址仅支持 HTTP 或 HTTPS", 400, "INVALID_AI_BASE_URL");
  if (url.username || url.password || url.search || url.hash) throw new AiServiceError("AI 服务地址不应包含账号、查询参数或片段", 400, "INVALID_AI_BASE_URL");
  return url.toString().replace(/\/$/, "");
}

function publicSettings(settings: Awaited<ReturnType<AiSettingsRepository["get"]>>): AiSettings {
  const { encryptedApiKey: _encryptedApiKey, ...safe } = settings;
  return safe;
}

export class AiService {
  constructor(
    private readonly repository: AiSettingsRepository,
    private readonly coreRepository: CoreRepository,
    private readonly events: EventBroker,
    private readonly secrets: SecretCipher,
  ) {}

  private publish(events: EventEnvelope[]) {
    events.forEach((event) => this.events.publish(event));
  }

  async getSettings() {
    return publicSettings(await this.repository.get());
  }

  async updateSettings(input: UpdateAiSettingsInput, actor: CoreActor, correlationId: string) {
    const current = await this.repository.get();
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    let encryptedApiKey = current.encryptedApiKey;
    let apiKeyHint = current.apiKeyHint;
    if (input.clearApiKey) {
      encryptedApiKey = null;
      apiKeyHint = null;
    } else if (input.apiKey) {
      encryptedApiKey = await this.secrets.encrypt(input.apiKey);
      apiKeyHint = input.apiKey.slice(-4).padStart(4, "•");
    }
    const event = createCoreEvent("integration", "ai-settings", "updated", actor, correlationId, {
      provider: input.provider,
      baseUrl,
      transcriptionModel: input.transcriptionModel,
      apiKeyConfigured: Boolean(encryptedApiKey),
      apiKeyHint,
    });
    const saved = await this.repository.database.transaction().execute(async (transaction) => {
      const settings = await this.repository.save({
        provider: input.provider,
        baseUrl,
        transcriptionModel: input.transcriptionModel,
        encryptedApiKey,
        apiKeyHint,
        updatedAt: event.occurredAt,
      }, transaction);
      await this.coreRepository.appendEvent(event, transaction);
      return settings;
    });
    this.publish([event]);
    return publicSettings(saved);
  }

  async transcribe(
    audio: { buffer: Buffer; filename: string; mimetype: string },
    actor: CoreActor,
    correlationId: string,
  ): Promise<VoiceTranscription> {
    const settings = await this.repository.get();
    if (!settings.encryptedApiKey) throw new AiServiceError("请先在全局设置中配置语音服务 API Key", 409, "AI_API_KEY_REQUIRED");
    const apiKey = await this.secrets.decrypt(settings.encryptedApiKey);
    const form = new FormData();
    const audioBytes = new Uint8Array(audio.buffer.byteLength);
    audioBytes.set(audio.buffer);
    form.append("file", new Blob([audioBytes], { type: audio.mimetype }), audio.filename || "recording.webm");
    form.append("model", settings.transcriptionModel);
    const endpoint = `${settings.baseUrl.replace(/\/$/, "")}/audio/transcriptions`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(90_000),
        redirect: "error",
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new AiServiceError(timedOut ? "语音转写超时" : "语音转写服务连接失败", 502, timedOut ? "VOICE_TRANSCRIPTION_TIMEOUT" : "VOICE_TRANSCRIPTION_UNREACHABLE");
    }
    const body = await response.json().catch(() => null) as { text?: unknown; languages?: unknown; error?: { message?: unknown } } | null;
    if (!response.ok) {
      const message = typeof body?.error?.message === "string" ? body.error.message : `上游语音服务返回 ${response.status}`;
      throw new AiServiceError(message, response.status === 401 || response.status === 403 ? 401 : 502, response.status === 401 || response.status === 403 ? "VOICE_TRANSCRIPTION_AUTH_FAILED" : "VOICE_TRANSCRIPTION_UPSTREAM_ERROR");
    }
    if (!body || typeof body.text !== "string") throw new AiServiceError("语音服务返回了不完整的转写结果", 502, "VOICE_TRANSCRIPTION_INVALID_RESPONSE");
    const languages = Array.isArray(body.languages)
      ? body.languages.filter((entry): entry is { code: string } => Boolean(entry) && typeof (entry as { code?: unknown }).code === "string")
      : undefined;
    const result: VoiceTranscription = {
      text: body.text,
      model: settings.transcriptionModel,
      provider: settings.provider,
      ...(languages ? { languages } : {}),
    };
    const event = createCoreEvent("integration", "voice-transcription", "transcribed", actor, correlationId, {
      provider: settings.provider,
      model: settings.transcriptionModel,
      bytes: audio.buffer.byteLength,
      mimetype: audio.mimetype,
      characters: result.text.length,
    });
    await this.coreRepository.appendEvent(event);
    this.publish([event]);
    return result;
  }
}
