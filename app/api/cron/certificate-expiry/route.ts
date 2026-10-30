/**
 * Cron nhắc hết hạn chứng nhận L1 trước 60 / 30 / 7 / 1 ngày — gọi bởi cron-job.org / Vercel Cron.
 *
 * Thiết lập:
 *   - URL:      https://www.veximtrade.com/api/cron/certificate-expiry
 *   - Method:   GET
 *   - Schedule: 0 2 * * * (09:00 ICT mỗi ngày)
 *   - Headers:  Authorization: Bearer <CRON_SECRET>
 *
 * Idempotent: mỗi mốc ("d60", "d30", "d7", "d1") chỉ gửi tối đa 1 lần và lưu vào
 * `certificates.expiry_notified`. Khi nhà cung cấp tải lên bản chứng nhận mới có
 * `valid_until` mới, `expiry_notified` được xóa để chu kỳ nhắc bắt đầu lại.
 */
import { NextResponse } from "next/server";

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

  const report = await sendCertificateExpiryReminders();
  return NextResponse.json({
    ok: true,
    provider: "cron-job.org (external)",
    ...report,
  });
}
