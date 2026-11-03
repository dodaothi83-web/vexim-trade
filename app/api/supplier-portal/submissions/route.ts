import { NextResponse } from "next/server";

import { supplierLevelAccess } from "@/lib/supplier-portal/submission-access";
import { getOrCreateSubmission, loadSubmissionBundle } from "@/lib/verification-submission-service";
import { readiness } from "@/lib/verification-submission";
import { getLocale } from "@/lib/i18n/server";
import { evidenceMessages } from "@/lib/i18n/portal/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Danh sách hồ sơ tự gửi của chính doanh nghiệp đang đăng nhập. */
export async function GET() {
  const access = await supplierLevelAccess(2);
  if (!access) return NextResponse.json({ ok: false, message: evidenceMessages[await getLocale()].submit.supplierMissing }, { status: 403 });
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
  const language = await getLocale();
  const text = evidenceMessages[language].submit;
  const access = await supplierLevelAccess(level);
  if (!access) return NextResponse.json({ ok: false, message: text.supplierMissing }, { status: 403 });
  try {
    const submission = await getOrCreateSubmission(access.store, {
      supplierId: access.supplier.id, level, userId: access.user.id, supplierType: access.supplier.supplier_type, language,
    });
    const bundle = await loadSubmissionBundle(access.store, submission.id);
    if (!bundle) return NextResponse.json({ ok: false, message: evidenceMessages[language].upload.noAccess }, { status: 500 });
    const check = readiness({ submission: bundle.submission, items: bundle.items, language });
    return NextResponse.json({ ok: true, submission: bundle.submission, readiness: check }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[submissions] không tạo được hồ sơ", error);
    const message = error instanceof Error && error.message === evidenceMessages.vi.draft.scopeMissing ? error.message : evidenceMessages[language].upload.noAccessFallback;
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }
}
