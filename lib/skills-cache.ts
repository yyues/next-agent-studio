/**
 * skills 内容的进程内 TTL 缓存(单实例部署,无 Redis 依赖)。
 *
 * skills 全文存 Vercel Blob,一次加载是 O(skill 数 × (2 + 文件数)) 次跨洋
 * HTTPS 往返;聊天每条消息都会注入 skills,不缓存时每句话都重读一遍。
 *
 * 角色有效 skills = 自己上传的 + 引用挂载的(全局库/自己其他角色) +
 * 内置角色自动包含的全局库;按 roleId 整体缓存。
 *
 * 失效:引用变化(updateRole)/skill 上传删除时逐出对应角色;
 * 全局库变更时清空全部(所有引用角色都可能受影响);
 * TTL 仅作兜底(直接改库/Blob 等漏网写入最多脏 TTL 时长)。
 */
import type { SkillModule } from "./skills/types";
import { loadSkillsByRoleId, loadSkillModulesForDocs, listGlobalSkillDocs } from "./skills";
import { findSkillDocsByRefs } from "@/lib/resource-refs";

const TTL_MS = 10 * 60 * 1000;

type CacheEntry = { value: SkillModule[]; expireAt: number };

type SkillsCacheState = {
  entries: Map<string, CacheEntry>;
  /** 加载去重:并发请求共享同一次回源 */
  inflight: Map<string, Promise<SkillModule[]>>;
  /** 逐出代数:加载期间发生失效时,旧结果不再写入缓存 */
  generations: Map<string, number>;
};

declare global {
  // eslint-disable-next-line no-var
  var __skillsCache: SkillsCacheState | undefined;
}

// 挂 globalThis 防 dev 热重载丢缓存(与 lib/mongodb 连接缓存同模式)
const state: SkillsCacheState =
  global.__skillsCache ??
  { entries: new Map(), inflight: new Map(), generations: new Map() };
if (!global.__skillsCache) global.__skillsCache = state;

export function invalidateSkillsCache(roleId: string) {
  state.generations.set(roleId, (state.generations.get(roleId) ?? 0) + 1);
  state.entries.delete(roleId);
}

/** 全局库变更:所有角色的有效 skills 都可能变化,全部逐出 */
export function invalidateAllSkillsCache() {
  for (const key of state.generations.keys()) {
    state.generations.set(key, (state.generations.get(key) ?? 0) + 1);
  }
  state.entries.clear();
}

function cached(roleId: string, loader: () => Promise<SkillModule[]>) {
  const hit = state.entries.get(roleId);
  const now = Date.now();
  if (hit && hit.expireAt > now) {
    hit.expireAt = now + TTL_MS; // 滑动续期:活跃角色不反复回源
    return Promise.resolve(hit.value);
  }

  let pending = state.inflight.get(roleId);
  if (!pending) {
    const generation = state.generations.get(roleId) ?? 0;
    pending = loader()
      .then((value) => {
        if ((state.generations.get(roleId) ?? 0) === generation) {
          state.entries.set(roleId, { value, expireAt: Date.now() + TTL_MS });
        }
        return value;
      })
      .finally(() => {
        state.inflight.delete(roleId);
      });
    state.inflight.set(roleId, pending);
  }
  return pending;
}

/**
 * 角色有效 skills(缓存):自己上传的 + 引用挂载的 + 内置角色自动含全局库。
 * 同 id 时自己上传的优先,其次引用,最后全局库兜底。
 */
export async function loadEffectiveSkillsCached(
  roleId: string,
  refs: string[] = [],
  includeGlobal = false,
): Promise<SkillModule[]> {
  return cached(roleId, async () => {
    const [own, refSkills, globalSkills] = await Promise.all([
      loadSkillsByRoleId(roleId),
      refs.length > 0
        ? findSkillDocsByRefs(refs).then(loadSkillModulesForDocs)
        : Promise.resolve([] as SkillModule[]),
      includeGlobal
        ? listGlobalSkillDocs().then(loadSkillModulesForDocs)
        : Promise.resolve([] as SkillModule[]),
    ]);

    const merged = new Map<string, SkillModule>();
    for (const s of own) merged.set(s.id, s);
    for (const s of refSkills) if (!merged.has(s.id)) merged.set(s.id, s);
    for (const s of globalSkills) if (!merged.has(s.id)) merged.set(s.id, s);
    return Array.from(merged.values());
  });
}
