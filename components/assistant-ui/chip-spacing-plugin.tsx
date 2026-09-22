"use client";

import { useEffect, type FC } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $createNodeSelection,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $nodesOfType,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  type LexicalNode,
  type LexicalEditor,
  type TextNode,
} from "lexical";
import { DirectiveNode } from "@assistant-ui/react-lexical";

/**
 * 指令 chip 辅助插件:
 *
 * 背景两条:
 * - 曾有"chip 后自动补空格"的 transform,但 SyncPlugin 的文本往返会重建
 *   chip 节点,transform 会把用户刚删掉的空格补回,退格永远失效,已移除。
 * - 库默认退格在孤立装饰节点(chip)边界后失效,chip 之后的任何字符都
 *   删不掉。这里显式接管:文本中 → 删前一字符;到头 → 选中前一个 chip
 *   (再按一次删除,Slack 同款语义)。
 */
export const ChipSpacingPlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    registeredEditor = editor;
    return () => {
      if (registeredEditor === editor) registeredEditor = null;
    };
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return false;
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }
        // 无 chip 时完全走库默认行为
        if ($nodesOfType(DirectiveNode).length === 0) return false;

        const anchor = selection.anchor;
        const node = anchor.getNode();
        event.preventDefault();

        if ($isTextNode(node) && anchor.offset > 0) {
          const offset = anchor.offset;
          editor.update(() => {
            spliceAndSelect(node, offset - 1);
          });
          return true;
        }

        // 文本节点开头 或 元素锚点(chip 后光标常落在根元素上,offset 为子节点序号):
        // 定位"前一个内容位置"——向前找最近的有效节点,删除其尾部字符或选中 chip
        editor.update(() => {
          let prev: LexicalNode | null = $isTextNode(node)
            ? node.getPreviousSibling()
            : node.getChildAtIndex(anchor.offset - 1);
          while (prev) {
            const target = tailTextOrDirective(prev);
            if (target.kind === "directive") {
              // 选中 chip:高亮给反馈,下一次退格由库默认删除选中节点
              const nodeSel = $createNodeSelection();
              nodeSel.add(target.node.getKey());
              $setSelection(nodeSel);
              return;
            }
            if (target.kind === "text") {
              spliceAndSelect(target.node as TextNode, target.node.getTextContent().length - 1);
              return;
            }
            prev = prev.getPreviousSibling();
          }
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
};

let registeredEditor: LexicalEditor | null = null;

/**
 * TriggerPopover 选中指令后调用一次，在 chip 后插入真实的可编辑空格。
 * 只响应本次插入，不使用 node transform，避免用户删掉空格后又被自动补回。
 */
export function insertSpaceAfterSelectedDirective(): void {
  const editor = registeredEditor;
  if (!editor) return;

  editor.update(
    () => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

      const anchor = selection.anchor;
      const node = anchor.getNode();
      const previous = $isTextNode(node)
        ? anchor.offset === 0
          ? node.getPreviousSibling()
          : null
        : node.getChildAtIndex(anchor.offset - 1);

      if (!(previous instanceof DirectiveNode)) return;

      if ($isTextNode(node)) {
        if (/^\s/.test(node.getTextContent())) return;
        node.insertBefore($createTextNode(" "));
        node.selectStart();
        return;
      }

      const next = previous.getNextSibling();
      if ($isTextNode(next) && /^\s/.test(next.getTextContent())) {
        next.selectStart();
        return;
      }

      const space = $createTextNode(" ");
      previous.insertAfter(space);
      space.selectEnd();
    },
    { tag: "history-merge" },
  );
}

/** 沿 lastChild 链下潜,找节点最尾部的内容位置(文本或 chip) */
function tailTextOrDirective(node: LexicalNode): {
  kind: "text" | "directive" | "empty";
  node: LexicalNode;
} {
  let cur: LexicalNode = node;
  while (!(cur instanceof DirectiveNode) && !$isTextNode(cur)) {
    const last = (cur as { getLastChild?: () => LexicalNode | null }).getLastChild?.();
    if (!last) return { kind: "empty", node: cur };
    cur = last;
  }
  if (cur instanceof DirectiveNode) return { kind: "directive", node: cur };
  if (cur.getTextContent().length > 0) return { kind: "text", node: cur };
  return { kind: "empty", node: cur };
}

/** 删除 text 节点中 offset 处的一个字符,并把折叠光标移到该处 */
function spliceAndSelect(node: TextNode, offset: number) {
  const text = node.getTextContent();
  node.setTextContent(text.slice(0, offset) + text.slice(offset + 1));
  // TextNode.select:折叠光标落回删除点
  node.select(offset);
}
