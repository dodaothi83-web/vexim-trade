import { NextResponse } from "next/server";
import { chatViewer } from "@/lib/chat/viewer";
import { conversationListUpdate, conversationViews } from "@/lib/chat/service";
import { chatAfterParam, hasUnread } from "@/lib/chat/core";
import { presenceKey, touchPresence } from "@/lib/chat/presence";
import { scheduleChatNotifications } from "@/lib/chat/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Danh sách cuộc trò chuyện của người đang xem (`?side=buyer|supplier`). `?peek=1` chỉ trả số
 * cuộc chưa đọc cho huy hiệu (thanh công cụ người mua 30 giây/lần, menu cổng nhà cung cấp mỗi
 * phút): không tra tên bên kia, sản phẩm hay trạng thái online của từng cuộc.
 * `?since=<ISO>` (khung Tin nhắn hỏi lại 15 giây/lần): chỉ cuộc có tin mới hơn mốc mới trả đủ,
 * các cuộc khác chỉ trả chưa đọc / đã xem / online (`partial: true`). Mốc sai định dạng thì trả đủ.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const viewer = await chatViewer(params.get("side"));
  if (!viewer) return NextResponse.json({ error: "auth" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  void touchPresence(viewer.store, viewer.side === "buyer" ? presenceKey.buyer(viewer.email) : presenceKey.supplier(viewer.supplierId));
  scheduleChatNotifications(viewer.store);
  const rows = await viewer.store.listChatConversations(viewer.side === "buyer" ? { buyerEmail: viewer.email } : { supplierId: viewer.supplierId });
  if (params.get("peek") === "1") {
    return NextResponse.json({ unread: rows.filter((c) => hasUnread(c, viewer.side)).length }, { headers: { "Cache-Control": "no-store" } });
  }
  const unread = rows.filter((c) => hasUnread(c, viewer.side)).length;
  const since = chatAfterParam(params.get("since"));
  if (since) {
    const conversations = await conversationListUpdate(viewer.store, rows, viewer.side, since);
    return NextResponse.json({ conversations, unread, partial: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const conversations = await conversationViews(viewer.store, rows, viewer.side);
  return NextResponse.json({ conversations, unread }, { headers: { "Cache-Control": "no-store" } });
}
