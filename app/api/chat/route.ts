import { frontendTools } from "@assistant-ui/ai-sdk";
import {
  type JSONSchema7,
  streamText,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import {
  filterToolsByRole,
  normalizeUserId,
  resolveRuntimeConfig,
} from "@/lib/server-settings";
import { resolveReasoningOptions } from "@/lib/reasoning";
import { getRagContext } from "@/lib/rag";
import {
  loadMcpToolsForChat,
  extractMcpMentions,
  type McpToolBundle,
} from "@/lib/mcp/client";

/**
 * 从消息列表中提取最后一条用户消息的文本，作为 RAG 检索 query。
 */
function extractLastUserQuery(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const text = (msg.parts ?? [])
      .filter(
        (p): p is { type: "text"; text: string } =>
          typeof p === "object" && p !== null && p.type === "text",
      )
      .map((p) => p.text)
      .join("\n");
    if (text.trim()) return text;
  }
  return "";
}

export async function POST(req: Request) {
  const {
    messages,
    system,
    tools,
    userId,
    roleId,
    deepThinking,
    mcpServerIds,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
    userId?: string;
    roleId?: string;
    deepThinking?: boolean;
    // conversationId 由客户端携带（见 assistant.tsx），服务端预留用于会话维度
    conversationId?: string;
    /** 对话面板勾选启用的 MCP serverId 列表 */
    mcpServerIds?: string[];
  } = await req.json();

  const normalizedUserId = normalizeUserId(
    userId ?? req.headers.get("x-user-id"),
  );

  const runtimeConfig = await resolveRuntimeConfig({
    userId: normalizedUserId,
    requestedRoleId: roleId,
  });

  const activeTools = filterToolsByRole(
    tools ?? {},
    runtimeConfig.role.toolToggles,
  );

  // 深度思考：按 provider family 解析原生 reasoning 参数（OpenAI/
  // Anthropic/通用各异），对未知 family 追加 prompt 指令兜底。
  const reasoningOptions = resolveReasoningOptions({
    deepThinking: deepThinking === true,
    providerName: runtimeConfig.provider.providerName,
    model: runtimeConfig.provider.model,
  });
  const deepThinkingInstruction = reasoningOptions.instructionFallback
    ? "在回答前请先进行深度思考与分步推理：先简述思路、拆解关键问题，再逐步推演，最后给出明确的最终结论。"
    : "";

  // RAG：用末条用户消息检索该角色知识库切片，注入 system prompt。
  // 角色无资源或检索失败均返回空串，不影响对话。
  // MCP:加载角色配置的外部 MCP server 工具。消息中 @serverName 可强制启用。
  // 未勾选任何 server 且无 @提及时,使用角色下所有 enabled 的 server。
  // 单个 server 连接失败自动跳过,不阻断对话。
  const lastUserQuery = extractLastUserQuery(messages);
  let mcpBundle: McpToolBundle = {
    tools: {},
    serverSummaries: [],
    close: async () => undefined,
  };
  try {
    mcpBundle = await loadMcpToolsForChat({
      userId: normalizedUserId,
      roleId: runtimeConfig.role.roleId,
      enabledServerIds: Array.isArray(mcpServerIds)
        ? mcpServerIds
        : undefined,
      mentionNames: extractMcpMentions(lastUserQuery),
    });
  } catch (error) {
    console.warn("[chat] MCP tools load failed:", error);
  }

  const mcpPromptSection =
    mcpBundle.serverSummaries.length > 0
      ? [
          "你可以调用以下外部 MCP 工具(工具名以 mcp__ 开头):",
          ...mcpBundle.serverSummaries.map(
            (s) =>
              `- ${s.name} (serverId: ${s.serverId}): ${s.toolNames.join(", ") || "无工具"}`,
          ),
          "用户在消息中用 @server名称 指定某个 MCP 时,优先使用该 server 的工具。",
        ].join("\n")
      : "";

  const ragContext = await getRagContext(
    runtimeConfig.role.roleId,
    lastUserQuery,
    runtimeConfig.provider,
  );

  const mergedSystemPrompt = [
    runtimeConfig.systemPrompt,
    ragContext,
    mcpPromptSection,
    system,
    deepThinkingInstruction,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = streamText({
    model: runtimeConfig.model,
    messages: await convertToModelMessages(messages),
    system: mergedSystemPrompt,
    temperature: runtimeConfig.temperature,
    tools: {
      ...frontendTools(activeTools),
      ...mcpBundle.tools,
    },
    ...(reasoningOptions.providerOptions
      ? { providerOptions: reasoningOptions.providerOptions }
      : {}),
  });

  // 流式生成结束后关闭 MCP 连接(finishReason 在整轮生成含工具调用完成后 resolve)
  void Promise.resolve(result.finishReason)
    .then(() => mcpBundle.close())
    .catch(() => undefined);

  return result.toUIMessageStreamResponse({
    onError: (error) =>
      error instanceof Error ? error.message : String(error),
  });
}
