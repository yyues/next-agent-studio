export type ClientRuntimeContext = {
  userId: string;
  roleId: string;
  deepThinking?: boolean;
  /** 对话中勾选启用的 MCP serverId 列表;undefined 表示使用角色默认(全部 enabled) */
  mcpServerIds?: string[];
};

export const RUNTIME_CONTEXT_UPDATED_EVENT = "runtime-context-updated";

const STORAGE_KEY = "assistant-runtime-context";

const defaultContext: ClientRuntimeContext = {
  userId: "demo-user",
  roleId: "general",
  deepThinking: false,
};

function normalizeContext(input: Partial<ClientRuntimeContext>) {
  const userId = input.userId?.trim() || defaultContext.userId;
  const roleId = input.roleId?.trim() || defaultContext.roleId;

  return {
    userId,
    roleId,
    deepThinking: input.deepThinking === true,
    mcpServerIds: Array.isArray(input.mcpServerIds)
      ? input.mcpServerIds
      : undefined,
  };
}

export function getClientRuntimeContext(): ClientRuntimeContext {
  if (typeof window === "undefined") {
    return defaultContext;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultContext;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ClientRuntimeContext>;
    return normalizeContext(parsed);
  } catch {
    return defaultContext;
  }
}

export function setClientRuntimeContext(input: Partial<ClientRuntimeContext>) {
  if (typeof window === "undefined") {
    return defaultContext;
  }

  const current = getClientRuntimeContext();
  const next = normalizeContext({ ...current, ...input });
  // 角色切换时清空 MCP 勾选:serverId 属于旧角色,对新角色无意义
  // (不清空会把旧角色的 id 发给服务端,导致新角色 MCP 工具被过滤为空)
  if (next.roleId !== current.roleId) next.mcpServerIds = undefined;

  // 无变化时不写入、不派发事件,避免订阅者自触发循环(如 RoleSwitcher 拉取后写回 roleId)
  if (
    next.userId === current.userId &&
    next.roleId === current.roleId &&
    next.deepThinking === current.deepThinking &&
    JSON.stringify(next.mcpServerIds) ===
      JSON.stringify(current.mcpServerIds)
  ) {
    return next;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent(RUNTIME_CONTEXT_UPDATED_EVENT, { detail: next }),
  );
  return next;
}
