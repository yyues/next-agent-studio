import { ObjectId } from "mongodb";

export type UserRole = "user" | "admin";

export interface UserDoc {
  _id: string;
  email: string;
  name: string;
  passwordHash: string;
  /** 用户角色：user 普通用户 / admin 管理员 */
  role?: UserRole;
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

/**
 * 客户（Customer）：企业/个人客户信息，与用户（User）互相独立
 *  - 试用系统：trial 状态 + 到期日
 *  - 延期：续期到新到期日
 *  - 禁用：status=disabled 后无法继续使用
 */
export type CustomerStatus = "active" | "trial" | "expired" | "disabled";

export interface CustomerDoc {
  _id?: ObjectId;
  /** 客户名称（公司/个人） */
  name: string;
  /** 联系人邮箱 */
  email?: string;
  /** 联系人手机号 */
  phone?: string;
  /** 备注 */
  remark?: string;
  /** 当前状态 */
  status: CustomerStatus;
  /** 试用/正式 到期时间；永久有效可设为 null */
  expireAt?: Date | null;
  /** 关联的系统用户 ID（如果该客户也注册了系统账户） */
  linkedUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
