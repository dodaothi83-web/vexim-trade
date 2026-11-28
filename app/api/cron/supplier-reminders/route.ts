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

import { sendSupplierInactivityReminders } from "@/lib/supplier-portal/inactivity";
import { sendFirstProductReminders } from "@/lib/supplier-portal/lifecycle-mail";
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
  // Thư nhắc đăng sản phẩm và thư lâu không vào chạy sau, để biết thư vừa gửi và không dồn hai thư một ngày.
  const firstProduct = await sendFirstProductReminders();
  const inactivity = await sendSupplierInactivityReminders();
  const ok = report.failed === 0 && !report.error && inactivity.failed === 0 && !inactivity.error && firstProduct.failed === 0 && !firstProduct.error;
  return NextResponse.json({
    ok,
    provider: "cron-job.org (external)",
    ...report,
    firstProduct,
    inactivity,
  }, { status: ok ? 200 : 503 });
}
