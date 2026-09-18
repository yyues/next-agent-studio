import { Schema, model, models } from "mongoose";

/** 注册用户账号(邮箱为唯一标识,密码 scrypt 哈希存储,绝不存明文) */
const userAccountSchema = new Schema(
  {
    email: { type: String, required: true, index: true },
    passwordHash: { type: String, required: true },
    salt: { type: String, required: true },
    /** 管理员标记(手动改库设定):可编辑通用角色、维护全局 skill/MCP 库 */
    isAdmin: { type: Boolean, default: false },
    /** 当前选中角色(原独立 UserSetting 表已并入);无账号的 fallback 用户不持久化 */
    currentRoleId: { type: String, default: "general" },
  },
  { timestamps: true, versionKey: false },
);

userAccountSchema.index({ email: 1 }, { unique: true });

export const UserAccountModel =
  models.UserAccount ?? model("UserAccount", userAccountSchema);
