import { withAui } from "@assistant-ui/next";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // unpdf 自带 pdf.js 运行时,交由 Node 直接 require,避免被打进服务端 bundle
  serverExternalPackages: ["unpdf"],
};

export default withAui(withNextIntl(nextConfig));
