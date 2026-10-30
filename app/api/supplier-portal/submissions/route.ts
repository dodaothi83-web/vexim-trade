import { NextResponse } from "next/server";

import { supplierLevelAccess } from "@/lib/supplier-portal/submission-access";
import { getOrCreateSubmission, loadSubmissionBundle } from "@/lib/verification-submission-service";
import { readiness } from "@/lib/verification-submission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Danh sách hồ sơ tự gửi của chính doanh nghiệp đang đăng nhập. */
export async function GET() {
  const access = await supplierLevelAccess(2);
  if (!access) return NextResponse.json({ ok: false, message: "Tài khoản NCC chưa được Vexim mở quyền." }, { status: 403 });
  const submissions = await access.store.listSubmissions(access.supplier.id);
  return NextResponse.json({
    ok: true,
    submissions: submissions.map((s) => ({
      id: s.id, target_level: s.target_level, status: s.status, submitted_at: s.submitted_at,
      review_note: s.review_note, verification_code: s.verification_code, updated_at: s.updated_at,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Mở (hoặc tạo) hồ sơ tự gửi của MỘT cấp. Không nhận supplier_id từ client:
 * hồ sơ luôn gắn với doanh nghiệp của phiên đăng nhập.
 */
export async function POST(request: Request) {
  let body: { level?: unknown };
  try { body = await request.json() as { level?: unknown }; } catch { body = {}; }
  const level = Number(body.level) === 3 ? 3 : 2;
  const access = await supplierLevelAccess(level);
  if (!access) return NextResponse.json({ ok: false, message: "Tài khoản NCC chưa được Vexim mở quyền." }, { status: 403 });
  try {
    const submission = await getOrCreateSubmission(access.store, {
      supplierId: access.supplier.id, level, userId: access.user.id, supplierType: access.supplier.supplier_type,
    });
    const bundle = await loadSubmissionBundle(access.store, submission.id);
    if (!bundle) return NextResponse.json({ ok: false, message: "Không mở được hồ sơ." }, { status: 500 });
    const check = readiness({ submission: bundle.submission, items: bundle.items });
    return NextResponse.json({ ok: true, submission: bundle.submission, readiness: check }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[submissions] không tạo được hồ sơ", error);
    const message = error instanceof Error && error.message.includes("chưa có loại hình") ? error.message : "Chưa mở được hồ sơ. Kiểm tra migration supplier_submissions rồi thử lại.";
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }
}
