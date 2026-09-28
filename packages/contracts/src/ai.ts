import { z } from "zod";

export const AiProviderSchema = z.enum(["openai", "openai_compatible"]);

export const AiSettingsSchema = z.object({
  provider: AiProviderSchema,
  baseUrl: z.string().url(),
  transcriptionModel: z.string().min(1).max(120),
  apiKeyConfigured: z.boolean(),
  apiKeyHint: z.string().nullable(),
  updatedAt: z.string().datetime().nullable(),
});

export const UpdateAiSettingsSchema = z.object({
  provider: AiProviderSchema,
  baseUrl: z.string().url().max(2_048),
  transcriptionModel: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(8).max(8_192).optional(),
  clearApiKey: z.boolean().optional().default(false),
});

export const VoiceTranscriptionSchema = z.object({
  text: z.string(),
  model: z.string(),
  provider: AiProviderSchema,
  languages: z.array(z.object({ code: z.string() })).optional(),
});

export type AiProvider = z.infer<typeof AiProviderSchema>;
export type AiSettings = z.infer<typeof AiSettingsSchema>;
export type UpdateAiSettingsInput = z.infer<typeof UpdateAiSettingsSchema>;
export type VoiceTranscription = z.infer<typeof VoiceTranscriptionSchema>;
