import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { L1_DOC_ITEMS, L2_VISIT_ITEMS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a L1/L2 review inline, without relying on a deployment-specific Server Action ID. */
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
  if (level !== 1 && level !== 2) {
    return NextResponse.json({ ok: false, message: "Chỉ có thể tạo đợt kiểm giấy tờ (L1) hoặc thăm nhà máy (L2)." }, { status: 400 });
  }

  try {
    const store = getStore();
    const supplier = await store.getSupplier(supplierId);
    if (!supplier) return NextResponse.json({ ok: false, message: "Không tìm thấy nhà cung cấp." }, { status: 404 });
    const currentLevel = supplier.verification_level ?? 0;
    const verifications = await store.listVerifications(supplierId);
    const ongoing = verifications.find((v) => v.target_level === level && v.status !== "approved");
    if (ongoing) {
      return NextResponse.json({ ok: true, id: ongoing.id, existing: true, message: "Đợt kiểm này đã tồn tại. Bảng kiểm ở ngay bên dưới." });
    }
    if (currentLevel >= level) {
      return NextResponse.json({ ok: false, message: `Nhà cung cấp đã được duyệt cấp ${level}; không tạo thêm đợt trùng.` }, { status: 409 });
    }
    if (level === 2 && currentLevel < 1) {
      return NextResponse.json({ ok: false, message: "Cần hoàn tất và được duyệt kiểm giấy tờ L1 trước khi thăm nhà máy L2." }, { status: 409 });
    }
    const session = await getSession();
    const checklist = Object.fromEntries((level === 1 ? L1_DOC_ITEMS : L2_VISIT_ITEMS).map((it) => [it.key, null]));
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
    revalidatePath("/crm/verifications");
    return NextResponse.json({ ok: true, id: created.id, message: "Đã tạo đợt kiểm. Bảng kiểm ở ngay bên dưới." });
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
