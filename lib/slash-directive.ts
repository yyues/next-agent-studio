import type { Unstable_DirectiveFormatter } from "@assistant-ui/react";

/**
 * "/" 指令(斜杠命令)的解析与序列化。
 *
 * 格式约定:命令以 `/名称` 内嵌在消息纯文本里(如 "/weather 查上海天气"),
 * 仅当 / 位于文本开头或空白之后才视为命令(避免误伤 URL、路径、除号)。
 * 名称支持 字母/数字/下划线/连字符/中文。
 */

export type SlashSegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; type: string; label: string; id: string };

const NAME_RE = /[A-Za-z0-9_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5-]*/;

/** 判断 text[i] 处的 "/" 是否处于命令位置(词首) */
function isCommandStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  return /\s/.test(prev) || prev === "(" || prev === "（";
}

/**
 * 将文本切分为 纯文本 / 命令mention 段落。
 * 不校验命令是否已知——由调用方(registry)决定未知的按纯文本回退。
 */
export function parseSlashSegments(text: string): SlashSegment[] {
  const segments: SlashSegment[] = [];
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "/") continue;
    if (!isCommandStart(text, i)) continue;
    const rest = text.slice(i + 1);
    const m = NAME_RE.exec(rest);
    if (!m) continue;
    const name = m[0];
    if (last < i) segments.push({ kind: "text", text: text.slice(last, i) });
    segments.push({
      kind: "mention",
      type: "command",
      label: name,
      id: name.toLowerCase(),
    });
    last = i + 1 + name.length;
    i = last - 1;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
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
