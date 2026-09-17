import { Schema, model, models } from "mongoose";

/**
 * 可恢复流:流元数据。streamId 唯一索引用作 acquire 的原子占位
 * (插入成功 = producer,冲突 = consumer)。TTL 索引按 expireAt 自动清理。
 */
const streamMetaSchema = new Schema(
  {
    streamId: { type: String, required: true },
    /** 属主校验:resume 时核对,防跨用户重放 */
    userId: { type: String, required: true },
    /** streaming | done | error */
    status: { type: String, enum: ["streaming", "done", "error"], default: "streaming" },
    error: { type: String, default: "" },
    /** 单调递增字节块序号(acquire 后从 0 递增) */
    seq: { type: Number, default: 0 },
    expireAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);
streamMetaSchema.index({ streamId: 1 }, { unique: true });
streamMetaSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

/**
 * 可恢复流:已编码字节块。按 {streamId, seq} 唯一,严格递增;
 * cursor 用 12 位零填充的 seq 字符串,保证字典序 = 数值序。
 */
const streamChunkSchema = new Schema(
  {
    streamId: { type: String, required: true },
    seq: { type: Number, required: true },
    data: { type: Buffer, required: true },
    expireAt: { type: Date, required: true },
  },
  { versionKey: false, timestamps: false },
);
streamChunkSchema.index({ streamId: 1, seq: 1 }, { unique: true });
streamChunkSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const StreamMetaModel =
  models.StreamMeta ?? model("StreamMeta", streamMetaSchema);
export const StreamChunkModel =
  models.StreamChunk ?? model("StreamChunk", streamChunkSchema);
