// 客户端 API 封装：统一处理鉴权与 JSON
export interface UserInfo {
  id: string;
  email: string;
  name: string;
}

export interface PublicConfig {
  allowGuestChat: boolean;
  hasDefaultProvider: boolean;
  defaultModel: string | null;
  defaultBaseUrl: string | null;
}

// 用户自定义 provider 设置（存数据库，apiKey 加密）
export interface ProviderSettings {
  baseUrl: string;
  model: string;
  apiKeyHint: string; // 掩码
  hasApiKey: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
  model?: string;
  stopReason?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: unknown;
}

async function req(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res;
}

export const api = {
  async register(email: string, password: string, name?: string): Promise<UserInfo> {
    const res = await req("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    return data.user;
  },
  async login(email: string, password: string): Promise<UserInfo> {
    const res = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    return data.user;
  },
  async logout(): Promise<void> {
    await req("/api/auth/logout", { method: "POST" });
  },
  async me(): Promise<UserInfo | null> {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return null;
      const data = await res.json();
      return data.user ?? null;
    } catch {
      return null;
    }
  },
  async listConversations(): Promise<Conversation[]> {
    const res = await req("/api/chat/conversations");
    const data = await res.json();
    return data.conversations;
  },
  async createConversation(title?: string): Promise<Conversation> {
    const res = await req("/api/chat/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    return data.conversation;
  },
  async getConversation(id: string): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
    const res = await req(`/api/chat/conversations/${id}`);
    return res.json();
  },
  async deleteConversation(id: string): Promise<void> {
    await req(`/api/chat/conversations/${id}`, { method: "DELETE" });
  },
  // provider 配置（存数据库）
  async getProviderSettings(): Promise<ProviderSettings | null> {
    const res = await req("/api/settings/provider");
    const data = await res.json();
    return data.settings ?? null;
  },
  async saveProviderSettings(input: {
    baseUrl: string;
    model: string;
    apiKey: string;
  }): Promise<ProviderSettings> {
    const res = await req("/api/settings/provider", {
      method: "PUT",
      body: JSON.stringify(input),
    });
    const data = await res.json();
    return data.settings;
  },
  async deleteProviderSettings(): Promise<void> {
    await req("/api/settings/provider", { method: "DELETE" });
  },
  async testProviderConnection(input?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }): Promise<TestConnectionResult> {
    const res = await fetch("/api/settings/provider/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input ?? {}),
    });
    return res.json();
  },
};
