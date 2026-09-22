import type { UIMessage } from "ai";

const DATABASE_NAME = "agent-studio-conversations";
const DATABASE_VERSION = 1;
const STORE_NAME = "conversations";

export const LOCAL_CONVERSATION_STORAGE_ERROR_EVENT =
  "local-conversation-storage-error";

export type LocalConversation = {
  key: string;
  userId: string;
  conversationId: string;
  roleId: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
};

function keyFor(userId: string, conversationId: string) {
  return `${userId}:${conversationId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "key" });
      if (!store.indexNames.contains("userId")) {
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open local conversation storage."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Local conversation storage operation failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Local conversation storage operation failed."));
    });
  } finally {
    db.close();
  }
}

export function reportLocalConversationStorageError() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOCAL_CONVERSATION_STORAGE_ERROR_EVENT));
  }
}

export const localConversationStore = {
  async list(userId: string): Promise<LocalConversation[]> {
    const entries = await withStore("readonly", (store) =>
      store.index("userId").getAll(IDBKeyRange.only(userId)),
    );
    return entries.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  get(userId: string, conversationId: string) {
    return withStore("readonly", (store) => store.get(keyFor(userId, conversationId)));
  },

  async ensure(userId: string, conversationId: string, roleId: string) {
    const existing = await this.get(userId, conversationId);
    if (existing) return existing;
    const entry: LocalConversation = {
      key: keyFor(userId, conversationId),
      userId,
      conversationId,
      roleId,
      title: "",
      messages: [],
      updatedAt: Date.now(),
    };
    await withStore("readwrite", (store) => store.put(entry));
    return entry;
  },

  async save(
    userId: string,
    conversationId: string,
    roleId: string,
    messages: UIMessage[],
  ) {
    const existing = await this.get(userId, conversationId);
    const entry: LocalConversation = {
      key: keyFor(userId, conversationId),
      userId,
      conversationId,
      roleId,
      title: existing?.title ?? "",
      messages,
      updatedAt: Date.now(),
    };
    await withStore("readwrite", (store) => store.put(entry));
  },

  async rename(userId: string, conversationId: string, title: string) {
    const existing = await this.get(userId, conversationId);
    if (!existing) return;
    await withStore("readwrite", (store) =>
      store.put({ ...existing, title, updatedAt: Date.now() }),
    );
  },

  delete(userId: string, conversationId: string) {
    return withStore("readwrite", (store) => store.delete(keyFor(userId, conversationId)));
  },
};
