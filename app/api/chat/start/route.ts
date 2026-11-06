import { NextResponse } from "next/server";
import { chatViewer, sameOrigin } from "@/lib/chat/viewer";
import { presenceKey, touchPresence } from "@/lib/chat/presence";
import { ChatError, existingConversationForProduct, existingConversationForSupplier, startConversation, startSupplierConversation } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cửa sổ chat trên trang sản phẩm: mở lại đúng cuộc cũ nếu đã từng hỏi nhà cung cấp này. */
export async function GET(request: Request) {
  const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const viewer = await chatViewer("buyer");
  if (!viewer || viewer.side !== "buyer") return json({ error: "auth" }, 401);
  void touchPresence(viewer.store, presenceKey.buyer(viewer.email));
  const params = new URL(request.url).searchParams;
  const productId = params.get("productId") ?? "";
  const supplierId = params.get("supplierId") ?? "";
  try {
    // Từ trang nhà cung cấp: tra theo nhà cung cấp; từ trang sản phẩm: tra theo sản phẩm.
    if (!productId && supplierId) return json({ conversationId: await existingConversationForSupplier(viewer.store, viewer.email, supplierId) });
    return json({ conversationId: await existingConversationForProduct(viewer.store, viewer.email, productId) });
  } catch (error) {
    if (error instanceof ChatError) return json({ error: error.code }, 400);
    console.error("[chat] lookup failed", error);
    return json({ error: "unavailable" }, 503);
  }
}

/** Người mua bấm "Ask supplier" trên trang sản phẩm: mở (hoặc mở lại) cuộc trò chuyện. */
export async function POST(request: Request) {
  const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const viewer = await chatViewer("buyer");
  if (!viewer || viewer.side !== "buyer") return json({ error: "auth" }, 401);
  void touchPresence(viewer.store, presenceKey.buyer(viewer.email));
  // Người mua đã xác minh email; chống spam bằng giới hạn số cuộc mới mỗi ngày và số tin mỗi 10 phút.
  let payload: { productId?: unknown; supplierId?: unknown; body?: unknown };
  try { payload = await request.json(); } catch { return json({ error: "invalid" }, 400); }
  try {
    const conversation = !payload.productId && typeof payload.supplierId === "string" && payload.supplierId
      ? await startSupplierConversation({ store: viewer.store, buyerEmail: viewer.email, supplierId: payload.supplierId.slice(0, 64), body: String(payload.body ?? "") })
      : await startConversation({ store: viewer.store, buyerEmail: viewer.email, productId: String(payload.productId ?? ""), body: String(payload.body ?? "") });
    return json({ id: conversation.id }, 201);
  } catch (error) {
    if (error instanceof ChatError) return json({ error: error.code }, error.code === "rate_limited" ? 429 : 400);
    console.error("[chat] start failed", error);
    return json({ error: "unavailable" }, 503);
  }
}
