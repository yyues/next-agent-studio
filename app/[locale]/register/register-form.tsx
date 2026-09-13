"use client";

import { useState, type FC, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { setClientRuntimeContext } from "@/lib/client-runtime-context";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 注册表单:邮箱 + 密码 + 确认密码。
 * 校验规则就近展示;blur 时校验(非每次击键);成功即登录并跳转。
 */
export const RegisterForm: FC = () => {
  const t = useTranslations("login");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirm?: string;
    form?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (field: "email" | "password" | "confirm") => {
    setErrors((prev) => {
      const next = { ...prev };
      if (field === "email") {
        next.email = !email.trim()
          ? t("errorEmailRequired")
          : !EMAIL_PATTERN.test(email.trim())
            ? t("errorEmailPattern")
            : undefined;
      }
      if (field === "password") {
        next.password =
          password.length < 6 ? t("errorPasswordPattern") : undefined;
      }
      if (field === "confirm") {
        next.confirm =
          confirm !== password ? t("errorConfirmMismatch") : undefined;
      }
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    validate("email");
    validate("password");
    validate("confirm");
    if (
      !EMAIL_PATTERN.test(email.trim()) ||
      password.length < 6 ||
      confirm !== password
    ) {
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === "EMAIL_TAKEN") {
          setErrors({ email: t("errorEmailTaken") });
        } else if (data.error === "INVALID_EMAIL") {
          setErrors({ email: t("errorEmailPattern") });
        } else if (data.error === "INVALID_PASSWORD") {
          setErrors({ password: t("errorPasswordPattern") });
        } else {
          setErrors({ form: t("errorServer") });
        }
        return;
      }

      setClientRuntimeContext({ userId: email.trim().toLowerCase() });
      // from 可能已带 locale 前缀(next-intl router 会再补一次导致 /zh/zh),先剥掉
      const from = searchParams.get("from")?.replace(/^\/(zh|en)(?=\/|$)/, "");
      router.replace(from && from.startsWith("/") ? from : "/chat");
      router.refresh();
    } catch {
      setErrors({ form: t("errorServer") });
    } finally {
      setSubmitting(false);
    }
  };

  const inputBase = (invalid?: boolean) =>
    `bg-background border-input h-11 w-full rounded-md border px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-2 ${
      invalid ? "border-destructive" : ""
    }`;

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <label htmlFor="reg-email" className="text-foreground text-sm font-medium">
          {t("email")}
        </label>
        <input
          id="reg-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => validate("email")}
          autoComplete="email"
          aria-invalid={!!errors.email || undefined}
          aria-describedby="reg-email-hint"
          className={inputBase(!!errors.email)}
        />
        {/* 常驻规则提示(渐进披露):格式要求始终可见 */}
        <p
          id="reg-email-hint"
          className={`text-xs ${errors.email ? "text-destructive" : "text-muted-foreground"}`}
        >
          {errors.email ?? t("emailHint")}
        </p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="reg-password" className="text-foreground text-sm font-medium">
          {t("password")}
        </label>
        <div className="relative">
          <input
            id="reg-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => validate("password")}
            autoComplete="new-password"
            aria-invalid={!!errors.password || undefined}
            aria-describedby="reg-password-hint"
            className={`${inputBase(!!errors.password)} pr-11`}
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
        <p
          id="reg-password-hint"
          className={`text-xs ${errors.password ? "text-destructive" : "text-muted-foreground"}`}
        >
          {errors.password ?? t("passwordHint")}
        </p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="reg-confirm" className="text-foreground text-sm font-medium">
          {t("confirmPassword")}
        </label>
        <input
          id="reg-confirm"
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => validate("confirm")}
          autoComplete="new-password"
          aria-invalid={!!errors.confirm || undefined}
          className={inputBase(!!errors.confirm)}
        />
        {errors.confirm && (
          <p role="alert" className="text-destructive text-xs">
            {errors.confirm}
          </p>
        )}
      </div>

      {errors.form && (
        <p role="alert" aria-live="polite" className="text-destructive text-xs">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:ring-primary/40 focus-visible:ring-2 disabled:opacity-60 active:scale-[0.99] motion-reduce:transition-none"
      >
        {submitting && <Loader2Icon className="size-4 animate-spin" />}
        {submitting ? t("registering") : t("register")}
      </button>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {t("registerAgreement")}
      </p>
    </form>
  );
};
