import { NextResponse } from "next/server";

import { getBuyerSession } from "@/lib/auth/buyer-session";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { rateLimit } from "@/lib/rfq/rate-limit";
import { loadFactoryReport, loadFactoryReportPhotos } from "@/lib/public/factory-report-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Dữ liệu báo cáo xác minh nhà máy để trình duyệt dựng PDF.
 * Bắt buộc đăng nhập: người mua (tài khoản buyer) hoặc nhân viên có quyền xem xác minh.
 * Không trả ghi chú nội bộ, liên hệ, địa chỉ chi tiết hay ảnh không được chọn.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const [buyer, staff] = await Promise.all([getBuyerSession(), getSession()]);
  const staffAllowed = Boolean(staff && hasPermission(staff.role, "verifications.view"));
  if (!buyer && !staffAllowed) {
    return NextResponse.json({ ok: false, message: "Sign in as a buyer to download this report." }, { status: 401 });
  }
  const limit = rateLimit(`factory-report:${buyer?.uid ?? staff?.uid}`, { windowMs: 60 * 60 * 1000, max: 30 });
  if (!limit.ok) return NextResponse.json({ ok: false, message: "Too many downloads. Please try again later." }, { status: 429 });
  const { code } = await params;
  const loaded = await loadFactoryReport(code).catch((error) => { console.error("[factory-report] load failed", error); return null; });
  if (!loaded) return NextResponse.json({ ok: false, message: "Report not found." }, { status: 404 });
  const photos = await loadFactoryReportPhotos(loaded.verification);
  return NextResponse.json({ ok: true, report: loaded.report, photos }, {
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
