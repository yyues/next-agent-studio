import { Schema, model, models, type InferSchemaType } from "mongoose";

const userSettingSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    currentRoleId: { type: String, required: true, default: "general" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSettingSchema.index({ userId: 1 }, { unique: true });

export type UserSettingDoc = InferSchemaType<typeof userSettingSchema>;

export const UserSettingModel =
  models.UserSetting ?? model("UserSetting", userSettingSchema);
