"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  sending: boolean;
  disabled: boolean; // 无可用 provider 时禁用
  placeholder: string;
}

// 输入框 + 发送/停止按钮
export function MessageComposer({
  value,
  onChange,
  onSend,
  onStop,
  sending,
  disabled,
  placeholder,
}: Props) {
  return (
    <div className="border-t border-neutral-200 p-4">
      <div className="max-w-3xl mx-auto flex gap-2 items-end">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="flex-1 resize-none rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900 max-h-40"
          style={{ minHeight: "48px" }}
        />
        {sending ? (
          <button
            onClick={onStop}
            className="rounded-xl bg-neutral-300 text-neutral-700 px-4 py-3 font-medium hover:bg-neutral-400"
          >
            停止
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={disabled}
            className="rounded-xl bg-neutral-900 text-white px-5 py-3 font-medium hover:bg-neutral-800 disabled:opacity-40"
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
