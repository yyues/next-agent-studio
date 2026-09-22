import type { Unstable_DirectiveFormatter } from "@assistant-ui/react";

/**
 * "/" 指令(斜杠命令)与 "@" 提及(MCP server)的解析与序列化。
 *
 * 格式约定:命令以 `/名称`、提及以 `@名称` 内嵌在消息纯文本里
 * (如 "/weather 查上海天气"、"@weather 查上海天气"),
 * 仅当触发符位于文本开头或空白之后才视为指令(避免误伤 URL、路径、邮箱)。
 * 名称支持 字母/数字/下划线/连字符/中文。
 */

export type SlashSegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; type: string; label: string; id: string };

/** 内置的单轮计划模式命令，不与角色技能混用。 */
export const PLAN_COMMAND = "plan";

const NAME_RE = /[A-Za-z0-9_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5-]*/;

/** 判断 text[i] 处的触发符是否处于词首(空白/行首/括号后) */
function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  return /\s/.test(prev) || prev === "(" || prev === "（";
}

type PositionedSegment = {
  start: number;
  end: number;
  segment: SlashSegment;
};

/** 扫描单个触发符的全部命中(不校验名称是否已知,由调用方回退) */
function scanTrigger(text: string, trigger: string, segmentType: string): PositionedSegment[] {
  const found: PositionedSegment[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== trigger) continue;
    if (!isWordStart(text, i)) continue;
    const rest = text.slice(i + 1);
    const m = NAME_RE.exec(rest);
    if (!m) continue;
    const name = m[0];
    found.push({
      start: i,
      end: i + 1 + name.length,
      segment: {
        kind: "mention",
        type: segmentType,
        label: name,
        id: name.toLowerCase(),
      },
    });
    i = i + name.length;
  }
  return found;
}

function buildSegments(text: string, positioned: PositionedSegment[]): SlashSegment[] {
  const segments: SlashSegment[] = [];
  let last = 0;
  for (const { start, end, segment } of positioned) {
    if (last < start) segments.push({ kind: "text", text: text.slice(last, start) });
    segments.push(segment);
    last = end;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

/**
 * 将文本切分为 纯文本 / 命令mention 段落。
 * 不校验命令是否已知——由调用方(registry)决定未知的按纯文本回退。
 */
export function parseSlashSegments(text: string): SlashSegment[] {
  return buildSegments(text, scanTrigger(text, "/", "command"));
}

/** 将文本切分为 纯文本 / @提及 段落(与后端 extractMcpMentions 同一形态) */
export function parseMentionSegments(text: string): SlashSegment[] {
  return buildSegments(text, scanTrigger(text, "@", "mention"));
}

/** 同时识别 /命令 与 @提及(用户气泡 chip 渲染用),按出现位置合并 */
export function parseDirectiveSegments(text: string): SlashSegment[] {
  const all = [...scanTrigger(text, "/", "command"), ...scanTrigger(text, "@", "mention")].sort(
    (a, b) => a.start - b.start,
  );
  return buildSegments(text, all);
}

/** 提取文本中全部命令名(去重,小写) */
export function extractCommandTokens(text: string): string[] {
  const names = new Set<string>();
  for (const seg of parseSlashSegments(text)) {
    if (seg.kind === "mention") names.add(seg.id);
  }
  return Array.from(names);
}

/**
 * TriggerPopover 的自定义 Directive formatter:
 * 选中命令后向输入框插入 `/名称 `(可读性好,服务端与历史渲染共用同一解析)。
 */
export const slashDirectiveFormatter: Unstable_DirectiveFormatter = {
  serialize: (item) => `/${(item.metadata?.name as string | undefined) ?? item.label}`,
  parse: (text) => parseSlashSegments(text),
};

/**
 * "@" 提及(MCP server)formatter:序列化为 `@名称`。
 * Lexical 输入框会在选中指令后插入独立的尾随空格文本节点，既保证
 * 后端名称解析有边界，也让用户能看到并删除这个空格。
 */
export const mentionDirectiveFormatter: Unstable_DirectiveFormatter = {
  serialize: (item) => `@${(item.metadata?.name as string | undefined) ?? item.label}`,
  parse: (text) => parseMentionSegments(text),
};
