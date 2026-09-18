/**
 * skills 内容的进程内 TTL 缓存(单实例部署,无 Redis 依赖)。
 *
 * skills 全文存 Vercel Blob,一次加载是 O(skill 数 × (2 + 文件数)) 次跨洋
 * HTTPS 往返;聊天每条消息都会注入 skills,不缓存时每句话都重读一遍。
 *
 * 失效:skill 上传/删除、角色删除等写路径同进程调用 invalidateSkillsCache;
 * TTL 仅作兜底(直接改库/Blob 等漏网写入最多脏 TTL 时长)。
 */
import type { SkillModule } from "./skills/types";
import { loadSkillsByRoleId } from "./skills";

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

export function loadSkillsByRoleIdCached(
  roleId: string,
): Promise<SkillModule[]> {
  const hit = state.entries.get(roleId);
  const now = Date.now();
  if (hit && hit.expireAt > now) {
    hit.expireAt = now + TTL_MS; // 滑动续期:活跃角色不反复回源
    return Promise.resolve(hit.value);
  }

  let pending = state.inflight.get(roleId);
  if (!pending) {
    const generation = state.generations.get(roleId) ?? 0;
    pending = loadSkillsByRoleId(roleId)
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
