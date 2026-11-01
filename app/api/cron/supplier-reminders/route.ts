/**
 * Cron nhắc nhà cung cấp hoàn thiện hồ sơ xác minh — gọi bởi cron-job.org / Vercel Cron.
 *
 * Thiết lập:
 *   - URL:      https://www.veximtrade.com/api/cron/supplier-reminders
 *   - Method:   GET
 *   - Schedule: 0 2 * * * (09:00 ICT mỗi ngày)
 *   - Headers:  Authorization: Bearer <CRON_SECRET>
 *
 * Đây là thư dịch vụ, không phải email quảng cáo: chỉ nhắc bước nhà cung cấp đã tự
 * bắt đầu hoặc đã tự yêu cầu; tối đa 1 thư/14 ngày và 6 thư/nhà cung cấp. Route này
 * cũng được gọi gộp trong `/api/cron/rfq-sla` nên không bắt buộc tạo job riêng.
 *
 * Xem docs/email-lifecycle-plan.md.
 */
import { NextResponse } from "next/server";

import { sendSupplierProgressReminders } from "@/lib/supplier-portal/reminders";

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

  const report = await sendSupplierProgressReminders();
  const ok = report.failed === 0 && !report.error;
  return NextResponse.json({
    ok,
    provider: "cron-job.org (external)",
    ...report,
  }, { status: ok ? 200 : 503 });
}
