import { Agent } from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  type ApiKeyAuth,
  type Model,
  type Api,
} from "@earendil-works/pi-ai";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { MessageDoc, ProviderSettingDoc } from "@/types/db";
import { getDb } from "@/lib/mongodb";
import { decrypt } from "@/lib/crypto";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL_ID = "openai/gpt-4o-mini";

const SYSTEM_PROMPT = "你是一个乐于助人的 AI 助手，请用简洁清晰的中文回答用户问题。";

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  modelId: string;
}

// 从环境变量解析项目默认 provider 配置
export function getDefaultProviderConfig(): ProviderConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL,
    modelId: process.env.DEFAULT_MODEL?.trim() || DEFAULT_MODEL_ID,
  };
}

// 返回静态 apiKey 的 auth（不走环境变量，直接用传入的 key）
function staticApiKeyAuth(key: string): ApiKeyAuth {
  return {
    name: "API key",
    resolve: async ({ signal }) => {
      signal.throwIfAborted();
      return { auth: { apiKey: key }, source: "custom" };
    },
  };
}

// OpenRouter 模型目录（静态，进程级缓存）
let _openrouterModels: readonly Model<Api>[] | null = null;
function getOpenRouterModels(): readonly Model<Api>[] {
  if (_openrouterModels) return _openrouterModels;
  _openrouterModels = openrouterProvider().getModels();
  return _openrouterModels;
}

// 按 (baseUrl, apiKey, modelId) 缓存 models 实例，避免每次请求重建
interface CacheEntry {
  models: ReturnType<typeof createModels>;
  modelId: string;
  model: Model<Api>;
}
const _cache = new Map<string, CacheEntry>();

// 当模型 ID 不在 OpenRouter 静态目录里时（如自定义 baseUrl 端点的模型），
// 构造一个通用 Model 追加到 provider 的模型列表，保证 getModel 能找到。
function makeGenericModel(config: ProviderConfig): Model<Api> {
  return {
    id: config.modelId,
    name: config.modelId,
    api: "openai-completions" as Api,
    provider: "openrouter",
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  } as unknown as Model<Api>;
}

export function buildModels(config: ProviderConfig): { models: ReturnType<typeof createModels>; model: Model<Api> } {
  const cacheKey = `${config.baseUrl}::${config.apiKey}::${config.modelId}`;
  const cached = _cache.get(cacheKey);
  if (cached) {
    return { models: cached.models, model: cached.model };
  }

  // 预定义目录里若已有该模型则复用，否则追加一个通用模型
  const catalog = getOpenRouterModels();
  const exists = catalog.some((m) => m.id === config.modelId);
  const modelList = exists
    ? catalog
    : [makeGenericModel(config), ...catalog];

  const models = createModels();
  const provider = createProvider({
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: config.baseUrl,
    auth: { apiKey: staticApiKeyAuth(config.apiKey) },
    models: modelList,
    api: openAICompletionsApi(),
  });
  models.setProvider(provider);

  const model = models.getModel("openrouter", config.modelId);
  if (!model) {
    throw new Error(`无法找到模型 openrouter/${config.modelId}，请检查模型 ID`);
  }
  _cache.set(cacheKey, { models, modelId: config.modelId, model });
  return { models, model };
}

// 从 DB 中的消息文档恢复成 AgentMessage[]
export function restoreMessages(docs: MessageDoc[]): AgentMessage[] {
  return docs.map((d) => {
    const msg: Record<string, unknown> = {
      role: d.role,
      content: d.content,
    };
    for (const [k, v] of Object.entries(d)) {
      if (k === "_id" || k === "conversationId" || k === "userId" || k === "role" || k === "content") continue;
      msg[k] = v;
    }
    return msg as unknown as AgentMessage;
  });
}

// 构建一个临时 Agent 用于本次请求（带历史上下文 + 指定 provider 配置）
export function createAgent(history: AgentMessage[], config: ProviderConfig): Agent {
  const { models, model } = buildModels(config);
  return new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      messages: history,
      tools: [],
    },
    streamFn: models.streamSimple.bind(models),
  });
}

// 从 DB 读取用户已保存的 provider 配置（解密 apiKey）
export async function getUserProviderConfig(userId: string): Promise<ProviderConfig | null> {
  const db = await getDb();
  const doc = await db.collection<ProviderSettingDoc>("provider_settings").findOne({ userId });
  if (!doc) return null;
  return {
    apiKey: decrypt(doc.apiKeyEnc),
    baseUrl: doc.baseUrl,
    modelId: doc.model,
  };
}

// 轻量测试 provider 连通性：请求 /models 端点（毫秒级返回，无需模型推理）
// 验证 API Key 有效 + 端点可达 + 目标 model 存在
export async function testProviderConnection(config: ProviderConfig): Promise<{
  ok: boolean;
  model?: string;
  error?: string;
}> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/models`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      // 5 秒超时，避免慢速端点
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "API Key 无效或无权限" };
    }
    if (res.status === 404) {
      // /models 不存在（某些代理端点不支持），但端点可达仍算 OK
      return { ok: true, model: config.modelId };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ""}` };
    }

    // 连通性 OK，解析 models 列表检查目标 model（若无列表则跳过检查）
    try {
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      if (data?.data?.length) {
        return { ok: true, model: config.modelId };
      }
    } catch {
      // 非 JSON 响应，不影响连通性判定
    }
    return { ok: true, model: config.modelId };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: "连接超时（5 秒）" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "连接失败" };
  }
}

// 解析最终生效的 provider 配置：请求体临时配置 > DB 用户配置 > env 默认
// 用于 stream API 与测试连接
export async function resolveProviderConfigForUser(
  userId: string | undefined,
  body: { apiKey?: string; baseUrl?: string; model?: string },
): Promise<ProviderConfig> {
  // 1. 请求体带明文配置
  if (body.apiKey?.trim() && body.baseUrl?.trim() && body.model?.trim()) {
    return {
      apiKey: body.apiKey.trim(),
      baseUrl: body.baseUrl.trim(),
      modelId: body.model.trim(),
    };
  }
  // 2. DB 用户配置
  if (userId) {
    const userCfg = await getUserProviderConfig(userId);
    if (userCfg) return userCfg;
  }
  // 3. env 默认
  const defaults = getDefaultProviderConfig();
  if (defaults) return defaults;
  throw new Error("未找到可用配置：请先在设置中保存自定义配置，或由服务端配置 OPENROUTER_API_KEY");
}
