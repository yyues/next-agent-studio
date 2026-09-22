import { Schema, model, models, type InferSchemaType } from "mongoose";

const mcpInvocationLogSchema = new Schema(
  {
    invocationId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    roleId: { type: String, required: true, index: true },
    serverId: { type: String, required: true },
    toolName: { type: String, required: true },
    status: {
      type: String,
      enum: ["success", "error", "timeout", "denied"],
      required: true,
    },
    durationMs: { type: Number, required: true, default: 0 },
    argumentSummary: { type: String, required: true, default: "" },
    resultSummary: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false },
);

mcpInvocationLogSchema.index({ userId: 1, createdAt: -1 });

export type McpInvocationLogDoc = InferSchemaType<typeof mcpInvocationLogSchema>;

export const McpInvocationLogModel =
  models.McpInvocationLog ?? model("McpInvocationLog", mcpInvocationLogSchema);
