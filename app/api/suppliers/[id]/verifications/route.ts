import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { auditHref, auditItems, auditStep } from "@/lib/verification";
import type { VerificationLevel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a review and link to its dedicated page (stable route, not a Server Action ID). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await guard("verifications.inspect");
  if (gate) return NextResponse.json({ ok: false, message: gate.message }, { status: 403 });
  const { id: supplierId } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const level = Number((payload as { targetLevel?: unknown } | null)?.targetLevel);
  if (level !== 1 && level !== 2 && level !== 3) {
    return NextResponse.json({ ok: false, message: "Bước kiểm tra không hợp lệ." }, { status: 400 });
  }
  const step = auditStep(level)!;

  try {
    const store = getStore();
    const supplier = await store.getSupplier(supplierId);
    if (!supplier) return NextResponse.json({ ok: false, message: "Không tìm thấy nhà cung cấp." }, { status: 404 });
    const verifications = await store.listVerifications(supplierId);
    const currentLevel = Math.max(0, ...verifications.filter((v) => v.status === "approved").map((v) => v.target_level));
    if (currentLevel >= level) {
      return NextResponse.json({ ok: false, message: `${step.title} đã được duyệt; không tạo đợt trùng.` }, { status: 409 });
    }
    const ongoing = verifications.find((v) => v.target_level === level && v.status !== "approved");
    if (ongoing) {
      return NextResponse.json({ ok: true, id: ongoing.id, existing: true, href: auditHref(supplierId, level), message: `Mở trang ${step.title.toLowerCase()} đang thực hiện.` });
    }
    if (currentLevel < level - 1) {
      return NextResponse.json({ ok: false, message: `Cần được duyệt ${auditStep(level - 1)?.title.toLowerCase()} trước khi bắt đầu ${step.title.toLowerCase()}.` }, { status: 409 });
    }
    const session = await getSession();
    const checklist = Object.fromEntries(auditItems(level as VerificationLevel).map((it) => [it.key, null]));
    const created = await store.createVerification({
      supplier_id: supplierId,
      target_level: level,
      status: level === 1 ? "in_progress" : "scheduled",
      inspector_id: session?.uid ?? null,
      checklist,
      checklist_notes: {},
      public_summary_i18n: {},
    });
    await store.addAuditLog({
      actor_id: session?.uid ?? null,
      actor_email: session?.email ?? null,
      entity: "supplier",
      entity_id: supplierId,
      action: `verification.start.l${level}`,
      before: { verification_level: currentLevel },
      after: { verification_id: created.id, target_level: level },
    }).catch((error) => console.error("[verification] audit write failed:", error));
    revalidatePath(`/crm/suppliers/${supplierId}`);
    revalidatePath(auditHref(supplierId, level));
    revalidatePath("/crm/verifications");
    return NextResponse.json({ ok: true, id: created.id, href: auditHref(supplierId, level), message: `Đã tạo trang ${step.title.toLowerCase()}.` });
  } catch (error) {
    console.error("[verification] cannot start review:", error);
    const detail = error instanceof Error ? error.message : String(error);
    const schemaMissing = /schema cache|could not find .* column|PGRST204|checklist_notes/i.test(detail);
    return NextResponse.json({
      ok: false,
      message: schemaMissing
        ? "CSDL thiếu cột cho quy trình xác minh. Quản trị viên cần chạy migration 20261017_verification_workflow.sql."
        : "Không tạo được đợt xác minh. Kiểm tra kết nối CSDL hoặc nhật ký máy chủ rồi thử lại.",
    }, { status: 500 });
  }
}
