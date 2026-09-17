"use client";

import {
  escapeCurrencyDollars,
  normalizeMathDelimiters,
} from "@assistant-ui/react-markdown";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { memo } from "react";
import "katex/dist/katex.min.css";

// 模型常用 $...$ 写行内公式,开启单美元定界;
// 货币美元由 preprocess 的 escapeCurrencyDollars 保护(代码块内不动)
const math = createMathPlugin({ singleDollarTextMath: true });

const StreamdownTextImpl = () => {
  return (
    <StreamdownTextPrimitive
      caret="block"
      // code=Shiki 高亮 / math=KaTeX / mermaid=流程图,均为显式按需启用
      plugins={{ code, math, mermaid }}
      shikiTheme={["github-light", "github-dark"]}
      // 归一化模型输出的数学定界符(\(..\)、\[..\] 等),并转义货币美元避免误判为公式
      preprocess={(text) => escapeCurrencyDollars(normalizeMathDelimiters(text))}
    />
  );
};

export const StreamdownText = memo(StreamdownTextImpl);
