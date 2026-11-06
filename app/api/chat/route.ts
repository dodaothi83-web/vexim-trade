import { NextResponse } from "next/server";
import { chatViewer } from "@/lib/chat/viewer";
import { conversationViews } from "@/lib/chat/service";
import { presenceKey, touchPresence } from "@/lib/chat/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Danh sách cuộc trò chuyện của người đang xem (`?side=buyer|supplier`). */
export async function GET(request: Request) {
  const viewer = await chatViewer(new URL(request.url).searchParams.get("side"));
  if (!viewer) return NextResponse.json({ error: "auth" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  void touchPresence(viewer.store, viewer.side === "buyer" ? presenceKey.buyer(viewer.email) : presenceKey.supplier(viewer.supplierId));
  const rows = await viewer.store.listChatConversations(viewer.side === "buyer" ? { buyerEmail: viewer.email } : { supplierId: viewer.supplierId });
  const conversations = await conversationViews(viewer.store, rows, viewer.side);
  return NextResponse.json({ conversations, unread: conversations.filter((c) => c.unread).length }, { headers: { "Cache-Control": "no-store" } });
}
