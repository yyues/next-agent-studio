import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";
import { AuthBrandPanel, AuthBrandRow } from "./auth-brand-panel";
import { Link } from "@/i18n/navigation";

/**
 * /{locale}/login?from=<被守卫跳转前的路径>
 */
export default async function LoginPage({
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

          <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-muted-foreground mt-1.5 text-sm">{t("subtitle")}</p>

          <Suspense>
            <LoginForm />
          </Suspense>

          <p className="text-muted-foreground mt-6 text-center text-sm">
            {t("noAccount")}{" "}
            <Link
              href="/register"
              className="text-primary hover:text-primary/80 font-medium underline-offset-4 transition-colors hover:underline"
            >
              {t("goRegister")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
