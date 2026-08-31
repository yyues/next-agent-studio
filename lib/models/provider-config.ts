import { Schema, model, models, type InferSchemaType } from "mongoose";

const providerConfigSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    providerName: { type: String, required: true, default: "openai-compatible" },
    baseUrl: { type: String, required: true },
    apiKey: { type: String, required: true },
    model: { type: String, required: true },
    // 用于 RAG 检索的 embedding 模型 id
    // OpenRouter 用 "openai/text-embedding-3-small"；OpenAI 直连用 "text-embedding-3-small"
    embeddingModel: { type: String, default: "" },
    // embedding 独立端点：留空则回退到主 baseUrl/apiKey
    // 当中转站不提供 /embeddings 或 embedding 走另一套地址/密钥时填写
    embeddingBaseUrl: { type: String, default: "" },
    embeddingApiKey: { type: String, default: "" },
    temperature: { type: Number, default: 0.7, min: 0, max: 2 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

providerConfigSchema.index({ userId: 1 }, { unique: true });

export type ProviderConfigDoc = InferSchemaType<typeof providerConfigSchema>;

export const ProviderConfigModel =
  models.ProviderConfig ?? model("ProviderConfig", providerConfigSchema);
