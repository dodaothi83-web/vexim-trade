import { NextResponse } from "next/server";
import { chatViewer, sameOrigin } from "@/lib/chat/viewer";
import { markSupportRead, postBuyerSupportMessage, SupportError, supportMessageViews } from "@/lib/chat/support";
import { supportHasUnread } from "@/lib/chat/support-core";
import { presenceKey, readPresence, touchPresence } from "@/lib/chat/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Cuộc chat của người mua với đội Vexim. `?peek=1` chỉ trả số tin chưa đọc (huy hiệu),
 * không đánh dấu đã đọc; mở khung chat thì lấy đủ tin và đánh dấu đã đọc.
 */
export async function GET(request: Request) {
  const viewer = await chatViewer("buyer");
  if (!viewer || viewer.side !== "buyer") return json({ error: "auth" }, 401);
  void touchPresence(viewer.store, presenceKey.buyer(viewer.email));
  try {
    const conversation = await viewer.store.getSupportConversationByBuyer(viewer.email);
    if (new URL(request.url).searchParams.get("peek") === "1") return json({ unread: conversation && supportHasUnread(conversation, "buyer") ? 1 : 0 });
    // Đội Vexim online khi có nhân viên đang mở hộp chat trong CRM.
    const staffLastSeen = (await readPresence(viewer.store, [presenceKey.staff()]))[presenceKey.staff()] ?? null;
    if (!conversation) return json({ messages: [], unread: 0, staffReadAt: null, staffLastSeen });
    const messages = await viewer.store.listSupportMessages(conversation.id);
    await markSupportRead(viewer.store, conversation, "buyer");
    return json({ messages: supportMessageViews(messages, "buyer"), unread: 0, staffReadAt: conversation.staff_last_read_at, staffLastSeen });
  } catch (error) {
    console.error("[support] buyer read failed", error);
    return json({ error: "unavailable" }, 503);
  }
}

/** Người mua gửi tin cho Vexim. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const viewer = await chatViewer("buyer");
  if (!viewer || viewer.side !== "buyer") return json({ error: "auth" }, 401);
  void touchPresence(viewer.store, presenceKey.buyer(viewer.email));
  let payload: { body?: unknown; pagePath?: unknown };
  try { payload = await request.json(); } catch { return json({ error: "invalid" }, 400); }
  try {
    const { message } = await postBuyerSupportMessage({ store: viewer.store, buyerEmail: viewer.email, body: String(payload.body ?? ""), pagePath: payload.pagePath });
    return json({ message: supportMessageViews([message], "buyer")[0] }, 201);
  } catch (error) {
    if (error instanceof SupportError) return json({ error: error.code }, error.code === "rate_limited" ? 429 : 400);
    console.error("[support] buyer send failed", error);
    return json({ error: "unavailable" }, 503);
  }
}
