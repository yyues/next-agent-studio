"use client";

import { ConfigProvider, App as AntdApp } from "antd";
import zhCN from "antd/locale/zh_CN";

/**
 * 全局 Ant Design Provider：
 * - ConfigProvider（主题/语言中文）
 * - App：子组件内可通过 AntdApp.useApp() 拿到 message/notification/modal
 */
export function AntdRootProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
