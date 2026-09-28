import type { AiSettings, AiProvider } from "@pcc/contracts";
import type { DatabaseExecutor, PccDatabase } from "./types.js";

export interface SaveAiSettingsInput {
  provider: AiProvider;
  baseUrl: string;
  transcriptionModel: string;
  encryptedApiKey: string | null;
  apiKeyHint: string | null;
  updatedAt: string;
}

export interface StoredAiSettings extends AiSettings {
  encryptedApiKey: string | null;
}

const defaults: AiSettings = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  transcriptionModel: "gpt-transcribe",
  apiKeyConfigured: false,
  apiKeyHint: null,
  updatedAt: null,
};

export class AiSettingsRepository {
  constructor(private readonly db: PccDatabase) {}

  get database() {
    return this.db;
  }

  async get(executor: DatabaseExecutor = this.db): Promise<StoredAiSettings> {
    const row = await executor.selectFrom("ai_settings").selectAll().where("id", "=", "default").executeTakeFirst();
    if (!row) return { ...defaults, encryptedApiKey: null };
    return {
      provider: row.provider as AiProvider,
      baseUrl: row.base_url,
      transcriptionModel: row.transcription_model,
      apiKeyConfigured: Boolean(row.encrypted_api_key),
      apiKeyHint: row.api_key_hint,
      updatedAt: row.updated_at,
      encryptedApiKey: row.encrypted_api_key,
    };
  }

  async save(input: SaveAiSettingsInput, executor: DatabaseExecutor = this.db) {
    const existing = await executor.selectFrom("ai_settings").select("created_at").where("id", "=", "default").executeTakeFirst();
    await executor.insertInto("ai_settings").values({
      id: "default",
      provider: input.provider,
      base_url: input.baseUrl,
      transcription_model: input.transcriptionModel,
      encrypted_api_key: input.encryptedApiKey,
      api_key_hint: input.apiKeyHint,
      created_at: existing?.created_at ?? input.updatedAt,
      updated_at: input.updatedAt,
    }).onConflict((conflict) => conflict.column("id").doUpdateSet({
      provider: input.provider,
      base_url: input.baseUrl,
      transcription_model: input.transcriptionModel,
      encrypted_api_key: input.encryptedApiKey,
      api_key_hint: input.apiKeyHint,
      updated_at: input.updatedAt,
    })).execute();
    return this.get(executor);
  }
}
