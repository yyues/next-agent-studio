// 将 pi-agent-core 的消息 content（string | 数组）渲染成纯文本
export function renderContent(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          const obj = p as Record<string, unknown>;
          if (typeof obj.text === "string") return obj.text;
          if (typeof obj.content === "string") return obj.content;
        }
        return "";
      })
      .join("");
  }
  if (typeof content === "object") return JSON.stringify(content);
  return String(content);
}
