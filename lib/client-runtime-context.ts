export type ClientRuntimeContext = {
  userId: string;
  roleId: string;
};

export const RUNTIME_CONTEXT_UPDATED_EVENT = "runtime-context-updated";

const STORAGE_KEY = "assistant-runtime-context";

const defaultContext: ClientRuntimeContext = {
  userId: "demo-user",
  roleId: "general",
};

function normalizeContext(input: Partial<ClientRuntimeContext>) {
  const userId = input.userId?.trim() || defaultContext.userId;
  const roleId = input.roleId?.trim() || defaultContext.roleId;

  return {
    userId,
    roleId,
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

  const next = normalizeContext({
    ...getClientRuntimeContext(),
    ...input,
  });

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(RUNTIME_CONTEXT_UPDATED_EVENT, { detail: next }));
  return next;
}
