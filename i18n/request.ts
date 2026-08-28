import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import zh from "../messages/zh.json";
import en from "../messages/en.json";

const messages: Record<string, Record<string, unknown>> = { zh, en };

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as "zh" | "en")) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: messages[locale] ?? messages[routing.defaultLocale],
  };
});
