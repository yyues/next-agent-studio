/**
 * GET /api/chat/resume/<streamId> — 重放/续接进行中的流(可恢复流)。
 * 属主校验:streamId 在 acquire 时绑定 userId,不匹配按 404 处理
 * (不向非属主确认流的存在)。
 */
import { RESUMABLE_STREAM_ID_HEADER } from "assistant-stream/resumable";
import {
  mongoResumableStore,
  resumableContext,
} from "@/lib/resumable/context";
import { getAuthUserId } from "@/lib/auth-request";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ streamId: string }> },
) {
  const { streamId } = await ctx.params;
  try {
    const userId = await getAuthUserId(
      req,
      new URL(req.url).searchParams.get("userId") ??
        req.headers.get("x-user-id"),
    );
    if (!(await mongoResumableStore.isOwnedBy(streamId, userId))) {
      return new Response(JSON.stringify({ error: "stream not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const stream = await resumableContext.resume(streamId);
    if (!stream) {
      return new Response(JSON.stringify({ error: "stream not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        [RESUMABLE_STREAM_ID_HEADER]: streamId,
        "x-accel-buffering": "no",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "stream not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}
