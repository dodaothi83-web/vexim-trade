"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { auditHref } from "@/lib/verification";
import { isPartnerL2, l2ScopeMatchesSupplier } from "@/lib/l2-scope";
import { canSelfApproveVerification } from "@/lib/verification-policy";
import { callItems, callReviewBlockers, callReviewImages, isCallReview, isReviewMethod, issueReportCode, type CallReviewDraft } from "@/lib/l2-call-review";
import { refreshCrmBadges } from "@/lib/crm/badges";
import { notifySupplierDecision } from "@/lib/supplier-portal/notify";
import { L2_PUBLIC_PHOTOS_MAX, L2_REVIEW_METHOD_LABELS, type Verification } from "@/lib/types";

/**
 * L2 xác minh qua cuộc gọi video / thực địa. Trưởng kiểm duyệt (hoặc admin) vừa gọi
 * vừa ghi checklist vừa duyệt. Không có AI. Mọi quyết định ghi audit log, họ tên người
 * kiểm được chụp lại từ hồ sơ nhân sự lúc duyệt.
 */

type Result = { ok: boolean; message: string; blockers?: string[] };

/** `datetime-local` theo giờ Việt Nam → ISO UTC. */
function vnLocalToIso(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return null;
  const date = new Date(`${text}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function text(fd: FormData, key: string, max: number): string | null {
  return String(fd.get(key) ?? "").trim().slice(0, max) || null;
}

function refresh(v: Verification, slug?: string | null) {
  revalidatePath(auditHref(v.supplier_id, 2));
  revalidatePath(`/crm/suppliers/${v.supplier_id}`);
  revalidatePath("/crm/verifications");
  revalidatePath("/crm/verifications/submissions");
  revalidatePath("/supplier/portal/verification/factory");
  if (slug) revalidatePath(`/suppliers/${slug}`);
  refreshCrmBadges();
}

async function loadEditable(id: string) {
  const store = getStore();
  const before = await store.getVerification(id);
  if (!before || !isCallReview(before)) return { error: "Không tìm thấy đợt kiểm qua cuộc gọi." } as const;
  // `submitted` chỉ là trạng thái tạm giữa hai bước nộp-duyệt của một người; nếu bước duyệt
  // lỗi giữa chừng, người kiểm vẫn mở lại được để lưu hoặc duyệt lần nữa.
  if (!["scheduled", "in_progress", "returned", "submitted"].includes(before.status)) {
    return { error: before.status === "approved" ? "Đợt kiểm đã duyệt; dữ liệu được khóa." : "Đợt kiểm không còn sửa được." } as const;
  }
  const supplier = await store.getSupplier(before.supplier_id);
  if (!supplier || !l2ScopeMatchesSupplier(before, supplier.supplier_type)) {
    return { error: "Loại hình doanh nghiệp không khớp phạm vi đợt kiểm. Xác minh loại hình trước khi tiếp tục." } as const;
  }
  return { store, before, supplier } as const;
}

/** Đọc form thành bản nháp; không tin ID ảnh từ trình duyệt nếu không thuộc đúng đợt kiểm. */
async function readDraft(fd: FormData, before: Verification): Promise<{ draft: CallReviewDraft; patch: Partial<Verification> } | { error: string }> {
  const store = getStore();
  const method = String(fd.get("review_method") ?? "");
  if (!isReviewMethod(method)) return { error: "Phương thức không hợp lệ." };
  if (isPartnerL2(before) && method !== "video_call") return { error: "Nhà máy đối tác bắt buộc xác minh qua cuộc gọi video kèm hợp đồng." };
  const started = vnLocalToIso(fd.get("call_started_at"));
  const ended = vnLocalToIso(fd.get("call_ended_at"));
  const checklist: Verification["checklist"] = {};
  const notes: Verification["checklist_notes"] = {};
  for (const item of callItems(before.l2_scope)) {
    const value = String(fd.get(`check:${item.key}`) ?? "");
    checklist[item.key] = value === "seen" ? true : value === "not_seen" ? false : value === "na" && !item.required ? "not_applicable" : null;
    notes[item.key] = text(fd, `note:${item.key}`, 600);
  }
  const media = await store.listMedia("verification", before.id);
  const images = callReviewImages(before, media);
  const requested = fd.getAll("public_photo").map(String);
  const publicPhotoIds = [...new Set(requested)].filter((id) => images.some((m) => m.id === id)).slice(0, L2_PUBLIC_PHOTOS_MAX);
  const partner = isPartnerL2(before);
  const partnerName = partner ? text(fd, "partner_factory_name", 200) : null;
  const draft: CallReviewDraft = {
    review_method: method, call_started_at: started, call_ended_at: ended,
    supplier_participants: text(fd, "supplier_participants", 400),
    checklist, checklist_notes: notes, public_photo_ids: publicPhotoIds,
    ...(partner ? { partner_factory_name: partnerName } : {}),
  };
  const patch: Partial<Verification> = {
    review_method: method,
    call_started_at: started,
    call_ended_at: ended,
    supplier_participants: draft.supplier_participants,
    observed_scale: text(fd, "observed_scale", 400),
    visit_address: text(fd, "visit_address", 300),
    visit_date: started ? new Date(Date.parse(started) + 7 * 3600_000).toISOString().slice(0, 10) : before.visit_date,
    checklist, checklist_notes: notes,
    public_photo_ids: publicPhotoIds,
    internal_notes: text(fd, "internal_notes", 5000),
    ...(partner ? { partner_factory_name: partnerName } : {}),
  };
  return { draft, patch };
}

export async function saveCallReviewAction(fd: FormData): Promise<Result> {
  try {
    const gate = await guard("verifications.inspect");
    if (gate) return { ok: false, message: gate.message ?? "Bạn không có quyền ghi đợt kiểm." };
    const loaded = await loadEditable(String(fd.get("id") ?? ""));
    if ("error" in loaded) return { ok: false, message: loaded.error! };
    const read = await readDraft(fd, loaded.before);
    if ("error" in read) return { ok: false, message: read.error };
    const session = await getSession();
    await loaded.store.updateVerification(loaded.before.id, { ...read.patch, status: "in_progress", return_reason: null });
    await loaded.store.addAuditLog({
      actor_id: session?.uid ?? null, actor_email: session?.email ?? null,
      entity: "supplier", entity_id: loaded.before.supplier_id, action: "verification.call_review.save.l2",
      before: { id: loaded.before.id, status: loaded.before.status },
      after: { id: loaded.before.id, status: "in_progress", review_method: read.patch.review_method, public_photos: read.patch.public_photo_ids?.length ?? 0 },
    }).catch((error) => console.error("[call-review] audit failed", error));
    try { refresh(loaded.before); } catch (error) { console.error("[call-review] revalidate failed", error); }
    return { ok: true, message: "Đã lưu bản kiểm." };
  } catch (error) {
    console.error("[call-review] save failed", error);
    return { ok: false, message: `Chưa lưu được bản kiểm (${error instanceof Error ? error.message.slice(0, 160) : "lỗi không rõ"}). Nội dung trên trang vẫn giữ nguyên.` };
  }
}

/** Tóm tắt công khai sinh từ dữ liệu đã ghi, tiếng Anh; không chứa liên hệ, giá hay mã lô. */
function publicSummary(v: Verification, inspectorName: string): string {
  const method = L2_REVIEW_METHOD_LABELS[v.review_method ?? "video_call"].en.toLowerCase();
  const date = v.call_started_at ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "numeric", month: "short", year: "numeric" }).format(new Date(v.call_started_at)) : "";
  const seen = callItems(v.l2_scope).filter((item) => v.checklist[item.key] === true && item.group !== "E").map((item) => item.labelEn.toLowerCase());
  const partner = isPartnerL2(v);
  return [
    `${partner ? "Partner factory" : "Facility"} reviewed by ${inspectorName} (Vexim review lead) via ${method}${date ? ` on ${date}` : ""}.`,
    seen.length ? `Observed: ${seen.join(", ")}.` : "",
    partner ? "The contract between the supplier and this partner factory was also reviewed; this does not mean the supplier owns the factory." : "",
    "This is Vexim's own review, not an independent third-party audit or product certification.",
  ].filter(Boolean).join(" ").slice(0, 1000);
}

export async function approveCallReviewAction(fd: FormData): Promise<Result> {
  let committed = false;
  try {
    const gate = await guard("verifications.approve");
    if (gate) return { ok: false, message: gate.message ?? "Bạn không có quyền duyệt." };
    const session = await getSession();
    if (!session || !hasPermission(session.role, "verifications.inspect") || !canSelfApproveVerification(session.role)) {
      return { ok: false, message: "Chỉ trưởng kiểm duyệt hoặc admin vừa kiểm vừa duyệt được đợt kiểm qua cuộc gọi." };
    }
    const loaded = await loadEditable(String(fd.get("id") ?? ""));
    if ("error" in loaded) return { ok: false, message: loaded.error! };
    const { store, before, supplier } = loaded;
    if ((await store.listVerifications(before.supplier_id)).some((v) => v.id !== before.id && v.target_level === 2 &&
      (v.l2_scope ?? "factory") === (before.l2_scope ?? "factory") && v.status === "approved")) {
      return { ok: false, message: "Phạm vi L3 này đã được duyệt ở đợt kiểm khác." };
    }
    const read = await readDraft(fd, before);
    if ("error" in read) return { ok: false, message: read.error };
    const media = await store.listMedia("verification", before.id);
    const blockers = callReviewBlockers({
      draft: read.draft, scope: before.l2_scope, media, verification: before,
      confirmations: { observed: fd.get("confirm_observed") === "yes", photos: fd.get("confirm_photos") === "yes" },
    });
    // Lưu bản kiểm kể cả khi chưa đủ, để không mất dữ liệu vừa nhập.
    await store.updateVerification(before.id, { ...read.patch, status: "in_progress", return_reason: null });
    if (blockers.length) return { ok: false, message: "Chưa duyệt được. Bản kiểm đã được lưu; còn thiếu:", blockers };

    const user = await store.getUser(session.uid).catch(() => null);
    const inspectorName = (user?.name?.trim() || session.email).slice(0, 160);
    const now = new Date().toISOString();
    const reportCode = before.report_code || issueReportCode();
    const merged = { ...before, ...read.patch } as Verification;
    const summary = publicSummary(merged, inspectorName);
    // CSDL chỉ cho duyệt từ `submitted`; một người kiểm và duyệt nên nộp rồi duyệt liền.
    await store.updateVerification(before.id, { status: "submitted", inspector_id: before.inspector_id ?? session.uid });
    await store.updateVerification(before.id, {
      status: "approved",
      approved_by: session.uid, approved_at: now,
      evidence_confirmed_by: session.uid, evidence_confirmed_at: now,
      self_approved: (before.inspector_id ?? session.uid) === session.uid,
      inspector_name: inspectorName,
      report_code: reportCode,
      public_photos_confirmed_at: now,
      public_summary_i18n: { en: summary },
      public_summary_published_at: now,
      public_summary_published_by: session.uid,
    });
    committed = true;
    await store.addAuditLog({
      actor_id: session.uid, actor_email: session.email,
      entity: "supplier", entity_id: before.supplier_id, action: "verification.call_review.approve.l2",
      before: { id: before.id, status: before.status },
      after: {
        id: before.id, status: "approved", review_method: read.patch.review_method, inspector_name: inspectorName,
        report_code: reportCode, public_photo_ids: read.patch.public_photo_ids, observed_confirmed: true, public_photos_confirmed: true,
        self_approved: (before.inspector_id ?? session.uid) === session.uid,
      },
    }).catch((error) => console.error("[call-review] audit failed", error));
    const mail = await notifySupplierDecision({
      supplierId: before.supplier_id, decision: "verification_approved",
      name: isPartnerL2(before) ? "Nhà máy đối tác" : "Xác thực nhà máy",
    }).catch(() => "failed" as const);
    try { refresh(before, supplier.status === "published" ? supplier.slug || supplier.id : null); } catch (error) { console.error("[call-review] revalidate failed", error); }
    return { ok: true, message: `Đã duyệt. Mã báo cáo ${reportCode}; người mua đăng nhập có thể tải báo cáo PDF.${mail === "sent" ? "" : " Email nhà cung cấp chưa gửi được; kết quả vẫn lưu trên cổng."}` };
  } catch (error) {
    console.error("[call-review] approve failed", error);
    const reason = error instanceof Error ? error.message.slice(0, 160) : "lỗi không rõ";
    return committed
      ? { ok: true, message: "Đã duyệt. Trang chưa tự cập nhật; tải lại để thấy kết quả." }
      : { ok: false, message: `Chưa duyệt được (${reason}). Bản kiểm vẫn giữ nguyên; tải lại trang và thử lại.` };
  }
}
