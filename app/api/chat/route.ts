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
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
    userId?: string;
    roleId?: string;
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

  const mergedSystemPrompt = [runtimeConfig.systemPrompt, system]
    .filter(Boolean)
    .join("\n\n");

  const result = streamText({
    model: runtimeConfig.model,
    messages: await convertToModelMessages(messages),
    system: mergedSystemPrompt,
    tools: {
      ...frontendTools(activeTools),
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) =>
      error instanceof Error ? error.message : String(error),
  });
}
