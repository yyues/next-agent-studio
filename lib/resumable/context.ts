import { createResumableStreamContext } from "assistant-stream/resumable";
import { createMongoResumableStreamStore } from "./mongo-store";

/**
 * 可恢复流上下文(进程级单例)。store 为 Mongo 实现(无状态,状态全在库里),
 * TTL 语义由 store 内部的 expireAt 控制,这里不再覆盖。
 */
export const mongoResumableStore = createMongoResumableStreamStore();

export const resumableContext = createResumableStreamContext({
  store: mongoResumableStore,
});
