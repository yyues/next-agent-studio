import { ObjectId } from "mongodb";

export interface UserDoc {
  _id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

export interface ConversationDoc {
  _id: ObjectId;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

// 用户自定义 provider 配置（apiKey 加密存储）
export interface ProviderSettingDoc {
  _id?: ObjectId;
  userId: string; // 唯一
  baseUrl: string;
  model: string;
  apiKeyEnc: string; // 加密后的 API Key
  apiKeyHint: string; // 掩码，供前端展示是否已设置
  createdAt: Date;
  updatedAt: Date;
}

// 持久化到 MongoDB 的消息（与 pi-agent-core 的 AgentMessage 结构兼容）
export interface MessageDoc {
  _id?: ObjectId;
  conversationId: string;
  userId: string;
  role: "user" | "assistant" | "toolResult" | string;
  content: unknown; // AgentMessage.content
  // 保留 pi-agent-core 中可能出现的额外字段
  [key: string]: unknown;
}

export interface ApiError {
  error: string;
}
