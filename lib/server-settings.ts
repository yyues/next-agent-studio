import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { connectToMongo } from "@/lib/mongodb";
import { ProviderConfigModel } from "@/lib/models/provider-config";
import { RoleProfileModel } from "@/lib/models/role-profile";
import { UserSettingModel } from "@/lib/models/user-setting";
import { availableSkillIds, loadSkillsByIds } from "@/lib/skills";

export type ProviderSettings = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type RoleProfile = {
  roleId: string;
  displayName: string;
  enabled: boolean;
  systemPrompt: string;
  skillIds: string[];
  toolToggles: Record<string, boolean>;
  priority: number;
};

const defaultProviderSettings: ProviderSettings = {
  providerName: process.env.DEFAULT_PROVIDER_NAME ?? "openai-compatible",
  baseUrl: process.env.DEFAULT_PROVIDER_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.DEFAULT_PROVIDER_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  model: process.env.DEFAULT_PROVIDER_MODEL ?? "gpt-5.6-luna",
};

const defaultRoleProfiles: RoleProfile[] = [
  {
    roleId: "general",
    displayName: "General Assistant",
    enabled: true,
    systemPrompt: "You are a practical assistant. Keep answers direct and useful.",
    skillIds: ["base"],
    toolToggles: {},
    priority: 0,
  },
  {
    roleId: "developer",
    displayName: "Developer",
    enabled: true,
    systemPrompt:
      "You are a senior software engineer. Explain trade-offs and favor safe, maintainable implementations.",
    skillIds: ["base", "developer"],
    toolToggles: {},
    priority: 1,
  },
  {
    roleId: "analyst",
    displayName: "Analyst",
    enabled: true,
    systemPrompt:
      "You are an analyst. Present key findings first and call out uncertainty clearly.",
    skillIds: ["base", "analyst"],
    toolToggles: {},
    priority: 2,
  },
];

const builtinRoleIds = new Set(defaultRoleProfiles.map((r) => r.roleId));

export function isBuiltinRole(roleId: string) {
  return builtinRoleIds.has(roleId);
}

export function normalizeUserId(input: unknown) {
  if (typeof input !== "string") {
    return "demo-user";
  }

  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : "demo-user";
}

function toToolToggleObject(
  value: unknown,
): Record<string, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([name, enabled]) => typeof name === "string" && typeof enabled === "boolean",
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

function normalizeProviderInput(payload: Partial<ProviderSettings>): ProviderSettings {
  validateProviderInput(payload);
  return {
    providerName: payload.providerName?.trim() || defaultProviderSettings.providerName,
    baseUrl: payload.baseUrl!.trim(),
    apiKey: payload.apiKey!.trim(),
    model: payload.model!.trim(),
  };
}

function maskApiKey(apiKey: string) {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
}

function buildModel(config: ProviderSettings) {
  const provider = createOpenAI({
    name: config.providerName,
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  return provider(config.model);
}

export async function getProviderSettings(userId: string) {
  try {
    await connectToMongo();

    const doc = await ProviderConfigModel.findOne({ userId }).lean();
    if (!doc) {
      return {
        source: "default" as const,
        config: defaultProviderSettings,
        maskedApiKey: maskApiKey(defaultProviderSettings.apiKey),
      };
    }

    const saved = {
      providerName: doc.providerName,
      baseUrl: doc.baseUrl,
      apiKey: doc.apiKey,
      model: doc.model,
    } satisfies ProviderSettings;

    return {
      source: "user" as const,
      config: saved,
      maskedApiKey: maskApiKey(saved.apiKey),
    };
  } catch (error) {
    console.warn("Failed to load provider settings from MongoDB. Using defaults.", error);
    return {
      source: "default" as const,
      config: defaultProviderSettings,
      maskedApiKey: maskApiKey(defaultProviderSettings.apiKey),
    };
  }
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
  };

  return {
    source: "user" as const,
    config: saved,
    maskedApiKey: maskApiKey(saved.apiKey),
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

export async function getRoleSettings(userId: string) {
  try {
    await connectToMongo();

    const userSetting = await UserSettingModel.findOne({ userId }).lean();
    const dbRoles = (await RoleProfileModel.find({ userId }).lean()).map((doc) =>
      toRoleProfile(doc as Record<string, unknown>),
    );

    const mergedById = new Map(defaultRoleProfiles.map((role) => [role.roleId, role]));
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
      availableSkillIds,
    };
  } catch (error) {
    console.warn("Failed to load role settings from MongoDB. Using defaults.", error);
    return {
      currentRoleId: "general",
      roles: defaultRoleProfiles,
      availableSkillIds,
    };
  }
}

export async function setCurrentRole(userId: string, roleId: string) {
  const roles = await getRoleSettings(userId);
  const roleExists = roles.roles.some((role) => role.roleId === roleId && role.enabled);
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
          input.overrideProvider.providerName ?? providerFromDb.config.providerName,
        baseUrl: input.overrideProvider.baseUrl ?? providerFromDb.config.baseUrl,
        apiKey: input.overrideProvider.apiKey ?? providerFromDb.config.apiKey,
        model: input.overrideProvider.model ?? providerFromDb.config.model,
      })
    : providerFromDb.config;

  const roleSettings = await getRoleSettings(input.userId);
  const roleId =
    input.requestedRoleId &&
    roleSettings.roles.some((role) => role.roleId === input.requestedRoleId && role.enabled)
      ? input.requestedRoleId
      : roleSettings.currentRoleId;

  const role =
    roleSettings.roles.find((item) => item.roleId === roleId && item.enabled) ??
    roleSettings.roles[0];

  const validSkillIds = role.skillIds.filter((id) => availableSkillIds.includes(id));
  const loadedSkills = await loadSkillsByIds(validSkillIds);
  const skillInstruction = loadedSkills
    .map((skill) => `- ${skill.title}: ${skill.instructions}`)
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

  const filteredEntries = Object.entries(tools).filter(([name]) => toolToggles[name] !== false);
  return Object.fromEntries(filteredEntries) as T;
}

export async function createRole(
  userId: string,
  payload: {
    roleId: string;
    displayName: string;
    systemPrompt: string;
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
    enabled: payload.enabled ?? true,
    skillIds: ["base"],
    toolToggles: {},
    priority: payload.priority ?? 10,
  });

  return toRoleProfile(doc.toObject() as Record<string, unknown>);
}

export async function updateRole(
  userId: string,
  roleId: string,
  payload: Partial<{
    displayName: string;
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
  if (payload.displayName !== undefined) update.displayName = payload.displayName;
  if (payload.systemPrompt !== undefined) update.systemPrompt = payload.systemPrompt;
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

  return { deleted: true };
}
