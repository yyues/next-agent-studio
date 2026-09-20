/**
 * 配置类读取的进程内 TTL 缓存(单实例部署,无 Redis 依赖;与 lib/skills-cache 同模式)。
 *
 * 覆盖 provider 设置 / 角色列表 / MCP 配置 / RAG 切片计数这类"每轮 chat 都要读、
 * 内容只有 KB 级、只在管理操作时变化"的数据——远程 Mongo 单次往返 240ms+,
 * 不缓存时每句话都把配置重读一遍。
 *
 * 语义:
 * - 命中即滑动续期(活跃用户不反复回源)
 * - inflight 去重:并发请求共享同一次回源
 * - generation 守卫:加载期间发生失效时,旧结果不写回缓存
 * - loader 抛错直接穿透不缓存(调用方降级逻辑留在缓存层之外,
 *   避免 DB 瞬断被缓存成 TTL 时长的错误配置)
 *
 * 失效:各写路径成功写入后调 invalidateCache;TTL 仅作兜底
 * (直接改库等漏网写入最多脏 TTL 时长)。
 * cachedLoad 是唯一读取收口,将来多实例部署换 Redis 只改本文件。
 */
const TTL_MS = 10 * 60 * 1000;

type CacheEntry = { value: unknown; expireAt: number };

type NamespaceState = {
  entries: Map<string, CacheEntry>;
  /** 加载去重:并发请求共享同一次回源 */
  inflight: Map<string, Promise<unknown>>;
  /** 逐出代数:加载期间发生失效时,旧结果不再写入缓存 */
  generations: Map<string, number>;
};

declare global {
  // eslint-disable-next-line no-var
  var __configCache: Map<string, NamespaceState> | undefined;
}

// 挂 globalThis 防 dev 热重载丢缓存(与 lib/mongodb 连接缓存同模式)
const namespaces: Map<string, NamespaceState> =
  global.__configCache ?? new Map();
if (!global.__configCache) global.__configCache = namespaces;

function namespaceOf(name: string): NamespaceState {
  let state = namespaces.get(name);
  if (!state) {
    state = { entries: new Map(), inflight: new Map(), generations: new Map() };
    namespaces.set(name, state);
  }
  return state;
}

/**
 * 逐出缓存。key 省略时全清整个 namespace(影响面是"所有 key"的变更用,
 * 如全局库增删);指定 key 时精确逐出。
 * 同时丢弃对应 inflight:失效后到来的请求重新回源,不吃加载中的旧值。
 */
export function invalidateCache(namespace: string, key?: string) {
  const state = namespaces.get(namespace);
  if (!state) return;
  if (key === undefined) {
    for (const k of state.generations.keys()) {
      state.generations.set(k, (state.generations.get(k) ?? 0) + 1);
    }
    state.entries.clear();
    state.inflight.clear();
    return;
  }
  state.generations.set(key, (state.generations.get(key) ?? 0) + 1);
  state.entries.delete(key);
  state.inflight.delete(key);
}

/**
 * 读取(带缓存):命中且未过期直接返回并续期;未命中回源 loader,
 * 期间发生失效(generation 变化)则结果仍返回但不写缓存。
 * loader 抛错时穿透给调用方,不缓存错误。
 */
export function cachedLoad<T>(
  namespace: string,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const state = namespaceOf(namespace);
  const hit = state.entries.get(key);
  const now = Date.now();
  if (hit && hit.expireAt > now) {
    hit.expireAt = now + TTL_MS; // 滑动续期:活跃 key 不反复回源
    return Promise.resolve(hit.value as T);
  }

  let pending = state.inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    const generation = state.generations.get(key) ?? 0;
    pending = loader()
      .then((value) => {
        if ((state.generations.get(key) ?? 0) === generation) {
          state.entries.set(key, { value, expireAt: Date.now() + TTL_MS });
        }
        return value;
      })
      .finally(() => {
        // 身份校验:invalidate 可能已把本 key 换成新一轮回源,不能误删
        if (state.inflight.get(key) === pending) state.inflight.delete(key);
      });
    state.inflight.set(key, pending);
  }
  return pending;
}
