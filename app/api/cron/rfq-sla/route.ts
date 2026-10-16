/**
 * Cron SLA cho RFQ: Vercel Hobby chỉ cho phép 1 lần/ngày, nên chạy lúc
 * 09:00 giờ Hà Nội (0 2 * * * UTC). Ở bản Pro có thể chuyển thành hourly.
 *
 * Mỗi lần chạy, gửi nhắc cho:
 *   - TẤT CẢ RFQ chưa assigned có tuổi ≥ 4h (chưa đóng / chưa spam).
 *   - TẤT CẢ RFQ chưa có first_response_at có tuổi ≥ 20h, ở các status active.
 * Vì cron chỉ chạy 1 lần/ngày, mỗi vi phạm SLA sẽ được nhắc đúng 1 lần/ngày;
 * không cần cửa sổ tránh lặp như phiên bản hourly.
 *
 * Header bắt buộc: Authorization: Bearer <CRON_SECRET>
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
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });

  const store = getStore();
  const [rfqs, buyers, users] = await Promise.all([
    store.listRfqs(),
    store.listBuyers().catch(() => []),
    store.listUsers().catch(() => []),
  ]);
  const buyerMap = new Map(buyers.map((b) => [b.id, b]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const now = Date.now();
  const closed = new Set(["won", "lost", "closed", "spam"]);
  const activeResponse = new Set(["new", "qualified", "matching", "quoting"]);

  let unassigned = 0;
  let due = 0;
  const errors: string[] = [];

  for (const rfq of rfqs) {
    if (closed.has(rfq.status)) continue;
    const buyer = buyerMap.get(rfq.buyer_id);
    if (!buyer) continue;
    const ageHours = (now - new Date(rfq.created_at).getTime()) / 3_600_000;
    const assigned = rfq.assigned_to ? userMap.get(rfq.assigned_to) : null;

    if (!rfq.assigned_to && ageHours >= 4) {
      try {
        await sendSlaAlert({ kind: "unassigned_4h", rfq, buyer });
        unassigned += 1;
      } catch (err) {
        errors.push(`unassigned ${rfq.code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!rfq.first_response_at && activeResponse.has(rfq.status) && ageHours >= 20) {
      try {
        await sendSlaAlert({
          kind: "response_due_4h",
          rfq,
          buyer,
          assignedToEmail: assigned?.email ?? null,
        });
        due += 1;
      } catch (err) {
        errors.push(`due ${rfq.code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    schedule: "daily 09:00 Asia/Ho_Chi_Minh",
    checked: rfqs.length,
    unassigned,
    due,
    errors: errors.length ? errors : undefined,
  });
}
