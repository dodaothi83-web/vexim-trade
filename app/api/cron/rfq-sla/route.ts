/**
 * Cron SLA cho RFQ: gọi bởi Vercel Cron mỗi giờ. Header bắt buộc:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Logic (MVP, đơn giản — không tính giờ làm việc chi tiết):
 *  - RFQ tạo cách đây ≥ 4h mà chưa assigned_to  -> gửi cảnh báo unassigned.
 *  - RFQ tạo cách đây ≥ 20h, chưa có first_response_at, status đang new/qualified/matching ->
 *    gửi cảnh báo sắp hết hạn 24h.
 *
 * Ở bản sau sẽ thay thẳng "giờ làm việc Asia/Ho_Chi_Minh" (Thứ 2-6, 9h-18h).
 */
import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { sendSlaAlert } from "@/lib/email/rfq";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // timingSafeEqual-like so sánh chuỗi
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const store = getStore();
  const [rfqs, buyers, users] = await Promise.all([
    store.listRfqs(),
    store.listBuyers().catch(() => []),
    store.listUsers().catch(() => []),
  ]);
  const buyerMap = new Map(buyers.map((b) => [b.id, b]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const now = Date.now();
  const warned = { unassigned: 0, due: 0 };
  const closed = new Set(["won", "lost", "closed", "spam"]);

  for (const rfq of rfqs) {
    if (closed.has(rfq.status)) continue;
    const ageHours = (now - new Date(rfq.created_at).getTime()) / 3_600_000;
    const buyer = buyerMap.get(rfq.buyer_id);
    if (!buyer) continue;
    const assigned = rfq.assigned_to ? userMap.get(rfq.assigned_to) : null;

    if (!rfq.assigned_to && ageHours >= 4 && ageHours < 5) {
      // Gửi 1 lần trong khoảng 4-5h để tránh spam liên tục
      await sendSlaAlert({
        kind: "unassigned_4h",
        rfq,
        buyer,
      }).catch(() => null);
      warned.unassigned += 1;
    }
    if (!rfq.first_response_at && ageHours >= 20 && ageHours < 21) {
      await sendSlaAlert({
        kind: "response_due_4h",
        rfq,
        buyer,
        assignedToEmail: assigned?.email ?? null,
      }).catch(() => null);
      warned.due += 1;
    }
  }

  return NextResponse.json({ ok: true, checked: rfqs.length, ...warned });
}
