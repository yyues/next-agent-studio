"use client";

import { useEffect, type FC } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  type LexicalEditor,
} from "lexical";
import { $createDirectiveNode } from "@assistant-ui/react-lexical";

/**
 * 建议 chip 的外部插入桥。
 *
 * 开场建议(ThreadSuggestions)在输入框组件树之外,拿不到 Lexical editor
 * 上下文;本插件渲染在 LexicalComposerInput 内部,把 editor 实例登记到
 * 模块级变量,暴露 insertSuggestionChip 供外部调用。
 *
 * 建议 chip 复用指令节点(DirectiveNode):directiveText = 建议原文,
 * 发送时按纯文本并入消息(不带 "/" 前缀,服务端不会当作命令解析);
 * 视觉与退格选中/删除等交互由现有 chip 体系(ChipSpacingPlugin)接管。
 */

let registeredEditor: LexicalEditor | null = null;

/** 输入框卸载时注销,避免向已销毁 editor 提交 update */
export const ComposerSuggestionBridge: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    registeredEditor = editor;
    return () => {
      if (registeredEditor === editor) registeredEditor = null;
    };
  }, [editor]);

  return null;
};

let suggestionSeq = 0;

/** 向输入框末尾插入建议 chip(输入框未挂载时返回 false) */
export function insertSuggestionChip(text: string): boolean {
  const editor = registeredEditor;
  if (!editor) return false;

  editor.update(() => {
    const root = $getRoot();
    const last = root.getLastChild();
    // 末段是段落则续接,否则新建段落(空输入框场景)
    const paragraph = $isParagraphNode(last)
      ? last
      : root.append($createParagraphNode());
    const chip = $createDirectiveNode(
      {
        id: `suggestion:${++suggestionSeq}`,
        type: "suggestion",
        label: text,
      },
      text,
    );
    // 尾随空格让光标落在 chip 之后,用户可直接续写补充
    const space = $createTextNode(" ");
    paragraph.append(chip, space);
    space.select();
  });
  editor.focus();
  return true;
}
