import "server-only";

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
  assessSourceLink,
  autoQueueStatus,
  codeMatches,
  issueVerificationCode,
  openSubmission,
  readiness,
  requiresHandwrittenCode,
  submissionEditable,
  submissionItemLabel,
  VERIFICATION_CODE_TTL_HOURS,
} from "@/lib/verification-submission";
import type { DataStore } from "@/lib/db/types";
import type {
  AiSubmissionReview,
  SubmissionIntegrityFlag,
  Supplier,
  SupplierSubmission,
  SupplierSubmissionItem,
  SupplierSubmissionLink,
  Verification,
} from "@/lib/types";

/**
 * Nghiệp vụ phía server của cổng NCC tự gửi bằng chứng L2/L3.
 *
 * Ranh giới giữ nguyên như phần còn lại của hệ thống xác minh:
 *  - AI quét và xếp hàng đợi, KHÔNG duyệt, KHÔNG cấp huy hiệu.
 *  - Nhân viên Vexim chấp thuận hồ sơ → tạo một ĐỢT KIỂM `verifications`
 *    kèm toàn bộ bằng chứng; việc duyệt đợt kiểm đó vẫn cần người thứ hai.
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
}): Promise<SupplierSubmission> {
  const existing = await store.listSubmissions(input.supplierId, input.level);
  const open = openSubmission(existing, input.level);
  if (open) return open;
  return store.createSubmission({
    supplier_id: input.supplierId,
    target_level: input.level,
    status: "draft",
    created_by: input.userId,
  });
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
  if (!submissionEditable(input.submission.status)) {
    throw new Error("Hồ sơ đã nộp hoặc đã xét; không thể phát hành mã mới.");
  }
  const code = issueVerificationCode(input.submission.target_level);
  const issuedAt = new Date().toISOString();
  await store.updateSubmission(input.submission.id, {
    verification_code: code,
    code_issued_at: issuedAt,
    // Mã mới nghĩa là các ảnh 🔖 cũ không còn đúng mã → đưa hồ sơ về nháp.
    status: input.submission.status === "pending_review" ? "draft" : input.submission.status,
    submitted_at: input.submission.status === "pending_review" ? null : input.submission.submitted_at,
  });
  await store.addAuditLog({
    actor_id: input.userId, actor_email: input.userEmail,
    entity: "supplier", entity_id: input.submission.supplier_id,
    action: `supplier.submission.code_issued.l${input.submission.target_level}`,
    before: null,
    after: { submission_id: input.submission.id, ttl_hours: VERIFICATION_CODE_TTL_HOURS },
  });
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
        mentions ? "Có thấy tên doanh nghiệp NCC khai trên trang" : "Không thấy tên doanh nghiệp NCC khai trên trang",
        "Nội dung trang là dữ liệu NCC/người khác đăng; không phải xác nhận của cơ quan nhà nước.",
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
 * AI quét toàn bộ bằng chứng của hồ sơ rồi HỆ THỐNG tự xếp hàng đợi:
 *  - đủ mục + AI không báo fail → `pending_review` (chờ Vexim xét duyệt)
 *  - AI báo fail / thiếu mục     → `returned` kèm lý do để NCC bổ sung ngay
 * Chưa cấu hình OPENAI_API_KEY: hồ sơ vẫn nộp được, chuyển sang chờ duyệt và
 * ghi rõ là chưa có kết quả quét tự động (nhân viên đối chiếu thủ công).
 */
export async function scanAndQueueSubmission(store: DataStore, input: {
  bundle: SubmissionBundle;
  supplier: Supplier;
  actorId: string | null;
  actorEmail: string | null;
  submit: boolean;
}): Promise<SubmissionScanResult> {
  const { bundle, supplier } = input;
  const submission = bundle.submission;
  const preCheck = readiness({ submission, items: bundle.items });
  if (input.submit && !preCheck.ready) {
    // Hồ sơ ở lại bản nháp: NCC còn thiếu mục bắt buộc thì chưa vào hàng đợi.
    await store.updateSubmission(submission.id, { review_note: preCheck.blockers.join(" ").slice(0, 1900) });
    return {
      ok: false, status: submission.status, aiReview: submission.ai_review,
      reasons: preCheck.blockers, missing: preCheck.missing, warnings: preCheck.warnings,
      message: "Chưa nộp được: hồ sơ còn thiếu mục bắt buộc hoặc thiếu mã xác minh.",
    };
  }

  // AI lỗi/không cấu hình thì KHÔNG làm mất hồ sơ: vẫn xếp hàng đợi, ghi rõ chưa quét.
  let aiReview: AiSubmissionReview | null = null;
  let scanError: string | null = null;
  try {
    aiReview = await runEvidenceScan({ bundle, supplier });
  } catch (error) {
    scanError = error instanceof Error ? error.message : "Không quét được bằng chứng.";
    console.error("[submission-scan] AI scan failed", scanError);
  }
  const itemsAfter = aiReview ? await applyAiReviewToItems(store, bundle, aiReview) : bundle.items;
  const check = readiness({ submission, items: itemsAfter });
  const failed = failedItemLabels(aiReview, submission.target_level);
  const queue = autoQueueStatus({
    ready: check.ready,
    aiFailedItems: failed,
    manipulationSuspected: aiReview?.manipulation_suspected ?? null,
  });

  const flags = mergeFlags(itemsAfter.map((i) => i.flags ?? []));
  const now = new Date().toISOString();
  const reviewNote = queue.status === "returned"
    ? [...queue.reasons, ...check.missing.map((key) => `Còn thiếu: ${submissionItemLabel(submission.target_level, key)}`)].join(" ").slice(0, 1900)
    : aiReview?.summary ?? null;

  const updated = await store.updateSubmission(submission.id, {
    status: input.submit ? queue.status : submission.status,
    flags,
    ai_review: aiReview,
    ai_scanned_at: aiReview ? now : submission.ai_scanned_at,
    submitted_at: input.submit && queue.status === "pending_review" ? now : submission.submitted_at,
    review_note: input.submit ? reviewNote : submission.review_note,
  });

  await store.addAuditLog({
    actor_id: input.actorId, actor_email: input.actorEmail,
    entity: "supplier", entity_id: submission.supplier_id,
    action: `supplier.submission.ai_scan.l${submission.target_level}`,
    before: null,
    after: {
      submission_id: submission.id,
      scanned: Boolean(aiReview),
      model: aiReview?.model ?? null,
      status: updated.status,
      verdicts: Object.entries(aiReview?.items ?? {}).map(([key, item]) => ({ key, verdict: item.verdict })),
      failed_items: failed.length,
    },
  });

  return {
    ok: queue.status === "pending_review",
    status: updated.status,
    aiReview,
    reasons: queue.reasons,
    missing: check.missing,
    warnings: check.warnings,
    message: !aiReview
      ? `Hệ thống chưa quét được bằng AI (${scanError ?? "chưa cấu hình khoá AI hoặc chưa có tệp đọc được"}). Hồ sơ vẫn được ghi nhận; nhân viên Vexim sẽ đối chiếu thủ công.`
      : queue.status === "pending_review"
        ? "AI đã quét xong và hồ sơ được chuyển vào hàng đợi chờ Vexim xét duyệt."
        : "AI đã quét xong và phát hiện điểm cần bổ sung; hồ sơ được trả lại kèm lý do.",
  };
}

/** Gửi bằng chứng tới model AI; trả null khi chưa cấu hình hoặc không có tệp đọc được. */
export async function runEvidenceScan(input: {
  bundle: SubmissionBundle;
  supplier: Supplier;
}): Promise<AiSubmissionReview | null> {
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
  for (const item of withMedia.slice(0, MAX_AI_SUBMISSION_FILES * 2)) {
    if (files.length >= MAX_AI_SUBMISSION_FILES) break;
    const label = submissionItemLabel(submission.target_level, item.checklist_key);
    // PDF không đưa vào phân tích ảnh; nhân viên sẽ mở trực tiếp.
    if (item.mime === "application/pdf") { skipped.push(`${label} (PDF — cần người mở)`); continue; }
    const object = await getObject(item.storage_path!);
    if (!object) { skipped.push(`${label} (tệp chưa có trong kho)`); continue; }
    if (object.data.byteLength > MAX_AI_SUBMISSION_FILE_BYTES) { skipped.push(`${label} (ảnh gốc quá ${MAX_AI_SUBMISSION_FILE_BYTES / 1024 / 1024} MB)`); continue; }
    if (total + object.data.byteLength > MAX_AI_SUBMISSION_TOTAL_BYTES) { skipped.push(`${label} (vượt tổng dung lượng mỗi lượt quét)`); continue; }
    files.push({ id: item.id, checklistKey: item.checklist_key, label, mime: item.mime ?? "image/jpeg", data: object.data });
    total += object.data.byteLength;
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
    text: `Danh sách bằng chứng (id → mục cần kiểm): ${evidenceManifest(files)}. Bị bỏ qua, chưa quét: ${JSON.stringify(skipped)}. ID tệp là định danh nội bộ; tên/chú thích do NCC nhập KHÔNG phải bằng chứng.`,
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
  return parseSubmissionReview(JSON.parse(readOutputText(payload)), submission.target_level, model);
}

/** Ghi kết quả AI xuống từng mục và đối chiếu mã viết tay với mã đã phát hành. */
async function applyAiReviewToItems(store: DataStore, bundle: SubmissionBundle, review: AiSubmissionReview): Promise<SupplierSubmissionItem[]> {
  const submission = bundle.submission;
  const out: SupplierSubmissionItem[] = [];
  for (const item of bundle.items) {
    const verdict = review.items[item.checklist_key];
    if (!verdict || !item.media_id) { out.push(item); continue; }
    const aiFlags: SubmissionIntegrityFlag[] = verdict.flags.map((flag) => ({
      flag,
      severity: flag === "content_mismatch" || flag === "code_mismatch" || flag === "code_missing" ? "hard" as const : "warning" as const,
      source: "ai" as const,
      detail: verdict.reason,
    }));
    // Mã viết tay: đối chiếu chuỗi AI đọc được với mã hệ thống phát hành.
    if (submission.target_level === 2 && requiresHandwrittenCode(item.checklist_key)) {
      const matches = codeMatches(submission.verification_code, verdict.code_read);
      if (verdict.code_visible === false || matches === false) {
        aiFlags.push({
          flag: matches === false ? "code_mismatch" : "code_missing",
          severity: "hard",
          source: "ai",
          detail: matches === false
            ? `AI đọc được “${(verdict.code_read ?? "").slice(0, 24)}” nhưng không khớp mã hệ thống phát hành.`
            : "AI không thấy tờ giấy viết tay mã xác minh trong ảnh bắt buộc.",
        });
      }
    }
    const flags = mergeFlags([item.flags ?? [], aiFlags]);
    const next = await store.updateSubmissionItem(item.id, {
      ai_verdict: verdict.verdict,
      ai_reason: verdict.reason,
      ai_detected_text: verdict.detected_text,
      ai_code_visible: verdict.code_visible,
      ai_code_read: verdict.code_read,
      flags,
    });
    out.push(next);
  }
  return out;
}

/**
 * Nhân viên Vexim chấp thuận hồ sơ tự gửi: tạo ĐỢT KIỂM của nhân viên
 * (target_level 2/3, status `in_progress`) và SAO CHÉP bằng chứng sang đợt kiểm
 * đó để hồ sơ gốc giữ nguyên làm lịch sử. Duyệt hay không là bước tiếp theo,
 * do người CÓ QUYỀN DUYỆT KHÁC quyết định (bốn mắt).
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
  const verification = await store.createVerification({
    supplier_id: submission.supplier_id,
    target_level: submission.target_level,
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
      `Hồ sơ NCC tự gửi ${submission.id} (L${submission.target_level}).`,
      submission.ai_scanned_at ? `AI quét lúc ${submission.ai_scanned_at}${submission.ai_review?.summary ? `: ${submission.ai_review.summary.slice(0, 400)}` : ""}.` : "Chưa có kết quả quét AI.",
      "Bằng chứng do NCC tự chụp/tự tải; AI và EXIF chỉ là tín hiệu đối chiếu, chưa phải xác minh.",
      input.note?.trim() ? `Ghi chú người nhận hồ sơ: ${input.note.trim().slice(0, 600)}` : "",
    ].filter(Boolean).join("\n"),
  });

  for (const item of bundle.items) {
    if (!item.media_id) continue;
    const media = await store.getMedia(item.media_id);
    if (!media) continue;
    await store.createMedia({
      owner_type: "verification",
      verification_id: verification.id,
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
    after: { submission_id: submission.id, verification_id: verification.id, items: bundle.items.filter((i) => i.media_id).length },
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
