import { Schema, model, models } from "mongoose";

/**
 * 对话历史。messages 全量存为 Mixed 数组(UIMessage[]),
 * 单用户单会话写入频率低,无需按消息分文档。
 */
const conversationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true },
    roleId: { type: String, default: "general" },
    title: { type: String, default: "" },
    messages: { type: Schema.Types.Mixed, default: [] },
  },
  {
    timestamps: true, // createdAt/updatedAt,列表按 updatedAt 倒序
    versionKey: false,
  },
);

conversationSchema.index(
  { userId: 1, conversationId: 1 },
  { unique: true },
);

export const ConversationModel =
  models.Conversation ?? model("Conversation", conversationSchema);
