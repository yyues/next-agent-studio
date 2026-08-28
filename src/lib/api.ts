// 客户端 API 封装：统一处理鉴权与 JSON
export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role?: "user" | "admin";
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
  async getConversation(
    id: string,
  ): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
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

  // =================== Admin ===================

  async adminStats(): Promise<AdminStats> {
    const res = await req("/api/admin/stats");
    return res.json();
  },

  async adminListUsers(
    params: {
      page?: number;
      pageSize?: number;
      keyword?: string;
    } = {},
  ): Promise<Paged<AdminUserRow>> {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.pageSize) q.set("pageSize", String(params.pageSize));
    if (params.keyword) q.set("keyword", params.keyword);
    const res = await req(`/api/admin/users?${q.toString()}`);
    return res.json();
  },

  async adminCreateUser(input: {
    email: string;
    password: string;
    name?: string;
    role?: "user" | "admin";
  }): Promise<{ ok: boolean; user: AdminUserRow }> {
    const res = await req("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.json();
  },

  async adminUpdateUser(
    id: string,
    patch: { name?: string; role?: "user" | "admin"; password?: string },
  ): Promise<{ ok: boolean }> {
    const res = await req(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return res.json();
  },

  async adminDeleteUser(id: string): Promise<void> {
    await req(`/api/admin/users/${id}`, { method: "DELETE" });
  },

  async adminListCustomers(
    params: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      status?: string;
    } = {},
  ): Promise<Paged<AdminCustomerRow>> {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.pageSize) q.set("pageSize", String(params.pageSize));
    if (params.keyword) q.set("keyword", params.keyword);
    if (params.status) q.set("status", params.status);
    const res = await req(`/api/admin/customers?${q.toString()}`);
    return res.json();
  },

  async adminCreateCustomer(
    input: Partial<AdminCustomerForm> & { name: string },
  ): Promise<{ ok: boolean; id: string }> {
    const res = await req("/api/admin/customers", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.json();
  },

  async adminUpdateCustomer(id: string, patch: AdminCustomerPatch): Promise<{ ok: boolean }> {
    const res = await req(`/api/admin/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return res.json();
  },

  async adminDeleteCustomer(id: string): Promise<void> {
    await req(`/api/admin/customers/${id}`, { method: "DELETE" });
  },
};

// ========= Admin 相关类型 =========
export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  list: T[];
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  createdAt: string | Date;
}

export type CustomerStatusType = "active" | "trial" | "expired" | "disabled";

export interface AdminCustomerRow {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  remark?: string | null;
  status: CustomerStatusType;
  expireAt?: string | Date | null;
  linkedUserId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface AdminCustomerForm {
  name: string;
  email?: string;
  phone?: string;
  remark?: string;
  status?: CustomerStatusType;
  trialDays?: number;
  expireAt?: string | null;
  linkedUserId?: string | null;
}

export interface AdminCustomerPatch {
  name?: string;
  email?: string;
  phone?: string;
  remark?: string;
  status?: CustomerStatusType;
  linkedUserId?: string | null;
  expireAt?: string | null;
  extendDays?: number;
  trialDays?: number;
}

export interface AdminStats {
  overview: {
    totalUsers: number;
    totalAdmins: number;
    totalConversations: number;
    totalMessages: number;
    totalCustomers: number;
    activeCustomers: number;
    trialCustomers: number;
  };
  today: {
    users: number;
    conversations: number;
    messages: number;
  };
  trend: {
    days: string[];
    users: number[];
    conversations: number[];
    messages: number[];
  };
}
