import type {
  ResumableStreamEntry,
  ResumableStreamStatus,
  ResumableStreamStore,
} from "assistant-stream/resumable";
import { connectToMongo } from "@/lib/mongodb";
import {
  StreamChunkModel,
  StreamMetaModel,
} from "@/lib/models/resumable-stream";

/**
 * Mongo 版 ResumableStreamStore(官方接口的自定义实现,无 Redis 依赖)。
 *
 * - acquire 的原子性由 StreamMeta 的 streamId 唯一索引保证
 *   (插入成功 = producer,冲突 = consumer),单次往返
 * - append 的序号由 meta 上 $inc 原子自增产生,严格递增
 * - read 轮询 Mongo(500ms)模拟 tail -f,finalize 后读完即结束
 * - TTL:距末次写入 30 分钟过期(流内容可能含敏感载荷,不宜长留)
 */

const TTL_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 500;
const CURSOR_PAD = 12;

const toCursor = (seq: number) => String(seq).padStart(CURSOR_PAD, "0");
const fromCursor = (cursor: string) => {
  const n = Number(cursor);
  return Number.isFinite(n) ? n : 0;
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

export interface MongoResumableStreamStore extends ResumableStreamStore {
  /** 绑定属主(chat 路由 acquire 后写入) */
  setOwner(streamId: string, userId: string): Promise<void>;
  /** 校验 streamId 属主(resume 路由用;不匹配或不存在返回 false) */
  isOwnedBy(streamId: string, userId: string): Promise<boolean>;
}

export function createMongoResumableStreamStore(): MongoResumableStreamStore {
  return {
    async acquire(streamId, options) {
      await connectToMongo();
      const expireAt = new Date(Date.now() + TTL_MS);
      // ctx.run 不透传上下文,属主由 chat 路由在 run 之后 setOwner 补写;
      // 这里给占位值以通过 required 校验(空字符串会让 create 抛 ValidationError)
      const userId = String(
        (options as { userId?: unknown } | undefined)?.userId ?? "unbound",
      );
      try {
        await StreamMetaModel.create({
          streamId,
          userId,
          status: "streaming",
          seq: 0,
          expireAt,
        });
        return "producer";
      } catch {
        // 唯一索引冲突:已有人在生产,作为 consumer 重放
        await StreamMetaModel.updateOne(
          { streamId },
          { $set: { expireAt } },
        ).exec();
        return "consumer";
      }
    },

    async append(streamId, chunk) {
      const expireAt = new Date(Date.now() + TTL_MS);
      const meta = await StreamMetaModel.findOneAndUpdate(
        { streamId },
        { $inc: { seq: 1 }, $set: { expireAt } },
        { new: true },
      ).lean();
      if (!meta) return; // 流已被清理,丢块即可(consumer 侧 finish 检测兜底)
      // $inc 拿到 1..N,块序号减 1 对齐 cursor 语义(首块 cursor 为 0 填充值)
      await StreamChunkModel.create({
        streamId,
        seq: meta.seq - 1,
        data: Buffer.from(chunk),
        expireAt,
      });
    },

    async finalize(streamId, status, error) {
      await connectToMongo();
      await StreamMetaModel.updateOne(
        { streamId },
        {
          $set: {
            status,
            error: error ?? "",
            // 终态后再留 5 分钟供重放,随后 TTL 清理
            expireAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        },
      ).exec();
    },

    async *read(streamId, cursor, signal) {
      await connectToMongo();
      let lastSeq = fromCursor(cursor) - 1;
      while (!signal.aborted) {
        const docs = (await StreamChunkModel.find({
          streamId,
          seq: { $gt: lastSeq },
        })
          .sort({ seq: 1 })
          .limit(256)
          .lean()) as unknown as { seq: number; data: Buffer }[];

        for (const doc of docs) {
          lastSeq = doc.seq;
          const entry: ResumableStreamEntry = {
            cursor: toCursor(doc.seq),
            chunk: new Uint8Array(doc.data.buffer, doc.data.byteOffset, doc.data.byteLength),
          };
          yield entry;
        }

        if (docs.length < 256) {
          const meta = (await StreamMetaModel.findOne({ streamId }).lean()) as
            | { status?: string }
            | null;
          if (!meta) return; // 已被 TTL 清理
          if (meta.status === "done" || meta.status === "error") {
            // 终态:确认没有残余新块再结束
            const rest = await StreamChunkModel.countDocuments({
              streamId,
              seq: { $gt: lastSeq },
            });
            if (rest === 0) return;
          } else {
            await sleep(POLL_INTERVAL_MS, signal);
          }
        }
      }
    },

    async status(streamId): Promise<ResumableStreamStatus> {
      await connectToMongo();
      const meta = (await StreamMetaModel.findOne({ streamId }).lean()) as
        | { status?: string }
        | null;
      if (!meta) return "missing";
      return meta.status as ResumableStreamStatus;
    },

    async delete(streamId) {
      await connectToMongo();
      await Promise.all([
        StreamMetaModel.deleteOne({ streamId }).exec(),
        StreamChunkModel.deleteMany({ streamId }).exec(),
      ]);
    },

    async setOwner(streamId, userId) {
      await connectToMongo();
      await StreamMetaModel.updateOne(
        { streamId },
        { $set: { userId } },
      ).exec();
    },

    async isOwnedBy(streamId, userId) {
      await connectToMongo();
      const meta = (await StreamMetaModel.findOne({ streamId }).lean()) as
        | { userId?: string }
        | null;
      return !!meta && meta.userId === userId;
    },
  };
}
