import { Schema, model, models } from "mongoose";

/**
 * 用户的多供应商配置(聊天模型)。同一用户可有多个,active 标记当前启用。
 * Embedding 不属于供应商,存于全局 ProviderConfig。
 */
const providerEntrySchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    providerId: { type: String, required: true },
    name: { type: String, required: true },
    providerName: { type: String, default: "openai-compatible" },
    baseUrl: { type: String, required: true },
    apiKey: { type: String, required: true },
    model: { type: String, required: true },
    temperature: { type: Number, default: 0.7, min: 0, max: 2 },
    active: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

providerEntrySchema.index({ userId: 1, providerId: 1 }, { unique: true });

export const ProviderEntryModel =
  models.ProviderEntry ?? model("ProviderEntry", providerEntrySchema);
