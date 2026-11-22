import { NextResponse } from "next/server";
import { chatViewer, sameOrigin } from "@/lib/chat/viewer";
import { presenceKey, touchPresence } from "@/lib/chat/presence";
import { chatAfterParam } from "@/lib/chat/core";
import { ChatError, attachableProduct, conversationStatus, markConversationRead, messageViews, ownedConversation, postMessage, conversationViews } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function viewerKey(viewer: NonNullable<Awaited<ReturnType<typeof chatViewer>>>) {
  return viewer.side === "buyer" ? { side: "buyer" as const, email: viewer.email } : { side: "supplier" as const, supplierId: viewer.supplierId };
}

/**
 * Tin nhắn của một cuộc trò chuyện; mở ra là đánh dấu đã đọc. Khung chat hỏi lại định kỳ với
 * `?after=<mốc>` để chỉ tải tin mới (`partial: true`), không tải lại cả cuộc mỗi 6 giây.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const viewer = await chatViewer(url.searchParams.get("side"));
  if (!viewer) return json({ error: "auth" }, 401);
  void touchPresence(viewer.store, viewer.side === "buyer" ? presenceKey.buyer(viewer.email) : presenceKey.supplier(viewer.supplierId));
  try {
    const conversation = await ownedConversation(viewer.store, (await params).id, viewerKey(viewer));
    const after = chatAfterParam(url.searchParams.get("after"));
    // Lần hỏi lại chỉ cần trạng thái (đã xem, online); tên bên kia khung chat đã có từ lần đầu.
    const [messages, view] = await Promise.all([
      viewer.store.listChatMessages(conversation.id, 500, after),
      after ? conversationStatus(viewer.store, conversation, viewer.side) : conversationViews(viewer.store, [conversation], viewer.side).then(([v]) => v),
      markConversationRead(viewer.store, conversation, viewer.side),
    ]);
    return json({ conversation: { ...view, unread: false }, messages: await messageViews(messages, viewer.side), partial: Boolean(after) });
  } catch (error) {
    if (error instanceof ChatError) return json({ error: error.code }, 404);
    console.error("[chat] read failed", error);
    return json({ error: "unavailable" }, 503);
  }
}

/** Gửi một tin vào cuộc trò chuyện của chính mình. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const viewer = await chatViewer(new URL(request.url).searchParams.get("side"));
  if (!viewer) return json({ error: "auth" }, 401);
  void touchPresence(viewer.store, viewer.side === "buyer" ? presenceKey.buyer(viewer.email) : presenceKey.supplier(viewer.supplierId));
  let payload: { body?: unknown; productId?: unknown };
  try { payload = await request.json(); } catch { return json({ error: "invalid" }, 400); }
  try {
    const conversation = await ownedConversation(viewer.store, (await params).id, viewerKey(viewer));
    // Chỉ người mua đính kèm thẻ sản phẩm (từ cửa sổ chat trên trang sản phẩm).
    const product = viewer.side === "buyer" && typeof payload.productId === "string" ? await attachableProduct(conversation, payload.productId) : null;
    const message = await postMessage({ store: viewer.store, conversation, sender: viewer.side, senderEmail: viewer.email, body: String(payload.body ?? ""), product });
    return json({ message: (await messageViews([message], viewer.side))[0] }, 201);
  } catch (error) {
    if (error instanceof ChatError) return json({ error: error.code }, error.code === "not_found" ? 404 : error.code === "rate_limited" ? 429 : 400);
    console.error("[chat] send failed", error);
    return json({ error: "unavailable" }, 503);
  }
}
