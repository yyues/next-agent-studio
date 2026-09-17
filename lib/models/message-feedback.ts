import { Schema, model, models } from "mongoose";

/**
 * 消息级反馈(👍/👎)。按 userId+conversationId+messageId 唯一,
 * 重复提交即覆盖,用于按角色聚合质量数据。
 */
const messageFeedbackSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true },
    messageId: { type: String, required: true },
    roleId: { type: String, default: "general", index: true },
    type: { type: String, enum: ["positive", "negative"], required: true },
    /** 消息文本快照,便于离线分析时无需回查会话 */
    snapshot: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

messageFeedbackSchema.index(
  { userId: 1, conversationId: 1, messageId: 1 },
  { unique: true },
);

export const MessageFeedbackModel =
  models.MessageFeedback ?? model("MessageFeedback", messageFeedbackSchema);
