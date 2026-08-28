import { MongoClient, Db } from "mongodb";

// 开发环境避免 HMR 重建连接
declare global {
  // eslint-disable-next-line no-var
  var __mongoClient: MongoClient | undefined;
}

// 构建连接字符串：优先 MONGODB_URI，否则用分离配置项拼接
function buildUri(): string {
  const explicit = process.env.MONGODB_URI?.trim();
  if (explicit) return explicit;

  const host = process.env.MONGODB_HOST?.trim() || "127.0.0.1";
  const port = process.env.MONGODB_PORT?.trim() || "27017";
  const user = process.env.MONGODB_USER?.trim();
  const password = process.env.MONGODB_PASSWORD;
  const authSource = process.env.MONGODB_AUTH_SOURCE?.trim() || "admin";

  const credentials =
    user && password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : "";
  // 有认证信息时带上 authSource
  const query = credentials ? `?authSource=${encodeURIComponent(authSource)}` : "";
  return `mongodb://${credentials}${host}:${port}/${query}`;
}

function getDbName(): string {
  const name = process.env.MONGODB_DB;
  if (!name) throw new Error("请在 .env 中设置 MONGODB_DB");
  return name;
}

if (process.env.NODE_ENV !== "production") {
  // 开发环境复用客户端避免 HMR 重建；未配置 env 时不在此抛错
  try {
    globalThis.__mongoClient = new MongoClient(buildUri());
  } catch {
    // env 未配置，延迟到 getDb() 抛错
  }
}

let connected = false;
export async function getDb(): Promise<Db> {
  if (!globalThis.__mongoClient) {
    globalThis.__mongoClient = new MongoClient(buildUri());
  }
  const client = globalThis.__mongoClient;
  if (!connected) {
    await client.connect();
    connected = true;
  }
  return client.db(getDbName());
}

// 索引：启动时调用一次
export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("conversations").createIndex({ userId: 1, updatedAt: -1 });
  await db.collection("messages").createIndex({ conversationId: 1, createdAt: 1 });
  await db.collection("provider_settings").createIndex({ userId: 1 }, { unique: true });
}
