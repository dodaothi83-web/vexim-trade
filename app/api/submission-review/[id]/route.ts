import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { guard } from "@/lib/auth/session";
import { staffSubmissionAccess } from "@/lib/supplier-portal/submission-access";
import { acceptSubmissionIntoVerification, returnSubmission } from "@/lib/verification-submission-service";
import { auditHref } from "@/lib/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nhân viên Vexim xét hồ sơ NCC TỰ GỬI.
 *
 * Chấp thuận ở đây KHÔNG cấp huy hiệu: nó chỉ tạo một ĐỢT KIỂM của nhân viên
 * kèm toàn bộ bằng chứng, để người kiểm đối chiếu và một người CÓ QUYỀN DUYỆT
 * KHÁC phê (bốn mắt) như quy trình L1/L2/L3 sẵn có.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await guard("verifications.inspect");
  if (gate) return NextResponse.json({ ok: false, message: gate.message }, { status: 403 });
  const internal = await guard("media.internal");
  if (internal) return NextResponse.json({ ok: false, message: internal.message }, { status: 403 });
  const { id } = await params;
  const access = await staffSubmissionAccess(id);
  if (!access) return NextResponse.json({ ok: false, message: "Không tìm thấy hồ sơ hoặc bạn không có quyền mở bằng chứng." }, { status: 404 });

  let body: { decision?: unknown; note?: unknown };
  try { body = await request.json() as { decision?: unknown; note?: unknown }; } catch { body = {}; }
  const decision = String(body.decision ?? "");
  const note = typeof body.note === "string" ? body.note : "";

  try {
    if (decision === "accept") {
      const { verification } = await acceptSubmissionIntoVerification(access.store, {
        bundle: { submission: access.submission, items: access.items, links: access.links },
        staffId: access.session.uid,
        staffEmail: access.session.email,
        note,
      });
      revalidatePath("/supplier/portal/verification/factory");
      revalidatePath("/supplier/portal/verification/export");
      revalidatePath(`/crm/suppliers/${access.submission.supplier_id}`);
      revalidatePath("/crm/verifications/submissions");
      return NextResponse.json({
        ok: true,
        message: "Đã nhận hồ sơ vào đợt kiểm của nhân viên. Bằng chứng đã sao sang đợt kiểm; việc DUYỆT vẫn cần người thứ hai.",
        verificationId: verification.id,
        href: auditHref(access.submission.supplier_id, access.submission.target_level),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    if (decision === "return") {
      if (note.trim().length < 8) {
        return NextResponse.json({ ok: false, message: "Hãy ghi rõ lý do cần bổ sung để NCC sửa đúng." }, { status: 400 });
      }
      await returnSubmission(access.store, {
        submission: access.submission,
        staffId: access.session.uid,
        staffEmail: access.session.email,
        reason: note,
      });
      revalidatePath("/supplier/portal/verification/factory");
      revalidatePath("/supplier/portal/verification/export");
      revalidatePath("/crm/verifications/submissions");
      return NextResponse.json({ ok: true, message: "Đã trả hồ sơ kèm lý do; NCC sẽ thấy trong cổng và bổ sung." }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ok: false, message: "Quyết định không hợp lệ." }, { status: 400 });
  } catch (error) {
    console.error("[submission-review] lỗi", error);
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "Không xử lý được hồ sơ.",
    }, { status: 400 });
  }
}
