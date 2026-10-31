import {
  L2_FACTORY_PHOTO_ITEMS,
  L2_PARTNER_ITEMS,
  type L2VerificationScope,
  type AiSubmissionReview,
  L3_EXPORT_ITEMS,
  SUBMISSION_FLAG_LABELS,
  type SupplierSubmission,
  type SupplierSubmissionItem,
  type SupplierSubmissionLink,
} from "@/lib/types";
import {
  aiReviewFindings,
  aiReviewMayBeOutdated,
  codeExpired,
  readiness,
  submissionEditable,
  submissionStatusLabel,
  VERIFICATION_CODE_TTL_HOURS,
} from "@/lib/verification-submission";
import { formatDaylight } from "@/lib/media/image-integrity";
import type { SubmissionBundle } from "@/lib/verification-submission-service";

/**
 * Khung nhìn đã "làm phẳng" của hồ sơ tự gửi, đủ để giao diện (kể cả client
 * component) hiển thị mà không cần gọi thêm store. Không chứa dữ liệu buyer,
 * ghi chú nội bộ của nhân viên hay kết quả duyệt huy hiệu.
 */

export interface PortalItemView {
  id: string;
  key: string;
  label: string;
  order: number;
  href: string;
  thumbHref: string | null;
  mime: string | null;
  isPdf: boolean;
  hasExif: boolean;
  exifLat: number | null;
  exifLng: number | null;
  exifCapturedLabel: string | null;
  exifCapturedAt: string | null;
  camera: string | null;
  software: string | null;
  captureLat: number | null;
  captureLng: number | null;
  captureAccuracy: number | null;
  uploadedAt: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  flags: { flag: string; label: string; severity: "hard" | "warning"; source: string; detail: string | null }[];
  aiVerdict: "pass" | "fail" | "uncertain" | null;
  aiReason: string | null;
  aiDetectedText: string | null;
  aiCodeVisible: boolean | null;
  aiCodeRead: string | null;
}

export interface PortalLinkView {
  id: string;
  url: string;
  label: string | null;
  allowedSource: boolean;
  fetchStatus: string;
  fetchNote: string | null;
  fetchedAt: string | null;
}

export interface PortalSubmissionView {
  id: string;
  level: 2 | 3;
  l2Scope: L2VerificationScope | null;
  status: SupplierSubmission["status"];
  statusLabel: string;
  editable: boolean;
  code: string | null;
  codeIssuedAt: string | null;
  codeExpired: boolean;
  codeTtlHours: number;
  deviceLat: number | null;
  deviceLng: number | null;
  deviceAccuracy: number | null;
  shipmentRef: string | null;
  /** Tên nhà máy đối tác khai trong hồ sơ L2 partner_contract (chưa phải kết luận). */
  partnerFactoryName: string | null;
  shippedOn: string | null;
  shipmentDestination: string | null;
  supplierNote: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  aiScannedAt: string | null;
  aiSummary: string | null;
  /** AI suggestions, never a decision; L2 factory only. */
  aiFindings: string[];
  aiFindingsMayBeOutdated: boolean;
  aiManipulation: boolean | null;
  aiModel: string | null;
  acceptedVerificationId: string | null;
  ready: boolean;
  missing: string[];
  blockers: string[];
  warnings: string[];
  requiredTotal: number;
  uploadedTotal: number;
  items: PortalItemView[];
  links: PortalLinkView[];
}

export interface PortalItemSpec {
  key: string;
  label: string;
  requirement: string | null;
  requiresCode: boolean;
  required: boolean;
  order: number;
}

export function photoSpecs(): PortalItemSpec[] {
  return L2_FACTORY_PHOTO_ITEMS.map((i) => ({
    key: i.key, label: i.label, requirement: i.requirement, requiresCode: i.requires_code, required: true, order: i.order,
  }));
}

export function partnerSpecs(): PortalItemSpec[] {
  return L2_PARTNER_ITEMS.map((i) => ({
    key: i.key, label: i.label, requirement: i.requirement, requiresCode: false, required: i.required, order: i.order,
  }));
}

export function exportSpecs(): PortalItemSpec[] {
  return L3_EXPORT_ITEMS.map((i, index) => ({
    key: i.key, label: i.label, requirement: "Chọn nếu phù hợp", requiresCode: false, required: i.required, order: index + 1,
  }));
}

/** Bằng chứng của hồ sơ tự gửi chỉ mở qua route riêng có kiểm tra quyền. */
export function submissionFileHref(storagePath: string): string {
  return `/api/supplier-portal/submission-file/${storagePath.replace(/^\/+/, "")}`;
}

function itemView(item: SupplierSubmissionItem, level: 2 | 3, forStaff: boolean, partner: boolean, review: AiSubmissionReview | null): PortalItemView {
  const scannedItemIds = Array.isArray(review?.scanned_item_ids) ? review.scanned_item_ids : undefined;
  const showAi = ((level === 2 && !partner) || forStaff) && (!scannedItemIds || scannedItemIds.includes(item.id));
  // The submission-level review is authoritative when a per-item write failed.
  const currentAi = showAi && scannedItemIds ? review?.items?.[item.checklist_key] : null;
  const itemAiIsCurrent = !currentAi || (item.ai_verdict === currentAi.verdict && item.ai_reason === currentAi.reason &&
    item.ai_detected_text === currentAi.detected_text && item.ai_code_visible === currentAi.code_visible && item.ai_code_read === currentAi.code_read);
  const specs = level === 2 ? partner ? partnerSpecs() : photoSpecs() : exportSpecs();
  const spec = specs.find((s) => s.key === item.checklist_key);
  const camera = [item.exif_camera_make, item.exif_camera_model].filter(Boolean).join(" ").trim();
  return {
    id: item.id,
    key: item.checklist_key,
    label: spec?.label ?? item.checklist_key,
    order: spec?.order ?? 99,
    href: item.storage_path ? submissionFileHref(item.storage_path) : "",
    thumbHref: item.thumb_path ? submissionFileHref(item.thumb_path) : null,
    mime: item.mime,
    isPdf: item.mime === "application/pdf",
    hasExif: item.has_exif,
    exifLat: item.exif_lat,
    exifLng: item.exif_lng,
    exifCapturedLabel: item.exif_captured_at ? formatDaylight(item.exif_captured_at) : null,
    exifCapturedAt: item.exif_captured_at,
    camera: camera || null,
    software: item.exif_software,
    captureLat: item.capture_lat,
    captureLng: item.capture_lng,
    captureAccuracy: item.capture_accuracy_m,
    uploadedAt: item.uploaded_at,
    width: item.width,
    height: item.height,
    bytes: item.bytes,
    flags: (item.flags ?? []).filter((f) => f.source !== "ai" || (showAi && itemAiIsCurrent)).map((f) => ({
      flag: f.flag,
      label: SUBMISSION_FLAG_LABELS[f.flag] ?? f.flag,
      severity: f.severity,
      source: f.source,
      detail: f.detail,
    })),
    aiVerdict: showAi ? currentAi ? currentAi.verdict : item.ai_verdict : null,
    aiReason: showAi ? currentAi ? currentAi.reason : item.ai_reason : null,
    aiDetectedText: showAi ? currentAi ? currentAi.detected_text : item.ai_detected_text : null,
    aiCodeVisible: showAi ? currentAi ? currentAi.code_visible : item.ai_code_visible : null,
    aiCodeRead: showAi ? currentAi ? currentAi.code_read : item.ai_code_read : null,
  };
}

/**
 * Dựng khung nhìn hồ sơ. `forStaff` cho phép kèm ghi chú xét duyệt của nhân viên;
 * bản gửi NCC vẫn thấy lý do trả hồ sơ (để họ sửa) nhưng không thấy nội bộ khác.
 */
export function buildPortalSubmission(bundle: SubmissionBundle, options?: { forStaff?: boolean }): PortalSubmissionView {
  const { submission, items, links } = bundle;
  const level = submission.target_level;
  const partner = level === 2 && submission.l2_scope === "partner_contract";
  const specs = level === 2 ? partner ? partnerSpecs() : photoSpecs() : exportSpecs();
  const check = readiness({ submission, items });
  const uploadedKeys = new Set(items.filter((i) => i.media_id && i.storage_path?.trim()).map((i) => i.checklist_key));
  const byKey = new Map<string, PortalItemView[]>();
  for (const item of items) {
    const view = itemView(item, level, Boolean(options?.forStaff), partner, submission.ai_review);
    byKey.set(view.key, [...(byKey.get(view.key) ?? []), view]);
  }
  // Giữ đúng thứ tự checklist; ảnh mới nhất của mỗi mục đứng đầu.
  const ordered: PortalItemView[] = [];
  for (const spec of specs) {
    const rows = (byKey.get(spec.key) ?? []).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    ordered.push(...rows);
  }
  for (const [key, rows] of byKey) {
    if (!specs.some((s) => s.key === key)) ordered.push(...rows);
  }
  return {
    id: submission.id,
    level,
    l2Scope: level === 2 ? submission.l2_scope ?? "factory" : null,
    status: submission.status,
    statusLabel: submissionStatusLabel(submission.status),
    editable: submissionEditable(submission.status),
    code: submission.verification_code,
    codeIssuedAt: submission.code_issued_at,
    codeExpired: codeExpired(submission),
    codeTtlHours: VERIFICATION_CODE_TTL_HOURS,
    deviceLat: submission.device_lat,
    deviceLng: submission.device_lng,
    deviceAccuracy: submission.device_accuracy_m,
    shipmentRef: submission.shipment_ref,
    partnerFactoryName: partner ? submission.partner_factory_name?.trim() || null : null,
    shippedOn: submission.shipped_on,
    shipmentDestination: submission.shipment_destination,
    supplierNote: submission.supplier_note,
    reviewNote: options?.forStaff ? submission.review_note : submission.status !== "returned" ? null
      : (level === 3 || (level === 2 && !partner)) && submission.ai_scanned_at && !submission.reviewed_by
        ? `${submission.review_note ? `Ghi chú trước đây: ${submission.review_note} ` : ""}Bạn có thể nộp lại để nhân viên kiểm tra.`
        : submission.review_note,
    submittedAt: submission.submitted_at,
    // Giữ lịch sử AI cho nhân viên, nhưng không trình bày kết quả cũ như điều kiện L3 mới.
    aiScannedAt: (level === 2 && !partner) || options?.forStaff ? submission.ai_scanned_at : null,
    aiSummary: (level === 2 && !partner) || options?.forStaff ? submission.ai_review?.summary ?? null : null,
    aiFindings: level === 2 && !partner ? aiReviewFindings(submission.ai_review, submission.verification_code) : [],
    aiFindingsMayBeOutdated: level === 2 && !partner && aiReviewMayBeOutdated(submission, items),
    aiManipulation: (level === 2 && !partner) || options?.forStaff ? submission.ai_review?.manipulation_suspected ?? null : null,
    aiModel: (level === 2 && !partner) || options?.forStaff ? submission.ai_review?.model ?? null : null,
    acceptedVerificationId: submission.verification_id,
    ready: check.ready,
    missing: check.missing,
    blockers: check.blockers,
    warnings: check.warnings,
    requiredTotal: level === 2 ? specs.filter((s) => s.required).length : 1,
    uploadedTotal: partner ? Number(uploadedKeys.has("partner_factory_contract")) : level === 2 ? uploadedKeys.size : Number(specs.some((spec) => uploadedKeys.has(spec.key as typeof items[number]["checklist_key"]))),
    items: ordered,
    links: links.map((l) => ({
      id: l.id, url: l.url, label: l.label, allowedSource: l.allowed_source,
      fetchStatus: l.fetch_status, fetchNote: l.fetch_note, fetchedAt: l.fetched_at,
    })),
  };
}
