/**
 * Gửi email nhắc theo đợt (chat nhà cung cấp, Chat với Vexim và cập nhật RFQ).
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
import { runChatNotifications, runUnansweredEscalations } from "@/lib/chat/notify";
import { runRfqPortalAlerts } from "@/lib/rfq/portal-alerts";
import { runRfqMediatedAlerts } from "@/lib/rfq/mediated-alerts";
import { retryPendingDirectRfqs } from "@/lib/rfq/retry-direct";

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
    const store = getStore();
    // A chat outage must not block RFQ notifications (or vice versa).
    const [chat, rfq, mediated, direct, unanswered] = await Promise.allSettled([
      runChatNotifications(store), runRfqPortalAlerts(store), runRfqMediatedAlerts(store), retryPendingDirectRfqs(store),
      runUnansweredEscalations(store),
    ]);
    if (unanswered.status === "rejected") console.error("[chat-notify] unanswered escalation failed", unanswered.reason);
    if (chat.status === "rejected") console.error("[chat-notify] chat alerts failed", chat.reason);
    if (rfq.status === "rejected") console.error("[chat-notify] RFQ alerts failed", rfq.reason);
    if (mediated.status === "rejected") console.error("[chat-notify] sourcing desk alerts failed", mediated.reason);
    if (direct.status === "rejected") console.error("[chat-notify] direct portal retry failed", direct.reason);
    return NextResponse.json({ ...(chat.status === "fulfilled" ? chat.value : { chat_error: "unavailable" }),
      rfq: rfq.status === "fulfilled" ? rfq.value : { error: "unavailable" },
      mediated: mediated.status === "fulfilled" ? mediated.value : { error: "unavailable" },
      direct: direct.status === "fulfilled" ? direct.value : { error: "unavailable" },
      unanswered: unanswered.status === "fulfilled" ? unanswered.value : { error: "unavailable" } },
    { status: [chat, rfq, mediated, direct, unanswered].some((result) => result.status === "rejected") ? 503 : 200,
      headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[chat-notify] cron failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
