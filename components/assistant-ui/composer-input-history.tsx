"use client";

import type { KeyboardEvent } from "react";
import { unstable_useComposerInputHistory, useAuiState } from "@assistant-ui/react";

/**
 * 终端式输入历史:空输入框按 ↑ 召回已发送消息、↓ 往回翻(官方 unstable_useComposerInputHistory)。
 *
 * 官方 hook 面向 ComposerPrimitive.Input(textarea),本项目用 Lexical contenteditable,
 * 因此这里给事件包一层 Proxy,把 currentTarget 垫片成 textarea 形状:
 * - value 取 composer 运行时文本(SyncPlugin 双向同步,与编辑器一致)
 * - 光标偏移用 Selection API 从真实 DOM 折算;选区非折叠时给出不相等的
 *   selectionStart/End,让官方 hook 主动放弃(保持其原生语义)
 * - setSelectionRange 置空:setText 后的光标落点由 Lexical SyncPlugin 负责
 */

/** 光标前纯文本长度;选区非折叠或不在输入区 root 内时返回 null */
const caretOffsetWithin = (root: Element | null): number | null => {
  const sel = window.getSelection();
  if (!root || !sel || !sel.rangeCount || !sel.isCollapsed) return null;
  const anchor = sel.getRangeAt(0);
  if (!root.contains(anchor.startContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(anchor.endContainer, anchor.endOffset);
  return pre.toString().length;
};

export const useLexicalComposerInputHistory = () => {
  const history = unstable_useComposerInputHistory();
  const text = useAuiState((s) => s.composer.text);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const root = (e.target as HTMLElement).closest(".aui-lexical-input");
    const caret = caretOffsetWithin(root);
    const shim = {
      value: text,
      selectionStart: caret ?? 0,
      // null(选区非折叠/不在输入区)时故意不相等,官方 hook 检测后直接返回
      selectionEnd: caret === null ? -1 : caret,
      setSelectionRange: () => {},
    };
    history.onKeyDown(
      new Proxy(e, {
        get(target, prop) {
          if (prop === "currentTarget") return shim;
          const v = Reflect.get(target, prop, target);
          return typeof v === "function" ? v.bind(target) : v;
        },
      }) as unknown as KeyboardEvent<HTMLTextAreaElement>,
    );
  };

  return { onKeyDown };
};
