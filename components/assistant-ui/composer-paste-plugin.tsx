"use client";

import { useEffect, type FC } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  PASTE_COMMAND,
  COMMAND_PRIORITY_HIGH,
  type LexicalNode,
} from "lexical";
import { useAui } from "@assistant-ui/react";
import { $createDirectiveNode } from "@assistant-ui/react-lexical";
import { parseDirectiveSegments } from "@/lib/slash-directive";
import { useCommandRegistry } from "@/lib/command-registry";

/** Handles clipboard images and preserves directive chips when text is pasted. */
export const ComposerPastePlugin: FC = () => {
  const [editor] = useLexicalComposerContext();
  const aui = useAui();
  const commands = useCommandRegistry((state) => state.commands);

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false;
        const clipboard = event.clipboardData;
        if (!clipboard) return false;

        const files = Array.from(clipboard.files).filter((file) => file.type.startsWith("image/"));
        const text = clipboard.getData("text/plain");
        if (files.length === 0 && !text) return false;

        event.preventDefault();
        for (const file of files) void aui.composer.addAttachment(file);

        if (text) {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            const nodes: LexicalNode[] = [];
            for (const segment of parseDirectiveSegments(text)) {
              if (segment.kind === "text") {
                if (segment.text) nodes.push($createTextNode(segment.text));
                continue;
              }
              const trigger = segment.type === "mention" ? "@" : "/";
              const command = commands.find(
                (entry) =>
                  (entry.type === "mcp" || segment.type === "command") &&
                  (entry.name.toLowerCase() === segment.id ||
                    entry.id.toLowerCase() === segment.id),
              );
              const isKnown =
                segment.type === "command"
                  ? segment.id === "plan" || command != null
                  : command?.type === "mcp";
              if (!isKnown) {
                nodes.push($createTextNode(`${trigger}${segment.label}`));
                continue;
              }
              nodes.push(
                $createDirectiveNode(
                  {
                    id: segment.id === "plan" ? "plan" : `${command?.type}:${command?.id}`,
                    type: segment.type === "mention" ? "mention" : (command?.type ?? "skill"),
                    label: segment.label,
                    metadata: { name: command?.name ?? segment.label, kind: segment.type },
                  },
                  `${trigger}${segment.label}`,
                ),
              );
            }
            if (nodes.length > 0) selection.insertNodes(nodes);
          });
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [aui.composer, commands, editor]);

  return null;
};
