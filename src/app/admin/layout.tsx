"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  App as AntdApp,
  Button,
  Spin,
  Breadcrumb,
  Tabs,
  type MenuProps,
} from "antd";
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  LogoutOutlined,
  MessageOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  CloseOutlined,
  VerticalRightOutlined,
  VerticalLeftOutlined,
} from "@ant-design/icons";
import { api, type UserInfo } from "@/lib/api";

const { Header, Sider, Content } = Layout;

// ---- 路由与菜单的映射 ----
interface RouteMeta {
  key: string;
  label: string;
  icon: ReactNode;
}

const ROUTES: RouteMeta[] = [
  { key: "/admin/dashboard", label: "看板", icon: <DashboardOutlined /> },
  { key: "/admin/users", label: "用户管理", icon: <UserOutlined /> },
  { key: "/admin/customers", label: "客户管理", icon: <TeamOutlined /> },
];

const ROUTE_MAP = new Map(ROUTES.map((r) => [r.key, r]));
const DEFAULT_TAB_KEY = "/admin/dashboard";

const SIDER_MENU: MenuProps["items"] = ROUTES.map((r) => ({
  key: r.key,
  icon: r.icon,
  label: <Link href={r.key}>{r.label}</Link>,
}));

// ---- 面包屑 ----
function renderBreadcrumb(pathname: string) {
  const items: { title: ReactNode }[] = [{ title: <Link href={DEFAULT_TAB_KEY}>管理后台</Link> }];
  const meta = ROUTE_MAP.get(pathname);
  if (meta && pathname !== DEFAULT_TAB_KEY) {
    items.push({ title: meta.label });
  }
  return <Breadcrumb items={items} style={{ marginBottom: 0 }} />;
}

// ---- 标签页类型 ----
interface TabItem {
  key: string;
  label: string;
  icon: ReactNode;
}

// ---- 右键菜单 ----
function buildContextMenu(
  tabKey: string,
  currentKey: string,
  tabs: TabItem[],
  actions: {
    refresh: () => void;
    closeCurrent: () => void;
    closeOthers: () => void;
    closeAll: () => void;
    closeLeft: () => void;
    closeRight: () => void;
  },
): MenuProps["items"] {
  const isActive = tabKey === currentKey;
  const onlyOne = tabs.length <= 1;
  const idx = tabs.findIndex((t) => t.key === tabKey);
  const hasLeft = idx > 0;
  const hasRight = idx < tabs.length - 1;

  return [
    {
      key: "refresh",
      icon: <ReloadOutlined />,
      label: "刷新页面",
      onClick: actions.refresh,
      disabled: !isActive,
    },
    { type: "divider" },
    {
      key: "closeCurrent",
      icon: <CloseOutlined />,
      label: "关闭当前标签",
      onClick: actions.closeCurrent,
      disabled: onlyOne,
    },
    {
      key: "closeOthers",
      label: "关闭其他标签",
      onClick: actions.closeOthers,
      disabled: tabs.length <= 1,
    },
    { type: "divider" },
    {
      key: "closeLeft",
      icon: <VerticalLeftOutlined />,
      label: "关闭左侧标签",
      onClick: actions.closeLeft,
      disabled: !hasLeft,
    },
    {
      key: "closeRight",
      icon: <VerticalRightOutlined />,
      label: "关闭右侧标签",
      onClick: actions.closeRight,
      disabled: !hasRight,
    },
    { type: "divider" },
    {
      key: "closeAll",
      icon: <CloseOutlined />,
      label: "关闭全部标签",
      onClick: actions.closeAll,
      disabled: tabs.length <= 1,
    },
  ];
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { message } = AntdApp.useApp();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // 标签页
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // ---- 页面缓存（keep-alive）：每个已访问路由的 children ReactNode ----
  const [pageCache, setPageCache] = useState<Map<string, ReactNode>>(new Map());
  // 每个 tab 的刷新计数器，变化时强制 remount
  const [refreshMap, setRefreshMap] = useState<Record<string, number>>({});
  // 保存最新的 children，供 useEffect 缓存
  const childrenRef = useRef<ReactNode>(children);
  childrenRef.current = children;

  const checkRole = useCallback(async () => {
    try {
      const u = await api.me();
      if (!u) {
        router.replace("/login?from=" + encodeURIComponent(pathnameRef.current));
        return;
      }
      if (u.role !== "admin") {
        message.error("需要管理员权限");
        router.replace("/chat?denied=1");
        return;
      }
      setUser(u);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "获取用户信息失败");
    } finally {
      setLoading(false);
    }
  }, [router, message]);

  useEffect(() => {
    checkRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 路由变化：加入标签 + 缓存页面（只缓存一次，保持 state）
  useEffect(() => {
    const meta = ROUTE_MAP.get(pathname);
    if (!meta) return;

    setTabs((prev) => {
      if (prev.some((t) => t.key === pathname)) return prev;
      return [...prev, { key: pathname, label: meta.label, icon: meta.icon }];
    });

    setPageCache((prev) => {
      if (prev.has(pathname)) return prev;
      const next = new Map(prev);
      next.set(pathname, childrenRef.current);
      return next;
    });
  }, [pathname]);

  // ---- 清理缓存工具 ----
  const removeCache = useCallback((key: string) => {
    setPageCache((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setRefreshMap((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // ---- 操作：刷新当前页（递增刷新计数器 → remount） ----
  const refreshTab = useCallback((key: string) => {
    setRefreshMap((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  }, []);

  // ---- 操作：关闭指定标签 ----
  const closeTab = useCallback(
    (targetKey: string) => {
      const cur = tabsRef.current;
      const idx = cur.findIndex((t) => t.key === targetKey);
      if (idx === -1) return;
      if (cur.length <= 1) return;
      const next = cur.filter((t) => t.key !== targetKey);
      setTabs(next);
      removeCache(targetKey);
      if (targetKey === pathnameRef.current) {
        const neighbor = next[Math.min(idx, next.length - 1)];
        if (neighbor) router.push(neighbor.key);
      }
    },
    [router, removeCache],
  );

  // ---- 操作：关闭其他标签 ----
  const closeOthers = useCallback(
    (keepKey: string) => {
      const cur = tabsRef.current;
      const toRemove = cur.filter((t) => t.key !== keepKey).map((t) => t.key);
      setTabs([
        {
          key: keepKey,
          label: ROUTE_MAP.get(keepKey)?.label ?? "",
          icon: ROUTE_MAP.get(keepKey)?.icon,
        },
      ]);
      toRemove.forEach(removeCache);
      if (keepKey !== pathnameRef.current) {
        router.push(keepKey);
      }
    },
    [router, removeCache],
  );

  // ---- 操作：关闭全部 ----
  const closeAll = useCallback(() => {
    const cur = tabsRef.current;
    const toRemove = cur.filter((t) => t.key !== DEFAULT_TAB_KEY).map((t) => t.key);
    setTabs([{ key: DEFAULT_TAB_KEY, label: "看板", icon: <DashboardOutlined /> }]);
    toRemove.forEach(removeCache);
    if (pathnameRef.current !== DEFAULT_TAB_KEY) {
      router.push(DEFAULT_TAB_KEY);
    }
  }, [router, removeCache]);

  // ---- 操作：关闭左侧 ----
  const closeLeft = useCallback(
    (targetKey: string) => {
      const cur = tabsRef.current;
      const idx = cur.findIndex((t) => t.key === targetKey);
      if (idx <= 0) return;
      const keep = cur.slice(idx);
      const toRemove = cur.slice(0, idx).map((t) => t.key);
      setTabs(keep);
      toRemove.forEach(removeCache);
      if (!keep.some((t) => t.key === pathnameRef.current)) {
        router.push(targetKey);
      }
    },
    [router, removeCache],
  );

  // ---- 操作：关闭右侧 ----
  const closeRight = useCallback(
    (targetKey: string) => {
      const cur = tabsRef.current;
      const idx = cur.findIndex((t) => t.key === targetKey);
      if (idx === -1 || idx >= cur.length - 1) return;
      const keep = cur.slice(0, idx + 1);
      const toRemove = cur.slice(idx + 1).map((t) => t.key);
      setTabs(keep);
      toRemove.forEach(removeCache);
      if (!keep.some((t) => t.key === pathnameRef.current)) {
        router.push(targetKey);
      }
    },
    [router, removeCache],
  );

  // ---- Tabs 事件 ----
  const onTabChange = (key: string) => {
    router.push(key);
  };

  const onTabEdit = (
    targetKey: React.MouseEvent | React.KeyboardEvent | string,
    action: "add" | "remove",
  ) => {
    if (action !== "remove" || typeof targetKey !== "string") return;
    closeTab(targetKey);
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spin size="large">
          <div style={{ textAlign: "center", color: "#999" }}>加载中…</div>
        </Spin>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        width={220}
        theme="dark"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        style={{ overflow: "auto", height: "100vh", position: "sticky", top: 0, left: 0 }}
      >
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 600,
            fontSize: collapsed ? 14 : 16,
            letterSpacing: collapsed ? 0 : 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {collapsed ? "🛠️" : "🛠️ 管理后台"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={SIDER_MENU}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <Layout style={{ minHeight: "100vh" }}>
        {/* 顶栏 */}
        <Header
          style={{
            background: "#fff",
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderBottom: "1px solid #f0f0f0",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16 }}
          />
          {renderBreadcrumb(pathname)}
          <div style={{ flex: 1 }} />
          <Button type="text" icon={<MessageOutlined />} onClick={() => router.push("/chat")}>
            聊天首页
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: "logout",
                  icon: <LogoutOutlined />,
                  label: "退出登录",
                  onClick: async () => {
                    await api.logout();
                    router.replace("/login");
                  },
                },
              ],
            }}
          >
            <div
              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Avatar style={{ backgroundColor: "#1677ff" }} size="small">
                {user.name?.[0]?.toUpperCase() ?? <UserOutlined />}
              </Avatar>
              <span style={{ fontSize: 14 }}>
                {user.name} <span style={{ color: "#1677ff" }}>(管理员)</span>
              </span>
            </div>
          </Dropdown>
        </Header>

        {/* 标签页栏 */}
        {tabs.length > 0 && (
          <div
            style={{
              background: "#f5f5f5",
              padding: "4px 12px 0",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <Tabs
              type="card"
              size="small"
              tabBarStyle={{ margin: 0 }}
              activeKey={pathname}
              onChange={onTabChange}
              hideAdd
              items={tabs.map((t) => ({
                key: t.key,
                label: (
                  <Dropdown
                    trigger={["contextMenu"]}
                    menu={{
                      items: buildContextMenu(t.key, pathnameRef.current, tabs, {
                        refresh: () => refreshTab(t.key),
                        closeCurrent: () => closeTab(t.key),
                        closeOthers: () => closeOthers(t.key),
                        closeAll: closeAll,
                        closeLeft: () => closeLeft(t.key),
                        closeRight: () => closeRight(t.key),
                      }),
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        cursor: "default",
                      }}
                    >
                      {t.icon}
                      {t.label}
                    </span>
                  </Dropdown>
                ),
                closable: tabs.length > 1,
              }))}
              style={{ marginBottom: 0 }}
            />
          </div>
        )}

        {/* 内容区：渲染所有已缓存页面，活动页显示，其余隐藏（keep-alive） */}
        <Content
          style={{
            margin: 0,
            padding: 24,
            background: "#f5f7fa",
            minHeight: "calc(100vh - 64px - 44px)",
          }}
        >
          {Array.from(pageCache.entries()).map(([key, node]) => (
            <div
              key={key}
              style={{
                display: key === pathname ? "block" : "none",
                height: "100%",
              }}
            >
              {/* key 变化时 remount（刷新操作） */}
              <div key={`${key}-${refreshMap[key] || 0}`}>{node}</div>
            </div>
          ))}
        </Content>
      </Layout>

      {/* 标签样式 */}
      <style jsx global>{`
        .ant-tabs.card-tab > .ant-tabs-nav .ant-tabs-tab {
          border-radius: 4px 4px 0 0;
          border: 1px solid #e8e8e8 !important;
          border-bottom: none !important;
          background: #fafafa;
          margin-right: 4px !important;
          padding: 3px 12px !important;
          height: 28px !important;
          line-height: 22px !important;
          font-size: 13px;
          transition: all 0.15s;
        }
        .ant-tabs.card-tab > .ant-tabs-nav .ant-tabs-tab:hover {
          background: #e6f4ff;
          border-color: #91caff !important;
        }
        .ant-tabs.card-tab > .ant-tabs-nav .ant-tabs-tab.ant-tabs-tab-active {
          background: #fff;
          border-color: #91caff !important;
          color: #1677ff;
          font-weight: 500;
        }
        .ant-tabs.card-tab > .ant-tabs-nav {
          margin-bottom: 0 !important;
        }
        .ant-tabs.card-tab > .ant-tabs-nav::before {
          display: none;
        }
        .ant-tabs.card-tab .ant-tabs-tab .ant-tabs-tab-remove {
          margin-inline-start: 4px;
          font-size: 12px;
        }
      `}</style>
    </Layout>
  );
}
