import { Schema, model, models, type InferSchemaType } from "mongoose";

const roleProfileSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    roleId: { type: String, required: true },
    displayName: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: true },
    systemPrompt: { type: String, required: true },
    skillIds: { type: [String], required: true, default: [] },
    toolToggles: { type: Map, of: Boolean, default: {} },
    priority: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

roleProfileSchema.index({ userId: 1, roleId: 1 }, { unique: true });

export type RoleProfileDoc = InferSchemaType<typeof roleProfileSchema>;

export const RoleProfileModel =
  models.RoleProfile ?? model("RoleProfile", roleProfileSchema);
