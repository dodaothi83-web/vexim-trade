import {
  L2_FACTORY_PHOTO_ITEMS,
  L3_EXPORT_ITEMS,
  SUBMISSION_FLAG_LABELS,
  type SupplierSubmission,
  type SupplierSubmissionItem,
  type SupplierSubmissionLink,
} from "@/lib/types";
import {
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
  flags: { flag: string; label: string; severity: "hard" | "warning"; detail: string | null }[];
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
  shippedOn: string | null;
  shipmentDestination: string | null;
  supplierNote: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  aiScannedAt: string | null;
  aiSummary: string | null;
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

export function exportSpecs(): PortalItemSpec[] {
  return L3_EXPORT_ITEMS.map((i, index) => ({
    key: i.key, label: i.label, requirement: i.required ? "Mục bắt buộc" : "Nếu có", requiresCode: false, required: i.required, order: index + 1,
  }));
}

/** Bằng chứng của hồ sơ tự gửi chỉ mở qua route riêng có kiểm tra quyền. */
export function submissionFileHref(storagePath: string): string {
  return `/api/supplier-portal/submission-file/${storagePath.replace(/^\/+/, "")}`;
}

function itemView(item: SupplierSubmissionItem, level: 2 | 3): PortalItemView {
  const specs = level === 2 ? photoSpecs() : exportSpecs();
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
    flags: (item.flags ?? []).map((f) => ({
      flag: f.flag,
      label: SUBMISSION_FLAG_LABELS[f.flag] ?? f.flag,
      severity: f.severity,
      detail: f.detail,
    })),
    aiVerdict: item.ai_verdict,
    aiReason: item.ai_reason,
    aiDetectedText: item.ai_detected_text,
    aiCodeVisible: item.ai_code_visible,
    aiCodeRead: item.ai_code_read,
  };
}

/**
 * Dựng khung nhìn hồ sơ. `forStaff` cho phép kèm ghi chú xét duyệt của nhân viên;
 * bản gửi NCC vẫn thấy lý do trả hồ sơ (để họ sửa) nhưng không thấy nội bộ khác.
 */
export function buildPortalSubmission(bundle: SubmissionBundle, options?: { forStaff?: boolean }): PortalSubmissionView {
  const { submission, items, links } = bundle;
  const level = submission.target_level;
  const specs = level === 2 ? photoSpecs() : exportSpecs();
  const check = readiness({ submission, items });
  const uploadedKeys = new Set(items.filter((i) => i.media_id).map((i) => i.checklist_key));
  const byKey = new Map<string, PortalItemView[]>();
  for (const item of items) {
    const view = itemView(item, level);
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
    shippedOn: submission.shipped_on,
    shipmentDestination: submission.shipment_destination,
    supplierNote: submission.supplier_note,
    reviewNote: options?.forStaff ? submission.review_note : submission.status === "returned" ? submission.review_note : null,
    submittedAt: submission.submitted_at,
    aiScannedAt: submission.ai_scanned_at,
    aiSummary: submission.ai_review?.summary ?? null,
    aiManipulation: submission.ai_review?.manipulation_suspected ?? null,
    aiModel: submission.ai_review?.model ?? null,
    acceptedVerificationId: submission.verification_id,
    ready: check.ready,
    missing: check.missing,
    blockers: check.blockers,
    warnings: check.warnings,
    requiredTotal: specs.filter((s) => s.required).length,
    uploadedTotal: uploadedKeys.size,
    items: ordered,
    links: links.map((l) => ({
      id: l.id, url: l.url, label: l.label, allowedSource: l.allowed_source,
      fetchStatus: l.fetch_status, fetchNote: l.fetch_note, fetchedAt: l.fetched_at,
    })),
  };
}
