import { getTranslations } from "next-intl/server";

/**
 * 登录/注册页共用的左侧品牌展示区(服务端组件)。
 */
export async function AuthBrandPanel() {
  const appTitle = process.env.APP_TITLE?.trim() || "Agent Studio";
  const t = await getTranslations("login");

  return (
    <div className="from-primary/15 via-primary/5 relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br to-transparent p-10 lg:flex">
      <div
        aria-hidden
        className="bg-primary/5 absolute -top-24 -left-24 size-96 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-primary/10 absolute -right-32 bottom-0 size-[28rem] rounded-full blur-3xl"
      />

      <div className="relative flex items-center gap-2.5">
        <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-xl">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4.5"
            aria-hidden
          >
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
          </svg>
        </span>
        <span className="text-lg font-semibold tracking-tight">{appTitle}</span>
      </div>

      <div className="relative max-w-md">
        <h1 className="text-foreground text-3xl leading-tight font-semibold tracking-tight">
          {t("heroTitle")}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {t("heroSubtitle")}
        </p>
        <ul className="mt-8 grid gap-3 text-sm">
          {(["featureRoles", "featureRag", "featureMcp"] as const).map((key) => (
            <li key={key} className="flex items-center gap-2.5">
              <span className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded-full">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                  aria-hidden
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span className="text-foreground/80">{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-muted-foreground relative text-xs">
        © {new Date().getFullYear()} {appTitle}
      </p>
    </div>
  );
}

/** 移动端顶部的品牌行(与 AuthBrandPanel 同 logo) */
export function AuthBrandRow() {
  const appTitle = process.env.APP_TITLE?.trim() || "Agent Studio";
  return (
    <div className="mb-8 flex items-center gap-2.5 lg:hidden">
      <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-xl">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4.5"
          aria-hidden
        >
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight">{appTitle}</span>
    </div>
  );
}
