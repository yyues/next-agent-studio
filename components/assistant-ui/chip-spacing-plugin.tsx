"use client";

import { useEffect, type FC } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createTextNode } from "lexical";
import { DirectiveNode } from "@assistant-ui/react-lexical";

/**
 * chip 尾随空格插件:
 * 指令 chip 插入到内容末尾(无后继节点)时,自动补一个空格文本节点。
 * 原因:chip 后无任何文本时,Chromium 把光标画在 chip 盒子边缘(贴边);
 * 有了空格节点,光标落在空格之后,与 chip 天然保持间距——Slack/Discord
 * 提及组件的同款做法。用户手动删掉空格不会被反复补回(transform 仅在
 * chip 节点自身变更时触发)。
 */
export const ChipSpacingPlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(DirectiveNode, (node) => {
      if (node.getNextSibling() !== null) return;
      node.insertAfter($createTextNode(" "));
    });
  }, [editor]);

  return null;
};
