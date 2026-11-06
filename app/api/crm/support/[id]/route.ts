import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getStore } from "@/lib/db";
import { sameOrigin } from "@/lib/chat/viewer";
import { markSupportRead, postStaffSupportMessage, SupportError, supportConversationViews, supportMessageViews } from "@/lib/chat/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const ID = /^[0-9a-f-]{8,64}$/i;

/** Tin nhắn của một cuộc; người có quyền trả lời mở ra thì tính là đã đọc. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("support.view");
  if (!session) return json({ error: "forbidden" }, 403);
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "not_found" }, 404);
  try {
    const store = getStore();
    const conversation = await store.getSupportConversation(id);
    if (!conversation) return json({ error: "not_found" }, 404);
    const messages = await store.listSupportMessages(id);
    // Người chỉ có quyền xem không làm mất dấu "chưa đọc" của nhân viên phụ trách.
    if (hasPermission(session.role, "support.manage")) await markSupportRead(store, conversation, "staff");
    const [view] = await supportConversationViews(store, [conversation]);
    return json({ conversation: { ...view, unread: false }, messages: supportMessageViews(messages, "staff"), canReply: hasPermission(session.role, "support.manage") });
  } catch (error) {
    console.error("[support] staff read failed", error);
    return json({ error: "unavailable" }, 503);
  }
}

/** `action`: send (kèm body) | claim (nhận xử lý) | release (trả về chưa ai nhận). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await requirePermission("support.manage");
  if (!session) return json({ error: "forbidden" }, 403);
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "not_found" }, 404);
  let payload: { action?: unknown; body?: unknown };
  try { payload = await request.json(); } catch { return json({ error: "invalid" }, 400); }
  try {
    const store = getStore();
    const conversation = await store.getSupportConversation(id);
    if (!conversation) return json({ error: "not_found" }, 404);
    if (payload.action === "claim") { await store.updateSupportConversation(id, { assigned_to: session.uid }); return json({ ok: true }); }
    if (payload.action === "release") {
      if (conversation.assigned_to && conversation.assigned_to !== session.uid && session.role !== "admin") return json({ error: "forbidden" }, 403);
      await store.updateSupportConversation(id, { assigned_to: null });
      return json({ ok: true });
    }
    const message = await postStaffSupportMessage({ store, conversation, staff: { id: session.uid, name: session.name, email: session.email }, body: String(payload.body ?? "") });
    return json({ message: supportMessageViews([message], "staff")[0] }, 201);
  } catch (error) {
    if (error instanceof SupportError) return json({ error: error.code }, error.code === "rate_limited" ? 429 : 400);
    console.error("[support] staff send failed", error);
    return json({ error: "unavailable" }, 503);
  }
}
