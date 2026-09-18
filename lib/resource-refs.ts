/**
 * 资源引用键(`${srcRoleId}/${id}`)的解析、校验与读取。
 *
 * 可引用来源:全局库(skill: scope=global;MCP: __global__ 伪角色)
 * 与用户自己的其他角色;其他用户的私有资源不可引用——写入时校验并
 * 静默丢弃非法项,读取时按存在性过滤(来源被删后引用自动失效)。
 */
import { connectToMongo } from "@/lib/mongodb";
import { SkillDocModel } from "@/lib/models/skill-doc";
import { McpServerModel } from "@/lib/models/mcp-server";
import { RoleProfileModel } from "@/lib/models/role-profile";
import { GLOBAL_ROLE_ID } from "@/lib/scopes";

export type ResourceRef = { srcRoleId: string; id: string };

export function parseResourceRef(ref: string): ResourceRef | null {
  const idx = ref.indexOf("/");
  if (idx <= 0 || idx === ref.length - 1) return null;
  return { srcRoleId: ref.slice(0, idx), id: ref.slice(idx + 1) };
}

export function toRefKey(srcRoleId: string, id: string) {
  return `${srcRoleId}/${id}`;
}

/** 校验 skill 引用列表,返回合法子集(全局库或自己角色下的 skill) */
export async function validateSkillRefs(
  userId: string,
  refs: string[],
): Promise<string[]> {
  const parsed = parseRefs(refs);
  if (parsed.length === 0) return [];

  await connectToMongo();
  const [docs, owned] = await Promise.all([
    SkillDocModel.find({
      $or: parsed.map(({ p }) => ({ roleId: p.srcRoleId, skillId: p.id })),
    }).lean(),
    ownedRoleIds(
      userId,
      parsed.map(({ p }) => p.srcRoleId),
    ),
  ]);

  return parsed
    .filter(({ p }) => {
      const doc = docs.find(
        (d) => d.roleId === p.srcRoleId && d.skillId === p.id,
      );
      return Boolean(doc && (doc.scope === "global" || owned.has(p.srcRoleId)));
    })
    .map(({ ref }) => ref);
}

/** 校验 MCP 引用列表(__global__/serverId 为全局;其余须为用户自己角色下的) */
export async function validateMcpRefs(
  userId: string,
  refs: string[],
): Promise<string[]> {
  const parsed = parseRefs(refs);
  if (parsed.length === 0) return [];

  await connectToMongo();
  const docs = await McpServerModel.find({
    $or: mcpRefFilters(userId, parsed),
  }).lean();

  return parsed
    .filter(({ p }) =>
      docs.some((d) =>
        p.srcRoleId === GLOBAL_ROLE_ID
          ? d.scope === "global" && d.serverId === p.id
          : d.roleId === p.srcRoleId && d.serverId === p.id,
      ),
    )
    .map(({ ref }) => ref);
}

/** 按引用键读取 skill 元数据(读取时信任写入校验;不存在的跳过) */
export async function findSkillDocsByRefs(
  refs: string[],
): Promise<Array<Record<string, unknown> & { skillId: string; roleId: string }>> {
  const parsed = parseRefs(refs);
  if (parsed.length === 0) return [];
  await connectToMongo();
  const docs = await SkillDocModel.find({
    $or: parsed.map(({ p }) => ({ roleId: p.srcRoleId, skillId: p.id })),
  }).lean();
  return docs as never;
}

/** 按引用键读取 MCP 配置行(全局行 + 用户自己角色行) */
export async function findMcpRowsByRefs(
  userId: string,
  refs: string[],
): Promise<Array<Record<string, unknown>>> {
  const parsed = parseRefs(refs);
  if (parsed.length === 0) return [];
  await connectToMongo();
  return McpServerModel.find({
    $or: mcpRefFilters(userId, parsed),
  }).lean() as never;
}

/* ---------- internal ---------- */

/** MCP 引用的 Mongo 过滤条件(全局行按 scope,其余按用户自己的角色行) */
function mcpRefFilters(userId: string, parsed: { p: ResourceRef }[]) {
  const filters: Record<string, unknown>[] = [];
  for (const { p } of parsed) {
    filters.push(
      p.srcRoleId === GLOBAL_ROLE_ID
        ? { scope: "global", serverId: p.id }
        : { userId, roleId: p.srcRoleId, serverId: p.id },
    );
  }
  return filters;
}

function parseRefs(refs: string[]) {
  return [
    ...new Set(refs.map((r) => r.trim()).filter(Boolean)),
  ]
    .map((ref) => ({ ref, p: parseResourceRef(ref) }))
    .filter((x): x is { ref: string; p: ResourceRef } => x.p !== null);
}

async function ownedRoleIds(
  userId: string,
  roleIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(roleIds)].filter((r) => !r.startsWith("__"));
  if (unique.length === 0) return new Set();
  const docs = await RoleProfileModel.find({
    userId,
    roleId: { $in: unique },
  })
    .select("roleId")
    .lean();
  return new Set(docs.map((d) => String(d.roleId)));
}
