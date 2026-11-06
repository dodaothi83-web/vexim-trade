/**
 * Gửi email báo tin nhắn chat theo đợt (chat nhà cung cấp và Chat với Vexim).
 *
 * Thiết lập cron-job.org:
 *   - URL:      https://www.veximtrade.com/api/cron/chat-notify
 *   - Method:   GET
 *   - Schedule: mỗi 5 phút (*\/5 * * * *)
 *   - Headers:  Authorization: Bearer <CRON_SECRET>
 *
 * Gọi bao nhiêu lần cũng không gửi trùng: mỗi cuộc được nhận việc trước khi gửi. Khi chưa cài
 * lịch, các lần người dùng tự hỏi tin mới cũng kích hoạt bộ quét (tối đa 3 phút một lần).
 */
import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { runChatNotifications } from "@/lib/chat/notify";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    return NextResponse.json(await runChatNotifications(getStore()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[chat-notify] cron failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
