import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { effectiveL2Scope, l2ScopeForSupplier } from "@/lib/l2-scope";
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
    const scope = level === 2 ? l2ScopeForSupplier(supplier.supplier_type) : null;
    if (level === 2 && !scope) return NextResponse.json({ ok: false, message: "Chưa rõ loại hình nhà cung cấp. Hãy xác minh và cập nhật trước khi tạo L2." }, { status: 400 });
    const verifications = await store.listVerifications(supplierId);
    const sameScope = (v: typeof verifications[number]) => v.target_level === level && (level !== 2 || effectiveL2Scope(v.l2_scope) === scope);
    if (verifications.some((v) => sameScope(v) && v.status === "approved")) {
      return NextResponse.json({ ok: false, message: `${step.title} đã được duyệt; không tạo đợt trùng.` }, { status: 409 });
    }
    const ongoing = verifications.find((v) => sameScope(v) && v.status !== "approved");
    if (ongoing) {
      return NextResponse.json({ ok: true, id: ongoing.id, existing: true, href: auditHref(supplierId, level, ongoing.id), message: `Mở trang ${step.title.toLowerCase()} đang thực hiện.` });
    }
    const session = await getSession();
    const checklist = Object.fromEntries(auditItems(level as VerificationLevel, scope).map((it) => [it.key, null]));
    const created = await store.createVerification({
      supplier_id: supplierId,
      target_level: level,
      ...(scope ? { l2_scope: scope } : {}),
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
      before: { approved_steps: verifications.filter((v) => v.status === "approved").map((v) => v.target_level) },
      after: { verification_id: created.id, target_level: level, l2_scope: scope },
    }).catch((error) => console.error("[verification] audit write failed:", error));
    revalidatePath(`/crm/suppliers/${supplierId}`);
    revalidatePath(auditHref(supplierId, level));
    revalidatePath("/crm/verifications");
    return NextResponse.json({ ok: true, id: created.id, href: auditHref(supplierId, level, created.id), message: `Đã tạo trang ${step.title.toLowerCase()}.` });
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
