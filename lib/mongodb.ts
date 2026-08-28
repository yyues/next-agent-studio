import mongoose from "mongoose";

type CachedConnection = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConn: CachedConnection | undefined;
}

const cached: CachedConnection = global.__mongooseConn ?? {
  conn: null,
  promise: null,
};

if (!global.__mongooseConn) {
  global.__mongooseConn = cached;
}

export type MongoConnectionMode = "uri" | "split";

export type MongoConnectionInfo = {
  mode: MongoConnectionMode;
  hasCredentials: boolean;
  host?: string;
  database?: string;
  authSource?: string;
};

function uriContainsCredentials(uri: string) {
  return /^mongodb(?:\+srv)?:\/\/[^/]*@/i.test(uri);
}

function resolveMongoUri() {
  const directUri = process.env.MONGODB_URI?.trim();
  const splitUsername = process.env.MONGODB_USERNAME?.trim();
  const splitPassword = process.env.MONGODB_PASSWORD?.trim();
  const hasSplitCredentials = Boolean(splitUsername && splitPassword);

  // If split credentials are provided, prefer them when direct URI has no auth section.
  if (directUri && (!hasSplitCredentials || uriContainsCredentials(directUri))) {
    return directUri;
  }

  const host = process.env.MONGODB_HOST?.trim() || "127.0.0.1";
  const port = process.env.MONGODB_PORT?.trim() || "27017";
  const database = process.env.MONGODB_DB?.trim() || "assistant_demo";
  const username = splitUsername;
  const password = splitPassword;
  const authSource =
    process.env.MONGODB_AUTH_SOURCE?.trim() ||
    (username && password ? "admin" : undefined);

  const credentials =
    username && password
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
      : "";

  const authQuery = authSource
    ? `?authSource=${encodeURIComponent(authSource)}`
    : "";

  return `mongodb://${credentials}${host}:${port}/${database}${authQuery}`;
}

export function getMongoConnectionInfo(): MongoConnectionInfo {
  const directUri = process.env.MONGODB_URI?.trim();
  const splitUsername = process.env.MONGODB_USERNAME?.trim();
  const splitPassword = process.env.MONGODB_PASSWORD?.trim();
  const hasSplitCredentials = Boolean(splitUsername && splitPassword);

  if (directUri && (!hasSplitCredentials || uriContainsCredentials(directUri))) {
    const match = directUri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@]+@)?([^/?]+)(?:\/([^?]*))?/i);
    return {
      mode: "uri",
      hasCredentials: uriContainsCredentials(directUri),
      host: match?.[1],
      database: match?.[2] || undefined,
      authSource: undefined,
    };
  }

  return {
    mode: "split",
    hasCredentials: hasSplitCredentials,
    host: process.env.MONGODB_HOST?.trim() || "127.0.0.1",
    database: process.env.MONGODB_DB?.trim() || "assistant_demo",
    authSource:
      process.env.MONGODB_AUTH_SOURCE?.trim() ||
      (hasSplitCredentials ? "admin" : undefined),
  };
}

export async function connectToMongo() {
  const uri = resolveMongoUri();
  if (!uri) {
    throw new Error(
      "Missing MongoDB config. Set MONGODB_URI or provide MONGODB_HOST/MONGODB_PORT/MONGODB_DB with optional MONGODB_USERNAME/MONGODB_PASSWORD.",
    );
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("requires authentication") || message.includes("Unauthorized")) {
        throw new Error(
          "MongoDB authentication failed. Check MONGODB_URI credentials or MONGODB_USERNAME/MONGODB_PASSWORD and MONGODB_AUTH_SOURCE.",
        );
      }

      throw error;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
