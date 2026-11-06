import { NextResponse } from "next/server";
import { chatViewer, sameOrigin } from "@/lib/chat/viewer";
import { ChatError, attachableProduct, markConversationRead, messageViews, ownedConversation, postMessage, conversationViews } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function viewerKey(viewer: NonNullable<Awaited<ReturnType<typeof chatViewer>>>) {
  return viewer.side === "buyer" ? { side: "buyer" as const, email: viewer.email } : { side: "supplier" as const, supplierId: viewer.supplierId };
}

/** Tin nhắn của một cuộc trò chuyện; mở ra là đánh dấu đã đọc. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await chatViewer(new URL(request.url).searchParams.get("side"));
  if (!viewer) return json({ error: "auth" }, 401);
  try {
    const conversation = await ownedConversation(viewer.store, (await params).id, viewerKey(viewer));
    const messages = await viewer.store.listChatMessages(conversation.id);
    await markConversationRead(viewer.store, conversation, viewer.side);
    const [view] = await conversationViews(viewer.store, [conversation], viewer.side);
    return json({ conversation: { ...view, unread: false }, messages: messageViews(messages, viewer.side) });
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
  let payload: { body?: unknown; productId?: unknown };
  try { payload = await request.json(); } catch { return json({ error: "invalid" }, 400); }
  try {
    const conversation = await ownedConversation(viewer.store, (await params).id, viewerKey(viewer));
    // Chỉ người mua đính kèm thẻ sản phẩm (từ cửa sổ chat trên trang sản phẩm).
    const product = viewer.side === "buyer" && typeof payload.productId === "string" ? await attachableProduct(conversation, payload.productId) : null;
    const message = await postMessage({ store: viewer.store, conversation, sender: viewer.side, senderEmail: viewer.email, body: String(payload.body ?? ""), product });
    return json({ message: messageViews([message], viewer.side)[0] }, 201);
  } catch (error) {
    if (error instanceof ChatError) return json({ error: error.code }, error.code === "not_found" ? 404 : error.code === "rate_limited" ? 429 : 400);
    console.error("[chat] send failed", error);
    return json({ error: "unavailable" }, 503);
  }
}
