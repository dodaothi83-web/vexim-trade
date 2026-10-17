"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { auditHref, auditItems, auditUploadKind, requiredAuditItems } from "@/lib/verification";
import { requireSecondVerificationReviewer } from "@/lib/verification-policy";
import { hasDocumentAuditEvidence } from "@/lib/verification-evidence";
import { verificationMediaEditError } from "@/lib/media/verification-access";
import { notifySupplierDecision } from "@/lib/supplier-portal/notify";
import { type AuditEvidenceKey, type Verification, type VerificationStatus } from "@/lib/types";

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
  const requiredKeys = new Set<string>(requiredAuditItems(before.target_level).map((it) => it.key));
  for (const it of items) {
    const value = fd.get(`check:${it.key}`);
    const optionalItem = !requiredKeys.has(it.key);
    checklist[it.key] = value === "yes" ? true : value === "no" ? false :
      value === "not_applicable" && optionalItem ? "not_applicable" : null;
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
  const patch: Partial<Verification> = {
    checklist, checklist_notes: notes, status: nextStatus, return_reason: null,
    ...(before.target_level === 1 ? { tax_number: taxNumber || null, bank_account_number: bankAccountNumber || null } : {}),
    internal_notes: String(fd.get("internal_notes") || "").trim().slice(0, 5000) || null,
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
  if (before.target_level === 1 && (!/^[0-9]{1,32}$/.test(before.tax_number ?? "") || !/^[0-9]{1,34}$/.test(before.bank_account_number ?? ""))) {
    return { ok: false, message: "Cần nhập mã số thuế và số tài khoản ngân hàng bằng chữ số; không cần tải ảnh cho hai mục này. Trả lại để bổ sung nếu bản kiểm đã nộp." };
  }
  if (requiredAuditItems(before.target_level).some((it) => before.checklist[it.key] !== true && before.checklist[it.key] !== false)) {
    return { ok: false, message: "Còn mục chưa kiểm; trả lại để bổ sung." };
  }
  // Never fall back to supplier-wide media: only this verification's attachments qualify.
  const media = await store.listMedia("verification", before.id);
  if (before.target_level === 1) {
    if (requiredAuditItems(1).some((it) => before.checklist[it.key] !== true)) return { ok: false, message: "Giấy tờ bắt buộc chưa đạt." };
    if (!hasDocumentAuditEvidence(media)) {
      return { ok: false, message: "Chưa có ảnh chụp giấy tờ hoặc PDF trong bằng chứng của đợt Kiểm tra giấy tờ này. Tệp ở kho chung NCC không được tính; hãy tải vào đúng đợt kiểm (hoặc trả lại để bổ sung)." };
    }
  } else if (before.target_level === 2) {
    if (!media.some((m) => m.kind === "image" && m.storage_path && m.checklist_key !== "documents_original")) {
      return { ok: false, message: "Cần ít nhất một ảnh thăm nhà máy trong đúng đợt kiểm trước khi duyệt. Các mục và ô thông tin khác có thể để trống." };
    }
  } else {
    // New inline evidence is assigned to a shipping/receipt row. Preserve older
    // documents already reviewed in the previous media manager without backfill.
    if (!media.some((m) => m.storage_path &&
      (["shipping_proof", "delivery_proof"].includes(m.checklist_key ?? "") && ["image", "document", "certificate"].includes(m.kind) ||
        m.kind === "document" && m.status === "checked"))) {
      return { ok: false, message: "Cần chứng từ vận chuyển/giao nhận ở đúng đợt kiểm (gắn vào mục tương ứng hoặc chứng từ cũ đã kiểm tra). Ảnh không liên quan hoặc video không đủ điều kiện." };
    }
  }
  try {
    await store.updateVerification(before.id, { status: "approved", approved_by: session?.uid ?? null, approved_at: new Date().toISOString() });
  } catch (error) {
    // The temporary self-review policy needs its companion DB migration. Do not
    // mask unrelated DB failures or claim this verification was approved.
    if (error instanceof Error && /verifications_four_eyes/.test(error.message)) {
      console.error("[verification] database still enforces verifications_four_eyes; approval not saved");
      return { ok: false, message: "CSDL vẫn yêu cầu người duyệt khác người kiểm (verifications_four_eyes). Hãy nhờ quản trị viên khác duyệt, hoặc quản trị CSDL chạy migration 20261017_temporary_self_verification_approval.sql trên đúng Supabase project. Bản kiểm vẫn đang chờ duyệt." };
    }
    throw error;
  }
  await auditChange(before, "approved", "approve");
  const name = before.target_level === 1 ? "Kiểm tra giấy tờ" : before.target_level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng";
  const mail = await notifySupplierDecision({ supplierId: before.supplier_id, decision: "verification_approved", name });
  if (mail !== "sent") console.warn("[verification] supplier approval email not sent; decision saved", mail);
  refreshAudit(before);
  return { ok: true, message: "Đã duyệt bước kiểm tra." + (mail === "sent" ? "" : " Email NCC chưa gửi được; kết quả vẫn lưu trên cổng.") };
}

/** Publication is a second, explicit reviewer decision, independent of approving the review. */
export async function updateVerificationPublicSummaryAction(fd: FormData) {
  const gate = await guard("verifications.approve");
  if (gate) return gate;
  const store = getStore();
  const before = await store.getVerification(String(fd.get("id") || ""));
  if (!before || before.status !== "approved" || ![2, 3].includes(before.target_level)) {
    return { ok: false, message: "Chỉ bản kiểm nhà máy hoặc giao hàng đã duyệt mới có thể công khai tóm tắt." };
  }
  const mode = String(fd.get("mode") || "");
  if (!["draft", "publish", "hide"].includes(mode)) return { ok: false, message: "Thao tác không hợp lệ." };
  const summary = String(fd.get("summary") || "").trim();
  if (mode !== "hide" && summary.length > 1000) return { ok: false, message: "Tóm tắt tối đa 1000 ký tự." };
  if (mode === "publish") {
    if (!summary || fd.get("confirmed") !== "yes") return { ok: false, message: "Cần nội dung và xác nhận đã đối chiếu, loại bỏ thông tin nhạy cảm." };
    // A human checks scope and sensitive commercial terms; reject obvious contact leaks too.
    if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(summary) || /https?:\/\/|www\./i.test(summary) || /(?:\+?\d[\s().-]?){9,15}\d/.test(summary)) {
      return { ok: false, message: "Tóm tắt chứa email, liên kết hoặc chuỗi số có thể là số điện thoại/mã đơn. Hãy viết lại ở mức khái quát." };
    }
  }
  const session = await getSession();
  const publishedAt = mode === "publish" ? new Date().toISOString() : null;
  await store.updateVerification(before.id, {
    ...(mode === "hide" ? {} : { public_summary_i18n: { en: summary } }),
    public_summary_published_at: publishedAt,
    public_summary_published_by: mode === "publish" ? session?.uid ?? null : null,
  });
  await store.addAuditLog({
    actor_id: session?.uid ?? null, actor_email: session?.email ?? null,
    entity: "supplier", entity_id: before.supplier_id, action: `verification.summary.${mode}`,
    before: { verification_id: before.id, published_at: before.public_summary_published_at ?? null, summary: before.public_summary_i18n?.en ?? "" },
    after: { verification_id: before.id, published_at: publishedAt, summary: mode === "hide" ? before.public_summary_i18n?.en ?? "" : summary },
  }).catch((err) => console.error("[audit] summary publication log failed", err));
  refreshAudit(before);
  const supplier = await store.getSupplier(before.supplier_id);
  if (supplier?.status === "published") revalidatePath(`/suppliers/${supplier.slug || supplier.id}`);
  return { ok: true, message: mode === "publish" ? "Đã duyệt và công khai tóm tắt." : mode === "hide" ? "Đã ẩn tóm tắt." : "Đã lưu nháp; chưa công khai." };
}

/** Associate old/unassigned evidence with a row of the same verification. */
export async function assignVerificationEvidenceAction(mediaId: string, key: AuditEvidenceKey | null) {
  const gate = await guard("media.manage");
  if (gate) return gate;
  const store = getStore();
  const asset = await store.getMedia(mediaId);
  if (!asset || asset.owner_type !== "verification" || !asset.verification_id) {
    return { ok: false, message: "Tệp không thuộc đợt kiểm." };
  }
  const v = await store.getVerification(asset.verification_id);
  if (!v || asset.supplier_id !== v.supplier_id || (key && !auditUploadKind(v.target_level, key))) {
    return { ok: false, message: "Mục bằng chứng không thuộc bước kiểm này." };
  }
  const blocked = await verificationMediaEditError(v);
  if (blocked) return { ok: false, message: blocked };
  if (key && (!asset.storage_path || !["image", "document", "certificate"].includes(asset.kind) ||
    (auditUploadKind(v.target_level, key) === "image" && asset.kind !== "image"))) {
    return { ok: false, message: "Mục ảnh chỉ nhận ảnh; mục chứng từ nhận ảnh hoặc PDF trong đúng đợt kiểm." };
  }
  if ((asset.checklist_key ?? null) === key) return { ok: true, message: "Tệp đã gắn với mục này." };
  const previousKey = asset.checklist_key ?? null;
  try {
    await store.updateMedia(mediaId, { checklist_key: key });
  } catch (error) {
    if (error instanceof Error && /media_checklist_key_ck/.test(error.message)) {
      console.error("[verification] missing factory/delivery inline evidence migration");
      return { ok: false, message: "CSDL chưa cập nhật mục bằng chứng. Cần chạy migration 20261017_factory_delivery_inline_evidence.sql trước khi gắn tệp." };
    }
    throw error;
  }
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
  const name = before.target_level === 1 ? "Kiểm tra giấy tờ" : before.target_level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng";
  const mail = await notifySupplierDecision({ supplierId: before.supplier_id, decision: "verification_returned", name, note: reason });
  if (mail !== "sent") console.warn("[verification] supplier return email not sent; decision saved", mail);
  refreshAudit(before);
  return { ok: true, message: "Đã trả về để bổ sung." + (mail === "sent" ? "" : " Email NCC chưa gửi được; kết quả vẫn lưu trên cổng.") };
}
