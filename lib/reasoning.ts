/**
 * 深度思考（reasoning）参数处理。
 *
 * 项目通过 `createOpenAICompatible({ name, baseURL, apiKey })` 统一构建模型，
 * 适用于任意 OpenAI 兼容端点（OpenRouter / MiMo / 自建网关等），模型不固定。
 *
 * `createOpenAICompatible` 的 chat model 从 `providerOptions[name].reasoningEffort`
 * 读取参数，映射到请求体的 `reasoning_effort`。因此所有处理函数都使用动态
 * `providerName` 作为命名空间键，而非硬编码 `"openai"`。
 *
 * 不同 family 的差异仅在于 effort 取值归一化：
 *  - OpenAI：支持 none/minimal/low/medium/high/xhigh
 *  - MiMo：仅支持 none/low/medium/high（minimal→low, xhigh→high）
 *  - Anthropic（经 OpenAI 兼容通道）：reasoningEffort 由网关翻译
 *  - 未知 family：reasoningEffort 尽力而为 + prompt 指令兜底
 */

import type { ProviderOptions } from "@ai-sdk/provider-utils";

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type ProviderFamily =
  | "openai"
  | "anthropic"
  | "google"
  | "mimo"
  | "openai-compatible"
  | "unknown";

export type ReasoningOptions = {
  /** 传入 streamText.providerOptions 的 provider 专属配置。 */
  providerOptions?: ProviderOptions;
  /**
   * 是否追加「分步推理」prompt 指令作为兜底。仅当模型是否支持原生 reasoning
   * 无法判定时为 true；对已知支持 reasoning 的 family 为 false（避免与
   * reasoning tokens 重复）。
   */
  instructionFallback: boolean;
};

/**
 * 启发式识别 provider family。同时参考 providerName 与 model id，使其在
 * 原生 provider 或 OpenAI 兼容网关（如 OpenRouter）转发同一模型时都能命中。
 */
export function detectProviderFamily(
  providerName: string,
  model: string,
): ProviderFamily {
  const name = providerName.toLowerCase().trim();
  const m = model.toLowerCase().trim();

  // MiMo（小米）：model 含 "mimo"，或经网关转发为 "xiaomi/mimo-*" /
  // "mimo/mimo-*"。需在 OpenAI 之前判定，避免被 OpenAI 兼容通道吞掉。
  if (m.includes("mimo") || m.startsWith("xiaomi/")) {
    return "mimo";
  }

  if (
    name === "openai" ||
    m.startsWith("openai/") ||
    /^gpt-?5/.test(m) ||
    /^o[34]\b/.test(m) ||
    m.startsWith("codex-")
  ) {
    return "openai";
  }

  if (
    name === "anthropic" ||
    m.includes("claude") ||
    m.startsWith("anthropic/")
  ) {
    return "anthropic";
  }

  if (name === "google" || m.startsWith("google/") || m.includes("gemini")) {
    return "google";
  }

  if (name === "openai-compatible") return "openai-compatible";
  return "unknown";
}

/**
 * 构造 providerOptions，使用动态 providerName 作为命名空间键。
 * `createOpenAICompatible` 从 `providerOptions[name].reasoningEffort` 读取
 * 并映射到请求体的 `reasoning_effort`。
 */
function buildProviderOptions(
  providerName: string,
  effort: string,
): ProviderOptions {
  return { [providerName]: { reasoningEffort: effort } };
}

/**
 * OpenAI reasoning 处理函数。
 *
 * OpenAI 支持 none/minimal/low/medium/high/xhigh 全部档位，直接透传。
 * 注意：`reasoningSummary` 是 `@ai-sdk/openai` 专属选项，`createOpenAICompatible`
 * 不支持，已移除。如需 reasoning 摘要，改用 `@ai-sdk/openai` 原生构建。
 */
export function buildOpenAIReasoningOptions(
  providerName: string,
  effort: ReasoningEffort,
): ReasoningOptions {
  return {
    providerOptions: buildProviderOptions(providerName, effort),
    instructionFallback: false,
  };
}

/**
 * Xiaomi MiMo reasoning 处理函数。
 *
 * MiMo 兼容 OpenAI Chat Completions，通过 `reasoning_effort` 控制思考
 * （none 关闭 / low·medium·high 开启，各档位效果一致）。不支持
 * `reasoningSummary`；思考模式下 `temperature`/`top_p` 被强制忽略。
 * 多轮工具调用时需回传 `reasoning_content`（由 AI SDK 自动处理）。
 *
 * effort 归一化：`minimal`/`xhigh` 不被支持，分别映射到 `low`/`high`。
 */
export function buildMimoReasoningOptions(
  providerName: string,
  effort: ReasoningEffort,
): ReasoningOptions {
  const mimoEffort: "none" | "low" | "medium" | "high" =
    effort === "none"
      ? "none"
      : effort === "minimal" || effort === "low"
        ? "low"
        : effort === "xhigh"
          ? "high"
          : effort === "medium"
            ? "medium"
            : "high";
  return {
    providerOptions: buildProviderOptions(providerName, mimoEffort),
    instructionFallback: false,
  };
}

/**
 * Anthropic reasoning 处理函数。
 *
 * 经 OpenAI 兼容通道访问 Claude（如 OpenRouter），使用 `reasoningEffort`
 * 由网关翻译为 Anthropic 原生格式。
 *
 * 注意：`thinking: { type: "adaptive" }` / `budgetTokens` 是
 * `@ai-sdk/anthropic` 专属选项，`createOpenAICompatible` 不支持。若后续接入
 * `@ai-sdk/anthropic` 原生构建模型，可改用 anthropic 命名空间。
 */
export function buildAnthropicReasoningOptions(
  providerName: string,
  effort: ReasoningEffort,
): ReasoningOptions {
  return {
    providerOptions: buildProviderOptions(providerName, effort),
    instructionFallback: false,
  };
}

/**
 * 通用处理函数：使用 `reasoningEffort`，适用于任意 OpenAI 兼容端点。
 * 对未知 family 追加 prompt 指令兜底（模型不支持 reasoning_effort 时仍可
 * 分步推理）。
 */
export function buildGenericReasoningOptions(
  providerName: string,
  effort: ReasoningEffort,
  opts: { instructionFallback?: boolean } = {},
): ReasoningOptions {
  return {
    providerOptions: buildProviderOptions(providerName, effort),
    instructionFallback: opts.instructionFallback ?? false,
  };
}

/**
 * 统一解析入口。按检测到的 family 选择对应处理函数，所有函数都通过
 * `providerName` 作为 providerOptions 命名空间键：
 *  - openai → 直接透传 effort（支持全部档位）
 *  - mimo → effort 归一化（minimal→low, xhigh→high）
 *  - anthropic → reasoningEffort 由网关翻译
 *  - google → reasoningEffort
 *  - openai-compatible / unknown → reasoningEffort + prompt 指令兜底
 *
 * `deepThinking` 关闭时：对已知 reasoning 模型显式传 `none` 强制关闭思考，
 * 对未知 family 返回空配置（不传 reasoning_effort，避免普通模型 400 报错）。
 */
export function resolveReasoningOptions(input: {
  deepThinking: boolean;
  providerName: string;
  model: string;
}): ReasoningOptions {
  const family = detectProviderFamily(input.providerName, input.model);
  const { providerName } = input;

  // 关闭深度思考：对已知默认开启思考的 reasoning 模型（MiMo 默认 enabled、
  // OpenAI o 系列/gpt-5、Claude thinking、Gemini thinking）显式传 none，
  // 防止模型默认返回思考内容。对未知 family 不传，避免对不支持
  // reasoning_effort 的普通模型（如 gpt-4o）造成 400 报错。
  if (!input.deepThinking) {
    switch (family) {
      case "openai":
        return buildOpenAIReasoningOptions(providerName, "none");
      case "mimo":
        return buildMimoReasoningOptions(providerName, "none");
      case "anthropic":
        return buildAnthropicReasoningOptions(providerName, "none");
      case "google":
        return buildGenericReasoningOptions(providerName, "none");
      case "openai-compatible":
      case "unknown":
      default:
        return { instructionFallback: false };
    }
  }

  const effort: ReasoningEffort = "high";
  switch (family) {
    case "openai":
      return buildOpenAIReasoningOptions(providerName, effort);
    case "mimo":
      return buildMimoReasoningOptions(providerName, effort);
    case "anthropic":
      return buildAnthropicReasoningOptions(providerName, effort);
    case "google":
      return buildGenericReasoningOptions(providerName, effort);
    case "openai-compatible":
    case "unknown":
    default:
      // 模型是否支持原生 reasoning 未知：reasoningEffort 尽力而为 + prompt 兜底。
      return buildGenericReasoningOptions(providerName, effort, {
        instructionFallback: true,
      });
  }
}
