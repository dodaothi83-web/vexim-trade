"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { auditHref, auditItems, auditUploadKind, coreDocsVerified, requiredAuditItems } from "@/lib/verification";
import { requireSecondVerificationReviewer } from "@/lib/verification-policy";
import { hasDocumentAuditEvidence } from "@/lib/verification-evidence";
import { verificationMediaEditError } from "@/lib/media/verification-access";
import { notifyStaffVerificationSubmission, notifySupplierDecision } from "@/lib/supplier-portal/notify";
import { type AuditEvidenceKey, type Verification, type VerificationStatus } from "@/lib/types";

function refreshAudit(v: Verification) {
  revalidatePath(auditHref(v.supplier_id, v.target_level));
  revalidatePath(`/crm/suppliers/${v.supplier_id}`);
  revalidatePath("/crm/verifications");
}

/**
 * Việc phụ chạy SAU khi CSDL đã ghi (email, revalidate, log). Một lỗi ở đây
 * không được biến quyết định đã lưu thành trang lỗi 500: người dùng chỉ cần
 * thấy cảnh báo mềm và tải lại trang.
 */
async function softEffect<T>(label: string, work: () => Promise<T> | T): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    console.error(`[verification] ${label} thất bại sau khi quyết định đã lưu`, error);
    return null;
  }
}

/** Nguyên nhân ngắn gọn để người dùng đọc lại và báo kỹ thuật, không phải cả stack trace. */
function briefReason(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error ?? "")).replace(/\s+/g, " ").trim();
  return text.slice(0, 180) || "không rõ nguyên nhân";
}

/** Gợi ý đúng việc cần làm khi CSDL chưa khớp mã nguồn (lỗi hay gặp ở production). */
function technicalHint(message: string): string {
  if (/schema cache|PGRST204|does not exist|column .* of relation/i.test(message)) {
    return " CSDL có thể chưa chạy migration mới; chạy migration rồi thử lại.";
  }
  // PostgREST trả lỗi này khi UPDATE khớp 0 dòng, thường vì khoá đang dùng bị RLS chặn ghi.
  if (/PGRST116|JSON object requested|0 rows|no rows/i.test(message)) {
    return " Không dòng nào được cập nhật: khoá Supabase của máy chủ có thể đang bị RLS chặn ghi.";
  }
  return "";
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
        self_approved: before.inspector_id == null || before.inspector_id === session?.uid,
      } : {}),
    },
  }).catch((err) => console.error("[audit] verification write failed", err));
}

/** Save the inspector's work or submit it for an independent reviewer. */
export async function updateVerificationChecklistAction(fd: FormData) {
  let committed = false;
  try {
    return await saveChecklist(fd, () => { committed = true; });
  } catch (error) {
    console.error("[verification] checklist action failed", error);
    return committed
      ? { ok: true, message: "Đã lưu bản kiểm. Trang chưa tự cập nhật; tải lại trang để thấy nội dung mới." }
      : { ok: false, message: `Chưa lưu được bản kiểm (${briefReason(error)}).${technicalHint(briefReason(error))} Nội dung trên trang vẫn giữ nguyên.` };
  }
}

async function saveChecklist(fd: FormData, markCommitted: () => void) {
  const gate = await guard("verifications.inspect");
  if (gate) return { ok: false, message: gate.message ?? "Tài khoản của bạn không có quyền thực hiện thao tác này." };
  const id = String(fd.get("id") || "").trim();
  const store = getStore();
  const before = await store.getVerification(id);
  if (!before) return { ok: false, message: "Không tìm thấy đợt kiểm." };
  if ((await store.listVerifications(before.supplier_id)).some((v) => v.target_level === before.target_level && v.status === "approved")) {
    return { ok: false, message: "Bước này đã được duyệt; không thể sửa đợt kiểm cũ." };
  }
  if (!["in_progress", "scheduled", "returned"].includes(before.status)) return { ok: false, message: "Đợt kiểm đã nộp hoặc đã duyệt; không thể sửa." };
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
    if (nextStatus === "submitted" && !taxNumber) {
      return { ok: false, message: "Hãy nhập mã số thuế trước khi nộp duyệt. Số tài khoản ngân hàng là mục tùy chọn." };
    }
  }
  if (nextStatus === "submitted" && requiredAuditItems(before.target_level).some((it) =>
    checklist[it.key] !== true && checklist[it.key] !== false)) {
    return { ok: false, message: "Hãy ghi kết quả các mục bắt buộc trước khi nộp duyệt." };
  }
  const visitDate = String(fd.get("visit_date") || "").trim();
  const visitAddress = String(fd.get("visit_address") || "").trim();
  const lat = String(fd.get("visit_lat") || "").trim();
  const lng = String(fd.get("visit_lng") || "").trim();
  if (before.target_level === 2 && (lat && !Number.isFinite(Number(lat)) || lng && !Number.isFinite(Number(lng)))) {
    return { ok: false, message: "GPS phải là số hợp lệ." };
  }
  const shipmentRef = String(fd.get("shipment_ref") || "").trim().slice(0, 150);
  const shippedOn = String(fd.get("shipped_on") || "").trim();
  if (before.target_level === 3 && shippedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(shippedOn) ||
    !Number.isFinite(Date.parse(shippedOn)) || shippedOn > new Date().toISOString().slice(0, 10))) {
    return { ok: false, message: "Ngày giao phải hợp lệ và không thể ở tương lai." };
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
  markCommitted();
  await auditChange(before, nextStatus, nextStatus === "submitted" ? "submit" : "save");
  await softEffect("làm mới trang kiểm tra", () => refreshAudit(before));
  if (nextStatus === "submitted") {
    const mail = await softEffect("email báo người duyệt",
      () => notifyStaffVerificationSubmission(before.supplier_id, before.target_level)) ?? "failed";
    if (mail !== "sent") console.warn("[verification] reviewer notification failed; submission remains queued", mail);
  }
  return { ok: true, message: nextStatus === "submitted" ? "Đã nộp duyệt; người kiểm duyệt sẽ xem bằng chứng." : "Đã lưu bản kiểm." };
}

async function getReviewable(id: string) {
  const session = await getSession();
  const store = getStore();
  const before = await store.getVerification(id);
  if (!before || before.status !== "submitted") return { ok: false as const, message: "Chỉ xét duyệt đợt đã nộp." };
  if ((await store.listVerifications(before.supplier_id)).some((v) => v.target_level === before.target_level && v.status === "approved")) {
    return { ok: false as const, message: "Bước này đã được duyệt ở đợt kiểm khác." };
  }
  // Giấy tờ L1 do NCC tự tải lên không có người kiểm tách biệt, nên bốn mắt chỉ
  // áp dụng khi đợt đã có người kiểm. Trường hợp còn lại người duyệt tự đối
  // chiếu và phải xác nhận rõ (xem approveReview), hồ sơ ghi self_approved.
  if (requireSecondVerificationReviewer() && before.inspector_id && before.inspector_id === session?.uid) {
    return { ok: false as const, message: "Bạn là người kiểm của đợt này; cần người khác duyệt." };
  }
  return { ok: true as const, before, store, session };
}

export async function approveVerificationAction(fd: FormData): Promise<{ ok: boolean; message: string }> {
  // A server action that throws becomes HTTP 500 in production and the browser
  // only shows a minified React digest. Every expected failure returns a
  // message instead; only a bug reaches the catch below, and even then the
  // page stays usable.
  let committed = false;
  try {
    // Phiên đăng nhập cũng có thể lỗi (CSDL, cookie hỏng). Đặt trong try để
    // không nhánh nào biến quyết định thành trang lỗi 500 với mã React lạ.
    const gate = await guard("verifications.approve");
    if (gate) return { ok: false, message: gate.message ?? "Tài khoản của bạn không có quyền thực hiện thao tác này." };
    return await approveReview(fd, () => { committed = true; });
  } catch (error) {
    console.error("[verification] approve action failed", error);
    return committed
      ? { ok: true, message: "Đã duyệt bước kiểm tra. Trang chưa tự cập nhật; tải lại trang để thấy kết quả và mở bước tiếp theo." }
      : { ok: false, message: `Chưa lưu được quyết định duyệt (${briefReason(error)}).${technicalHint(briefReason(error))} Bản kiểm vẫn đang chờ duyệt.` };
  }
}

async function approveReview(fd: FormData, markCommitted: () => void) {
  const reviewable = await getReviewable(String(fd.get("id") || ""));
  if (!reviewable.ok) return reviewable;
  const { before, store, session } = reviewable;
  const bankNumber = (before.bank_account_number ?? "").trim();
  if (before.target_level === 1 && (!/^[0-9]{1,32}$/.test(before.tax_number ?? "") ||
      (bankNumber && !/^[0-9]{1,34}$/.test(bankNumber)))) {
    return { ok: false, message: "Cần nhập mã số thuế bằng chữ số; số tài khoản ngân hàng là mục tùy chọn nhưng nếu có thì phải là chữ số. Không cần tải ảnh cho hai mục này. Trả lại để bổ sung nếu bản kiểm đã nộp." };
  }
  if (!before.inspector_id && fd.get("confirm_self_review") !== "yes") {
    return { ok: false, message: "Đợt này do nhà cung cấp tự tải lên nên chưa có người kiểm tách biệt. Đánh dấu xác nhận bạn đã tự đối chiếu từng giấy tờ rồi duyệt lần nữa; hệ thống sẽ ghi rõ một người vừa đối chiếu vừa duyệt." };
  }
  if (requiredAuditItems(before.target_level).some((it) => before.checklist[it.key] !== true && before.checklist[it.key] !== false)) {
    return { ok: false, message: "Còn mục chưa kiểm; trả lại để bổ sung." };
  }
  // Never fall back to supplier-wide media: only this verification's attachments qualify.
  const media = await store.listMedia("verification", before.id);
  if (before.target_level === 1) {
    if (requiredAuditItems(1).some((it) => before.checklist[it.key] !== true)) return { ok: false, message: "Chưa nhập mã số thuế. Mục này bắt buộc ghi nhận trước khi duyệt." };
    // Giấy pháp nhân sai tên là điểm dừng, không phải một lựa chọn thay thế.
    if (before.checklist.business_license === false) {
      return { ok: false, message: "Đăng ký doanh nghiệp đang đánh dấu Không đạt. Không duyệt bước giấy tờ khi giấy pháp nhân không khớp; trả lại để NCC bổ sung." };
    }
    if (!coreDocsVerified(before.checklist)) {
      return { ok: false, message: "Cần đánh dấu Đạt ít nhất một trong ba giấy xác minh: Đăng ký doanh nghiệp, ATTP, hoặc HACCP/ISO/FSSC/Halal. Giấy phải đứng tên pháp nhân đã đăng ký." };
    }
    if (!hasDocumentAuditEvidence(media)) {
      return { ok: false, message: "Chưa có ảnh chụp giấy tờ hoặc PDF trong bằng chứng của đợt Kiểm tra giấy tờ này. Tệp ở kho chung NCC không được tính; hãy tải vào đúng đợt kiểm (hoặc trả lại để bổ sung)." };
    }
  } else if (before.target_level === 2) {
    if (!media.some((m) => m.kind === "image" && m.storage_path && (m.checklist_key as string | null) !== "documents_original")) {
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
  const decision = { status: "approved" as const, approved_by: session?.uid ?? null, approved_at: new Date().toISOString() };
  // Chỉ đợt chưa có người kiểm mới dùng cờ này; đợt đã có người kiểm giữ false.
  const patch = { ...decision, self_approved: !before.inspector_id };
  try {
    try {
      await store.updateVerification(before.id, patch);
    } catch (error) {
      // CSDL chưa chạy migration 20261033: cột self_approved chưa có. Không để
      // thứ tự deploy chặn quyết định; ràng buộc bốn mắt (nếu còn) vẫn tự chặn.
      if (!/self_approved/.test(briefReason(error)) || !/schema cache|PGRST204|does not exist/i.test(briefReason(error))) throw error;
      console.warn("[verification] self_approved column missing; approving without it", briefReason(error));
      await store.updateVerification(before.id, decision);
    }
    markCommitted();
  } catch (error) {
    if (error instanceof Error && /verifications_four_eyes/.test(error.message)) {
      console.error("[verification] database rejected the four-eyes approval");
      return { ok: false, message: "CSDL yêu cầu người duyệt khác người kiểm. Nhờ tài khoản khác xét duyệt; bản kiểm vẫn đang chờ duyệt." };
    }
    throw error;
  }
  await auditChange(before, "approved", "approve");
  const name = before.target_level === 1 ? "Kiểm tra giấy tờ" : before.target_level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng";
  const mail = await softEffect("email duyệt gửi NCC",
    () => notifySupplierDecision({ supplierId: before.supplier_id, decision: "verification_approved", name })) ?? "failed";
  if (mail !== "sent") console.warn("[verification] supplier approval email not sent; decision saved", mail);
  await softEffect("làm mới trang kiểm tra", () => refreshAudit(before));
  return { ok: true, message: "Đã duyệt bước kiểm tra." + (mail === "sent" ? "" : " Email NCC chưa gửi được; kết quả vẫn lưu trên cổng.") };
}

/** Publication is a second, explicit reviewer decision, independent of approving the review. */
export async function updateVerificationPublicSummaryAction(fd: FormData) {
  try {
    return await savePublicSummary(fd);
  } catch (error) {
    console.error("[verification] public summary action failed", error);
    return { ok: false, message: `Chưa lưu được tóm tắt (${briefReason(error)}). Bản đang công khai vẫn giữ nguyên.` };
  }
}

async function savePublicSummary(fd: FormData) {
  const gate = await guard("verifications.approve");
  if (gate) return { ok: false, message: gate.message ?? "Tài khoản của bạn không có quyền thực hiện thao tác này." };
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
  await softEffect("làm mới trang kiểm tra", () => refreshAudit(before));
  const supplier = await softEffect("đọc hồ sơ NCC",
    () => store.getSupplier(before.supplier_id));
  if (supplier?.status === "published") await softEffect("làm mới trang công khai",
    () => revalidatePath(`/suppliers/${supplier.slug || supplier.id}`));
  return { ok: true, message: mode === "publish" ? "Đã duyệt và công khai tóm tắt." : mode === "hide" ? "Đã ẩn tóm tắt." : "Đã lưu nháp; chưa công khai." };
}

/** Associate old/unassigned evidence with a row of the same verification. */
export async function assignVerificationEvidenceAction(mediaId: string, key: AuditEvidenceKey | null) {
  try {
    return await assignEvidence(mediaId, key);
  } catch (error) {
    console.error("[verification] evidence assignment failed", error);
    return { ok: false, message: `Chưa gắn được tệp (${briefReason(error)}). Tệp giữ nguyên như trước.` };
  }
}

async function assignEvidence(mediaId: string, key: AuditEvidenceKey | null) {
  const gate = await guard("media.manage");
  if (gate) return { ok: false, message: gate.message ?? "Tài khoản của bạn không có quyền thực hiện thao tác này." };
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
      return { ok: false, message: "CSDL chưa cập nhật mục bằng chứng. Cần chạy migration 20261017_factory_delivery_inline_evidence.sql và 20261020_supplier_self_verification_submissions.sql (danh mục 9 ảnh L2) trước khi gắn tệp." };
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
  await softEffect("làm mới trang kiểm tra", () => refreshAudit(v));
  return { ok: true, message: key ? "Đã gắn tệp vào mục kiểm." : "Đã chuyển tệp về bằng chứng chưa gắn mục." };
}

export async function returnVerificationAction(fd: FormData): Promise<{ ok: boolean; message: string }> {
  let committed = false;
  try {
    // Phiên đăng nhập cũng có thể lỗi (CSDL, cookie hỏng). Đặt trong try để
    // không nhánh nào biến quyết định thành trang lỗi 500 với mã React lạ.
    const gate = await guard("verifications.approve");
    if (gate) return { ok: false, message: gate.message ?? "Tài khoản của bạn không có quyền thực hiện thao tác này." };
    return await returnReview(fd, () => { committed = true; });
  } catch (error) {
    console.error("[verification] return action failed", error);
    return committed
      ? { ok: true, message: "Đã trả về để bổ sung. Trang chưa tự cập nhật; tải lại trang để thấy trạng thái mới." }
      : { ok: false, message: `Chưa trả về được (${briefReason(error)}). Bản kiểm vẫn đang chờ duyệt.` };
  }
}

async function returnReview(fd: FormData, markCommitted: () => void) {
  const reviewable = await getReviewable(String(fd.get("id") || ""));
  if (!reviewable.ok) return reviewable;
  const { before, store } = reviewable;
  const reason = String(fd.get("reason") || "").trim();
  if (!reason) return { ok: false, message: "Cần ghi lý do trả về bổ sung." };
  await store.updateVerification(before.id, { status: "returned", return_reason: reason.slice(0, 1000) });
  markCommitted();
  await auditChange(before, "returned", "return");
  const name = before.target_level === 1 ? "Kiểm tra giấy tờ" : before.target_level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng";
  const mail = await softEffect("email trả về gửi NCC",
    () => notifySupplierDecision({ supplierId: before.supplier_id, decision: "verification_returned", name, note: reason })) ?? "failed";
  if (mail !== "sent") console.warn("[verification] supplier return email not sent; decision saved", mail);
  await softEffect("làm mới trang kiểm tra", () => refreshAudit(before));
  return { ok: true, message: "Đã trả về để bổ sung." + (mail === "sent" ? "" : " Email NCC chưa gửi được; kết quả vẫn lưu trên cổng.") };
}
