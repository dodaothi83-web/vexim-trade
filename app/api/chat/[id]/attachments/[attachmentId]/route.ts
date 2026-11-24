import { NextResponse } from "next/server";
import { chatViewer, sameOrigin, type ChatViewer } from "@/lib/chat/viewer";
import {
  ChatAttachmentError, attachmentDelivery, discardChatUpload, finishChatUpload, receiveChatUpload, uploaderKey, type ChatUploader,
} from "@/lib/chat/attachments";
import { CHAT_SERVER_UPLOAD_MAX_BYTES } from "@/lib/chat/attachments-core";
import { ChatError, ownedConversation } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

type Params = { params: Promise<{ id: string; attachmentId: string }> };

function uploader(viewer: ChatViewer): ChatUploader {
  return viewer.side === "buyer" ? { side: "buyer", email: viewer.email, store: viewer.store } : { side: "supplier", supplierId: viewer.supplierId, store: viewer.store };
}

async function context(request: Request, params: Params["params"]) {
  const viewer = await chatViewer(new URL(request.url).searchParams.get("side"));
  if (!viewer) return null;
  const { id, attachmentId } = await params;
  const who = uploader(viewer);
  const conversation = await ownedConversation(viewer.store, id, who.side === "buyer" ? { side: "buyer", email: who.email } : { side: "supplier", supplierId: who.supplierId });
  return { viewer: who, conversation, attachmentId };
}

function failure(error: unknown, action: string) {
  if (error instanceof ChatError) return json({ error: error.code }, 404);
  if (error instanceof ChatAttachmentError) return json({ error: error.code }, error.code === "not_found" ? 404 : 400);
  console.error(`[chat-attachments] ${action} failed`, error);
  return json({ error: "unavailable" }, 503);
}

/**
 * Mở hoặc tải một tệp đã gửi trong cuộc của chính mình: kiểm quyền rồi chuyển sang link có hạn
 * 5 phút. `?download=1` luôn tải về. Người tải lên cũng mở được tệp chưa gửi của mình.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await context(request, params);
    if (!ctx) return json({ error: "auth" }, 401);
    const row = /^[0-9a-f-]{8,64}$/i.test(ctx.attachmentId) ? await ctx.viewer.store.getChatAttachment(ctx.attachmentId) : null;
    const visible = row && row.conversation_id === ctx.conversation.id && (row.message_id || row.uploader_key === uploaderKey(ctx.viewer));
    if (!row || !visible) return json({ error: "not_found" }, 404);
    if (row.status === "deleted") return json({ error: "expired" }, 410);
    const delivery = await attachmentDelivery(row, new URL(request.url).searchParams.get("download") === "1");
    if (!delivery) return json({ error: "not_found" }, 404);
    if ("redirect" in delivery) {
      // Trình duyệt giữ chuyển hướng vài phút (ít hơn hạn của link) để cuộn lại khung chat không hỏi lại.
      return new NextResponse(null, { status: 302, headers: { Location: delivery.redirect, "Cache-Control": "private, max-age=120", "Referrer-Policy": "no-referrer" } });
    }
    return new NextResponse(Buffer.from(delivery.data), {
      headers: { ...delivery.headers, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" },
    });
  } catch (error) {
    return failure(error, "read");
  }
}

/** Đường dự phòng khi không tải thẳng lên kho được: nhận nội dung tệp (tối đa 4 MB). */
export async function PUT(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  try {
    const ctx = await context(request, params);
    if (!ctx) return json({ error: "auth" }, 401);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > CHAT_SERVER_UPLOAD_MAX_BYTES) return json({ error: "too_large" }, 413);
    const data = new Uint8Array(await request.arrayBuffer());
    await receiveChatUpload({ ...ctx, id: ctx.attachmentId, data });
    return json({ ok: true });
  } catch (error) {
    return failure(error, "upload");
  }
}

/** Bước 2: tệp đã lên kho; máy chủ kiểm dung lượng và nội dung thật rồi cho phép gửi. */
export async function POST(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  try {
    const ctx = await context(request, params);
    if (!ctx) return json({ error: "auth" }, 401);
    return json(await finishChatUpload({ ...ctx, id: ctx.attachmentId }));
  } catch (error) {
    return failure(error, "finish");
  }
}

/** Bỏ một tệp khỏi tin đang soạn (chưa gửi). */
export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  try {
    const ctx = await context(request, params);
    if (!ctx) return json({ error: "auth" }, 401);
    await discardChatUpload({ ...ctx, id: ctx.attachmentId });
    return json({ ok: true });
  } catch (error) {
    return failure(error, "discard");
  }
}
