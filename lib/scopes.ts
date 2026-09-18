/**
 * 共享/保留作用域的约定常量。
 *
 * 权限与共享模型(详见 lib/admin.ts):
 * - 内置角色(general/developer)存为 __builtin__ 用户名下的单例共享文档,
 *   所有用户可见;仅管理员可编辑。
 * - 全局 MCP 库行为 __global__ 角色下的 __system__ 用户文档(scope="global")。
 * - 全局 skill 库复用内置角色 general 的 Blob 前缀 skills/general/
 *   (SkillDoc.scope="global")。
 * 以 "__" 开头的 id 不会与 ObjectId/用户邮箱冲突。
 */
export const BUILTIN_USER_ID = "__builtin__";
export const GLOBAL_USER_ID = "__system__";
export const GLOBAL_ROLE_ID = "__global__";

/** 判断 roleId 是否为共享保留 id(全局库伪角色) */
export function isReservedRoleId(roleId: string) {
  return roleId.startsWith("__") && roleId.endsWith("__");
}
