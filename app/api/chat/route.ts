import { NextResponse } from "next/server";
import { chatViewer } from "@/lib/chat/viewer";
import { conversationViews } from "@/lib/chat/service";
import { hasUnread } from "@/lib/chat/core";
import { presenceKey, touchPresence } from "@/lib/chat/presence";
import { scheduleChatNotifications } from "@/lib/chat/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Danh sách cuộc trò chuyện của người đang xem (`?side=buyer|supplier`). `?peek=1` chỉ trả số
 * cuộc chưa đọc cho huy hiệu (thanh công cụ người mua 30 giây/lần, menu cổng nhà cung cấp mỗi
 * phút): không tra tên bên kia, sản phẩm hay trạng thái online của từng cuộc.
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
  const conversations = await conversationViews(viewer.store, rows, viewer.side);
  return NextResponse.json({ conversations, unread: conversations.filter((c) => c.unread).length }, { headers: { "Cache-Control": "no-store" } });
}
