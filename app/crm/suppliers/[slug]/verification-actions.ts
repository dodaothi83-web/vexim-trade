"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { auditHref, auditItems } from "@/lib/verification";
import { requireSecondVerificationReviewer } from "@/lib/verification-policy";
import type { Verification, VerificationStatus } from "@/lib/types";

function refreshAudit(v: Verification) {
  revalidatePath(auditHref(v.supplier_id, v.target_level));
  revalidatePath(`/crm/suppliers/${v.supplier_id}`);
  revalidatePath("/crm/verifications");
}

async function auditChange(before: Verification, status: VerificationStatus, action: string) {
  const session = await getSession();
  await getStore().addAuditLog({
    actor_id: session?.uid ?? null, actor_email: session?.email ?? null,
    entity: "supplier", entity_id: before.supplier_id,
    action: `verification.${action}.l${before.target_level}`,
    before: { id: before.id, status: before.status, checklist: before.checklist },
    after: {
      id: before.id, status,
      ...(status === "approved" ? {
        inspector_id: before.inspector_id,
        approved_by: session?.uid ?? null,
        self_approved: before.inspector_id != null && before.inspector_id === session?.uid,
      } : {}),
    },
  }).catch((err) => console.error("[audit] verification write failed", err));
}

/** Save the inspector's work or submit it for a reviewer (possibly the same admin temporarily). */
export async function updateVerificationChecklistAction(fd: FormData) {
  const gate = await guard("verifications.inspect");
  if (gate) throw new Error(gate.message);
  const id = String(fd.get("id") || "").trim();
  const store = getStore();
  const before = await store.getVerification(id);
  if (!before) throw new Error("Không tìm thấy đợt kiểm.");
  if ((await store.listVerifications(before.supplier_id)).some((v) => v.target_level === before.target_level && v.status === "approved")) {
    throw new Error("Bước này đã được duyệt; không thể sửa đợt kiểm cũ.");
  }
  if (!["in_progress", "scheduled", "returned"].includes(before.status)) throw new Error("Đợt kiểm đã nộp hoặc đã duyệt; không thể sửa.");
  const nextStatus = fd.get("status") === "submitted" ? "submitted" : "in_progress";
  const checklist: Verification["checklist"] = { ...before.checklist };
  const notes: Verification["checklist_notes"] = { ...before.checklist_notes };
  const items = auditItems(before.target_level);
  for (const it of items) {
    const value = fd.get(`check:${it.key}`);
    checklist[it.key] = value === "yes" ? true : value === "no" ? false : null;
    notes[it.key] = String(fd.get(`note:${it.key}`) ?? "").trim().slice(0, 1000) || null;
  }
  if (nextStatus === "submitted" && items.some((it) => checklist[it.key] === null)) {
    throw new Error("Hãy ghi kết quả cho tất cả mục kiểm trước khi nộp duyệt.");
  }
  const visitDate = String(fd.get("visit_date") || "").trim();
  const visitAddress = String(fd.get("visit_address") || "").trim();
  const lat = String(fd.get("visit_lat") || "").trim();
  const lng = String(fd.get("visit_lng") || "").trim();
  if (before.target_level === 2 && (lat && !Number.isFinite(Number(lat)) || lng && !Number.isFinite(Number(lng)))) {
    throw new Error("GPS phải là số hợp lệ.");
  }
  const shipmentRef = String(fd.get("shipment_ref") || "").trim().slice(0, 150);
  const shippedOn = String(fd.get("shipped_on") || "").trim();
  if (before.target_level === 3 && shippedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(shippedOn) ||
    !Number.isFinite(Date.parse(shippedOn)) || shippedOn > new Date().toISOString().slice(0, 10))) {
    throw new Error("Ngày giao phải hợp lệ và không thể ở tương lai.");
  }
  if (before.target_level === 3 && nextStatus === "submitted" && (!shipmentRef || !shippedOn)) {
    throw new Error("Cần mã lô hàng và ngày giao hàng trước khi nộp duyệt.");
  }
  const patch: Partial<Verification> = {
    checklist, checklist_notes: notes, status: nextStatus, return_reason: null,
    internal_notes: String(fd.get("internal_notes") || "").trim().slice(0, 5000) || null,
    public_summary_i18n: { en: String(fd.get("public_summary_en") || "").trim().slice(0, 1000) },
  };
  if (before.target_level === 2) {
    Object.assign(patch, { visit_date: visitDate || null, visit_address: visitAddress || null,
      visit_lat: lat ? Number(lat) : null, visit_lng: lng ? Number(lng) : null });
  }
  if (before.target_level === 3) {
    Object.assign(patch, { shipment_ref: shipmentRef || null, shipped_on: shippedOn || null,
      shipment_destination: String(fd.get("shipment_destination") || "").trim().slice(0, 200) || null });
  }
  await store.updateVerification(id, patch);
  await auditChange(before, nextStatus, nextStatus === "submitted" ? "submit" : "save");
  refreshAudit(before);
  return { ok: true, message: nextStatus === "submitted" ? "Đã nộp duyệt." : "Đã lưu bản kiểm." };
}

async function getReviewable(id: string) {
  const session = await getSession();
  const store = getStore();
  const before = await store.getVerification(id);
  if (!before || before.status !== "submitted") throw new Error("Chỉ xét duyệt đợt đã nộp.");
  if ((await store.listVerifications(before.supplier_id)).some((v) => v.target_level === before.target_level && v.status === "approved")) {
    throw new Error("Bước này đã được duyệt ở đợt kiểm khác.");
  }
  if (requireSecondVerificationReviewer() && before.inspector_id === session?.uid) {
    throw new Error("Người kiểm không được tự duyệt. Cần người khác xét duyệt.");
  }
  return { before, store, session };
}

export async function approveVerificationAction(fd: FormData) {
  const gate = await guard("verifications.approve");
  if (gate) throw new Error(gate.message);
  const { before, store, session } = await getReviewable(String(fd.get("id") || ""));
  const items = auditItems(before.target_level);
  if (items.some((it) => before.checklist[it.key] !== true && before.checklist[it.key] !== false)) {
    throw new Error("Còn mục chưa kiểm; trả lại để bổ sung.");
  }
  if (before.target_level > 1) {
    const prev = (await store.listVerifications(before.supplier_id)).some((v) => v.target_level === before.target_level - 1 && v.status === "approved");
    if (!prev) throw new Error("Bước trước chưa được duyệt.");
  }
  const media = await store.listMedia("verification", before.id);
  if (before.target_level === 1) {
    if (items.slice(0, 5).some((it) => before.checklist[it.key] !== true)) throw new Error("Giấy tờ bắt buộc chưa đạt.");
    if (!media.some((m) => m.kind === "document" || m.kind === "certificate")) throw new Error("Cần tải giấy tờ làm bằng chứng.");
  } else if (before.target_level === 2) {
    if (!before.visit_date || !before.visit_address || before.visit_lat == null || before.visit_lng == null ||
      !Number.isFinite(before.visit_lat) || !Number.isFinite(before.visit_lng) ||
      Math.abs(before.visit_lat) > 90 || Math.abs(before.visit_lng) > 180) {
      throw new Error("Cần ngày, địa chỉ và GPS hợp lệ của nhà máy.");
    }
    if (before.checklist.photos_taken !== true || !media.some((m) => m.kind === "image")) throw new Error("Cần ảnh thăm nhà máy và xác nhận mục ảnh chụp.");
  } else {
    if (!before.shipment_ref?.trim() || !before.shipped_on || before.shipped_on > new Date().toISOString().slice(0, 10)) {
      throw new Error("Cần mã lô hàng và ngày giao thực tế (không ở tương lai).");
    }
    if (items.some((it) => before.checklist[it.key] !== true)) throw new Error("Cần xác nhận đủ chứng từ xuất hàng và giao nhận.");
    if (!media.some((m) => m.kind === "document" && m.storage_path && m.status === "checked")) {
      throw new Error("Cần ít nhất một chứng từ giao hàng đã được kiểm tra (vận đơn hoặc xác nhận giao nhận). RFQ thắng không đủ điều kiện.");
    }
  }
  await store.updateVerification(before.id, { status: "approved", approved_by: session?.uid ?? null, approved_at: new Date().toISOString() });
  await auditChange(before, "approved", "approve");
  refreshAudit(before);
  return { ok: true, message: "Đã duyệt bước kiểm tra." };
}

export async function returnVerificationAction(fd: FormData) {
  const gate = await guard("verifications.approve");
  if (gate) throw new Error(gate.message);
  const { before, store } = await getReviewable(String(fd.get("id") || ""));
  const reason = String(fd.get("reason") || "").trim();
  if (!reason) throw new Error("Cần ghi lý do trả về bổ sung.");
  await store.updateVerification(before.id, { status: "returned", return_reason: reason.slice(0, 1000) });
  await auditChange(before, "returned", "return");
  refreshAudit(before);
  return { ok: true, message: "Đã trả về để bổ sung." };
}
