"use client";

import { useState, type FC, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { setClientRuntimeContext } from "@/lib/client-runtime-context";

/**
 * 登录表单。
 * 成功后:将 userId 同步到运行时上下文(角色/会话/MCP 均按 userId 隔离),跳回 from 或 /chat。
 */
export const LoginForm: FC = () => {
  const t = useTranslations("login");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [field, setField] = useState<"email" | "password" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // 就近校验:错误显示在对应字段下方并聚焦
    if (!email.trim()) {
      setError(t("errorEmailRequired"));
      setField("email");
      return;
    }
    if (!password) {
      setError(t("errorPasswordRequired"));
      setField("password");
      return;
    }

    setError("");
    setField(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === "INVALID_CREDENTIALS") {
          setError(t("errorInvalid"));
          setField("password");
        } else {
          setError(t("errorServer"));
        }
        return;
      }

      setClientRuntimeContext({ userId: email.trim().toLowerCase() });
      // from 可能已带 locale 前缀(next-intl router 会再补一次导致 /zh/zh),先剥掉
      const from = searchParams.get("from")?.replace(/^\/(zh|en)(?=\/|$)/, "");
      router.replace(from && from.startsWith("/") ? from : "/chat");
      router.refresh();
    } catch {
      setError(t("errorServer"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputBase =
    "bg-background border-input h-11 w-full rounded-md border px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-2 disabled:opacity-50";

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-4" noValidate>
      <label htmlFor="login-email" className="grid gap-1.5">
        <span className="text-foreground text-sm font-medium">{t("email")}</span>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          aria-invalid={field === "email" || undefined}
          className={inputBase}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-foreground text-sm font-medium">{t("password")}</span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            aria-invalid={field === "password" || undefined}
            className={`${inputBase} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-11 items-center justify-center transition-colors"
          >
            {showPassword ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </button>
        </div>
      </label>

      {/* 就近错误提示(role=alert 读屏可感知) */}
      <p
        role="alert"
        aria-live="polite"
        className={`text-destructive min-h-5 text-xs ${
          error ? "" : "invisible"
        }`}
      >
        {error || "\u00A0"}
      </p>

      <button
        type="submit"
        disabled={submitting}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:ring-primary/40 focus-visible:ring-2 disabled:opacity-60 active:scale-[0.99] motion-reduce:transition-none"
      >
        {submitting && <Loader2Icon className="size-4 animate-spin" />}
        {submitting ? t("signingIn") : t("signIn")}
      </button>
    </form>
  );
};
