import "server-only";

import { isPartnerL2, l2ScopeForSupplier, l2ScopeMatchesSupplier } from "@/lib/l2-scope";

import { submissionEvidenceErrorMessage } from "@/lib/supplier-portal/submission-evidence-errors";

import {
  AI_SUBMISSION_DEFAULT_MODEL,
  AI_SUBMISSION_MODEL_ENV,
  MAX_AI_SUBMISSION_FILES,
  MAX_AI_SUBMISSION_FILE_BYTES,
  MAX_AI_SUBMISSION_TOTAL_BYTES,
  evidenceManifest,
  evidenceReviewSystemPrompt,
  failedItemLabels,
  parseSubmissionReview,
} from "@/lib/ai/evidence-review";
import { readOutputText } from "@/lib/ai/company-introduction";
import { getObject } from "@/lib/media/storage";
import { mergeFlags } from "@/lib/media/image-integrity";
import {
  aiReviewFindings,
  aiReviewMayBeOutdated,
  assessSourceLink,
  codeMatches,
  evidenceSnapshot,
  issueVerificationCode,
  openSubmission,
  readiness,
  requiredPhotoKeys,
  requiresHandwrittenCode,
  submissionEditable,
  submissionItemLabel,
  VERIFICATION_CODE_TTL_HOURS,
} from "@/lib/verification-submission";
import type { DataStore } from "@/lib/db/types";
import { notifyStaffSupplierSubmission } from "@/lib/supplier-portal/notify";
import type {
  AiSubmissionReview,
  SubmissionIntegrityFlag,
  Supplier,
  SupplierType,
  SupplierSubmission,
  SupplierSubmissionItem,
  SupplierSubmissionLink,
  Verification,
} from "@/lib/types";

/**
 * Nghiệp vụ phía server của cổng NCC tự gửi bằng chứng L2/L3.
 *
 * Ranh giới giữ nguyên như phần còn lại của hệ thống xác minh:
 *  - L2 có thể dùng AI; L3 gửi thẳng cho nhân viên. Không tự duyệt hay cấp huy hiệu.
 *  - Nhân viên Vexim chấp thuận hồ sơ → tạo một ĐỢT KIỂM `verifications`
 *    kèm toàn bộ bằng chứng; một nhân sự đủ quyền có thể kiểm và duyệt sau xác nhận.
 */

export interface SubmissionBundle {
  submission: SupplierSubmission;
  items: SupplierSubmissionItem[];
  links: SupplierSubmissionLink[];
}

export async function loadSubmissionBundle(store: DataStore, submissionId: string): Promise<SubmissionBundle | null> {
  const submission = await store.getSubmission(submissionId);
  if (!submission) return null;
  const [items, links] = await Promise.all([
    store.listSubmissionItems(submission.id),
    store.listSubmissionLinks(submission.id),
  ]);
  return { submission, items, links };
}

/** Lấy hồ sơ đang mở của NCC ở một cấp; chưa có thì tạo bản nháp. */
export async function getOrCreateSubmission(store: DataStore, input: {
  supplierId: string;
  level: 2 | 3;
  userId: string | null;
  supplierType: SupplierType | null | undefined;
}): Promise<SupplierSubmission> {
  const scope = input.level === 2 ? l2ScopeForSupplier(input.supplierType) : null;
  if (input.level === 2 && !scope) throw new Error("Hồ sơ chưa có loại hình nhà cung cấp. Liên hệ nhân viên để cập nhật trước khi mở L2.");
  const existing = await store.listSubmissions(input.supplierId, input.level);
  const open = openSubmission(existing, input.level, scope);
  if (open) return open;
  try {
    return await store.createSubmission({
      supplier_id: input.supplierId,
      target_level: input.level,
      ...(scope ? { l2_scope: scope } : {}),
      status: "draft",
      created_by: input.userId,
    });
  } catch (error) {
    // Concurrent requests can race the unique open-case constraint.
    const winner = openSubmission(await store.listSubmissions(input.supplierId, input.level), input.level, scope);
    if (winner) return winner;
    throw error;
  }
}

/**
 * Phát hành mã xác minh cho hồ sơ L2. Sinh ở server, ghi audit; NCC chỉ đọc.
 * Mã cũ được thay khi đã hết hạn hoặc NCC chủ động tạo lại.
 */
export async function issueCodeForSubmission(store: DataStore, input: {
  submission: SupplierSubmission;
  userId: string | null;
  userEmail: string | null;
  supplierName: string;
}): Promise<{ code: string; issuedAt: string }> {
  if (isPartnerL2(input.submission)) {
    throw new Error("Hồ sơ đối tác không cần mã ảnh nhà máy.");
  }
  if (!submissionEditable(input.submission.status)) {
    throw new Error("Hồ sơ đã nộp hoặc đã xét; không thể phát hành mã mới.");
  }
  const code = issueVerificationCode(input.submission.target_level);
  const issuedAt = new Date().toISOString();
  const saved = await store.updateEditableSubmission(input.submission.id, {
    verification_code: code,
    code_issued_at: issuedAt,
  }, input.submission.status as "draft" | "returned");
  if (!saved) throw new Error("Hồ sơ vừa thay đổi hoặc đã nộp. Hãy tải lại trang để kiểm tra.");
  await store.addAuditLog({
    actor_id: input.userId, actor_email: input.userEmail,
    entity: "supplier", entity_id: input.submission.supplier_id,
    action: `supplier.submission.code_issued.l${input.submission.target_level}`,
    before: null,
    after: { submission_id: input.submission.id, ttl_hours: VERIFICATION_CODE_TTL_HOURS },
  }).catch((error) => console.error("[submission-code] audit failed", error));
  return { code, issuedAt };
}

/** Cập nhật thông tin lô hàng L3 do NCC tự khai (luôn đánh dấu supplier-stated). */
export async function saveShipmentDetails(store: DataStore, input: {
  submission: SupplierSubmission;
  shipmentRef: string | null;
  shippedOn: string | null;
  destination: string | null;
  note: string | null;
}): Promise<SupplierSubmission> {
  if (!submissionEditable(input.submission.status)) throw new Error("Hồ sơ đã nộp hoặc đã xét.");
  const date = input.shippedOn?.trim() ? input.shippedOn.trim() : null;
  if (date && Number.isNaN(Date.parse(date))) throw new Error("Ngày giao hàng không hợp lệ.");
  return store.updateSubmission(input.submission.id, {
    shipment_ref: clamp(input.shipmentRef, 120),
    shipped_on: date,
    shipment_destination: clamp(input.destination, 160),
    supplier_note: clamp(input.note, 2000),
  });
}

/**
 * Lưu tên nhà máy đối tác ghi trên hợp đồng L2. Đây là khai báo của nhà cung cấp để
 * đối chiếu, không phải kết luận xác minh; nhân viên kiểm lại với hợp đồng khi duyệt.
 */
export async function savePartnerFactoryName(store: DataStore, input: {
  submission: SupplierSubmission;
  partnerFactoryName: string | null;
}): Promise<SupplierSubmission> {
  if (!submissionEditable(input.submission.status)) throw new Error("Hồ sơ đã nộp hoặc đã xét.");
  if (!isPartnerL2(input.submission)) throw new Error("Mục này chỉ dành cho hồ sơ xác thực nhà máy đối tác.");
  const name = clamp(input.partnerFactoryName, 200);
  if (name && name.length < 2) throw new Error("Tên nhà máy đối tác quá ngắn.");
  const updated = await store.updateEditableSubmission(input.submission.id, { partner_factory_name: name });
  if (!updated) throw new Error("Hồ sơ đã nộp hoặc đã xét; không sửa được tên nhà máy đối tác.");
  return updated;
}

function clamp(value: string | null | undefined, max: number): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

/** Lưu link nguồn công khai của L3; chỉ domain allowlist mới được máy chủ quét. */
export async function addSourceLink(store: DataStore, input: {
  submission: SupplierSubmission;
  url: string;
  label: string | null;
  userId: string | null;
}): Promise<{ link: SupplierSubmissionLink; assessment: ReturnType<typeof assessSourceLink> }> {
  if (!submissionEditable(input.submission.status)) throw new Error("Hồ sơ đã nộp hoặc đã xét.");
  const assessment = assessSourceLink(input.url);
  if (!assessment.ok) throw new Error(assessment.reason);
  const links = await store.listSubmissionLinks(input.submission.id);
  if (links.length >= 8) throw new Error("Mỗi hồ sơ tối đa 8 link nguồn.");
  if (links.some((l) => l.url === input.url.trim())) throw new Error("Link này đã được khai.");
  const link = await store.createSubmissionLink({
    submission_id: input.submission.id,
    url: input.url.trim(),
    label: clamp(input.label, 200),
    allowed_source: assessment.allowed,
    fetch_status: assessment.allowed ? "pending" : "manual",
    fetch_note: assessment.reason,
    created_by: input.userId,
  });
  return { link, assessment };
}

/**
 * Thử đọc MỘT link nguồn công khai. Chỉ dùng để ghi nhận tín hiệu đối chiếu
 * (trang còn sống, có nhắc tên doanh nghiệp hay không) — không lưu nội dung,
 * không đi theo redirect ra ngoài allowlist, không truy cập mạng nội bộ.
 */
export async function probeSourceLink(input: { url: string; supplierName: string }): Promise<{
  status: "fetched" | "failed" | "blocked";
  note: string;
}> {
  const assessment = assessSourceLink(input.url);
  if (!assessment.ok || !assessment.allowed) return { status: "blocked", note: assessment.reason };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(input.url, {
      method: "GET",
      redirect: "manual", // không tự theo chuyển hướng: mỗi hop phải được kiểm lại
      headers: { "User-Agent": "VeximTrade-VerificationBot/1.0 (+https://veximtrade.com/how-we-verify)", Accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (response.status >= 300 && response.status < 400) {
      return { status: "blocked", note: "Link chuyển hướng; hệ thống không tự theo redirect ra ngoài danh sách nguồn công khai." };
    }
    if (!response.ok) return { status: "failed", note: `Nguồn trả về HTTP ${response.status}.` };
    const text = (await response.text()).slice(0, 400_000);
    const title = /<title[^>]*>([^<]{0,200})<\/title>/i.exec(text)?.[1]?.trim() ?? null;
    const normalized = text.replace(/\s+/g, " ").toLowerCase();
    const name = input.supplierName.trim().toLowerCase();
    const mentions = name.length >= 4 && normalized.includes(name);
    return {
      status: "fetched",
      note: [
        title ? `Tiêu đề trang: “${title.slice(0, 140)}”` : "Không đọc được tiêu đề trang",
        mentions ? "Có thấy tên doanh nghiệp nhà cung cấp khai trên trang" : "Không thấy tên doanh nghiệp nhà cung cấp khai trên trang",
        "Nội dung trang là dữ liệu nhà cung cấp/người khác đăng; không phải xác nhận của cơ quan nhà nước.",
      ].join(" · "),
    };
  } catch (error) {
    return { status: "failed", note: `Không truy cập được nguồn (${error instanceof Error ? error.name : "lỗi mạng"}). Nhân viên Vexim sẽ tự mở link.` };
  }
}

export interface SubmissionScanResult {
  ok: boolean;
  status: SupplierSubmission["status"];
  aiReview: AiSubmissionReview | null;
  reasons: string[];
  missing: string[];
  warnings: string[];
  message: string;
}

/**
 * L2 factory AI supplies findings only. A structurally complete submission goes
 * to staff regardless of AI output; partner L2 and L3 remain manual.
 */
export async function scanAndQueueSubmission(store: DataStore, input: {
  bundle: SubmissionBundle;
  supplier: Supplier;
  actorId: string | null;
  actorEmail: string | null;
  submit: boolean;
  /** Skip an optional scan when its separate rate limit is exhausted. */
  skipAi?: boolean;
}): Promise<SubmissionScanResult> {
  const { bundle, supplier } = input;
  const submission = bundle.submission;
  const partner = isPartnerL2(submission);
  const preCheck = readiness({ submission, items: bundle.items });
  if (!l2ScopeMatchesSupplier(submission, supplier.supplier_type)) return {
    ok: false, status: submission.status, aiReview: null, reasons: [], missing: preCheck.missing, warnings: preCheck.warnings,
    message: "Loại hình doanh nghiệp chưa rõ hoặc đã thay đổi. Liên hệ nhân viên để kiểm tra lại hồ sơ L2.",
  };
  if (submission.target_level === 3 || partner) {
    // Chặn cả các caller cũ và caller server, không chỉ ẩn nút trên giao diện.
    if (!input.submit) return {
      ok: false, status: submission.status, aiReview: null, reasons: [],
      missing: preCheck.missing, warnings: preCheck.warnings,
      message: partner ? "Hợp đồng đối tác do nhân viên kiểm tra, không quét bằng AI." : "Chứng từ L3 do nhân viên kiểm tra, không quét bằng AI.",
    };
    if (!submissionEditable(submission.status)) return {
      ok: false, status: submission.status, aiReview: null, reasons: [],
      missing: preCheck.missing, warnings: preCheck.warnings,
      message: "Hồ sơ đã nộp hoặc đã xét. Hãy tải lại trang để xem trạng thái.",
    };
    if (!preCheck.ready) return {
      ok: false, status: submission.status, aiReview: null, reasons: preCheck.blockers,
      missing: preCheck.missing, warnings: preCheck.warnings,
      message: partner ? "Hãy tải hợp đồng với nhà máy đối tác trước khi nộp." : "Hãy tải ít nhất một chứng từ xuất khẩu trước khi nộp.",
    };
    const now = new Date().toISOString();
    const beforeStatus = submission.status;
    const previousReviewNote = beforeStatus === "returned" ? submission.review_note : null;
    const previousReviewer = beforeStatus === "returned" ? submission.reviewed_by : null;
    // Chỉ chuyển trạng thái nếu hồ sơ vẫn mở; không ghi đè kết quả nhân viên
    // hoặc tạo lần nộp thứ hai khi có hai yêu cầu đồng thời.
    let updated: SupplierSubmission | null;
    try {
      updated = await store.updateEditableSubmission(submission.id, {
        status: "pending_review", submitted_at: now, review_note: null,
      });
    } catch (error) {
      const message = submissionEvidenceErrorMessage(error);
      if (!message) throw error;
      return { ok: false, status: submission.status, aiReview: null, reasons: [message],
        missing: preCheck.missing, warnings: preCheck.warnings, message };
    }
    if (!updated) return {
      ok: false, status: (await store.getSubmission(submission.id))?.status ?? submission.status,
      aiReview: null, reasons: [], missing: [], warnings: preCheck.warnings,
      message: "Trạng thái hồ sơ đã thay đổi. Hãy tải lại trang để xem kết quả.",
    };
    // Kết quả AI cũ và cờ cũ vẫn được giữ để đối soát lịch sử, không sử dụng ở đây.
    await store.addAuditLog({
      actor_id: input.actorId, actor_email: input.actorEmail,
      entity: "supplier", entity_id: submission.supplier_id,
      action: `supplier.submission.submitted.l${submission.target_level}`,
      before: { status: beforeStatus, review_note: previousReviewNote, reviewed_by: previousReviewer },
      after: { submission_id: submission.id, status: updated.status, review_method: "manual", l2_scope: submission.l2_scope ?? null },
    }).catch((error) => console.error("[submission] audit failed", error));
    const notification = await notifyStaffSupplierSubmission(submission.supplier_id, submission.target_level, submission.l2_scope)
      .catch((error) => { console.error("[submission] staff notification failed", error); return "failed" as const; });
    if (notification === "failed") console.warn("[submission] staff notification not sent; submission is still in the queue");
    return {
      ok: true, status: updated.status, aiReview: null, reasons: [], missing: [],
      warnings: preCheck.warnings,
      message: partner ? "Đã nộp hồ sơ. Nhân viên sẽ đối chiếu hợp đồng với nhà máy đối tác và phản hồi." : "Đã nộp hồ sơ. Nhân viên sẽ kiểm tra chứng từ và phản hồi.",
    };
  }
  if (input.submit && !submissionEditable(submission.status)) return {
    ok: false, status: submission.status, aiReview: null, reasons: [],
    missing: preCheck.missing, warnings: preCheck.warnings,
    message: "Hồ sơ đã nộp hoặc đã xét. Hãy tải lại trang để xem trạng thái.",
  };
  if (input.submit && !preCheck.ready) return {
    // No AI verdict can make the case unready: only actual required files/code.
    ok: false, status: submission.status, aiReview: null,
    reasons: preCheck.blockers, missing: preCheck.missing, warnings: preCheck.warnings,
    message: "Chưa nộp được: hồ sơ còn thiếu mục bắt buộc hoặc thiếu mã xác minh.",
  };

  const beforeStatus = submission.status;
  const beforeNote = submission.review_note;
  const beforeReviewer = submission.reviewed_by;
  const snapshot = evidenceSnapshot(submission, bundle.items);

  // A provider error, missing configuration, or exhausted scan quota never
  // prevents an otherwise complete case from being sent to a human.
  let aiReview: AiSubmissionReview | null = null;
  if (!input.skipAi) {
    try {
      const result = await runEvidenceScan({ bundle, supplier });
      aiReview = result ? { ...result, evidence_snapshot: snapshot } : null;
    } catch (error) {
      console.error("[submission-scan] AI scan failed", error instanceof Error ? error.message : error);
    }
  }

  // AI may take minutes. Do not attach its findings to changed files or send
  // an old version after another tab/person changed the case while it ran.
  let current = await store.getSubmission(submission.id);
  let currentItems = await store.listSubmissionItems(submission.id);
  const changedResult = (status: SupplierSubmission["status"]): SubmissionScanResult => ({
    ok: false, status, aiReview: null, reasons: [], missing: [], warnings: [],
    message: "Hồ sơ vừa thay đổi. Hãy tải lại trang, kiểm tra rồi thử lại.",
  });
  if (!current || evidenceSnapshot(current, currentItems) !== snapshot || (input.submit && current.status !== beforeStatus)) {
    return changedResult(current?.status ?? beforeStatus);
  }
  const itemsAfter = aiReview
    ? await applyAiReviewToItems(store, { ...bundle, submission: current, items: currentItems }, aiReview)
    : currentItems;
  const check = readiness({ submission: current, items: itemsAfter });
  if (input.submit && !check.ready) return {
    ok: false, status: current.status, aiReview: null, reasons: check.blockers,
    missing: check.missing, warnings: check.warnings,
    message: "Chưa nộp được: hồ sơ còn thiếu mục bắt buộc hoặc thiếu mã xác minh.",
  };

  let findings = aiReviewFindings(aiReview, current.verification_code);
  let failed = failedItemLabels(aiReview, current.target_level);
  let aiSaveFailed = false;
  const flags = mergeFlags(itemsAfter.map((i) => i.flags ?? []));
  const now = new Date().toISOString();
  // Preserve an earlier successful scan if this attempt was unavailable.
  // Its original timestamp remains visible; it is not presented as this scan.
  const scanPatch = {
    flags,
    ...(aiReview ? { ai_review: aiReview, ai_scanned_at: now } : {}),
  };

  // Recheck after per-item writes as well; a replacement during those writes
  // must not attach the old scan to a different set of evidence.
  current = await store.getSubmission(submission.id);
  currentItems = await store.listSubmissionItems(submission.id);
  if (!current || evidenceSnapshot(current, currentItems) !== snapshot || (input.submit && current.status !== beforeStatus)) {
    return changedResult(current?.status ?? beforeStatus);
  }

  let updated: SupplierSubmission | null;
  if (input.submit) {
    try {
      // Never overwrite a staff decision or a concurrent submission with the
      // status captured before the AI request. Only the NCC's still-open case
      // can be placed in the queue; AI cannot set `returned` or `accepted`.
      updated = await store.updateEditableSubmission(submission.id, {
        ...scanPatch, status: "pending_review", submitted_at: now, review_note: null,
      }, beforeStatus as "draft" | "returned");
    } catch (error) {
      const message = submissionEvidenceErrorMessage(error);
      if (message) return { ok: false, status: current.status, aiReview: null, reasons: [message],
        missing: check.missing, warnings: check.warnings, message };
      if (!aiReview) throw error;
      // If saving optional AI data failed but the case itself can still be
      // written, queue it without AI. The same status CAS is kept on retry.
      console.error("[submission-scan] could not save AI result; queueing without it", error);
      updated = await store.updateEditableSubmission(submission.id, {
        status: "pending_review", submitted_at: now, review_note: null,
      }, beforeStatus as "draft" | "returned");
      aiReview = null;
      findings = [];
      failed = [];
      aiSaveFailed = true;
    }
    if (!updated) return changedResult((await store.getSubmission(submission.id))?.status ?? beforeStatus);
  } else {
    // A trial or staff rescan never writes the case status, review note, or
    // submission time, even if a human decided the case during the scan.
    updated = await store.updateSubmission(submission.id, scanPatch);
  }

  await store.addAuditLog({
    actor_id: input.actorId, actor_email: input.actorEmail,
    entity: "supplier", entity_id: submission.supplier_id,
    action: `supplier.submission.ai_scan.l${submission.target_level}`,
    before: input.submit ? { status: beforeStatus, review_note: beforeNote, reviewed_by: beforeReviewer } : null,
    after: {
      submission_id: submission.id,
      scanned: Boolean(aiReview),
      model: aiReview?.model ?? null,
      status: updated.status,
      verdicts: Object.entries(aiReview?.items ?? {}).map(([key, item]) => ({ key, verdict: item.verdict })),
      failed_items: failed.length,
    },
  }).catch((error) => console.error("[submission-scan] audit failed", error));

  if (input.submit) {
    const notification = await notifyStaffSupplierSubmission(submission.supplier_id, 2, submission.l2_scope)
      .catch((error) => { console.error("[submission-scan] staff notification failed", error); return "failed" as const; });
    if (notification === "failed") console.warn("[submission-scan] staff notification not sent; submission is still in the queue");
  }

  return {
    ok: true,
    status: updated.status,
    aiReview,
    reasons: findings,
    missing: check.missing,
    warnings: check.warnings,
    message: !aiReview
      ? input.submit
        ? aiSaveFailed
          ? "Hồ sơ đã được gửi. Chưa lưu được kết quả AI; nhân viên sẽ đối chiếu."
          : aiReviewMayBeOutdated(updated, itemsAfter)
            ? "Hồ sơ đã được gửi. Kết quả AI từ lần trước có thể không khớp ảnh hiện tại; nhân viên sẽ đối chiếu."
            : "Hệ thống chưa quét được bằng AI. Hồ sơ đã được gửi để nhân viên đối chiếu."
        : submissionEditable(updated.status)
          ? "Hệ thống chưa quét được bằng AI. Hãy hoàn thiện và nộp hồ sơ để nhân viên đối chiếu."
          : "Hệ thống chưa quét được bằng AI. Hồ sơ vẫn được lưu để nhân viên đối chiếu."
      : !input.submit
        ? findings.length
          ? "AI phát hiện điểm cần kiểm tra. Nhân viên sẽ đối chiếu khi hồ sơ được nộp."
          : "AI đã quét thử. Hãy xem kết quả trước khi tiếp tục."
        : findings.length
          ? "Hồ sơ đã được gửi. AI có điểm cần kiểm tra; nhân viên sẽ đối chiếu và quyết định."
          : "AI đã quét xong và hồ sơ được chuyển vào hàng đợi chờ duyệt.",
  };
}

/** Gửi bằng chứng tới model AI; trả null khi chưa cấu hình hoặc không có tệp đọc được. */
export async function runEvidenceScan(input: {
  bundle: SubmissionBundle;
  supplier: Supplier;
}): Promise<AiSubmissionReview | null> {
  // Phòng vệ cho mọi caller, kể cả khi bỏ qua scanAndQueueSubmission.
  if (input.bundle.submission.target_level === 3 || isPartnerL2(input.bundle.submission)) return null;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const { bundle, supplier } = input;
  const submission = bundle.submission;
  const withMedia = bundle.items.filter((i) => i.storage_path);
  if (!withMedia.length) return null;

  const model = process.env[AI_SUBMISSION_MODEL_ENV]?.trim() || AI_SUBMISSION_DEFAULT_MODEL;
  const files: { id: string; checklistKey: string; label: string; mime: string; data: Uint8Array }[] = [];
  const skipped: string[] = [];
  let total = 0;
  // Select at most one readable image per category, preferring the newest.
  // Duplicate images must not consume the limit and hide other categories.
  for (const key of requiredPhotoKeys()) {
    if (files.length >= MAX_AI_SUBMISSION_FILES) break;
    const candidates = withMedia.filter((item) => item.checklist_key === key)
      .sort((a, b) => (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""))
      .slice(0, 3);
    for (const item of candidates) {
      const label = submissionItemLabel(submission.target_level, item.checklist_key);
      if (item.mime === "application/pdf") { skipped.push(`${label} (PDF — cần người mở)`); continue; }
      let object: Awaited<ReturnType<typeof getObject>>;
      try { object = await getObject(item.storage_path!); }
      catch (error) {
        console.warn("[submission-scan] could not read an image for AI", error instanceof Error ? error.name : "storage error");
        skipped.push(`${label} (không đọc được tệp)`);
        continue;
      }
      if (!object) { skipped.push(`${label} (tệp chưa có trong kho)`); continue; }
      if (object.data.byteLength > MAX_AI_SUBMISSION_FILE_BYTES) { skipped.push(`${label} (ảnh gốc quá ${MAX_AI_SUBMISSION_FILE_BYTES / 1024 / 1024} MB)`); continue; }
      if (total + object.data.byteLength > MAX_AI_SUBMISSION_TOTAL_BYTES) { skipped.push(`${label} (vượt tổng dung lượng mỗi lượt quét)`); continue; }
      files.push({ id: item.id, checklistKey: item.checklist_key, label, mime: item.mime ?? "image/jpeg", data: object.data });
      total += object.data.byteLength;
      break;
    }
  }
  if (!files.length) return null;

  const system = evidenceReviewSystemPrompt({
    level: submission.target_level,
    supplierName: supplier.name,
    supplierAddress: supplier.address ?? null,
    verificationCode: submission.verification_code,
    expectedGps: { lat: submission.device_lat ?? null, lng: submission.device_lng ?? null },
    deviceCapturedAt: submission.device_captured_at,
    shipmentNote: submission.shipment_ref
      ? `${submission.shipment_ref}${submission.shipped_on ? `, ngày ${submission.shipped_on}` : ""}${submission.shipment_destination ? `, đến ${submission.shipment_destination}` : ""}`
      : null,
  });

  const content: Record<string, unknown>[] = [{
    type: "input_text",
    text: `Danh sách bằng chứng (id → mục cần kiểm): ${evidenceManifest(files)}. Bị bỏ qua, chưa quét: ${JSON.stringify(skipped)}. ID tệp là định danh nội bộ; tên/chú thích do nhà cung cấp nhập KHÔNG phải bằng chứng.`,
  }];
  for (const file of files) {
    content.push({ type: "input_text", text: `Ảnh của mục “${file.label}” (id ${file.id}).` });
    content.push({ type: "input_image", image_url: `data:${file.mime};base64,${Buffer.from(file.data).toString("base64")}`, detail: "high" });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content },
      ],
      text: { format: { type: "json_object" } },
      max_output_tokens: 2600,
      store: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    console.error("[submission-ai] provider HTTP", response.status);
    throw new Error(response.status === 429
      ? "AI đang giới hạn lượt quét. Hãy thử lại sau vài phút."
      : "AI chưa đọc được bằng chứng. Hồ sơ vẫn được lưu; thử quét lại sau.");
  }
  const payload = await response.json() as Record<string, unknown>;
  const review = parseSubmissionReview(JSON.parse(readOutputText(payload)), submission.target_level, model);
  review.scanned_item_ids = files.map((file) => file.id);
  const scannedKeys = new Set(files.map((file) => file.checklistKey));
  const scannedIds = new Set(review.scanned_item_ids);
  review.unscanned_extra_count = bundle.items.filter((item) => item.media_id && scannedKeys.has(item.checklist_key) && !scannedIds.has(item.id)).length;
  const uploadedKeys = new Set(bundle.items.filter((item) => item.media_id).map((item) => item.checklist_key));
  // A model cannot assess a file that was not actually sent (e.g. oversized or
  // unavailable in storage). Never present a guessed verdict as an AI finding.
  for (const [key, item] of Object.entries(review.items)) {
    if (scannedKeys.has(key)) continue;
    review.items[key] = {
      ...item, verdict: "uncertain", reason: uploadedKeys.has(key as SupplierSubmissionItem["checklist_key"])
        ? "AI chưa quét được ảnh này; nhân viên sẽ kiểm tra." : null,
      detected_text: null, code_visible: null, code_read: null, flags: [],
    };
  }
  return review;
}

/** Ghi kết quả AI xuống từng mục và đối chiếu mã viết tay với mã đã phát hành. */
async function applyAiReviewToItems(store: DataStore, bundle: SubmissionBundle, review: AiSubmissionReview): Promise<SupplierSubmissionItem[]> {
  const submission = bundle.submission;
  const out: SupplierSubmissionItem[] = [];
  for (const item of bundle.items) {
    const verdict = review.items[item.checklist_key];
    if (!verdict || !item.media_id) { out.push(item); continue; }
    const scanned = review.scanned_item_ids?.includes(item.id) ?? false;
    const aiFlags: SubmissionIntegrityFlag[] = (scanned ? verdict.flags : []).map((flag) => ({
      flag,
      severity: "warning" as const,
      source: "ai" as const,
      detail: verdict.reason,
    }));
    // Mã viết tay: đối chiếu chuỗi AI đọc được với mã hệ thống phát hành.
    if (scanned && submission.target_level === 2 && requiresHandwrittenCode(item.checklist_key)) {
      const matches = codeMatches(submission.verification_code, verdict.code_read);
      if (verdict.code_visible === false || matches === false) {
        aiFlags.push({
          flag: matches === false ? "code_mismatch" : "code_missing",
          severity: "warning",
          source: "ai",
          detail: matches === false
            ? `AI đọc được “${(verdict.code_read ?? "").slice(0, 24)}” nhưng không khớp mã hệ thống phát hành.`
            : "AI không thấy tờ giấy viết tay mã xác minh trong ảnh bắt buộc.",
        });
      }
    }
    // Replace, rather than accumulate, AI findings from older scans of this
    // same file. Non-AI integrity flags remain untouched.
    const flags = mergeFlags([(item.flags ?? []).filter((flag) => flag.source !== "ai"), aiFlags]);
    try {
      const next = await store.updateSubmissionItem(item.id, {
        ai_verdict: scanned ? verdict.verdict : null,
        ai_reason: scanned ? verdict.reason : null,
        ai_detected_text: scanned ? verdict.detected_text : null,
        ai_code_visible: scanned ? verdict.code_visible : null,
        ai_code_read: scanned ? verdict.code_read : null,
        flags,
      });
      out.push(next);
    } catch (error) {
      // The full review is also saved on the submission and displayed to staff.
      // A per-item write failure must not turn optional AI into a submission gate.
      console.error("[submission-scan] could not save item finding", error);
      out.push(item);
    }
  }
  return out;
}

/**
 * Nhân viên Vexim chấp thuận hồ sơ tự gửi: tạo ĐỢT KIỂM của nhân viên
 * (target_level 2/3, status `in_progress`) và SAO CHÉP bằng chứng sang đợt kiểm
 * đó để hồ sơ gốc giữ nguyên làm lịch sử. Duyệt hay không là bước tiếp theo,
 * một nhân sự đủ quyền có thể tự hoàn tất; reviewer độc lập là tùy chọn.
 */
export async function acceptSubmissionIntoVerification(store: DataStore, input: {
  bundle: SubmissionBundle;
  staffId: string;
  staffEmail: string | null;
  note?: string | null;
}): Promise<{ verification: Verification }> {
  const { bundle, staffId } = input;
  const submission = bundle.submission;
  if (submission.status === "accepted" && submission.verification_id) {
    const existing = await store.getVerification(submission.verification_id);
    if (existing) return { verification: existing };
  }
  if (submission.status !== "pending_review" && submission.status !== "returned") {
    throw new Error("Chỉ nhận hồ sơ đang chờ xét duyệt hoặc cần bổ sung.");
  }
  if (submission.target_level === 2) {
    const supplier = await store.getSupplier(submission.supplier_id);
    if (!supplier || !l2ScopeMatchesSupplier(submission, supplier.supplier_type)) {
      throw new Error("Loại hình doanh nghiệp không khớp phạm vi hồ sơ L2. Xác minh và cập nhật loại hình trước khi tiếp tục; giữ hồ sơ cũ.");
    }
    if (isPartnerL2(submission) && !readiness({ submission, items: bundle.items }).ready) {
      throw new Error("Chưa có hợp đồng với nhà máy đối tác trong hồ sơ. Hãy yêu cầu nhà cung cấp bổ sung.");
    }
  }
  // Validate every referenced manual file before creating a review; never copy
  // another entity's file just because an item points at its media id.
  const sourceFiles: Array<{ item: SupplierSubmissionItem; media: NonNullable<Awaited<ReturnType<DataStore["getMedia"]>>> }> = [];
  const manual = submission.target_level === 3 || isPartnerL2(submission);
  for (const item of bundle.items) {
    if (!item.media_id) continue;
    const media = await store.getMedia(item.media_id);
    if (manual && (!media || item.submission_id !== submission.id || item.supplier_id !== submission.supplier_id ||
      media.owner_type !== "submission" || media.submission_id !== submission.id || media.supplier_id !== submission.supplier_id ||
      media.audience !== "internal" || media.checklist_key !== item.checklist_key || !item.storage_path?.trim() ||
      media.storage_path !== item.storage_path || !["image", "document"].includes(media.kind) ||
      (isPartnerL2(submission) && item.checklist_key === "partner_factory_photos" && media.kind !== "image"))) {
      throw new Error("Bằng chứng không thuộc đúng hồ sơ hoặc doanh nghiệp. Hãy kiểm tra lại tệp trước khi nhận.");
    }
    if (media) sourceFiles.push({ item, media });
  }
  if (isPartnerL2(submission) && !sourceFiles.some(({ item }) => item.checklist_key === "partner_factory_contract")) {
    throw new Error("Chưa có hợp đồng hợp lệ với nhà máy đối tác trong hồ sơ.");
  }
  const verification = await store.createVerification({
    supplier_id: submission.supplier_id,
    target_level: submission.target_level,
    ...(submission.target_level === 2 ? { l2_scope: submission.l2_scope ?? "factory" } : {}),
    // Tên nhà máy đối tác đi theo hồ sơ; nhân viên đối chiếu lại với hợp đồng trước khi duyệt.
    ...(isPartnerL2(submission) ? { partner_factory_name: submission.partner_factory_name?.trim() || null } : {}),
    status: "in_progress",
    inspector_id: staffId,
    visit_date: submission.submitted_at ? submission.submitted_at.slice(0, 10) : null,
    visit_lat: submission.device_lat,
    visit_lng: submission.device_lng,
    visit_address: null,
    shipment_ref: submission.shipment_ref,
    shipped_on: submission.shipped_on,
    shipment_destination: submission.shipment_destination,
    checklist: {},
    checklist_notes: {},
    internal_notes: [
      `Hồ sơ nhà cung cấp tự gửi ${submission.id} (L${submission.target_level}${isPartnerL2(submission) ? " · hợp đồng nhà máy đối tác" : ""}).`,
      submission.ai_scanned_at
        ? `${submission.target_level === 3 ? "Lịch sử AI cũ, chỉ tham khảo" : "AI quét"} lúc ${submission.ai_scanned_at}${submission.ai_review?.summary ? `: ${submission.ai_review.summary.slice(0, 400)}` : ""}.`
        : submission.target_level === 3 || isPartnerL2(submission) ? "Chứng từ do nhân viên đối chiếu." : "Chưa có kết quả quét AI.",
      isPartnerL2(submission) ? "Hợp đồng với nhà máy đối tác; không mặc định cơ sở thuộc nhà cung cấp hay đã được kiểm thực địa." : "Bằng chứng do nhà cung cấp tự chụp/tự tải; AI và EXIF chỉ là tín hiệu đối chiếu, chưa phải xác minh.",
      input.note?.trim() ? `Ghi chú người nhận hồ sơ: ${input.note.trim().slice(0, 600)}` : "",
    ].filter(Boolean).join("\n"),
  });

  for (const { media } of sourceFiles) {
    await store.createMedia({
      owner_type: "verification",
      verification_id: verification.id,
      submission_id: null,
      supplier_id: submission.supplier_id,
      product_id: null,
      checklist_key: media.checklist_key ?? null,
      kind: media.kind,
      audience: "internal",
      status: "unverified",
      expires_on: null,
      caption: media.caption,
      storage_path: media.storage_path,
      thumb_path: media.thumb_path,
      external_url: null,
      mime: media.mime,
      bytes: media.bytes,
      width: media.width,
      height: media.height,
      sort_order: media.sort_order,
      created_by: media.created_by,
    });
  }

  await store.updateSubmission(submission.id, {
    status: "accepted",
    reviewed_by: staffId,
    reviewed_at: new Date().toISOString(),
    review_note: input.note?.trim() ? input.note.trim().slice(0, 1900) : submission.review_note,
    verification_id: verification.id,
  });
  await store.addAuditLog({
    actor_id: staffId, actor_email: input.staffEmail,
    entity: "supplier", entity_id: submission.supplier_id,
    action: `staff.submission.accepted.l${submission.target_level}`,
    before: { submission_id: submission.id, status: submission.status },
    after: { submission_id: submission.id, verification_id: verification.id, l2_scope: verification.l2_scope ?? null, items: bundle.items.filter((i) => i.media_id).length },
  });
  return { verification };
}

/** Trả hồ sơ về cho NCC bổ sung (kèm lý do bắt buộc). */
export async function returnSubmission(store: DataStore, input: {
  submission: SupplierSubmission;
  staffId: string;
  staffEmail: string | null;
  reason: string;
}): Promise<SupplierSubmission> {
  const reason = input.reason.trim();
  if (reason.length < 8) throw new Error("Hãy ghi rõ lý do cần bổ sung (tối thiểu 8 ký tự).");
  const updated = await store.updateSubmission(input.submission.id, {
    status: "returned",
    reviewed_by: input.staffId,
    reviewed_at: new Date().toISOString(),
    review_note: reason.slice(0, 1900),
  });
  await store.addAuditLog({
    actor_id: input.staffId, actor_email: input.staffEmail,
    entity: "supplier", entity_id: input.submission.supplier_id,
    action: `staff.submission.returned.l${input.submission.target_level}`,
    before: { submission_id: input.submission.id, status: input.submission.status },
    after: { submission_id: input.submission.id, reason: reason.slice(0, 400) },
  });
  return updated;
}
