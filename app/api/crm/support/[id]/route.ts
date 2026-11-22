import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getStore } from "@/lib/db";
import { sameOrigin } from "@/lib/chat/viewer";
import { presenceKey, touchPresence } from "@/lib/chat/presence";
import { markSupportRead, postStaffSupportMessage, SupportError, supportConversationStatus, supportConversationViews, supportMessageViews } from "@/lib/chat/support";
import { chatAfterParam } from "@/lib/chat/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const ID = /^[0-9a-f-]{8,64}$/i;

/**
 * Tin nhắn của một cuộc; người có quyền trả lời mở ra thì tính là đã đọc. Hộp chat hỏi lại định
 * kỳ với `?after=<mốc>`: chỉ trả tin mới và bản gọn của cuộc (`partial: true`), không tải lại cả
 * cuộc và không tra lại tên/hồ sơ người mua mỗi 6 giây.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("support.view");
  if (!session) return json({ error: "forbidden" }, 403);
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "not_found" }, 404);
  try {
    const store = getStore();
    const conversation = await store.getSupportConversation(id);
    if (!conversation) return json({ error: "not_found" }, 404);
    const after = chatAfterParam(new URL(request.url).searchParams.get("after"));
    const canReply = hasPermission(session.role, "support.manage");
    if (canReply) void touchPresence(store, presenceKey.staff());
    const [messages, view] = await Promise.all([
      store.listSupportMessages(id, 500, after),
      after ? supportConversationStatus(store, conversation) : supportConversationViews(store, [conversation]).then(([v]) => v),
      // Người chỉ có quyền xem không làm mất dấu "chưa đọc" của nhân viên phụ trách.
      canReply ? markSupportRead(store, conversation, "staff") : null,
    ]);
    return json({ conversation: { ...view, unread: false }, messages: supportMessageViews(messages, "staff"), canReply, partial: Boolean(after) });
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
