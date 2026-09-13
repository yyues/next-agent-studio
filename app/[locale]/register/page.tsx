import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { RegisterForm } from "./register-form";
import { AuthBrandPanel, AuthBrandRow } from "../login/auth-brand-panel";
import { Link } from "@/i18n/navigation";

/**
 * /{locale}/register — 新用户注册,成功后直接登录进入 /chat
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "login" });

  return (
    <div className="bg-background text-foreground flex min-h-dvh">
      <AuthBrandPanel />

      <div className="flex flex-1 items-center justify-center p-6 lg:max-w-md xl:max-w-lg">
        <div className="w-full max-w-sm">
          <AuthBrandRow />

          <h2 className="text-2xl font-semibold tracking-tight">
            {t("registerTitle")}
          </h2>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {t("registerSubtitle")}
          </p>

          <Suspense>
            <RegisterForm />
          </Suspense>

          <p className="text-muted-foreground mt-6 text-center text-sm">
            {t("hasAccount")}{" "}
            <Link
              href="/login"
              className="text-primary hover:text-primary/80 font-medium underline-offset-4 transition-colors hover:underline"
            >
              {t("goLogin")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
