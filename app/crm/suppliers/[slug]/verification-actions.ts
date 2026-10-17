"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { auditHref, auditItems, requiredAuditItems } from "@/lib/verification";
import { requireSecondVerificationReviewer } from "@/lib/verification-policy";
import { hasDocumentAuditEvidence } from "@/lib/verification-evidence";
import { verificationMediaEditError } from "@/lib/media/verification-access";
import { L1_DOC_ITEMS, type L1DocKey, type Verification, type VerificationStatus } from "@/lib/types";

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
  const requiredKeys = new Set(requiredAuditItems(before.target_level).map((it) => it.key));
  for (const it of items) {
    const value = fd.get(`check:${it.key}`);
    const optionalDoc = before.target_level === 1 && !requiredKeys.has(it.key);
    checklist[it.key] = value === "yes" ? true : value === "no" ? false :
      value === "not_applicable" && optionalDoc ? "not_applicable" : null;
    if (fd.has(`note:${it.key}`)) notes[it.key] = String(fd.get(`note:${it.key}`) ?? "").trim().slice(0, 1000) || null;
  }
  // Two identifiers are entered as strings, not scans. Recording a number is not
  // an external validation and never approves the review automatically.
  const taxNumber = String(fd.get("tax_number") ?? before.tax_number ?? "").trim();
  const bankAccountNumber = String(fd.get("bank_account_number") ?? before.bank_account_number ?? "").trim();
  if (before.target_level === 1) {
    if (taxNumber && !/^[0-9]{1,32}$/.test(taxNumber)) return { ok: false, message: "Mã số thuế chỉ được nhập chữ số (tối đa 32 số)." };
    if (bankAccountNumber && !/^[0-9]{1,34}$/.test(bankAccountNumber)) return { ok: false, message: "Số tài khoản chỉ được nhập chữ số (tối đa 34 số)." };
    checklist.tax_certificate = taxNumber ? true : null;
    checklist.bank_letter = bankAccountNumber ? true : null;
    if (nextStatus === "submitted" && (!taxNumber || !bankAccountNumber)) {
      return { ok: false, message: "Hãy nhập mã số thuế và số tài khoản ngân hàng trước khi nộp duyệt." };
    }
  }
  if (nextStatus === "submitted" && requiredAuditItems(before.target_level).some((it) =>
    checklist[it.key] !== true && checklist[it.key] !== false)) {
    throw new Error("Hãy ghi kết quả các mục bắt buộc trước khi nộp duyệt.");
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
    ...(before.target_level === 1 ? { tax_number: taxNumber || null, bank_account_number: bankAccountNumber || null } : {}),
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
  if (before.target_level === 1 && (!/^[0-9]{1,32}$/.test(before.tax_number ?? "") || !/^[0-9]{1,34}$/.test(before.bank_account_number ?? ""))) {
    return { ok: false, message: "Cần nhập mã số thuế và số tài khoản ngân hàng bằng chữ số; không cần tải ảnh cho hai mục này. Trả lại để bổ sung nếu bản kiểm đã nộp." };
  }
  if (requiredAuditItems(before.target_level).some((it) => before.checklist[it.key] !== true && before.checklist[it.key] !== false)) {
    return { ok: false, message: "Còn mục chưa kiểm; trả lại để bổ sung." };
  }
  if (before.target_level > 1) {
    const prev = (await store.listVerifications(before.supplier_id)).some((v) => v.target_level === before.target_level - 1 && v.status === "approved");
    if (!prev) return { ok: false, message: "Bước trước chưa được duyệt." };
  }
  // Never fall back to supplier-wide media: only this verification's attachments qualify.
  const media = await store.listMedia("verification", before.id);
  if (before.target_level === 1) {
    if (requiredAuditItems(1).some((it) => before.checklist[it.key] !== true)) return { ok: false, message: "Giấy tờ bắt buộc chưa đạt." };
    if (!hasDocumentAuditEvidence(media)) {
      return { ok: false, message: "Chưa có ảnh chụp giấy tờ hoặc PDF trong bằng chứng của đợt Kiểm tra giấy tờ này. Tệp ở kho chung NCC không được tính; hãy tải vào đúng đợt kiểm (hoặc trả lại để bổ sung)." };
    }
  } else if (before.target_level === 2) {
    if (!before.visit_date || !before.visit_address || before.visit_lat == null || before.visit_lng == null ||
      !Number.isFinite(before.visit_lat) || !Number.isFinite(before.visit_lng) ||
      Math.abs(before.visit_lat) > 90 || Math.abs(before.visit_lng) > 180) {
      return { ok: false, message: "Cần ngày, địa chỉ và GPS hợp lệ của nhà máy." };
    }
    if (before.checklist.photos_taken !== true || !media.some((m) => m.kind === "image" && m.storage_path)) {
      return { ok: false, message: "Cần ảnh thăm nhà máy và xác nhận mục ảnh chụp." };
    }
  } else {
    if (!before.shipment_ref?.trim() || !before.shipped_on || before.shipped_on > new Date().toISOString().slice(0, 10)) {
      return { ok: false, message: "Cần mã lô hàng và ngày giao thực tế (không ở tương lai)." };
    }
    if (items.some((it) => before.checklist[it.key] !== true)) return { ok: false, message: "Cần xác nhận đủ chứng từ xuất hàng và giao nhận." };
    if (!media.some((m) => m.kind === "document" && m.storage_path && m.status === "checked")) {
      return { ok: false, message: "Cần ít nhất một chứng từ giao hàng đã được kiểm tra (vận đơn hoặc xác nhận giao nhận). RFQ thắng không đủ điều kiện." };
    }
  }
  await store.updateVerification(before.id, { status: "approved", approved_by: session?.uid ?? null, approved_at: new Date().toISOString() });
  await auditChange(before, "approved", "approve");
  refreshAudit(before);
  return { ok: true, message: "Đã duyệt bước kiểm tra." };
}

/** Associate old/unassigned evidence with a document check without moving the file. */
export async function assignVerificationEvidenceAction(mediaId: string, key: L1DocKey | null) {
  const gate = await guard("media.manage");
  if (gate) return gate;
  const store = getStore();
  const asset = await store.getMedia(mediaId);
  if (!asset || asset.owner_type !== "verification" || !asset.verification_id) {
    return { ok: false, message: "Tệp không thuộc đợt kiểm." };
  }
  const v = await store.getVerification(asset.verification_id);
  if (!v || v.target_level !== 1 || asset.supplier_id !== v.supplier_id ||
    (key && (["tax_certificate", "bank_letter"].includes(key) || !L1_DOC_ITEMS.some((it) => it.key === key)))) {
    return { ok: false, message: "Mục kiểm giấy tờ không hợp lệ." };
  }
  const blocked = await verificationMediaEditError(v);
  if (blocked) return { ok: false, message: blocked };
  if (key && (!asset.storage_path || !["image", "document", "certificate"].includes(asset.kind))) {
    return { ok: false, message: "Chỉ ảnh hoặc PDF trong đợt kiểm mới được gắn vào mục giấy tờ." };
  }
  if ((asset.checklist_key ?? null) === key) return { ok: true, message: "Tệp đã gắn với mục này." };
  const previousKey = asset.checklist_key ?? null;
  await store.updateMedia(mediaId, { checklist_key: key });
  const session = await getSession();
  await store.addAuditLog({
    actor_id: session?.uid ?? null, actor_email: session?.email ?? null,
    entity: "supplier", entity_id: v.supplier_id,
    action: "verification.media.assign",
    before: { verification_id: v.id, media_id: mediaId, checklist_key: previousKey },
    after: { verification_id: v.id, media_id: mediaId, checklist_key: key },
  }).catch((err) => console.error("[audit] evidence assignment failed", err));
  refreshAudit(v);
  return { ok: true, message: key ? "Đã gắn tệp vào mục kiểm." : "Đã chuyển tệp về bằng chứng chưa gắn mục." };
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
