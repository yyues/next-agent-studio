import { withAui } from "@assistant-ui/next";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {/* config options here */};

export default withAui(withNextIntl(nextConfig));
