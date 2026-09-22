import { frontendTools } from "@assistant-ui/ai-sdk";
import {
  type JSONSchema7,
  streamText,
  convertToModelMessages,
  tool,
  type ToolSet,
  type UIMessage,
} from "ai";
import { getAuthCredentials } from "@/lib/auth";
import { RESUMABLE_STREAM_ID_HEADER } from "assistant-stream/resumable";
import { mongoResumableStore, resumableContext } from "@/lib/resumable/context";
import { z } from "zod";
import { marked } from "marked";
import htmlToDocx from "html-to-docx";
import { filterToolsByRole, resolveRuntimeConfig } from "@/lib/server-settings";
import { getAuthUserId } from "@/lib/auth-request";
import { extractCommandTokens, PLAN_COMMAND } from "@/lib/slash-directive";
import { resolveReasoningOptions } from "@/lib/reasoning";
import { countRoleChunks, searchRoleKnowledge, formatSearchResults } from "@/lib/rag";
import { loadMcpToolsForChat, extractMcpMentions, type McpToolBundle } from "@/lib/mcp/client";

/**
 * MCP 写操作工具的名称启发式(命中即要求用户审批后执行)。
 * 只覆盖明确的变更类动词;get/list/search/read 等查询类放行。
 */
const MCP_WRITE_TOOL_RE =
  /(create|write|update|delete|remove|drop|insert|send|post|patch|rename|move|copy|edit|modify|cancel|submit|publish|deploy|reset|set|add|upload|execute|run|apply|approve|pay|transfer|close|open|start|stop|kill|restart)/i;

/**
 * 从消息列表中提取最后一条用户消息的文本，用于斜杠命令与 MCP @提及解析。
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

/** /plan 的澄清工具已有结果时，下一轮应直接根据答案输出计划。 */
function hasPlanQuestionAnswers(messages: UIMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      (message.parts ?? []).some(
        (part) =>
          (part.type === "tool-ask_plan_questions" &&
            "state" in part &&
            part.state === "output-available") ||
          (part.type === "dynamic-tool" &&
            part.toolName === "ask_plan_questions" &&
            part.state === "output-available"),
      ),
  );
}

export async function POST(req: Request) {
  /* ---------- 文件生成工具族(主流 agent 模式) ----------
   * 能力边界写进 schema:每个工具只接受自己支持的扩展名,模型在结构上
   * 无法请求未支持格式;真需要时会向用户转述可选格式(协商回退)。
   * 模型只产出文本/结构化数据,二进制一律由服务端转换生成:
   * - docx: marked → html-to-docx
   * - xlsx: exceljs(表格 JSON)
   * - pptx: pptxgenjs(幻灯片 JSON)
   * - pdf : 无头浏览器打印(尽力而为,无浏览器时报错让模型改荐 docx)
   */
  const sanitizeName = (filename: string, allowed: RegExp) => {
    const base = filename.replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 80) || "document";
    return allowed.test(base) ? base : `${base}.md`;
  };
  const dataUrl = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString("base64")}`;
  const textUrl = (mime: string, text: string) =>
    `data:${mime};charset=utf-8;base64,${Buffer.from(text, "utf8").toString("base64")}`;

  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  /** 定位本机可用的 Chromium/Edge(仅本地/自托管;Vercel 需配 CHROME_PATH) */
  const findBrowser = () => {
    const candidates = [
      process.env.CHROME_PATH,
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ].filter(Boolean) as string[];
    try {
      const { existsSync } = require("fs") as typeof import("fs");
      return candidates.find((p) => existsSync(p));
    } catch {
      return undefined;
    }
  };

  const DOC_EXTS = ".md/.docx/.txt/.csv/.json/.pdf";

  const generateDocumentTool = tool({
    description:
      "生成文档文件供用户下载,支持 .md/.docx/.txt/.csv/.json/.pdf。当用户要求'生成文档/写报告/导出文件'或调用 docx/文档类技能时必须调用本工具。content 必须是完整的纯 Markdown 文本——严禁输出 base64、二进制、OOXML 或 HTML 转储;.docx/.pdf 由服务端自动转换。不支持 .xlsx(用 generate_spreadsheet)和 .pptx(用 generate_presentation)。",
    inputSchema: z.object({
      filename: z
        .string()
        .min(1)
        .refine((v) => /\.(md|markdown|txt|csv|json|docx|pdf)$/i.test(v), {
          message: `不支持的文档格式。本工具仅支持 ${DOC_EXTS};表格请用 generate_spreadsheet(.xlsx),演示文稿请用 generate_presentation(.pptx)。`,
        })
        .describe("文件名,含扩展名(.md/.docx/.txt/.csv/.json/.pdf)"),
      content: z.string().min(1).describe("完整文档内容(纯 Markdown),不得省略或截断"),
    }),
    execute: async ({ filename, content }) => {
      const base = sanitizeName(filename, /\.(md|markdown|txt|csv|json|docx|pdf)$/i);

      if (/\.docx$/i.test(base)) {
        const html = await marked.parse(content, { async: true });
        const buf = Buffer.from(
          await htmlToDocx(
            `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`,
          ),
        );
        return {
          url: dataUrl(DOCX_MIME, buf),
          filename: base,
          mimeType: DOCX_MIME,
          size: buf.length,
        };
      }

      if (/\.pdf$/i.test(base)) {
        const exe = findBrowser();
        if (!exe)
          throw new Error(
            "当前环境没有可用的浏览器内核,无法生成 PDF;请向用户说明并改用 .docx 生成。",
          );
        const html = await marked.parse(content, { async: true });
        const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;line-height:1.7;margin:2cm 2.2cm;}
          h1{border-bottom:2px solid #333;padding-bottom:6px;} table{border-collapse:collapse;}
          th,td{border:1px solid #999;padding:4px 8px;} code{background:#f4f4f4;padding:1px 4px;}
        </style></head><body>${html}</body></html>`;
        const puppeteer = (await import("puppeteer-core")).default;
        const browser = await puppeteer.launch({
          executablePath: exe,
          args: ["--no-sandbox", "--disable-gpu"],
        });
        try {
          const page_ = await browser.newPage();
          await page_.setContent(page, { waitUntil: "load" });
          const buf = Buffer.from(
            await page_.pdf({
              format: "A4",
              printBackground: true,
              margin: { top: "1.5cm", bottom: "1.5cm", left: "1.5cm", right: "1.5cm" },
            }),
          );
          return {
            url: dataUrl("application/pdf", buf),
            filename: base,
            mimeType: "application/pdf",
            size: buf.length,
          };
        } finally {
          await browser.close();
        }
      }

      const mimeOf: Record<string, string> = {
        md: "text/markdown",
        markdown: "text/markdown",
        txt: "text/plain",
        csv: "text/csv",
        json: "application/json",
      };
      const ext = (base.match(/\.([a-z]+)$/i)?.[1] ?? "md").toLowerCase();
      return {
        url: textUrl(mimeOf[ext] ?? "text/markdown", content),
        filename: base.replace(/\.markdown$/i, ".md"),
        mimeType: mimeOf[ext] ?? "text/markdown",
        size: content.length,
      };
    },
  });

  const generateSpreadsheetTool = tool({
    description:
      "生成 Excel 表格文件(.xlsx)供用户下载。当用户要求'生成表格/Excel/统计表'时必须调用本工具。sheets 为结构化表格数据(每个 sheet 的 rows 为二维数组,第一行默认视为表头)。",
    inputSchema: z.object({
      filename: z
        .string()
        .min(1)
        .refine((v) => /\.xlsx$/i.test(v), {
          message: "本工具仅支持 .xlsx;普通文档请用 generate_document。",
        })
        .describe("文件名,以 .xlsx 结尾,如 sales-report.xlsx"),
      sheets: z
        .array(
          z.object({
            name: z.string().min(1).describe("工作表名(≤31字符)"),
            rows: z
              .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
              .min(1)
              .describe("二维数组;第一行视为表头"),
          }),
        )
        .min(1)
        .describe("工作表列表"),
    }),
    execute: async ({ filename, sheets }) => {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      for (const s of sheets) {
        const ws = wb.addWorksheet(s.name.slice(0, 31) || `Sheet${wb.worksheets.length + 1}`);
        ws.addRows(s.rows);
        if (s.rows[0]) ws.getRow(1).font = { bold: true };
        // 简单自适应列宽:按各列最长内容估
        const colCount = Math.max(...s.rows.map((r) => r.length));
        for (let c = 1; c <= colCount; c++) {
          let maxLen = 8;
          for (const row of s.rows) {
            const v = row[c - 1];
            if (v !== null && v !== undefined) maxLen = Math.max(maxLen, String(v).length + 2);
          }
          ws.getColumn(c).width = Math.min(maxLen, 40);
        }
      }
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      const name = sanitizeName(filename, /\.xlsx$/i);
      return {
        url: dataUrl(XLSX_MIME, buf),
        filename: name,
        mimeType: XLSX_MIME,
        size: buf.length,
      };
    },
  });

  const generatePresentationTool = tool({
    description:
      "生成 PowerPoint 演示文稿(.pptx)供用户下载。当用户要求'生成 PPT/幻灯片/演示文稿'或调用 pptx 类技能时必须调用本工具。slides 为结构化幻灯片数据(标题 + 要点列表)。",
    inputSchema: z.object({
      filename: z
        .string()
        .min(1)
        .refine((v) => /\.pptx$/i.test(v), {
          message: "本工具仅支持 .pptx;普通文档请用 generate_document。",
        })
        .describe("文件名,以 .pptx 结尾,如 product-intro.pptx"),
      slides: z
        .array(
          z.object({
            title: z.string().min(1).describe("幻灯片标题"),
            bullets: z.array(z.string()).default([]).describe("要点列表"),
            notes: z.string().optional().describe("演讲者备注"),
          }),
        )
        .min(1)
        .describe("幻灯片列表"),
    }),
    execute: async ({ filename, slides }) => {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_16x9";
      for (const s of slides) {
        const slide = pptx.addSlide();
        slide.addText(s.title, {
          x: 0.5,
          y: 0.4,
          w: 9,
          h: 0.9,
          fontSize: 30,
          bold: true,
          color: "1F2937",
        });
        if (s.bullets.length > 0) {
          slide.addText(
            s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
            {
              x: 0.8,
              y: 1.5,
              w: 8.4,
              h: 3.6,
              fontSize: 16,
              color: "374151",
              lineSpacingMultiple: 1.4,
            },
          );
        }
        if (s.notes) slide.addNotes(s.notes);
      }
      const b64 = (await pptx.write({ outputType: "base64" })) as string;
      const name = sanitizeName(filename, /\.pptx$/i);
      return {
        url: `data:${PPTX_MIME};base64,${b64}`,
        filename: name,
        mimeType: PPTX_MIME,
        size: Math.floor((b64.length * 3) / 4),
      };
    },
  });

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

  const normalizedUserId = await getAuthUserId(req, userId ?? req.headers.get("x-user-id"));

  const lastUserQuery = extractLastUserQuery(messages);
  // "/" 斜杠命令:显式调用技能(仅注入命中技能)与 MCP 服务器(强制连接)
  const commandTokens = extractCommandTokens(lastUserQuery);
  const planMode = commandTokens.includes(PLAN_COMMAND);
  const invokedSkillCommands = commandTokens.filter((command) => command !== PLAN_COMMAND);
  const planQuestionsAnswered = hasPlanQuestionAnswers(messages);

  const runtimeConfig = await resolveRuntimeConfig({
    userId: normalizedUserId,
    requestedRoleId: roleId,
    invokedSkillCommands,
  });

  const activeTools = filterToolsByRole(tools ?? {}, runtimeConfig.role.toolToggles);
  // 计划澄清工具仅在 /plan 时向模型公开，避免普通对话误触发问答卡片。
  const { ask_plan_questions: planQuestionsTool, ...standardFrontendTools } = activeTools;
  const shouldAskPlanQuestions = planMode && !planQuestionsAnswered && Boolean(planQuestionsTool);

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

  // RAG:角色有知识库切片时挂载 rag_search 工具,由模型按需检索
  // (不再每轮自动检索注入 system prompt)。检索失败降级为不挂载。
  // MCP:自动加载角色显式挂载的 server；消息中 @serverName 或 /serverName 可单次启用
  // 未挂载的 server（未知名称不会命中任何 server，自然忽略）。
  // 单个 server 连接失败自动跳过,不阻断对话。
  let mcpBundle: McpToolBundle = {
    tools: {},
    serverSummaries: [],
    close: async () => undefined,
  };
  // MCP 连接与切片计数互不依赖,并行执行省一段串行等待
  const [mcpLoaded, ragEnabled] = await Promise.all([
    planMode
      ? Promise.resolve(undefined)
      : loadMcpToolsForChat({
          userId: normalizedUserId,
          roleId: runtimeConfig.role.roleId,
          // / 选中的 MCP 与 @ 提及一样，都会在本轮显式挂载。
          mentionNames: [...extractMcpMentions(lastUserQuery), ...invokedSkillCommands],
        }).catch((error) => {
          // 单个 server 连接失败自动跳过,不阻断对话
          console.warn("[chat] MCP tools load failed:", error);
          return undefined;
        }),
    planMode
      ? Promise.resolve(false)
      : countRoleChunks(runtimeConfig.role.roleId)
          .then((n) => n > 0)
          .catch(() => false),
  ]);
  if (mcpLoaded) mcpBundle = mcpLoaded;

  const ragSearchTool = tool({
    description:
      "检索当前角色知识库(用户上传的 PDF/Markdown/TXT 资料切片)。当用户问题可能涉及已上传的资料、需要引用资料原文或出处时调用;一次结果不理想可换关键词再次调用。返回带来源文件与页码的切片列表,引用时请注明出处。多个来源对同一问题给出不一致信息时,不要悄悄混合:并列说明各来源的说法(含来源与页码)并指出差异;带[权威资料]标注的来源为该角色指定的权威版本,优先采信。",
    inputSchema: z.object({
      query: z.string().min(1).describe("检索关键词或问题,优先使用资料中可能出现的原词表述"),
      topK: z.number().int().min(1).max(8).optional().describe("返回条数,默认 5"),
    }),
    execute: async ({ query, topK }) => {
      const hits = await searchRoleKnowledge(
        runtimeConfig.role.roleId,
        query,
        runtimeConfig.provider,
        topK ? { topK } : undefined,
      );
      return { results: formatSearchResults(hits) };
    },
  });

  const mcpPromptSection =
    mcpBundle.serverSummaries.length > 0
      ? [
          "你可以调用以下外部 MCP 工具(工具名以 mcp__ 开头):",
          ...mcpBundle.serverSummaries.map(
            (s) => `- ${s.name} (serverId: ${s.serverId}): ${s.toolNames.join(", ") || "无工具"}`,
          ),
          "用户在消息中用 @server名称 指定某个 MCP 时,优先使用该 server 的工具。",
        ].join("\n")
      : "";

  const mergedSystemPrompt = [
    runtimeConfig.systemPrompt,
    mcpPromptSection,
    system,
    deepThinkingInstruction,
    planMode
      ? planQuestionsAnswered
        ? "计划模式已开启，用户已回答澄清问题。仅根据原始需求和回答输出清晰、可执行的分步计划，包含目标、关键步骤、依赖或风险及验证方式。不得调用工具、不得执行操作、不得声称已完成未实际执行的工作。"
        : "计划模式已开启：必须调用 ask_plan_questions 一次，提出 1 至 3 个会显著影响计划的澄清问题，然后等待用户回答。不要在调用前输出计划或问题正文。除 ask_plan_questions 外不得调用工具、不得执行操作、不得声称已完成未实际执行的工作。"
      : "",
    "重要:凡用户请求包含「生成/写/导出/给我 … 文档/报告/文件/表格/PPT」意图,必须调用文件生成工具把完整内容做成文件,禁止只在回复正文里粘贴长文档;回复正文仅用一两句话说明已生成什么文件。格式路由:普通文档(.md/.docx/.txt/.csv/.json/.pdf)→generate_document(给纯 Markdown);Excel(.xlsx)→generate_spreadsheet(给 sheets 结构化数据);PPT(.pptx)→generate_presentation(给 slides 结构化数据)。用户要的格式不在支持列表时,明确告知并推荐最接近的已支持格式。",
    "技能说明若要求运行脚本/代码(如 docx/pptx/xlsx 技能的 python 工作流),忽略该执行方式——本环境无代码执行;改为调用对应的文件生成工具,服务端负责转换成目标格式。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = streamText({
    model: runtimeConfig.model,
    messages: await convertToModelMessages(messages),
    system: mergedSystemPrompt,
    temperature: runtimeConfig.temperature,
    tools: (planMode
      ? shouldAskPlanQuestions
        ? frontendTools(planQuestionsTool ? { ask_plan_questions: planQuestionsTool } : {})
        : {}
      : {
          ...frontendTools(standardFrontendTools),
          ...mcpBundle.tools,
          ...(ragEnabled ? { rag_search: ragSearchTool } : {}),
          generate_document: generateDocumentTool,
          generate_spreadsheet: generateSpreadsheetTool,
          generate_presentation: generatePresentationTool,
        }) as ToolSet,
    // HITL:MCP 工具按名称启发式判定写操作(改/删/发/建等),执行前需用户审批;
    // 内置文档生成等本地工具只产出文件,不触外部系统,无需审批
    toolApproval: ({ toolCall }) => {
      const name = toolCall.toolName;
      if (!name.startsWith("mcp__")) return "not-applicable";
      return MCP_WRITE_TOOL_RE.test(name)
        ? {
            type: "user-approval",
            reason: "该 MCP 工具可能修改外部数据,请确认是否执行",
          }
        : "not-applicable";
    },
    // HMAC 签名防伪造审批(与 auth 同源派生,可用 TOOL_APPROVAL_SECRET 覆盖)
    experimental_toolApprovalSecret:
      process.env.TOOL_APPROVAL_SECRET ??
      (() => {
        const { username, password } = getAuthCredentials();
        return `tool-approval:${username}:${password}`;
      })(),
    ...(reasoningOptions.providerOptions
      ? { providerOptions: reasoningOptions.providerOptions }
      : {}),
  });

  // 流式生成结束后关闭 MCP 连接(finishReason 在整轮生成含工具调用完成后 resolve)
  void Promise.resolve(result.finishReason)
    .then(() => mcpBundle.close())
    .catch(() => undefined);

  // 可恢复流:live 分支直发客户端——Mongo 版 store 的 append 每 chunk 两次
  // 库往返、read 为 500ms 轮询,若响应走 store 会让流式慢一个数量级;
  // backup 分支由后台 producer 落库,仅供断线/刷新后 resume 重放。
  const streamId = crypto.randomUUID();
  const source = result.toUIMessageStreamResponse({
    onError: (error) => (error instanceof Error ? error.message : String(error)),
    // 部分 OpenAI-compatible 服务即使收到 reasoning_effort: none 仍会回传
    // reasoning token。关闭开关时不要把这类内部内容透传到客户端。
    sendReasoning: deepThinking === true,
  });
  const [liveBody, backupBody] = source.body!.tee();
  void resumableContext
    .run(streamId, () => backupBody)
    .then(async (consumer) => {
      // 客户端消费的是 live 分支,consumer 无人读,立即关停其轮询;
      // 此刻 acquire 已完成,再绑属主不会因 meta 未建而丢失
      await consumer.cancel();
      await mongoResumableStore.setOwner(streamId, normalizedUserId);
    })
    .catch(() => undefined);
  return new Response(liveBody, {
    headers: {
      "Content-Type": "text/event-stream",
      [RESUMABLE_STREAM_ID_HEADER]: streamId,
      "x-accel-buffering": "no",
    },
  });
}
