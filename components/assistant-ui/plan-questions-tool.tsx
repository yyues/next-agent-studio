"use client";

import { useCallback, useRef, useState } from "react";
import { makeAssistantTool, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { CheckIcon, CircleHelpIcon, Loader2Icon } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const planQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(6).optional(),
      }),
    )
    .min(1)
    .max(3),
});

function PlanQuestionsCard({ args, status, resume }: ToolCallMessagePartProps) {
  const parsed = planQuestionsSchema.safeParse(args);
  const questions = parsed.success ? parsed.data.questions : [];
  const answersRef = useRef<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [canSubmit, setCanSubmit] = useState(false);

  const recordAnswer = useCallback(
    (questionId: string, value: string) => {
      answersRef.current[questionId] = value;
      const ready = questions.every((question) => answersRef.current[question.id]?.trim());
      setCanSubmit((current) => (current === ready ? current : ready));
    },
    [questions],
  );

  if (status.type === "complete") {
    return (
      <div className="border-border/60 bg-muted/30 my-2 rounded-xl border px-3.5 py-3 text-sm">
        <p className="text-muted-foreground flex items-center gap-1.5">
          <CheckIcon className="size-4 text-emerald-600" />
          已收到计划所需信息，正在生成计划。
        </p>
      </div>
    );
  }

  // 参数流式生成期间只展示稳定的加载提示，避免半成品问题卡片跳动。
  if (status.type === "running") {
    return (
      <div className="text-muted-foreground my-2 flex items-center gap-2 px-1 text-sm">
        <Loader2Icon className="text-primary size-4 animate-spin" />
        正在生成确认问题…
      </div>
    );
  }

  if (status.type !== "requires-action" || !parsed.success || questions.length === 0) return null;

  return (
    <div className="border-primary/25 bg-primary/5 my-2 rounded-xl border px-3.5 py-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <CircleHelpIcon className="text-primary size-4" />
        确认计划细节
      </div>
      <div className="space-y-3">
        {questions.map((question) => (
          <fieldset key={question.id} className="space-y-1.5">
            <legend className="text-sm leading-5">{question.question}</legend>
            {question.options ? (
              <div className="flex flex-wrap gap-1.5">
                {question.options.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={selectedOptions[question.id] === option ? "default" : "outline"}
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => {
                      recordAnswer(question.id, option);
                      setSelectedOptions((current) => ({ ...current, [question.id]: option }));
                    }}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            ) : (
              <input
                defaultValue={answersRef.current[question.id] ?? ""}
                onChange={(event) => recordAnswer(question.id, event.target.value)}
                className={cn(
                  "border-input bg-background placeholder:text-muted-foreground h-8 w-full rounded-md border px-2.5 text-sm outline-none",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                )}
              />
            )}
          </fieldset>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-4"
        disabled={!canSubmit}
        onClick={() => resume({ answers: { ...answersRef.current } })}
      >
        确认并生成计划
      </Button>
    </div>
  );
}

/** 仅在 /plan 请求时由服务端暴露的前端人工澄清工具。 */
export const PlanQuestionsTool = makeAssistantTool({
  toolName: "ask_plan_questions",
  description:
    "计划模式中信息不足时，向用户一次提出 1 至 3 个必要的澄清问题；收到答案后再生成计划。",
  parameters: planQuestionsSchema,
  execute: async (_args, { human }) => human({}),
  render: (props) => <PlanQuestionsCard {...props} />,
});
