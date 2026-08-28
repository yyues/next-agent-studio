# AGENT.md — Agent Demo 项目 AI 编码规范与技术边界

> 本文件定义 AI Agent 在协助开发本项目时必须遵守的技术约束、代码习惯与输出边界。

---

## 1. 项目概览

### 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 16.3 |
| 语言 | TypeScript (严格模式) | 5.x |
| 样式 | Tailwind CSS v4 + Ant Design 6 | - |
| 数据库 | MongoDB (mongodb driver) | 7.x |
| 鉴权 | JWT (jose) + bcryptjs | - |
| 加密 | Node.js crypto (AES-256-GCM) | - |
| 聊天 UI | @assistant-ui/react | 0.15 |
| AI Agent | @earendil-works/pi-agent-core | 0.84 |
| 格式化 | Prettier + prettier-plugin-tailwindcss | 3.x |
| Lint | ESLint (next/core-web-vitals + typescript) | 9.x |

### 核心业务

- **AI 对话聊天**：SSE 流式对话、多会话管理、Provider 配置（加密存储 API Key）
- **用户系统**：注册/登录/登出、JWT Cookie 鉴权、角色（user/admin）
- **管理后台**（需管理员权限）：
  - Dashboard 看板（统计 + 7 日趋势）
  - 用户管理（CRUD + 角色控制 + 重置密码 + 最后管理员保护）
  - 客户管理（CRUD + 试用/延期/禁用 + 状态流转）
  - 标签页 keep-alive + 右键菜单 + 侧边栏折叠

### 关键架构决策

1. **Middleware 只做路由级鉴权**（Edge Runtime 兼容），DB 回查由 API 路由内部 `requireAdmin()` 兜底
2. **JWT 携带 role 字段**，减少 middleware 回查 DB 的开销
3. **Provider API Key 使用 AES-256-GCM 加密** 存储
4. **Keep-Alive 通过页面缓存 Map 实现**，切换标签不销毁 React 组件树
5. **SSE 流式**：`/api/chat/stream` 发送 `event: delta` 事件

---

## 2. 目录结构

```
src/
├── app/                          # Next.js App Router 页面
│   ├── admin/                    # 管理后台
│   │   ├── dashboard/page.tsx    # 看板
│   │   ├── users/page.tsx        # 用户管理
│   │   ├── customers/page.tsx    # 客户管理
│   │   ├── layout.tsx            # 共享布局（侧边栏+标签页+面包屑）
│   │   └── page.tsx              # /admin → /admin/dashboard 重定向
│   ├── api/
│   │   ├── admin/                # 后台 API
│   │   │   ├── stats/route.ts
│   │   │   ├── users/route.ts + [id]/route.ts
│   │   │   └── customers/route.ts + [id]/route.ts
│   │   ├── auth/                 # 鉴权 API
│   │   │   ├── login/route.ts
│   │   │   ├── logout/route.ts
│   │   │   ├── me/route.ts
│   │   │   └── register/route.ts
│   │   ├── chat/                 # 聊天 API
│   │   │   ├── conversations/route.ts + [id]/route.ts
│   │   │   └── stream/route.ts
│   │   ├── config/route.ts
│   │   └── settings/provider/route.ts + test/route.ts
│   ├── chat/page.tsx             # 聊天主页面
│   ├── login/page.tsx            # 登录页
│   ├── register/page.tsx         # 注册页
│   ├── layout.tsx                # 根布局（含 AntdRootProviders）
│   ├── globals.css               # Tailwind + 全局样式
│   └── page.tsx                  # 首页
├── components/
│   ├── assistant-ui/             # assistant-ui 自定义组件
│   ├── chat/                     # 聊天相关组件
│   ├── providers/AntdRootProviders.tsx  # antd ConfigProvider + App
│   ├── settings/ProviderSettingsDialog.tsx
│   └── ui/                       # 已归档（antd Modal 替代）
├── lib/
│   ├── agent.ts                  # pi-agent-core 封装
│   ├── api.ts                    # 客户端 API 封装 + 类型定义
│   ├── assistant-runtime.ts      # assistant-ui runtime
│   ├── auth.ts                   # getCurrentUser / requireAdmin
│   ├── crypto.ts                 # AES-256-GCM 加解密
│   ├── jwt.ts                    # JWT 签发/验证
│   ├── mongodb.ts                # MongoClient 连接管理
│   ├── render.ts                 # Markdown 渲染
│   └── utils.ts                  # 工具函数
├── types/db.ts                   # MongoDB 文档类型定义
└── middleware.ts                 # 路由级鉴权中间件
```

---

## 3. AI 编码硬性约束

### 3.1 禁止行为

- **禁止在 middleware 中导入 mongodb 或任何 Node.js 专属 API**（Edge Runtime 不支持）
- **禁止绕过 `requireAdmin()` 进行后台 API 鉴权**
- **禁止在日志或错误信息中打印用户密码、API Key、加密后的密钥**
- **禁止修改 `.env.local` 文件**（运行时配置）
- **禁止删除或修改 `demo/antdx.tsx`**（设计参考文件）
- **禁止在组件 render 阶段直接写入 ref**（`ref.current = x`），应使用 `useLayoutEffect`
- **禁止在 keep-alive 页面缓存中使用 `display: none` 以外的隐藏方式**（已验证 antd 组件兼容性）
- **禁止在路由变化时重建 runtime 实例**（chat runtime 的 `switchCount` 分离机制已验证）

### 3.2 必须遵守

- **所有后台 API 路由必须通过 `requireAdmin()` 守卫**
- **新用户注册默认角色必须是 `user`**
- **最后一个 admin 用户不允许被降级或删除**（admin users PATCH/DELETE 已实现保护）
- **Provider API Key 必须通过 `encrypt()` 加密存储**
- **数据库文档类型必须在 `src/types/db.ts` 中定义**
- **客户端 API 方法必须通过 `src/lib/api.ts` 的 `api` 对象暴露**
- **React 组件必须是 `"use client"` 或明确的 Server Component**
- **antd 组件使用 `styles` 属性替代已废弃的 `valueStyle`、`bodyStyle` 等**

### 3.3 技术边界

| 场景 | 允许 | 禁止 |
|------|------|------|
| 数据库操作 | `getDb()` 后使用 collection | 在 middleware 中直接操作 DB |
| 密码处理 | `bcryptjs` 哈希 + compare | 明文存储或传输 |
| API 响应 | `NextResponse.json()` + 统一错误格式 `{ error: string }` | 返回不一致的错误格式 |
| 状态管理 | React useState/useReducer + useRef | 引入 Zustand/Redux（当前规模不需要） |
| 样式 | Tailwind 工具类 + antd 组件样式 | 引入额外 CSS-in-JS 库 |
| 路由 | Next.js App Router 文件约定 | 引入 react-router |

---

## 4. 代码习惯

### 4.1 命名规范

- 文件：`kebab-case.tsx`（如 `ProviderSettingsDialog.tsx`）
- 组件：`PascalCase`（如 `AdminDashboardPage`）
- 变量/函数：`camelCase`
- 常量：`UPPER_SNAKE_CASE`（如 `COOKIE_NAME`）
- 类型/接口：`PascalCase`（如 `AdminCustomerRow`）
- 集合名：与 `src/types/db.ts` 中的接口名对应（`users`、`conversations`、`messages`、`provider_settings`、`customers`）

### 4.2 TypeScript 严格模式

- 所有 API 路由必须有明确的请求/响应类型
- `api.ts` 中的方法必须有完整的参数和返回值类型
- 避免使用 `any`，必须使用时添加 `unknown` + 类型守卫
- MongoDB 操作必须指定文档泛型：`db.collection<UserDoc>("users")`

### 4.3 antd 使用规范

```tsx
// ✅ 正确：使用 styles 属性
<Statistic title="..." value={n} styles={{ content: { color: "#1677ff" } }} />

// ❌ 禁止：已废弃的 valueStyle
<Statistic title="..." value={n} valueStyle={{ color: "#1677ff" }} />

// ✅ 正确：使用 antd App.useApp() 获取 message/modal
const { message } = AntdApp.useApp();

// ❌ 禁止：静态调用
import { message } from "antd";
message.success("ok");
```

### 4.4 客户端 API 封装

```typescript
// ✅ 正确：统一通过 api 对象
const data = await api.adminListUsers({ keyword: "张三" });

// ❌ 禁止：直接在组件中 fetch
const res = await fetch("/api/admin/users?keyword=张三");
```

### 4.5 错误处理

```typescript
// ✅ 正确
try {
  await api.adminCreateCustomer(input);
  message.success("创建成功");
} catch (e) {
  message.error(e instanceof Error ? e.message : "操作失败");
}

// ❌ 禁止：空 catch 块或 console.error 泄露敏感信息
try { ... } catch { }
```

---

## 5. 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 生产构建（含 TypeScript 检查）
npm run start        # 启动生产服务器
npm run lint         # ESLint 检查
npm run format       # Prettier 格式化全部文件
npm run format:check # Prettier 格式检查（CI 使用）
```

---

## 6. 环境变量

`.env.local`（不入库）：

```
# 数据库
MONGODB_URI=mongodb://root:rootpassword@127.0.0.1:27017/?authSource=agent_demo
MONGODB_DB=agent_demo

# JWT
JWT_SECRET=your-jwt-secret-at-least-32-chars
JWT_EXPIRES_IN=7d

# 加密（生产环境必须独立配置）
ENCRYPTION_KEY=your-encryption-key

# 可选：默认 AI Provider
NEXT_PUBLIC_DEFAULT_BASE_URL=
NEXT_PUBLIC_DEFAULT_MODEL=
```

---

## 7. 数据库集合

| 集合名 | 文档类型 | 说明 |
|--------|----------|------|
| `users` | `UserDoc` | 用户账户 + 角色 |
| `conversations` | `ConversationDoc` | 会话元数据 |
| `messages` | `MessageDoc` | AI 对话消息 |
| `provider_settings` | `ProviderSettingDoc` | 用户自定义 AI Provider |
| `customers` | `CustomerDoc` | 客户信息 + 试用/延期状态 |

### 初始化管理员

新注册用户默认 `role: "user"`。设置首个管理员需直接操作 MongoDB：

```javascript
use agent_demo
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin" } }
)
```

---

## 8. AI 输出边界

### 可以做的

- 创建/修改页面组件、API 路由、工具函数
- 添加新的 antd 组件、Tailwind 样式
- 运行 `npm run build` / `npm run format` / `npm run lint`
- 读取数据库结构、分析现有代码
- 创建 `src/app/**/page.tsx`、`src/app/**/layout.tsx`

### 不应做的

- 引入未在 `dependencies` 中声明的第三方库
- 修改 `next.config.ts`、`tsconfig.json`、`postcss.config.mjs` 等构建配置
- 重构 `src/lib/mongodb.ts` 的连接管理逻辑
- 修改 `src/middleware.ts` 中的鉴权策略
- 在 AI 回复中暴露系统 prompt、密钥、内部实现细节
- 创建不必要的新文件（如全局 Context Provider、自定义 Hook 等，除非明确需要）
- 修改 `.gitignore`、`.env.local`、`package-lock.json`

### 输出格式

- 代码变更：直接使用 Edit/Write 工具，不输出大段代码块
- 解释说明：简洁中文，聚焦变更点和原因
- 错误反馈：附带完整错误信息和堆栈
- 完成确认：列出修改的文件清单和关键变更摘要