# agent.md

> 本文件同时承担两份职责：
> 1. **AI 行为规范** —— 约束本仓库内 AI 助手（含编码助手与产品对话助手）的输出与行为。
> 2. **系统说明书** —— 记录核心逻辑、架构设计与业务流程，供 AI 与开发者快速建立准确上下文。
>
> 凡与本文档冲突的实现，以代码为准；发现偏差应先更新本文档再继续。

---

## 一、AI 行为规范

### 1.1 通用输出准则
- **语言**：始终使用用户最近一条消息的语言回复；代码注释遵循同一语言规则，除非用户另有指示。
- **风格**：直接、简洁、可落地。先给结论/动作，再给必要解释；跳过寒暄与过渡句。能用一句说清不用三句。
- **格式**：使用 GitHub 风格 Markdown。引用仓库内代码必须用可点击链接（`file:///` 协议 + basename），不得写裸路径或行号；展示「尚不存在于代码库的代码」用带语言标签的代码块。
- **不越界**：只做被要求的事，不加未要求的功能、重构、注释、类型注解、错误兜底。三行相似代码优于过早抽象。不为假想未来需求设计。

### 1.2 对话助手（运行时）输出准则
- 角色由 `roleId` 决定：`role.systemPrompt` 是人格基线，必须优先遵循。
- **RAG 资料优先**：`rag_search` 工具返回的资料切片（含来源文件与页码）优先据此回答并注明出处；资料未涵盖的部分再依自身能力作答，不得编造资料里不存在的内容。
- **Skills 知识**：system prompt 中的「Active skills」段为该角色激活的能力说明与参考知识，按其约束产出。
- **深度思考**：当 `deepThinking` 开启时，先简述思路、拆解关键问题，再逐步推演，最后给明确结论。
- 工具调用由前端 `tools` 与角色 `toolToggles` 共同决定；未被开启的工具不得调用。
- 回复失败时给出可读错误，不暴露内部堆栈或密钥。

### 1.3 编码助手准则
- 改代码前先读相关文件，理解既有实现再动手。
- 优先编辑既有文件，不新建文件；不主动创建 `*.md`/README 文档。
- 敏感信息（API Key、DB 凭据）走环境变量，不硬编码、不提交。
- 中间件运行在 Edge Runtime，禁用 Node.js 专属 API（如 `process.getBuiltinModule`、`mongodb` driver），用纯 JS 依赖（如 `jose`）替代。
- Vercel 生产环境文件系统只读，`mkdirSync`/`writeFileSync` 会 ENOENT；用户上传内容必须存 Vercel Blob，仓库内置文件可只读访问。

---

## 二、系统核心逻辑

### 2.1 Provider 解析
- 数据源：MongoDB `ProviderConfig`（按 `userId` 唯一），缺省回退到环境变量默认值。
- 字段：`providerName` / `baseUrl` / `apiKey` / `model` / `embeddingModel` / `embeddingBaseUrl` / `embeddingApiKey` / `temperature`。
- 默认值来源：`DEFAULT_PROVIDER_NAME` / `DEFAULT_PROVIDER_BASE_URL` / `DEFAULT_PROVIDER_API_KEY`（回退 `OPENAI_API_KEY`）/ `DEFAULT_PROVIDER_MODEL`（默认 `gpt-5.6-luna`）/ `DEFAULT_EMBEDDING_MODEL`（默认 `text-embedding-3-small`）/ `DEFAULT_EMBEDDING_BASE_URL` / `DEFAULT_EMBEDDING_API_KEY`（默认空，回退主 baseUrl/apiKey）/ `DEFAULT_PROVIDER_TEMPERATURE`（默认 0.7）。
- 模型构造：`createOpenAICompatible({ name, baseURL, apiKey })` → `.chatModel(model)` 供对话；embedding 用 `embeddingBaseUrl/embeddingApiKey`（留空回退主 `baseUrl/apiKey`）→ `.embeddingModel(embeddingModel)` 供 RAG。当中转站不提供 `/embeddings` 或 embedding 走另一套地址/密钥时，单独填写 embedding 端点即可。
- 入口：[lib/server-settings.ts](file:///e:/Desktop/fe/agent-demo/lib/server-settings.ts) 的 `getProviderSettings` / `upsertProviderSettings` / `resolveRuntimeConfig`。

### 2.2 角色解析与 System Prompt 构建
- 角色：内置 `general` / `developer`（首次查询时 `seedDefaultRoles` upsert 进 DB），自定义角色存 `RoleProfile`。当前角色由 `UserSetting.currentRoleId` 决定。
- `resolveRuntimeConfig({ userId, requestedRoleId })`：
  1. 取 provider 配置；
  2. 取角色列表，`requestedRoleId` 合法且启用则用之，否则用 `currentRoleId`；
  3. `loadSkillsByRoleId(roleId)` 加载 skills，把 `title + instructions + knowledge` 合并成 skill 指令段；
  4. `systemPrompt = [role.systemPrompt, skillInstruction ? "Active skills:\n..." : ""].join("\n\n")`。
- 返回 `{ model, provider, role, systemPrompt, temperature }`。
- **配置读取走进程内 TTL 缓存**：`getProviderSettings` / `getRoleSettings` / `listEffectiveMcpServers` / `countRoleChunks` 经 [lib/config-cache.ts](file:///e:/Desktop/fe/agent-demo/lib/config-cache.ts) 的 `cachedLoad`（单实例、10 分钟滑动 TTL、inflight 去重、错误不缓存）；对应写路径（provider upsert/切换/删除、角色增删改/切换当前角色、MCP 增删/全局库/updateRole 的 mcpRefs、RAG 切片增删）成功后 `invalidateCache` 主动逐出，TTL 仅兜底。将来多实例部署换 Redis 只需改 config-cache 一个文件。

### 2.3 Skills 加载
- 两来源合并（DB 上传项覆盖同 id 内置项）：
  1. 文件系统内置：`skills/{roleId}/{skillId}/SKILL.md`（含 frontmatter + 指令正文 + `prompts/` + `knowledge/`）。
  2. 上传 skill：元数据存 `SkillDoc`，内容存 Vercel Blob `skills/{roleId}/{skillId}/`。
- `loadSkillsByRoleId` 并行加载两来源，按 id 合并。
- **Skills 是全量注入 system prompt，不走 RAG**（与 Resources 不同）。

### 2.4 RAG 检索（Resources）
- 入口：单文件上传（`.pdf` / `.md` / `.txt`，≤20MB，不再接受 zip）；PDF 经 [lib/rag/pdf.ts](file:///e:/Desktop/fe/agent-demo/lib/rag/pdf.ts)（unpdf）逐页抽取文本，扫描件（平均每页 <20 有效字符）检测后跳过索引并回传警告。
- 数据模型：`ResourceChunk`（`roleId` / `resourceId` / `fileName` / `chunkIndex` / `content` / `pageStart` / `pageEnd`（PDF 切片页码范围，文本类不写）/ `embedding: number[]` / `embeddingModel`）。
- 切片：[lib/rag/chunking.ts](file:///e:/Desktop/fe/agent-demo/lib/rag/chunking.ts) 递归切分（段落 > 换行 > 中文句号 > 英文句号 > 分号 > 空格），~800 字符/片、150 重叠；`chunkPaginatedText` 为 PDF 做页感知切片（短页并入相邻片，切片携带页码）。
- 向量化：[lib/rag/embeddings.ts](file:///e:/Desktop/fe/agent-demo/lib/rag/embeddings.ts) 用 provider 的 `embeddingBaseUrl/embeddingApiKey`（留空回退主 baseUrl/apiKey）构造 `createOpenAICompatible` → `.embeddingModel(embeddingModel)`，AI SDK v7 `embedMany`（`maxParallelCalls: 4`）/ `embed`。
- 检索：[lib/rag/retrieve.ts](file:///e:/Desktop/fe/agent-demo/lib/rag/retrieve.ts) 按 `roleId` 拉全部切片，余弦相似度排序，取 Top-K（默认 5，阈值 0.2）；角色可标记一份"以此为准"的权威资源（`RoleResource.authoritative`，每角色独占，`PATCH .../resources/[id]` 切换）——其切片得分 +0.05 加成、结果带 `[权威资料]` 标注。
- 形态：**`rag_search` 工具按需检索**（非 system prompt 自动注入）——角色有切片才挂载该工具，模型判断与资料相关时调用，可用不同关键词多次检索；工具说明要求多来源信息冲突时并列说明差异并优先采信 `[权威资料]` 标注的来源。`searchRoleKnowledge` 失败降级为空结果；权威资源 id 经 config-cache 缓存（`rag-auth` ns，PATCH/删资源时逐出）。历史 zip 资源的存量切片仍可检索。

### 2.5 深度思考
- [lib/reasoning.ts](file:///e:/Desktop/fe/agent-demo/lib/reasoning.ts) `resolveReasoningOptions` 按 provider family（OpenAI / Anthropic / 通用）解析原生 reasoning 参数。
- 未知 family 追加 prompt 指令兜底（先思路、再拆解、再推演、后结论）。

### 2.6 工具过滤
- `filterToolsByRole(tools, toolToggles)`：`toolToggles[name] === false` 的工具被剔除；未配置的默认放行。

---

## 三、架构设计

### 3.1 技术栈
- **框架**：Next.js 16（App Router，Turbopack）+ React 19 + TypeScript 7。
- **AI**：AI SDK v7（`ai` ^7.0.77）、`@ai-sdk/openai-compatible`、`@ai-sdk/openai`；前端 `@assistant-ui/react` + `@assistant-ui/ai-sdk`。
- **存储**：MongoDB（Mongoose ^9）+ Vercel Blob（^2.8）。
- **i18n**：next-intl ^4，locale `zh`（默认）/`en`。
- **样式**：Tailwind ^4 + base-ui + lucide-react。
- **状态**：zustand ^5 + assistant-ui runtime。

### 3.2 目录结构约定
```
app/[locale]/                 # 国际化页面
  assistant.tsx               # 对话运行时入口（useChatRuntime + AssistantChatTransport）
  chat/[chatId]/page.tsx       # 对话页（动态路由 chatId，?roleId=）
  settings/provider/page.tsx   # Provider 设置页
  admin/roles/                 # 角色管理（详情/列表）
app/api/
  chat/route.ts                # 对话流式接口
  settings/provider/           # Provider 配置 CRUD
  settings/roles/[roleId]/     # 角色 CRUD + skills + resources
lib/
  server-settings.ts           # provider/role/skill 解析与 system prompt 构建
  reasoning.ts                 # 深度思考 provider 适配
  blob.ts                      # Vercel Blob 封装（含本地回退）
  mongodb.ts                   # Mongo 连接（全局缓存）
  config-cache.ts              # 配置类读取的进程内 TTL 缓存（provider/roles/mcp/rag-chunks）
  client-runtime-context.ts    # 客户端运行时上下文（userId/roleId/deepThinking）
  provider-storage.ts          # Provider 本地 AES-GCM 加密存储
  skills/                      # Skills 加载器
  resources/                   # Resources 目录管理
  rag/                         # RAG：chunking / pdf 抽取 / embeddings / retrieve / index
  models/                      # Mongoose 模型
components/
  chat/  settings/  ui/        # 按功能拆分
messages/                      # i18n 文案 zh/en
skills/{roleId}/{skillId}/     # 内置 skill（仓库提交）
```

### 3.3 存储分层
- **MongoDB**：所有元数据与向量。模型：`ProviderConfig` / `RoleProfile` / `UserSetting` / `SkillDoc` / `RoleResource` / `ResourceChunk`。
- **Vercel Blob**：文件内容。路径前缀：
  - `skills/{roleId}/{skillId}/` —— skill 包（SKILL.md / prompts/ / knowledge/）
  - `resources/{roleId}/{resourceId}/{entryName}` —— RAG 资料原文件
- **本地回退**：未配置 `BLOB_READ_WRITE_TOKEN` 时，[lib/blob.ts](file:///e:/Desktop/fe/agent-demo/lib/blob.ts) 自动回退到本地磁盘（pathname 与 Blob 一致），开发环境无需 Blob store。生产必须配置 token（开 Blob 时获得）+ `BLOB_STORE_ID`（OIDC 自动认证）。
- **Vercel 约束**：生产文件系统只读；Blob store 的 access 模式（public/private）创建后不可改，需新建 store。

### 3.4 Provider 抽象
- 统一走 OpenAI-compatible 接口，OpenRouter 与 OpenAI 直连都适配。
- 对话用主 `baseUrl/apiKey`（`chatModel`）；RAG embedding 可独立配置 `embeddingBaseUrl/embeddingApiKey`，留空回退主 `baseUrl/apiKey`——当中转站不提供 `/embeddings` 或 embedding 走另一套地址/密钥时单独填写。
- 模型名按 provider 调整：OpenRouter embedding 用 `openai/text-embedding-3-small`，OpenAI 直连用 `text-embedding-3-small`。

### 3.5 鉴权与边界
- **中间件**：[middleware.ts](file:///e:/Desktop/fe/agent-demo/middleware.ts) 仅 next-intl locale 中间件，matcher 排除 `api/_next/静态文件`。Edge Runtime，禁用 Node API。
- **用户标识**：客户端 `getClientRuntimeContext().userId`，默认 `demo-user`（访客），经 `x-user-id` 头与 body `userId` 传服务端，`normalizeUserId` 归一。
- **访客对话**：由 `ALLOW_GUEST_CHAT` 环境变量控制。
- **Admin**：页面位于 `app/[locale]/admin/*`；项目约束要求 `/admin/*` 与 `/api/admin/*` 仅 admin 角色可访问、最后一个 admin 不可降级/删除。当前 API 层暂无强制校验，属待补强项。
- **敏感信息**：Provider apiKey 在 DB 以 String 存储；客户端 localStorage 经 Web Crypto AES-GCM 加密。项目约束要求用户 API 配置以 AES-256-GCM 加密入库、敏感信息入环境变量。

---

## 四、业务流程

### 4.1 对话请求流程（端到端）
1. 前端 `Assistant` 组件以 `conversationId` 为 React key 挂载，`useChatRuntime` + `AssistantChatTransport` 指向 `/api/chat`。
2. 请求 body 附加：`userId` / `roleId` / `conversationId` / `deepThinking`；header 附加 `x-user-id`。
3. [app/api/chat/route.ts](file:///e:/Desktop/fe/agent-demo/app/api/chat/route.ts)：
   - `normalizeUserId` → `resolveRuntimeConfig({ userId, requestedRoleId: roleId })` 得 model/provider/role/systemPrompt/temperature；
   - `filterToolsByRole` 过滤工具；
   - `resolveReasoningOptions` 解析深度思考；
   - `extractLastUserQuery(messages)` 取末条用户消息（斜杠命令与 MCP @提及解析用）；
   - `countRoleChunks(roleId) > 0` 时在 tools 中挂载 `rag_search`（角色知识库按需检索）；
   - `mergedSystemPrompt = [systemPrompt, mcpPromptSection, system, deepThinkingInstruction].filter(Boolean).join("\n\n")`；
   - `streamText({ model, messages, system, temperature, tools, providerOptions })` → `toUIMessageStreamResponse`。
4. 前端 Thread 渲染流式 UIMessage；`sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` 触发工具自动续跑。

### 4.2 资源上传与索引流程
1. 角色管理详情页上传单文件（`.pdf`/`.md`/`.txt`）→ `POST /api/settings/roles/[roleId]/resources?userId=...`。
2. [resources/route.ts](file:///e:/Desktop/fe/agent-demo/app/api/settings/roles/[roleId]/resources/route.ts)：
   - 校验扩展名与大小（≤20MB，zip 一律 400 拒绝），MD5 去重，同名先清旧 Blob；
   - `blobPut` 到 `resources/{roleId}/{resourceId}/{安全化文件名}`；
   - upsert `RoleResource` 元数据（含 `indexWarning`）；
   - `getProviderSettings(userId)` 取 provider → `indexResourceFromBlob(roleId, resourceId, blobPrefix, provider.config)`：
     - 列出 Blob 下可索引文件（白名单 `.pdf`/`.md`/`.txt`）；
     - 先删旧切片（幂等）；
     - PDF：`extractPdfPages` 逐页抽取 → `chunkPaginatedText` 页感知切片（带页码）；其余：`chunkText` 递归切片；
     - `embedTexts`（embedMany）→ `ResourceChunkModel.insertMany`；
   - 索引失败不阻断上传，仅返回 `indexed: false`；扫描件/超页数写入 `indexWarning` 并随响应 `warnings` 透传前端。
3. 删资源：`DELETE .../resources/[resourceId]` 删 Blob + `RoleResource` 元数据 + `deleteResourceChunks(roleId, resourceId)`。
4. 删角色：`removeRoleResourceDir(roleId)` 删 Blob + `RoleResource` + `deleteResourceChunks(roleId)`。

### 4.3 角色切换流程
1. 前端 `RoleSwitcher` 选角色 → 更新 `client-runtime-context`（带去重，无变化不派发事件，避免循环）→ `PUT /api/settings/roles` 切 `currentRoleId`。
2. 生成新 `chatId`，`router.replace('/chat/<newChatId>?roleId=<role>')`。
3. `chatId` 作为 `Assistant` 的 key 触发 remount，重置会话上下文。
4. 新会话首次请求带上新 `roleId`，服务端 `resolveRuntimeConfig` 解析到新角色。

### 4.4 Provider 设置流程（多供应商，全部持久化 MongoDB `assistant_demo.providerentries`，无 localStorage 路径）
1. 列表：`GET /api/settings/providers`（userId 取自登录 cookie，apiKey 仅返回掩码）。
2. 新建/更新：`POST|PUT /api/settings/providers[/providerId]` → `upsertProviderEntry` upsert 到 `providerentries`（apiKey 留空沿用旧值；首个供应商自动激活）。
3. 激活/删除：`PATCH|DELETE /api/settings/providers/[providerId]`；删除激活项后自动激活剩余第一个。
4. 内置 Embedding（不属于供应商）：`GET|PUT /api/settings/embedding`，存全局 `providerconfigs`，模型固定不可改。
5. 旧 `GET /api/settings/provider` 保留兼容：返回激活供应商拼出的 ProviderSettings。
6. 测试连接：`POST /api/settings/providers/[providerId]/test` 用配置 `generateText` 探活。
7. 回归测试：`pnpm test:provider`（需 dev server 运行，覆盖 增→查库→隔离→改→删 全链路）。

### 4.5 角色管理流程
1. 列表 `GET /api/settings/roles?userId=...`：`getRoleSettings` seed 内置角色 + 合并 DB 角色 + 按优先级排序 + 返回 `currentRoleId`。
2. 创建 `POST /api/settings/roles`：禁用内置 roleId 重名；`RoleProfile.create` + `ensureRoleSkillDir`。
3. 更新 `PUT /api/settings/roles/[roleId]`：内置角色不可改；更新可变字段。
4. 删除 `DELETE /api/settings/roles/[roleId]`：内置角色不可删；删 `RoleProfile` + `removeRoleSkillDir` + `removeRoleResourceDir`。

### 4.6 Skills 上传流程
1. `POST /api/settings/roles/[roleId]/skills` 接收 zip。
2. 解析 `SKILL.md` frontmatter，MD5 去重，逐文件 `blobPut` 到 `skills/{roleId}/{skillId}/`，upsert `SkillDoc`。
3. 对话时 `loadSkillsByRoleId` 合并内置+上传，全量注入 system prompt（非 RAG）。

---

## 五、关键约束速查

| 约束 | 说明 |
|---|---|
| 敏感信息 | API Key / DB 凭据入环境变量，不硬编码；用户 API 配置以 AES-256-GCM 加密入库（待全面落地） |
| 访客对话 | `ALLOW_GUEST_CHAT` 控制开关；访客 userId 默认 `demo-user` |
| Edge 中间件 | 禁用 Node.js API，用纯 JS 依赖（`jose` 等） |
| Vercel 文件系统 | 生产只读；用户上传内容必须存 Vercel Blob，内置文件可只读访问 |
| Blob store | access 模式与 region 创建后不可改；需新建 store |
| Admin | `/admin/*` 与 `/api/admin/*` 仅 admin；最后一个 admin 不可降级/删除（API 层待补强） |
| OpenRouter | 支持自定义 baseUrl + apiKey，用户配置优先于服务端默认 |
| RAG 降级 | 角色无切片跳过检索；索引/检索失败均不阻断上传与对话 |
| 组件拆分 | chat 组件 `components/chat/`，settings `components/settings/`，UI `components/ui/` |
| API Key 输入 | 用 `type="text"` + 显隐切换，避免浏览器密码管理器干扰 |

---

## 六、AI 协作备忘

- 改动涉及对话/角色/资源前，先读 [lib/server-settings.ts](file:///e:/Desktop/fe/agent-demo/lib/server-settings.ts) 与对应 route。
- 新增 MongoDB 模型放 `lib/models/`，复用 `connectToMongo`，按 `roleId` 建索引。
- 新增文件存储走 [lib/blob.ts](file:///e:/Desktop/fe/agent-demo/lib/blob.ts)，路径前缀遵循 `skills/` 或 `resources/` 约定，确保本地回退兼容。
- RAG 相关改动集中在 `lib/rag/`，不得在 chat route 内散落切片/向量化逻辑。
- 切换 embedding 模型后需重建索引（旧切片维度不匹配时余弦返回 0，自动降级）。
- i18n 文案改动同步 [messages/zh.json](file:///e:/Desktop/fe/agent-demo/messages/zh.json) 与 [messages/en.json](file:///e:/Desktop/fe/agent-demo/messages/en.json)。
