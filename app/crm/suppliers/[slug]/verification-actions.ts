"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { inVnBounds } from "@/lib/verification";
import {
  L1_DOC_ITEMS,
  L2_VISIT_ITEMS,
  type Verification,
  type VerificationLevel,
  type VerificationStatus,
} from "@/lib/types";

/** Tạo mới một đợt xác minh L1 hoặc L2 cho NCC. */
export async function startVerificationAction(fd: FormData) {
  const g = await guard("verifications.inspect");
  if (g) throw new Error(g.message);
  const session = await getSession();
  const supplierId = String(fd.get("supplierId") || "").trim();
  const targetLevel = Number(fd.get("targetLevel") || 1) as VerificationLevel;
  if (!supplierId) throw new Error("Thiếu nhà cung cấp.");
  if (targetLevel !== 1 && targetLevel !== 2) throw new Error("Cấp xác minh không hợp lệ.");
  const store = getStore();
  const sup = await store.getSupplier(supplierId);
  if (!sup) throw new Error("Nhà cung cấp không tồn tại.");

  // Checklist khởi tạo: tất cả null = chưa kiểm.
  const items = targetLevel === 1 ? L1_DOC_ITEMS : L2_VISIT_ITEMS;
  const checklist: Record<string, boolean | null> = {};
  const notes: Record<string, string | null> = {};
  for (const it of items) { checklist[it.key] = null; notes[it.key] = null; }

  const v = await store.createVerification({
    supplier_id: supplierId,
    target_level: targetLevel,
    status: "scheduled",
    inspector_id: session?.uid ?? null,
    checklist,
    checklist_notes: notes,
    public_summary_i18n: { en: "" },
  });
  try {
    await store.addAuditLog({
      actor_id: session?.uid ?? null,
      actor_email: session?.email ?? null,
      entity: "supplier",
      entity_id: supplierId,
      action: `verification.start.l${targetLevel}`,
      before: { verification_level: sup.verification_level ?? 0 },
      after: { verification_id: v.id, target_level: targetLevel },
    });
  } catch { /* best effort */ }
  revalidatePath(`/crm/suppliers/${supplierId}`);
  revalidatePath(`/crm/suppliers/${supplierId}`);
}

/** Cập nhật checklist + thông tin thăm nhà máy (GPS/ngày/địa chỉ/ghi chú). */
export async function updateVerificationChecklistAction(fd: FormData) {
  const g = await guard("verifications.inspect");
  if (g) throw new Error(g.message);
  const session = await getSession();
  const id = String(fd.get("id") || "").trim();
  if (!id) throw new Error("Thiếu verification id.");
  const store = getStore();
  const before = await store.getVerification(id);
  if (!before) throw new Error("Không tìm thấy hồ sơ.");

  const items = before.target_level === 1 ? L1_DOC_ITEMS : L2_VISIT_ITEMS;
  const checklist: Record<string, boolean | null> = { ...before.checklist };
  const notes: Record<string, string | null> = { ...before.checklist_notes };
  for (const it of items) {
    const v = fd.get(`check:${it.key}`);
    checklist[it.key] = v === "yes" ? true : v === "no" ? false : null;
    const note = String(fd.get(`note:${it.key}`) ?? "").trim();
    notes[it.key] = note || null;
  }

  const visitDate = String(fd.get("visit_date") || "").trim();
  const visitLat = fd.get("visit_lat");
  const visitLng = fd.get("visit_lng");
  const visitAddress = String(fd.get("visit_address") || "").trim();
  const internalNotes = String(fd.get("internal_notes") || "").trim();
  const publicSummaryEn = String(fd.get("public_summary_en") || "").trim();

  const nextStatus = String(fd.get("status") || before.status) as VerificationStatus;

  const patch: Partial<Verification> = {
    checklist,
    checklist_notes: notes,
    visit_date: visitDate || null,
    visit_lat: visitLat !== null && visitLat !== "" ? Number(visitLat) : null,
    visit_lng: visitLng !== null && visitLng !== "" ? Number(visitLng) : null,
    visit_address: visitAddress || null,
    internal_notes: internalNotes || null,
    public_summary_i18n: { en: publicSummaryEn },
    status: nextStatus,
  };
  if (nextStatus === "returned") {
    patch.return_reason = String(fd.get("return_reason") || "").trim() || null;
  } else {
    patch.return_reason = null;
  }
  const after = await store.updateVerification(id, patch);

  try {
    await store.addAuditLog({
      actor_id: session?.uid ?? null,
      actor_email: session?.email ?? null,
      entity: "supplier",
      entity_id: before.supplier_id,
      action: `verification.update.l${before.target_level}.${nextStatus}`,
      before: { status: before.status, checklist: before.checklist },
      after: { status: after.status, id: after.id },
    });
  } catch { /* */ }
  revalidatePath(`/crm/suppliers/${before.supplier_id}`);
  revalidatePath(`/crm/suppliers/${before.supplier_id}`);
}

/** Admin duyệt một đợt xác minh đã submitted (chỉ verifications.approve). */
export async function approveVerificationAction(fd: FormData) {
  const g = await guard("verifications.approve");
  if (g) throw new Error(g.message);
  const session = await getSession();
  const id = String(fd.get("id") || "").trim();
  if (!id) throw new Error("Thiếu id.");
  const store = getStore();
  const before = await store.getVerification(id);
  if (!before) throw new Error("Không tìm thấy.");
  // Bắt buộc tất cả checklist đều đã điền (true/false, không null) khi approve
  const items = before.target_level === 1 ? L1_DOC_ITEMS : L2_VISIT_ITEMS;
  const missing = items.filter((it) => before.checklist[it.key] !== true && before.checklist[it.key] !== false);
  if (missing.length > 0) {
    throw new Error(`Còn ${missing.length} mục chưa kiểm, không thể duyệt.`);
  }
  // L1: tất cả giấy tờ chính phải đạt
  if (before.target_level === 1) {
    const required = L1_DOC_ITEMS.slice(0, 5); // 5 mục đầu tiên là giấy tờ bắt buộc
    const failed = required.filter((it) => before.checklist[it.key] !== true);
    if (failed.length > 0) {
      throw new Error("Thiếu giấy tờ bắt buộc — vui lòng đánh dấu đạt hoặc trả hồ sơ.");
    }
  } else {
    // L2: bắt buộc ngày thăm + GPS + địa chỉ nhà máy
    if (!before.visit_date) throw new Error("L2 cần có ngày thăm nhà máy.");
    if (before.visit_lat == null || before.visit_lng == null) {
      throw new Error("L2 cần có GPS (lấy từ điện thoại lúc thăm).");
    }
    if (!before.visit_address) throw new Error("L2 cần có địa chỉ nhà máy.");
  }
  const after = await store.updateVerification(id, {
    status: "approved",
    approved_by: session?.uid ?? null,
    approved_at: new Date().toISOString(),
  });
  try {
    await store.addAuditLog({
      actor_id: session?.uid ?? null,
      actor_email: session?.email ?? null,
      entity: "supplier",
      entity_id: before.supplier_id,
      action: `verification.approve.l${before.target_level}`,
      before: { status: before.status, verification_level: (await store.getSupplier(before.supplier_id))?.verification_level ?? 0 },
      after: { status: after.status, target_level: after.target_level, approved_at: after.approved_at },
    });
  } catch { /* */ }
  revalidatePath(`/crm/suppliers/${before.supplier_id}`);
  revalidatePath(`/crm/suppliers/${before.supplier_id}`);
}
