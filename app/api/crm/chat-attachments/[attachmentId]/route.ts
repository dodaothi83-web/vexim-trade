import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { attachmentDelivery } from "@/lib/chat/attachments";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Nhân viên Vexim mở tệp trong một cuộc chat (trang CRM › Tin nhắn): cùng quyền xem tin nhắn
 * `rfq.view`. Chỉ tệp đã gửi; tệp đang soạn của người dùng không mở được từ đây.
 */
export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "rfq.view")) return json({ error: "auth" }, 401);
  const { attachmentId } = await params;
  try {
    const store = getStore();
    const row = /^[0-9a-f-]{8,64}$/i.test(attachmentId) ? await store.getChatAttachment(attachmentId) : null;
    if (!row || !row.message_id) return json({ error: "not_found" }, 404);
    if (row.status === "deleted") return json({ error: "expired" }, 410);
    const delivery = await attachmentDelivery(row, new URL(request.url).searchParams.get("download") === "1");
    if (!delivery) return json({ error: "not_found" }, 404);
    if ("redirect" in delivery) return new NextResponse(null, { status: 302, headers: { Location: delivery.redirect, "Cache-Control": "private, max-age=120", "Referrer-Policy": "no-referrer" } });
    return new NextResponse(Buffer.from(delivery.data), {
      headers: { ...delivery.headers, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" },
    });
  } catch (error) {
    console.error("[chat-attachments] staff read failed", error);
    return json({ error: "unavailable" }, 503);
  }
}
