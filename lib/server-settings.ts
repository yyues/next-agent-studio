import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { connectToMongo } from "@/lib/mongodb";
import { ProviderConfigModel } from "@/lib/models/provider-config";
import { ProviderEntryModel } from "@/lib/models/provider-entry";
import { RoleProfileModel } from "@/lib/models/role-profile";
import { UserSettingModel } from "@/lib/models/user-setting";
import { RoleResourceModel } from "@/lib/models/role-resource";
import {
  loadSkillsByRoleId,
  ensureRoleSkillDir,
  removeRoleSkillDir,
  getAvailableSkillIds,
} from "@/lib/skills";
import { removeRoleResourceDir } from "@/lib/resources";

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
    displayName: "General Assistant",
    description: "",
    enabled: true,
    systemPrompt:
      "You are a practical assistant. Keep answers direct and useful.",
    skillIds: ["base"],
    toolToggles: {},
    priority: 0,
  },
  {
    roleId: "developer",
    displayName: "Developer",
    description: "",
    enabled: true,
    systemPrompt:
      "You are a senior software engineer. Explain trade-offs and favor safe, maintainable implementations.",
    skillIds: ["base", "developer"],
    toolToggles: {},
    priority: 1,
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
    const embeddingApiKey = doc?.embeddingApiKey ?? "";

    const config: ProviderSettings = active
      ? {
          providerName: active.providerName || "openai-compatible",
          baseUrl: active.baseUrl,
          apiKey: active.apiKey,
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
    maskedApiKey: maskApiKey(e.apiKey),
  }));
}

export async function getProviderEntryRaw(userId: string, providerId: string) {
  await connectToMongo();
  return ProviderEntryModel.findOne({ userId, providerId }).lean();
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
  // apiKey 留空表示沿用旧值;新建时必须提供
  const apiKey = payload.apiKey?.trim() || existing?.apiKey;
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
    { new: true, upsert: true, setDefaultsOnInsert: true },
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
    apiKey: doc?.embeddingApiKey ?? "",
    maskedApiKey: maskApiKey(doc?.embeddingApiKey ?? ""),
  };
}

export async function upsertEmbeddingSettings(
  userId: string,
  payload: { embeddingBaseUrl?: string; embeddingApiKey?: string },
) {
  await connectToMongo();
  const existing = await ProviderConfigModel.findOne({ userId }).lean();
  const embeddingBaseUrl = payload.embeddingBaseUrl?.trim() ?? "";
  // key 留空表示沿用旧值(显式传空串也保留,避免误清空)
  const embeddingApiKey =
    payload.embeddingApiKey?.trim() || existing?.embeddingApiKey || "";

  await ProviderConfigModel.findOneAndUpdate(
    { userId },
    {
      userId,
      embeddingModel: defaultProviderSettings.embeddingModel,
      embeddingBaseUrl,
      embeddingApiKey,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return {
    model: defaultProviderSettings.embeddingModel,
    baseUrl: embeddingBaseUrl,
    maskedApiKey: maskApiKey(embeddingApiKey),
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

  const doc = await ProviderConfigModel.findOneAndUpdate(
    { userId },
    { ...normalized, userId },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  if (!doc) {
    throw new Error("Failed to save provider settings.");
  }

  const saved = {
    providerName: doc.providerName,
    baseUrl: doc.baseUrl,
    apiKey: doc.apiKey,
    model: doc.model,
    embeddingModel:
      doc.embeddingModel || defaultProviderSettings.embeddingModel,
    embeddingBaseUrl: doc.embeddingBaseUrl ?? "",
    embeddingApiKey: doc.embeddingApiKey ?? "",
    temperature:
      typeof doc.temperature === "number"
        ? doc.temperature
        : defaultProviderSettings.temperature,
  };

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
  for (const role of defaultRoleProfiles) {
    await RoleProfileModel.findOneAndUpdate(
      { userId, roleId: role.roleId },
      {
    $setOnInsert: {
          userId,
          roleId: role.roleId,
          displayName: role.displayName,
          description: role.description,
          enabled: role.enabled,
          systemPrompt: role.systemPrompt,
          skillIds: role.skillIds,
          toolToggles: role.toolToggles,
          priority: role.priority,
        },
      },
      { upsert: true },
    );
  }
}
export async function getRoleSettings(userId: string) {
  try {
    await connectToMongo();
    await seedDefaultRoles(userId);

    const userSetting = await UserSettingModel.findOne({ userId }).lean();
    const dbRoles = (await RoleProfileModel.find({ userId }).lean()).map(
      (doc) => toRoleProfile(doc as Record<string, unknown>),
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
      availableSkillIds: await getAvailableSkillIds(currentRoleId),
    };
  } catch (error) {
    console.warn(
      "Failed to load role settings from MongoDB. Using defaults.",
      error,
    );
    return {
      currentRoleId: "general",
      roles: defaultRoleProfiles,
      availableSkillIds: await getAvailableSkillIds("general"),
    };
  }
}

export async function setCurrentRole(userId: string, roleId: string) {
  const roles = await getRoleSettings(userId);
  const roleExists = roles.roles.some(
    (role) => role.roleId === roleId && role.enabled,
  );
  if (!roleExists) {
    throw new Error("Invalid roleId.");
  }

  await UserSettingModel.findOneAndUpdate(
    { userId },
    { userId, currentRoleId: roleId },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return {
    currentRoleId: roleId,
  };
}

export async function resolveRuntimeConfig(input: {
  userId: string;
  requestedRoleId?: string;
  overrideProvider?: Partial<ProviderSettings>;
}) {
  const providerFromDb = await getProviderSettings(input.userId);
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

  const roleSettings = await getRoleSettings(input.userId);
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
  // 按角色加载 skills（从 skills/{roleId}/ 目录扫描）
  const loadedSkills = await loadSkillsByRoleId(roleId);
  const skillInstruction = loadedSkills
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
    skillInstruction ? `Active skills:\n${skillInstruction}` : "",
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
    roleId: string;
    displayName: string;
    systemPrompt: string;
    description?: string;
    enabled?: boolean;
    priority?: number;
  },
) {
  if (isBuiltinRole(payload.roleId)) {
    throw new Error("Cannot create a role with a built-in roleId.");
  }

  await connectToMongo();

  const existing = await RoleProfileModel.findOne({
    userId,
    roleId: payload.roleId,
  }).lean();
  if (existing) {
    throw new Error("roleId already exists for this user.");
  }

  const doc = await RoleProfileModel.create({
    userId,
    roleId: payload.roleId,
    displayName: payload.displayName,
    systemPrompt: payload.systemPrompt,
    description: payload.description ?? "",
    enabled: payload.enabled ?? true,
    skillIds: ["base"],
    toolToggles: {},
    priority: payload.priority ?? 10,
  });

  // 创建角色对应的 skill 目录
  ensureRoleSkillDir(payload.roleId);

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
  }>,
) {
  if (isBuiltinRole(roleId)) {
    throw new Error("Built-in roles cannot be modified.");
  }

  await connectToMongo();

  const update: Record<string, unknown> = {};
  if (payload.displayName !== undefined)
    update.displayName = payload.displayName;
  if (payload.description !== undefined)
    update.description = payload.description;
  if (payload.systemPrompt !== undefined)
    update.systemPrompt = payload.systemPrompt;
  if (payload.enabled !== undefined) update.enabled = payload.enabled;
  if (payload.priority !== undefined) update.priority = payload.priority;

  const doc = await RoleProfileModel.findOneAndUpdate(
    { userId, roleId },
    { $set: update },
    { new: true },
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
  await seedDefaultRoles(userId);

  const defaultRole = defaultRoleProfiles.find((r) => r.roleId === roleId);
  const doc = await RoleProfileModel.findOne({ userId, roleId }).lean();
  const role = doc
    ? toRoleProfile(doc as Record<string, unknown>)
    : defaultRole;

  if (!role) throw new Error("Role not found.");

  const loadedSkills = await loadSkillsByRoleId(roleId);
  const resources = await RoleResourceModel.find({ roleId }).lean();

  return {
    role,
    skills: loadedSkills.map((s) => ({
      skillId: s.id,
      title: s.title,
      description: s.description ?? s.instructions?.slice(0, 120) ?? "",
      version: s.version,
    })),
    resources: resources.map((r) => ({
      resourceId: r.resourceId,
      fileName: r.fileName,
      filePath: r.filePath,
      createdAt: r.createdAt,
    })),
  };
}
