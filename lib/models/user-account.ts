import { Schema, model, models } from "mongoose";

/** 注册用户账号(邮箱为唯一标识,密码 scrypt 哈希存储,绝不存明文) */
const userAccountSchema = new Schema(
  {
    email: { type: String, required: true, index: true },
    passwordHash: { type: String, required: true },
    salt: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);

userAccountSchema.index({ email: 1 }, { unique: true });

export const UserAccountModel =
  models.UserAccount ?? model("UserAccount", userAccountSchema);
