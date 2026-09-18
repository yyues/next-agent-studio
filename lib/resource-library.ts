/**
 * "从库中选择"的可选池:全局库 + 用户自己的其他角色。
 * 排除当前正在编辑的角色自己的资源;返回项带来源分组信息。
 */
import { connectToMongo } from "@/lib/mongodb";
import { SkillDocModel } from "@/lib/models/skill-doc";
import { McpServerModel } from "@/lib/models/mcp-server";
import { RoleProfileModel } from "@/lib/models/role-profile";
import { BUILTIN_USER_ID, GLOBAL_ROLE_ID } from "@/lib/scopes";
import { listGlobalMcpServers } from "@/lib/mcp/client";
import { builtinRoleIdList } from "@/lib/server-settings";

export type LibrarySkill = {
  /** 引用键(`${srcRoleId}/${skillId}`),保存时写入 RoleProfile.skillIds */
  key: string;
  skillId: string;
  title: string;
  description: string;
  version: string;
  source: "global" | "role";
  /** 来源角色名(global 为 null,前端显示"全局库") */
  roleName: string | null;
};

export type LibraryMcp = {
  key: string;
  serverId: string;
  name: string;
  url: string;
  enabled: boolean;
  source: "global" | "role";
  roleName: string | null;
};

export async function listSelectableLibrary(userId: string, excludeRoleId?: string) {
  await connectToMongo();

  // 用户自己的其他私有角色(含已发布,发布者视角仍可引用);
  // 内置 roleId 的历史个人副本不算自己的角色(以 __builtin__ 单例为准)
  const roleDocs = await RoleProfileModel.find({
    userId,
    roleId: {
      $nin: [
        ...builtinRoleIdList(),
        ...(excludeRoleId ? [excludeRoleId] : []),
      ],
    },
  })
    .select("roleId displayName")
    .lean();
  const ownRoleIds = roleDocs.map((r) => String(r.roleId));
  const roleNameByRoleId = new Map(
    roleDocs.map((r) => [String(r.roleId), String(r.displayName)]),
  );

  const [globalSkillDocs, ownSkillDocs, globalMcps, ownMcpDocs] =
    await Promise.all([
      SkillDocModel.find({ scope: "global", enabled: true }).lean(),
      ownRoleIds.length > 0
        ? SkillDocModel.find({
            roleId: { $in: ownRoleIds },
            scope: "role",
            enabled: true,
          }).lean()
        : Promise.resolve([]),
      listGlobalMcpServers().catch(() => []),
      ownRoleIds.length > 0
        ? McpServerModel.find({
            userId,
            roleId: { $in: ownRoleIds },
            scope: "role",
          }).lean()
        : Promise.resolve([]),
    ]);

  const skills: LibrarySkill[] = [
    ...globalSkillDocs.map((d) => ({
      key: `${String(d.roleId)}/${String(d.skillId)}`,
      skillId: String(d.skillId),
      title: String(d.title),
      description: String(d.description ?? ""),
      version: String(d.version ?? "1.0.0"),
      source: "global" as const,
      roleName: null,
    })),
    ...ownSkillDocs.map((d) => ({
      key: `${String(d.roleId)}/${String(d.skillId)}`,
      skillId: String(d.skillId),
      title: String(d.title),
      description: String(d.description ?? ""),
      version: String(d.version ?? "1.0.0"),
      source: "role" as const,
      roleName: roleNameByRoleId.get(String(d.roleId)) ?? String(d.roleId),
    })),
  ];

  const mcps: LibraryMcp[] = [
    ...globalMcps.map((m) => ({
      key: `${GLOBAL_ROLE_ID}/${m.serverId}`,
      serverId: m.serverId,
      name: m.name,
      url: m.url,
      enabled: m.enabled,
      source: "global" as const,
      roleName: null,
    })),
    ...ownMcpDocs.map((d) => ({
      key: `${String(d.roleId)}/${String(d.serverId)}`,
      serverId: String(d.serverId),
      name: String(d.name),
      url: String(d.url),
      enabled: Boolean(d.enabled),
      source: "role" as const,
      roleName: roleNameByRoleId.get(String(d.roleId)) ?? String(d.roleId),
    })),
  ];

  return { skills, mcps };
}

/** 内置单例用户的角色名查询兜底(暂未使用,保留给列表展示扩展) */
export { BUILTIN_USER_ID };
