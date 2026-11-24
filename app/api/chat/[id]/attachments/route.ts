import { NextResponse } from "next/server";
import { chatViewer, sameOrigin } from "@/lib/chat/viewer";
import { ChatAttachmentError, beginChatUpload } from "@/lib/chat/attachments";
import { ChatError, ownedConversation } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Bước 1 của gửi tệp: trình duyệt khai tên, dung lượng và mã SHA-256 của tệp; máy chủ kiểm quyền,
 * loại tệp, dung lượng, hạn mức gói rồi trả link tải thẳng lên kho (hết hạn sau 10 phút). Tệp
 * giống hệt đã gửi trước đó thì dùng lại ngay, không tải lần nữa.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const viewer = await chatViewer(new URL(request.url).searchParams.get("side"));
  if (!viewer) return json({ error: "auth" }, 401);
  let payload: { name?: unknown; size?: unknown; sha256?: unknown };
  try { payload = await request.json(); } catch { return json({ error: "invalid" }, 400); }
  try {
    const key = viewer.side === "buyer" ? { side: "buyer" as const, email: viewer.email } : { side: "supplier" as const, supplierId: viewer.supplierId };
    const conversation = await ownedConversation(viewer.store, (await params).id, key);
    const ticket = await beginChatUpload({ conversation, viewer: { ...key, store: viewer.store }, name: payload.name, size: payload.size, sha256: payload.sha256 });
    return json(ticket, 201);
  } catch (error) {
    if (error instanceof ChatError) return json({ error: error.code }, 404);
    if (error instanceof ChatAttachmentError) return json({ error: error.code }, error.code === "rate_limited" ? 429 : error.code === "quota" ? 413 : 400);
    console.error("[chat-attachments] begin failed", error);
    return json({ error: "unavailable" }, 503);
  }
}
