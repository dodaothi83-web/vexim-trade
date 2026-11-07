import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { rateLimit } from "@/lib/rfq/rate-limit";
import { supplierSubmissionAccess, staffSubmissionAccess } from "@/lib/supplier-portal/submission-access";
import { isPartnerL2 } from "@/lib/l2-scope";
import { submissionEditable } from "@/lib/verification-submission";
import { scanAndQueueSubmission } from "@/lib/verification-submission-service";
import { getLocale } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { evidenceMessages } from "@/lib/i18n/portal/evidence";
import { bookingMessages } from "@/lib/i18n/portal/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * L2 quét AI; L3 giữ tương thích đường nộp cũ nhưng gửi thẳng cho nhân viên.
 *
 * Ai gọi được:
 *  - NCC của đúng hồ sơ, khi hồ sơ còn mở (draft/returned) hoặc vừa nộp.
 *  - Nhân viên có `verifications.inspect` + `media.internal` (quét lại khi đối chiếu).
 *
 * AI không duyệt hay cấp huy hiệu. Không quét AI bất kỳ hồ sơ L3 nào.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Câu trả về theo ngôn ngữ người đang nộp/quét.
  const language = await getLocale();
  const text = evidenceMessages[language].submit;
  let submit = false;
  if (request.headers.get("content-type")?.includes("application/json")) {
    try { submit = (await request.json() as { submit?: unknown }).submit === true; } catch { submit = false; }
  }

  const session = await getSession();
  const staff = session && hasPermission(session.role, "verifications.inspect") && hasPermission(session.role, "media.internal")
    ? await staffSubmissionAccess(id)
    : null;
  const own = staff ? null : await supplierSubmissionAccess(id);
  const access = staff ?? own;
  if (!access) {
    return NextResponse.json({ ok: false, message: text.noAccessScan }, { status: 403 });
  }
  const isStaff = Boolean(staff);
  // 11/2026: L2 (nhà máy và đối tác) gửi qua trang đặt lịch; không còn quét AI hay nộp bộ ảnh.
  if (access.submission.target_level === 2) {
    return NextResponse.json({ ok: false, message: bookingMessages[language].scanRetired }, { status: 410 });
  }
  const manualExport = access.submission.target_level === 3 || isPartnerL2(access.submission);
  if (manualExport && (isStaff || !submit)) {
    return NextResponse.json({ ok: false, message: isPartnerL2(access.submission) ? text.manualNoAiPartner : text.manualNoAiExport }, { status: 409 });
  }
  if (!isStaff && !submissionEditable(access.submission.status)) {
    return NextResponse.json({ ok: false, message: text.scanLocked }, { status: 409 });
  }

  const actorKey = isStaff ? `staff:${session?.uid}` : `supplier:${access.submission.supplier_id}`;
  // Submission has its own abuse limit. Exhausting the optional AI quota must
  // not prevent a complete factory case from reaching a person.
  if (submit) {
    const submitLimit = rateLimit(`${manualExport ? "submission-manual" : "submission-factory-submit"}:${actorKey}`, { windowMs: 30 * 60 * 1000, max: 12 });
    if (!submitLimit.ok) return NextResponse.json({
      ok: false,
      message: fill(text.tooManySubmits, { minutes: Math.ceil(submitLimit.resetInMs / 60000) }),
    }, { status: 429 });
  }
  let skipAi = false;
  if (!manualExport) {
    const scanLimit = rateLimit(`submission-scan:${actorKey}`, { windowMs: 30 * 60 * 1000, max: isStaff ? 12 : 4 });
    if (!scanLimit.ok && !submit) return NextResponse.json({
      ok: false,
      message: fill(text.scanQuota, { minutes: Math.ceil(scanLimit.resetInMs / 60000) }),
    }, { status: 429 });
    skipAi = !scanLimit.ok;
  }
  const supplier = await access.store.getSupplier(access.submission.supplier_id);
  if (!supplier) return NextResponse.json({ ok: false, message: text.supplierMissing }, { status: 404 });

  try {
    const result = await scanAndQueueSubmission(access.store, {
      bundle: { submission: access.submission, items: access.items, links: access.links },
      supplier,
      actorId: isStaff ? session?.uid ?? null : own?.userId ?? null,
      actorEmail: isStaff ? session?.email ?? null : own?.userEmail ?? null,
      submit,
      skipAi,
      language,
    });
    // Refresh is a side effect: never report a saved submission as failed if it throws.
    try {
      revalidatePath("/supplier/portal/verification/factory");
      revalidatePath("/supplier/portal/verification/export");
      revalidatePath(`/crm/verifications/submissions/${access.submission.id}`);
      revalidatePath("/crm/verifications/submissions");
    } catch (error) {
      console.error("[submission] revalidation failed", error);
    }
    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      message: result.message,
      aiScanned: Boolean(result.aiReview),
      summary: result.aiReview?.summary ?? null,
      manipulationSuspected: result.aiReview?.manipulation_suspected ?? null,
      items: Object.entries(result.aiReview?.items ?? {}).map(([key, item]) => ({ key, ...item })),
      reasons: result.reasons,
      missing: result.missing,
      warnings: result.warnings,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[submission-ai-scan] lỗi", error instanceof Error ? error.message : error);
    return NextResponse.json({
      ok: false,
      message: manualExport ? "Chưa nộp được hồ sơ. Tệp đã tải vẫn được giữ; thử lại sau."
        : error instanceof Error && /AI/.test(error.message)
          ? error.message
          : "Hệ thống chưa quét được bằng chứng. Tệp đã tải vẫn được giữ; thử lại sau.",
    }, { status: 502 });
  }
}
