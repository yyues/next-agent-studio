import { Schema, model, models, type InferSchemaType } from "mongoose";

const providerConfigSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    providerName: { type: String, required: true, default: "openai-compatible" },
    baseUrl: { type: String, required: true },
    apiKey: { type: String, required: true },
    model: { type: String, required: true },
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
