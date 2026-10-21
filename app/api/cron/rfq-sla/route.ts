/**
 * Cron SLA cho RFQ — gọi bởi cron-job.org (hoặc Vercel Cron / GitHub Actions).
 *
 * Thiết lập cron-job.org:
 *   - URL:      https://www.veximtrade.com/api/cron/rfq-sla
 *   - Method:   GET
 *   - Schedule: 0 2 * * * (09:00 ICT mỗi ngày, Hobby), hoặc 0 * * * * (mỗi giờ, Pro)
 *   - Headers:  Authorization: Bearer <CRON_SECRET>
 *
 * Logic IDEMPOTENT: dù cron gọi bao lâu 1 lần cũng không spam:
 *   - unassigned_4h:     gửi khi RFQ chưa assigned và tuổi ≥ 4h; đánh dấu
 *                        specs.sla_unassigned_alerted_at để không gửi lại.
 *   - response_due_4h:   gửi khi RFQ chưa first_response_at, tuổi ≥ 20h, trạng thái active;
 *                        đánh dấu specs.sla_due_alerted_at để không gửi lại.
 * Khi trạng thái thay đổi (đã phân công / đã trả lời buyer), cờ được giữ lại làm lịch sử.
 */
import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { sendSlaAlert } from "@/lib/email/rfq";
import { sendCertificateExpiryReminders } from "@/lib/certificate-service";

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
  const closed = new Set(["won", "lost", "spam"]);
  const activeResponse = new Set(["new", "needs_review", "in_progress", "matching", "quoted"]);

  let unassigned = 0;
  let due = 0;
  const errors: string[] = [];

  for (const rfq of rfqs) {
    if (closed.has(rfq.status)) continue;
    const buyer = buyerMap.get(rfq.buyer_id);
    if (!buyer) continue;
    const ageHours = (now - new Date(rfq.created_at).getTime()) / 3_600_000;
    const specs = (rfq.specs as Record<string, unknown>) ?? {};
    const assigned = rfq.assigned_to ? userMap.get(rfq.assigned_to) : null;

    // --- Cảnh báo chưa phân công (sau 4 giờ) ---
    if (!rfq.assigned_to && ageHours >= 4 && !specs.sla_unassigned_alerted_at) {
      try {
        await sendSlaAlert({ kind: "unassigned_4h", rfq, buyer });
        const alertedAt = new Date().toISOString();
        await store.updateRfq(rfq.id, { specs: { ...specs, sla_unassigned_alerted_at: alertedAt } });
        // The second alert below may also fire on this run; preserve both markers.
        specs.sla_unassigned_alerted_at = alertedAt;
        unassigned += 1;
      } catch (err) {
        errors.push(`unassigned ${rfq.code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // --- Cảnh báo sắp hết hạn phản hồi (còn ~4 giờ so với mốc 24 giờ) ---
    if (
      !rfq.first_response_at &&
      activeResponse.has(rfq.status) &&
      ageHours >= 20 &&
      !specs.sla_due_alerted_at
    ) {
      try {
        await sendSlaAlert({
          kind: "response_due_4h",
          rfq,
          buyer,
          assignedToEmail: assigned?.email ?? null,
        });
        await store.updateRfq(rfq.id, {
          specs: { ...specs, sla_due_alerted_at: new Date().toISOString() },
        });
        due += 1;
      } catch (err) {
        errors.push(`due ${rfq.code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Chạy gộp luôn kiểm tra nhắc hết hạn chứng nhận L1 (60/30/7/1 ngày, idempotent)
  // để chỉ cần 1 cron job và 1 mã CRON_SECRET duy nhất.
  let certificatesReminded = 0;
  try {
    if (typeof store.listSuppliers === "function" && typeof store.listCertificates === "function") {
      const certReport = await sendCertificateExpiryReminders({ store });
      certificatesReminded = certReport.reminded;
    }
  } catch (err) {
    console.error("[cron] certificate expiry check failed", err);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    provider: "cron-job.org (external)",
    checked: rfqs.length,
    unassigned,
    due,
    certificatesReminded,
    errors: errors.length ? errors : undefined,
  }, { status: errors.length ? 503 : 200 });
}
