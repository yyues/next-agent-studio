import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import mongoose from "mongoose";
import { connectToMongo } from "@/lib/mongodb";
import { ProviderConfigModel } from "@/lib/models/provider-config";
import { ProviderEntryModel } from "@/lib/models/provider-entry";
import { RoleProfileModel } from "@/lib/models/role-profile";
import { UserSettingModel } from "@/lib/models/user-setting";
import { RoleResourceModel } from "@/lib/models/role-resource";
import {
  removeRoleSkillDir,
} from "@/lib/skills";
import { loadSkillsByRoleIdCached } from "@/lib/skills-cache";
import { SkillDocModel } from "@/lib/models/skill-doc";
import { removeRoleResourceDir } from "@/lib/resources";
import { encryptSecret, decryptSecret } from "@/lib/secret-crypto";

export type ProviderSettings = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  embeddingModel: string;
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  temperature: number;
};

export type RoleProfile = {
  roleId: string;
  displayName: string;
  description: string;
  enabled: boolean;
  systemPrompt: string;
  skillIds: string[];
  toolToggles: Record<string, boolean>;
  priority: number;
  /** 新会话欢迎页的开场建议问题(逐条展示,点击即发送) */
  suggestions: string[];
};

const defaultProviderSettings: ProviderSettings = {
  providerName: process.env.DEFAULT_PROVIDER_NAME ?? "openai-compatible",
  baseUrl: process.env.DEFAULT_PROVIDER_BASE_URL ?? "https://api.openai.com/v1",
  apiKey:
    process.env.DEFAULT_PROVIDER_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  model: process.env.DEFAULT_PROVIDER_MODEL ?? "gpt-5.6-luna",
  embeddingModel:
    process.env.DEFAULT_EMBEDDING_MODEL ?? "text-embedding-3-small",
  embeddingBaseUrl: process.env.DEFAULT_EMBEDDING_BASE_URL ?? "",
  embeddingApiKey: process.env.DEFAULT_EMBEDDING_API_KEY ?? "",
  temperature: Number(process.env.DEFAULT_PROVIDER_TEMPERATURE ?? 0.7),
};

const defaultRoleProfiles: RoleProfile[] = [
  {
    roleId: "general",
    displayName: "通用助手",
    description: "日常问答、写作、翻译、总结与头脑风暴的全能助手",
    enabled: true,
    systemPrompt: `你是一位务实、高效的通用助手。

回答原则:
- 直接给有用的答案,先结论后展开;不确定就明说,不编造事实。
- 与用户使用相同的语言交流;术语首次出现时用一句话解释。
- 内容较长时分点、分节,善用小标题与列表;能给示例就给示例。
- 涉及文档/报告/表格/演示文稿等产出物时,调用文件生成工具输出为文件,而不是在正文里粘贴长文。
- 写作类任务先确认目标读者、语气与篇幅;用户没说就按常规商务场景处理。
- 头脑风暴给足数量并保持差异性,最后附一句推荐倾向。
- 翻译保留原意与语气,不随意增删内容。
- 用户的问题有歧义时,先给出最可能的理解并作答,再提示可以补充信息修正方向。`,
    skillIds: ["base"],
    toolToggles: {},
    priority: 0,
    suggestions: [
      "帮我总结一段文字或一篇文章的要点",
      "写一封正式的商务邮件",
      "给我一个一周工作计划模板",
      "把这段话翻译成英文并润色",
      "用通俗的语言解释一个专业概念",
      "头脑风暴:给我 10 个产品命名思路",
    ],
  },
  {
    roleId: "developer",
    displayName: "开发工程师",
    description: "代码评审、排错、重构与技术选型的资深工程师",
    enabled: true,
    systemPrompt: `你是一位资深软件工程师,精通主流编程语言、工程实践与系统设计。

回答原则:
- 先给结论/方案,再讲依据;讲清权衡(trade-offs),而不是只给一种做法。
- 代码要安全、可维护:处理边界情况与错误路径,避免引入不必要的依赖。
- 修改代码时给出完整可运行的代码块,并简述改了什么、为什么;大改动给出关键 diff 说明。
- 排查报错时按"可能原因 → 排查步骤 → 修复方案"组织,从最可能的原因开始。
- Review 代码时按严重程度分级指出问题(缺陷/风险/风格),给出具体修改建议。
- 缺少必要上下文(语言版本、框架、报错日志、目标)时,先提出关键问题,同时给出基于合理假设的初步方案。
- 技术选型对比给出维度明确的对比表,并基于场景给出明确推荐。
- 不臆测不存在的 API;对不确定的库行为注明需要验证。`,
    skillIds: ["base", "developer"],
    toolToggles: {},
    priority: 1,
    suggestions: [
      "帮我 review 一段代码,指出问题与改进建议",
      "解释一个报错信息的可能原因",
      "把这段伪代码重构成 TypeScript",
      "为这个函数编写单元测试",
      "对比两种技术方案的优劣并给出选型建议",
      "帮我写一个正则表达式并解释规则",
    ],
  },
];

const builtinRoleIds = new Set(defaultRoleProfiles.map((r) => r.roleId));

export function isBuiltinRole(roleId: string) {
  return builtinRoleIds.has(roleId);
}

/**
 * 角色 ownership 守卫:内置角色共享;自定义角色必须属于该 userId。
 * 用于 skills/resources 等按 roleId 存储的端点,防止跨用户改动。
 */
export async function assertRoleAccess(userId: string, roleId: string) {
  if (isBuiltinRole(roleId)) return;
  await connectToMongo();
  const doc = await RoleProfileModel.findOne({ userId, roleId }).lean();
  if (!doc) throw new Error("Role not found for this user.");
}

export function normalizeUserId(input: unknown) {
  if (typeof input !== "string") {
    return "demo-user";
  }

  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : "demo-user";
}

function toToolToggleObject(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([name, enabled]) =>
      typeof name === "string" && typeof enabled === "boolean",
  );

  return Object.fromEntries(entries) as Record<string, boolean>;
}

function toRoleProfile(doc: Record<string, unknown>): RoleProfile {
  const toolToggles =
    doc.toolToggles instanceof Map
      ? Object.fromEntries(doc.toolToggles.entries())
      : toToolToggleObject(doc.toolToggles);

  return {
    roleId: String(doc.roleId),
    displayName: String(doc.displayName),
    description: String(doc.description ?? ""),
    enabled: Boolean(doc.enabled),
    systemPrompt: String(doc.systemPrompt),
    skillIds: Array.isArray(doc.skillIds)
      ? doc.skillIds.map((v) => String(v))
      : [],
    toolToggles,
    priority: Number(doc.priority ?? 0),
    suggestions: Array.isArray(doc.suggestions)
      ? (doc.suggestions as unknown[]).map((v) => String(v)).filter(Boolean)
      : [],
  };
}

function validateProviderInput(payload: Partial<ProviderSettings>) {
  if (!payload.baseUrl?.trim()) {
    throw new Error("baseUrl is required.");
  }
  if (!payload.apiKey?.trim()) {
    throw new Error("apiKey is required.");
  }
  if (!payload.model?.trim()) {
    throw new Error("model is required.");
  }
}

function normalizeProviderInput(
  payload: Partial<ProviderSettings>,
): ProviderSettings {
  validateProviderInput(payload);
  const rawTemp = Number(payload.temperature);
  const temperature =
    Number.isFinite(rawTemp) && rawTemp >= 0 && rawTemp <= 2
      ? rawTemp
      : defaultProviderSettings.temperature;
  return {
    providerName:
      payload.providerName?.trim() || defaultProviderSettings.providerName,
    baseUrl: payload.baseUrl!.trim(),
    apiKey: payload.apiKey!.trim(),
    model: payload.model!.trim(),
    embeddingModel:
      payload.embeddingModel?.trim() || defaultProviderSettings.embeddingModel,
    embeddingBaseUrl: payload.embeddingBaseUrl?.trim() ?? "",
    embeddingApiKey: payload.embeddingApiKey?.trim() ?? "",
    temperature,
  };
}

function maskApiKey(apiKey: string) {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
}

function buildModel(config: ProviderSettings) {
  const provider = createOpenAICompatible({
    name: config.providerName,
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  return provider.chatModel(config.model);
}

export async function getProviderSettings(userId: string) {
  try {
    await connectToMongo();
    await ensureProvidersMigrated(userId);

    // 聊天供应商:激活的 entry,无则回退默认
    const entries = await ProviderEntryModel.find({ userId }).lean();
    const active =
      entries.find((e) => e.active) ?? entries[0] ?? null;

    const doc = await ProviderConfigModel.findOne({ userId }).lean();
    // embedding 为全局内置配置,不随供应商切换
    const embeddingModel =
      doc?.embeddingModel || defaultProviderSettings.embeddingModel;
    const embeddingBaseUrl = doc?.embeddingBaseUrl ?? "";
    const embeddingApiKey = decryptSecret(doc?.embeddingApiKey ?? "");

    const config: ProviderSettings = active
      ? {
          providerName: active.providerName || "openai-compatible",
          baseUrl: active.baseUrl,
          apiKey: decryptSecret(active.apiKey),
          model: active.model,
          embeddingModel,
          embeddingBaseUrl,
          embeddingApiKey,
          temperature:
            typeof active.temperature === "number"
              ? active.temperature
              : defaultProviderSettings.temperature,
        }
      : defaultProviderSettings;

    return {
      source: (active ? "user" : "default") as "user" | "default",
      config,
      maskedApiKey: maskApiKey(config.apiKey),
      maskedEmbeddingApiKey: maskApiKey(embeddingApiKey),
    };
  } catch (error) {
    console.warn(
      "Failed to load provider settings from MongoDB. Using defaults.",
      error,
    );
    return {
      source: "default" as const,
      config: defaultProviderSettings,
      maskedApiKey: maskApiKey(defaultProviderSettings.apiKey),
      maskedEmbeddingApiKey: maskApiKey(
        defaultProviderSettings.embeddingApiKey,
      ),
    };
  }
}

/* ---------- 多供应商 CRUD ---------- */

export type ProviderEntryInput = {
  providerId?: string;
  name: string;
  providerName?: string;
  baseUrl: string;
  apiKey?: string; // 为空表示保留旧值(编辑时)
  model: string;
  temperature?: number;
};

/**
 * 迁移:旧的单份 ProviderConfig 聊天配置 → 第一个供应商 entry。
 * 已有 entry 或无旧配置时跳过。
 */
async function ensureProvidersMigrated(userId: string) {
  const count = await ProviderEntryModel.countDocuments({ userId });
  if (count > 0) return;

  const legacy = await ProviderConfigModel.findOne({ userId }).lean();
  if (!legacy?.baseUrl || !legacy?.apiKey || !legacy?.model) return;
  // 默认值也迁移,保证"第一个供应商"始终存在且可用
  await ProviderEntryModel.create({
    userId,
    providerId: "default",
    name: legacy.providerName || "Default",
    providerName: legacy.providerName || "openai-compatible",
    baseUrl: legacy.baseUrl,
    apiKey: legacy.apiKey,
    model: legacy.model,
    temperature:
      typeof legacy.temperature === "number"
        ? legacy.temperature
        : defaultProviderSettings.temperature,
    active: true,
  });
}

export async function listProviderEntries(userId: string) {
  await connectToMongo();
  await ensureProvidersMigrated(userId);
  const entries = await ProviderEntryModel.find({ userId })
    .sort({ createdAt: 1 })
    .lean();
  return entries.map((e) => ({
    providerId: e.providerId,
    name: e.name,
    providerName: e.providerName,
    baseUrl: e.baseUrl,
    model: e.model,
    temperature: e.temperature ?? 0.7,
    active: Boolean(e.active),
    maskedApiKey: maskApiKey(decryptSecret(e.apiKey)),
  }));
}

export async function getProviderEntryRaw(userId: string, providerId: string) {
  await connectToMongo();
  const doc = await ProviderEntryModel.findOne({ userId, providerId }).lean();
  // apiKey 解密后返回(调用方 test/export 均需明文)
  return doc
    ? { ...doc, apiKey: decryptSecret(doc.apiKey) }
    : doc;
}

export async function upsertProviderEntry(
  userId: string,
  payload: ProviderEntryInput,
) {
  await connectToMongo();
  if (!payload.name?.trim()) throw new Error("name is required.");
  if (!/^https?:\/\//i.test(payload.baseUrl?.trim() ?? "")) {
    throw new Error("baseUrl must be a valid http(s) URL.");
  }
  if (!payload.model?.trim()) throw new Error("model is required.");

  const providerId =
    payload.providerId?.trim() ||
    payload.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    `provider-${Date.now()}`;

  const existing = await ProviderEntryModel.findOne({
    userId,
    providerId,
  }).lean();
  // apiKey 留空表示沿用旧值(库中旧值为密文,原样保留);新建时必须提供
  const apiKey = payload.apiKey?.trim()
    ? encryptSecret(payload.apiKey.trim())
    : existing?.apiKey;
  if (!apiKey) throw new Error("apiKey is required.");

  const rawTemp = Number(payload.temperature);
  const temperature =
    Number.isFinite(rawTemp) && rawTemp >= 0 && rawTemp <= 2
      ? rawTemp
      : (existing?.temperature ?? defaultProviderSettings.temperature);

  const count = await ProviderEntryModel.countDocuments({ userId });
  const doc = await ProviderEntryModel.findOneAndUpdate(
    { userId, providerId },
    {
      userId,
      providerId,
      name: payload.name.trim(),
      providerName:
        payload.providerName?.trim() || existing?.providerName || "openai-compatible",
      baseUrl: payload.baseUrl.trim(),
      apiKey,
      model: payload.model.trim(),
      temperature,
      // 首个供应商自动激活
      active: existing?.active ?? count === 0,
    },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return doc;
}

export async function deleteProviderEntry(userId: string, providerId: string) {
  await connectToMongo();
  const doc = await ProviderEntryModel.findOneAndDelete({
    userId,
    providerId,
  }).lean();
  if (!doc) throw new Error("Provider not found.");

  // 删除的是激活项 → 自动激活剩余的第一个
  if (doc.active) {
    const remaining = await ProviderEntryModel.findOne({ userId }).lean();
    if (remaining) {
      await ProviderEntryModel.updateOne(
        { userId, providerId: remaining.providerId },
        { active: true },
      );
    }
  }
  return { deleted: true };
}

export async function setActiveProviderEntry(
  userId: string,
  providerId: string,
) {
  await connectToMongo();
  const exists = await ProviderEntryModel.findOne({
    userId,
    providerId,
  }).lean();
  if (!exists) throw new Error("Provider not found.");

  await ProviderEntryModel.updateMany({ userId }, { active: false });
  await ProviderEntryModel.updateOne({ userId, providerId }, { active: true });
  return { active: providerId };
}

/* ---------- 全局内置 Embedding ---------- */

export async function getEmbeddingSettings(userId: string) {
  await connectToMongo();
  const doc = await ProviderConfigModel.findOne({ userId }).lean();
  return {
    // 模型内置固定,不开放修改
    model: defaultProviderSettings.embeddingModel,
    baseUrl: doc?.embeddingBaseUrl ?? "",
    apiKey: decryptSecret(doc?.embeddingApiKey ?? ""),
    maskedApiKey: maskApiKey(decryptSecret(doc?.embeddingApiKey ?? "")),
  };
}

export async function upsertEmbeddingSettings(
  userId: string,
  payload: { embeddingBaseUrl?: string; embeddingApiKey?: string },
) {
  await connectToMongo();
  const existing = await ProviderConfigModel.findOne({ userId }).lean();
  const embeddingBaseUrl = payload.embeddingBaseUrl?.trim() ?? "";
  // key 留空表示沿用旧值(库中旧值为密文,原样保留,避免误清空/重复加密)
  const embeddingApiKey = payload.embeddingApiKey?.trim()
    ? encryptSecret(payload.embeddingApiKey.trim())
    : (existing?.embeddingApiKey ?? "");

  await ProviderConfigModel.findOneAndUpdate(
    { userId },
    {
      userId,
      embeddingModel: defaultProviderSettings.embeddingModel,
      embeddingBaseUrl,
      embeddingApiKey,
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean();

  return {
    model: defaultProviderSettings.embeddingModel,
    baseUrl: embeddingBaseUrl,
    maskedApiKey: maskApiKey(decryptSecret(embeddingApiKey)),
  };
}

export async function upsertProviderSettings(
  userId: string,
  payload: Partial<ProviderSettings>,
) {
  await connectToMongo();
  const existing = await getProviderSettings(userId);

  const normalized = normalizeProviderInput({
    providerName: payload.providerName ?? existing.config.providerName,
    baseUrl: payload.baseUrl ?? existing.config.baseUrl,
    apiKey: payload.apiKey?.trim() ? payload.apiKey : existing.config.apiKey,
    model: payload.model ?? existing.config.model,
    embeddingModel: payload.embeddingModel ?? existing.config.embeddingModel,
    embeddingBaseUrl:
      payload.embeddingBaseUrl !== undefined
        ? payload.embeddingBaseUrl
        : existing.config.embeddingBaseUrl,
    embeddingApiKey:
      payload.embeddingApiKey?.trim() !== ""
        ? payload.embeddingApiKey
        : existing.config.embeddingApiKey,
    temperature:
      typeof payload.temperature === "number"
        ? payload.temperature
        : existing.config.temperature,
  });

  // normalized 持有明文(供返回掩码);落库时加密 apiKey 字段
  const doc = await ProviderConfigModel.findOneAndUpdate(
    { userId },
    {
      ...normalized,
      apiKey: encryptSecret(normalized.apiKey),
      embeddingApiKey: encryptSecret(normalized.embeddingApiKey),
      userId,
    },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  ).lean();

  if (!doc) {
    throw new Error("Failed to save provider settings.");
  }

  const saved = { ...normalized };

  return {
    source: "user" as const,
    config: saved,
    maskedApiKey: maskApiKey(saved.apiKey),
    maskedEmbeddingApiKey: maskApiKey(saved.embeddingApiKey),
  };
}

export async function testProviderSettings(payload: Partial<ProviderSettings>) {
  const normalized = normalizeProviderInput(payload);

  const model = buildModel(normalized);
  await generateText({
    model,
    prompt: "Respond with: pong",
    maxOutputTokens: 10,
  });

  return true;
}

/**
 * 将内置角色同步到数据库（首次查询时自动调用）
 * 对每个内置角色执行 upsert，确保数据库中始终存在默认角色记录
 */
async function seedDefaultRoles(userId: string) {
  // 并行 upsert(跨洋写单次数百毫秒)
  await Promise.all(
    defaultRoleProfiles.map((role) =>
      RoleProfileModel.findOneAndUpdate(
        { userId, roleId: role.roleId },
        [
          {
            $set: {
              userId: { $ifNull: ["$userId", userId] },
              roleId: { $ifNull: ["$roleId", role.roleId] },
              displayName: { $ifNull: ["$displayName", role.displayName] },
              description: { $ifNull: ["$description", role.description] },
              enabled: { $ifNull: ["$enabled", role.enabled] },
              systemPrompt: { $ifNull: ["$systemPrompt", role.systemPrompt] },
              skillIds: { $ifNull: ["$skillIds", role.skillIds] },
              toolToggles: { $ifNull: ["$toolToggles", role.toolToggles] },
              priority: { $ifNull: ["$priority", role.priority] },
              suggestions: { $ifNull: ["$suggestions", role.suggestions] },
            },
          },
        ],
        { upsert: true, updatePipeline: true },
      ),
    ),
  );
}
export async function getRoleSettings(userId: string) {
  try {
    await connectToMongo();

    // 两个读取并行;常态(已播种)不再执行两次播种写
    const [userSetting, dbRoleDocs] = await Promise.all([
      UserSettingModel.findOne({ userId }).lean(),
      RoleProfileModel.find({ userId }).lean(),
    ]);

    let docs = dbRoleDocs;
    const hasAllDefaults = defaultRoleProfiles.every((d) =>
      docs.some((doc) => doc.roleId === d.roleId),
    );
    if (!hasAllDefaults) {
      await seedDefaultRoles(userId);
      docs = await RoleProfileModel.find({ userId }).lean();
    }

    const dbRoles = docs.map((doc) =>
      toRoleProfile(doc as Record<string, unknown>),
    );

    const mergedById = new Map(
      defaultRoleProfiles.map((role) => [role.roleId, role]),
    );
    for (const role of dbRoles) {
      mergedById.set(role.roleId, role);
    }

    const roles = Array.from(mergedById.values()).sort(
      (a, b) => a.priority - b.priority,
    );

    const currentRoleId =
      userSetting?.currentRoleId && mergedById.has(userSetting.currentRoleId)
        ? userSetting.currentRoleId
        : "general";

    return {
      currentRoleId,
      roles,
    };
  } catch (error) {
    console.warn(
      "Failed to load role settings from MongoDB. Using defaults.",
      error,
    );
    return {
      currentRoleId: "general",
      roles: defaultRoleProfiles,
    };
  }
}

export async function setCurrentRole(userId: string, roleId: string) {
  await connectToMongo();

  // 单查校验(库文档覆盖内置默认;不再整跑 getRoleSettings 省一轮 Mongo 往返)
  const doc = await RoleProfileModel.findOne({ userId, roleId }).lean();
  const enabled = doc
    ? Boolean(doc.enabled)
    : defaultRoleProfiles.find((r) => r.roleId === roleId)?.enabled === true;
  if (!enabled) {
    throw new Error("Invalid roleId.");
  }

  await UserSettingModel.findOneAndUpdate(
    { userId },
    { userId, currentRoleId: roleId },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  return {
    currentRoleId: roleId,
  };
}

export async function resolveRuntimeConfig(input: {
  userId: string;
  requestedRoleId?: string;
  overrideProvider?: Partial<ProviderSettings>;
  /** 用户以 /命令 显式调用的技能名(小写);非空时仅注入命中的技能 */
  invokedSkillCommands?: string[];
}) {
  // 两个设置读取互不依赖,并行执行(远程 Mongo 下省一次串行往返)
  const [providerFromDb, roleSettings] = await Promise.all([
    getProviderSettings(input.userId),
    getRoleSettings(input.userId),
  ]);
  const provider = input.overrideProvider
    ? normalizeProviderInput({
        providerName:
          input.overrideProvider.providerName ??
          providerFromDb.config.providerName,
        baseUrl:
          input.overrideProvider.baseUrl ?? providerFromDb.config.baseUrl,
        apiKey: input.overrideProvider.apiKey ?? providerFromDb.config.apiKey,
        model: input.overrideProvider.model ?? providerFromDb.config.model,
        embeddingModel:
          input.overrideProvider.embeddingModel ??
          providerFromDb.config.embeddingModel,
        embeddingBaseUrl:
          input.overrideProvider.embeddingBaseUrl ??
          providerFromDb.config.embeddingBaseUrl,
        embeddingApiKey:
          input.overrideProvider.embeddingApiKey ??
          providerFromDb.config.embeddingApiKey,
        temperature:
          typeof input.overrideProvider.temperature === "number"
            ? input.overrideProvider.temperature
            : providerFromDb.config.temperature,
      })
    : providerFromDb.config;

  const roleId =
    input.requestedRoleId &&
    roleSettings.roles.some(
      (role) => role.roleId === input.requestedRoleId && role.enabled,
    )
      ? input.requestedRoleId
      : roleSettings.currentRoleId;

  const role =
    roleSettings.roles.find((item) => item.roleId === roleId && item.enabled) ??
    roleSettings.roles[0];

    // const validSkillIds = role.skillIds.filter((id) => availableSkillIds.includes(id));
    // 按角色加载 skills(进程内 TTL 缓存,命中时聊天消息不再回源 Blob)
    const loadedSkills = await loadSkillsByRoleIdCached(roleId);
  // 显式 /命令 调用 → 仅注入命中技能(显式优先);未使用 / 时保持全量注入
  const explicitCommands = (input.invokedSkillCommands ?? []).map((c) =>
    c.toLowerCase(),
  );
  const effectiveSkills =
    explicitCommands.length > 0
      ? loadedSkills.filter((s) => explicitCommands.includes(s.id.toLowerCase()))
      : loadedSkills;
  const skillInstruction = effectiveSkills
    .map((skill) => {
      let text = `- ${skill.title}: ${skill.instructions}`;
      if (skill.knowledge && skill.knowledge.length > 0) {
        text += `\n  参考知识:\n${skill.knowledge.join("\n")}`;
      }
      return text;
    })
    .join("\n");

  const systemPrompt = [
    role.systemPrompt,
    skillInstruction
      ? `${
          explicitCommands.length > 0
            ? "Explicitly invoked skills (用户以 /命令 显式调用,请优先按这些技能执行):"
            : "Active skills:"
        }\n${skillInstruction}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    model: buildModel(provider),
    provider,
    role,
    systemPrompt,
    temperature: provider.temperature,
  };
}

export function filterToolsByRole<T extends Record<string, unknown>>(
  tools: T,
  toolToggles: Record<string, boolean>,
) {
  const keys = Object.keys(toolToggles);
  if (keys.length === 0) {
    return tools;
  }

  const filteredEntries = Object.entries(tools).filter(
    ([name]) => toolToggles[name] !== false,
  );
  return Object.fromEntries(filteredEntries) as T;
}

export async function createRole(
  userId: string,
  payload: {
    roleId?: string;
    displayName: string;
    systemPrompt: string;
    description?: string;
    enabled?: boolean;
    priority?: number;
    suggestions?: string[];
  },
) {
  await connectToMongo();

  // roleId 缺省时直接用 Mongo 自动生成的 ObjectId(全局唯一,URL/Blob 路径安全)
  const roleId = payload.roleId?.trim() || new mongoose.Types.ObjectId().toString();
  if (isBuiltinRole(roleId)) {
    throw new Error("Cannot create a role with a built-in roleId.");
  }

  const existing = await RoleProfileModel.findOne({
    userId,
    roleId,
  }).lean();
  if (existing) {
    throw new Error("roleId already exists for this user.");
  }

  const doc = await RoleProfileModel.create({
    userId,
    roleId,
    displayName: payload.displayName,
    systemPrompt: payload.systemPrompt,
    description: payload.description ?? "",
    enabled: payload.enabled ?? true,
    skillIds: ["base"],
    toolToggles: {},
    priority: payload.priority ?? 10,
    suggestions: (payload.suggestions ?? []).map((v) => v.trim()).filter(Boolean),
  });

  return toRoleProfile(doc.toObject() as Record<string, unknown>);
}

export async function updateRole(
  userId: string,
  roleId: string,
  payload: Partial<{
    displayName: string;
    description: string;
    systemPrompt: string;
    enabled: boolean;
    priority: number;
    suggestions: string[];
  }>,
) {
  await connectToMongo();

  // 内置角色同样可编辑(按用户维度覆盖);未拉取过角色列表时库中尚无
  // 播种文档,先补种一份再更新,避免 "Role not found."
  if (isBuiltinRole(roleId)) await seedDefaultRoles(userId);

  const update: Record<string, unknown> = {};
  if (payload.displayName !== undefined)
    update.displayName = payload.displayName;
  if (payload.description !== undefined)
    update.description = payload.description;
  if (payload.systemPrompt !== undefined)
    update.systemPrompt = payload.systemPrompt;
  if (payload.enabled !== undefined) update.enabled = payload.enabled;
  if (payload.priority !== undefined) update.priority = payload.priority;
  if (payload.suggestions !== undefined)
    update.suggestions = payload.suggestions
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);

  const doc = await RoleProfileModel.findOneAndUpdate(
    { userId, roleId },
    { $set: update },
    { returnDocument: "after" },
  ).lean();

  if (!doc) {
    throw new Error("Role not found.");
  }

  return toRoleProfile(doc as Record<string, unknown>);
}

export async function deleteRole(userId: string, roleId: string) {
  if (isBuiltinRole(roleId)) {
    throw new Error("Built-in roles cannot be deleted.");
  }

  await connectToMongo();

  const result = await RoleProfileModel.deleteOne({ userId, roleId });
  if (result.deletedCount === 0) {
    throw new Error("Role not found.");
  }

  // 清理角色对应的 skill 目录
  await removeRoleSkillDir(roleId);
  await removeRoleResourceDir(roleId);

  return { deleted: true };
}

export async function getRoleById(userId: string, roleId: string) {
  await connectToMongo();

  const defaultRole = defaultRoleProfiles.find((r) => r.roleId === roleId);
  let doc = await RoleProfileModel.findOne({ userId, roleId }).lean();
  // 仅当查询的是内置角色且库中缺失时才播种(常态零写)
  if (!doc && defaultRole) {
    await seedDefaultRoles(userId);
    doc = await RoleProfileModel.findOne({ userId, roleId }).lean();
  }
  const role = doc
    ? toRoleProfile(doc as Record<string, unknown>)
    : defaultRole;

  if (!role) throw new Error("Role not found.");

  // 只查 SkillDoc 元数据,不读 Blob 全文(列表展示字段全够;
  // 全文仅聊天注入时经 loadSkillsByRoleIdCached 读取并缓存)
  const [skillDocs, resources] = await Promise.all([
    SkillDocModel.find({ roleId, enabled: true }).lean(),
    RoleResourceModel.find({ roleId }).lean(),
  ]);

  return {
    role,
    skills: skillDocs.map((d) => ({
      skillId: d.skillId,
      title: d.title,
      description: d.description ?? "",
      version: d.version,
    })),
    resources: resources.map((r) => ({
      resourceId: r.resourceId,
      fileName: r.fileName,
      filePath: r.filePath,
      createdAt: r.createdAt,
    })),
  };
}
