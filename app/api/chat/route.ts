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

export async function POST(req: Request) {
  const {
    messages,
    system,
    tools,
    userId,
    roleId,
    deepThinking,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
    userId?: string;
    roleId?: string;
    deepThinking?: boolean;
    // conversationId 由客户端携带（见 assistant.tsx），服务端预留用于会话维度
    conversationId?: string;
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

  // 深度思考：追加分步推理指令（模型无关）。若模型原生支持 reasoning
  // tokens，可在此改用 providerOptions.reasoning 等更细粒度控制。
  const deepThinkingInstruction = deepThinking
    ? "在回答前请先进行深度思考与分步推理：先简述思路、拆解关键问题，再逐步推演，最后给出明确的最终结论。"
    : "";

  const mergedSystemPrompt = [
    runtimeConfig.systemPrompt,
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
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) =>
      error instanceof Error ? error.message : String(error),
  });
}
