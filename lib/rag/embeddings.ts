/**
 * Embedding 向量化
 *
 * 复用用户配置的 OpenAI-compatible provider（baseUrl/apiKey），
 * 通过 @ai-sdk/openai-compatible 的 .embeddingModel() 创建 embedding 模型，
 * 调 AI SDK v7 的 embedMany / embed 生成向量。
 *
 * 向量维度随模型变化（text-embedding-3-small = 1536），调用方无需关心维度。
 */
import { embed, embedMany, type EmbeddingModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ProviderSettings } from "@/lib/server-settings";

/**
 * 用 provider 配置构造 embedding 模型。
 *
 * Embedding 端点可独立配置：embeddingBaseUrl/embeddingApiKey 留空时回退到主 baseUrl/apiKey。
 * 当中转站不提供 /embeddings 或 embedding 走另一套地址/密钥时，单独填写即可。
 */
export function buildEmbeddingModel(config: ProviderSettings): EmbeddingModel {
  const baseURL =
    config.embeddingBaseUrl?.trim() || config.baseUrl;
  const apiKey =
    config.embeddingApiKey?.trim() || config.apiKey;
  const provider = createOpenAICompatible({
    name: config.providerName,
    baseURL,
    apiKey,
  });
  return provider.embeddingModel(config.embeddingModel);
}

/**
 * 批量向量化文本。SDK 内部按模型 maxEmbeddingsPerCall 自动分批，
 * maxParallelCalls 限制并发，避免请求过载。返回与输入同序的向量数组。
 */
export async function embedTexts(
  texts: string[],
  model: EmbeddingModel,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const { embeddings } = await embedMany({
    model,
    values: texts,
    maxParallelCalls: 4,
  });
  return embeddings;
}

/**
 * 向量化单条 query。
 */
export async function embedQuery(
  text: string,
  model: EmbeddingModel,
): Promise<number[]> {
  const { embedding } = await embed({ model, value: text });
  return embedding;
}
