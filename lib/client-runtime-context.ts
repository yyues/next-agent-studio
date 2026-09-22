export type ClientRuntimeContext = {
  userId: string;
  roleId: string;
  deepThinking?: boolean;
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

  // 无变化时不写入、不派发事件,避免订阅者自触发循环(如 RoleSwitcher 拉取后写回 roleId)
  if (
    next.userId === current.userId &&
    next.roleId === current.roleId &&
    next.deepThinking === current.deepThinking
  ) {
    return next;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(RUNTIME_CONTEXT_UPDATED_EVENT, { detail: next }));
  return next;
}
