import type { FastifyInstance } from "fastify";
import { UpdateAiSettingsSchema } from "@pcc/contracts";
import { actorFromRequest, correlationIdFromRequest } from "./actor.js";
import { AiService, AiServiceError } from "./ai-service.js";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export async function registerAiRoutes(app: FastifyInstance, ai: AiService) {
  app.get("/api/settings/ai", async () => ai.getSettings());

  app.put("/api/settings/ai", async (request) => ai.updateSettings(UpdateAiSettingsSchema.parse(request.body), actorFromRequest(request), correlationIdFromRequest(request)));

  app.post("/api/voice/transcriptions", async (request) => {
    const file = await request.file({ limits: { files: 1, fileSize: MAX_AUDIO_BYTES } });
    if (!file) throw new AiServiceError("请选择一段音频", 400, "VOICE_FILE_REQUIRED");
    if (!file.mimetype.startsWith("audio/") && file.mimetype !== "application/octet-stream") {
      throw new AiServiceError("上传内容不是受支持的音频", 415, "VOICE_FILE_TYPE_UNSUPPORTED");
    }
    const buffer = await file.toBuffer();
    if (!buffer.byteLength) throw new AiServiceError("录音内容为空", 400, "VOICE_FILE_EMPTY");
    return ai.transcribe({ buffer, filename: file.filename, mimetype: file.mimetype }, actorFromRequest(request), correlationIdFromRequest(request));
  });
}
