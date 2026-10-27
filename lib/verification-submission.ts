import crypto from "node:crypto";

import {
  L2_FACTORY_PHOTO_ITEMS,
  L2_PARTNER_ITEMS,
  L3_EXPORT_ITEMS,
  type AiSubmissionReview,
  type ExportDocKey,
  type FactoryPhotoKey,
  type L2VerificationScope,
  type SubmissionIntegrityFlag,
  type SubmissionStatus,
  type SupplierSubmission,
  type SupplierSubmissionItem,
} from "@/lib/types";

/**
 * Luật của cổng NHÀ CUNG CẤP TỰ GỬI bằng chứng L2 (nhà máy) / L3 (lịch sử xuất khẩu).
 *
 * Ranh giới quan trọng, giữ đúng chính sách sẵn có của hệ thống:
 *  - Hồ sơ tự gửi KHÔNG phải kết quả xác minh. L2 có thể dùng AI; L3 do nhân viên đối chiếu.
 *  - Huy hiệu L2/L3 trên trang buyer chỉ xuất hiện khi một đợt kiểm
 *    `verifications` do nhân sự Vexim có quyền duyệt xác nhận. Cùng một nhân sự
 *    có thể kiểm và duyệt sau xác nhận. Chấp thuận hồ sơ chỉ tạo đợt kiểm kèm bằng chứng.
 */

/* ------------------------- chính sách ảnh (tạm thời nới) ------------------------- */

/**
 * 21/10/2026: tạm GỠ yêu cầu "phải là ảnh gốc, còn EXIF, có GPS, chụp ban ngày".
 *
 * Lý do: nhà cung cấp Việt Nam quen chụp bằng điện thoại rồi gửi qua Zalo. Bắt họ
 * giữ đúng tệp gốc, bật định vị, chụp đúng khung giờ khiến cổng xác thực khó dùng,
 * hồ sơ nộp rất ít. Nay ảnh nào cũng nhận (JPG/PNG/WebP), kể cả ảnh đã qua ứng dụng
 * chat. Các tín hiệu kỹ thuật vẫn được ghi lại làm ghi chú cho người duyệt, nhưng
 * KHÔNG còn là điều kiện để nộp.
 *
 * Phần GIỮ NGUYÊN, vẫn bắt buộc: tờ mã xác minh do hệ thống phát hành phải nằm
 * trong 3 ảnh có đánh dấu 🔖 (cổng nhà máy, dây chuyền đang chạy, kho thành phẩm).
 * NCC cần tạo mã còn hiệu lực và tải đủ ảnh trước khi nộp. AI chỉ nêu nghi ngờ
 * về tờ mã; nhân viên đối chiếu và quyết định có yêu cầu bổ sung hay không.
 */
export const ORIGINAL_PHOTO_REQUIRED = false;

/* ------------------------------- kích thước tệp ------------------------------- */

/** Ảnh điện thoại có thể lớn; vẫn chặn mức hợp lý để không nghẽn serverless. */
export const MAX_L2_PHOTO_BYTES = 30 * 1024 * 1024;
/** Chứng từ L3: ảnh hoặc PDF. */
export const MAX_L3_DOC_BYTES = 15 * 1024 * 1024;
/** Cạnh dài tối đa của ảnh lưu trong kho (đủ để AI và người duyệt soi nhãn, biển tên). */
export const STORED_IMAGE_MAX_SIDE = 2000;
export const SUBMISSION_THUMB_SIDE = 480;
/** Số ảnh tối đa cho MỘT mục (tải lại sẽ thay ảnh cũ). */
export const MAX_ITEMS_PER_KEY = 3;

/* --------------------------------- mã xác minh --------------------------------- */

/** Bỏ các ký tự dễ nhầm (0/O, 1/I) vì NCC phải CHÉP TAY lên giấy. */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const VERIFICATION_CODE_TTL_HOURS = 72;

/**
 * Mã xác minh Vexim phát hành cho một hồ sơ: `VX-L2-7KQM-4TRD`.
 * Sinh ở server, không nhận mã do client tự đặt.
 */
export function issueVerificationCode(level: 2 | 3): string {
  const bytes = crypto.randomBytes(8);
  const group = (offset: number) => {
    let out = "";
    for (let i = 0; i < 4; i += 1) out += CODE_ALPHABET[bytes[offset + i] % CODE_ALPHABET.length];
    return out;
  };
  return `VX-L${level}-${group(0)}-${group(4)}`;
}

/** So khớp mã viết tay AI đọc được với mã đã phát hành (bỏ dấu gạch/cách/ký tự lạ). */
export function normalizeCode(code: string | null | undefined): string {
  return (code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function codeMatches(issued: string | null, read: string | null): boolean | null {
  if (!issued) return null;
  const a = normalizeCode(issued);
  const b = normalizeCode(read);
  if (!b) return null; // AI không đọc ra → chưa kết luận, để người duyệt xem ảnh
  return a === b;
}

export function codeExpired(submission: Pick<SupplierSubmission, "code_issued_at">, now = new Date()): boolean {
  if (!submission.code_issued_at) return false;
  const issued = Date.parse(submission.code_issued_at);
  if (Number.isNaN(issued)) return false;
  return now.getTime() - issued > VERIFICATION_CODE_TTL_HOURS * 3600_000;
}

/* --------------------------------- mục bắt buộc --------------------------------- */

export function requiredPhotoKeys(): FactoryPhotoKey[] {
  return L2_FACTORY_PHOTO_ITEMS.map((i) => i.key);
}

export function codeRequiredKeys(): FactoryPhotoKey[] {
  return L2_FACTORY_PHOTO_ITEMS.filter((i) => i.requires_code).map((i) => i.key);
}

export function requiredDocKeys(): ExportDocKey[] {
  return L3_EXPORT_ITEMS.filter((i) => i.required).map((i) => i.key);
}

export function submissionItemKeys(level: 2 | 3, scope?: L2VerificationScope | null): string[] {
  return level === 2 ? scope === "partner_contract" ? L2_PARTNER_ITEMS.map((i) => i.key) : [...requiredPhotoKeys()] : L3_EXPORT_ITEMS.map((i) => i.key);
}

export function submissionItemLabel(level: 2 | 3, key: string): string {
  if (level === 3 && key === "any_export_evidence") return "Ít nhất một chứng từ xuất khẩu";
  if (level === 2) return L2_PARTNER_ITEMS.find((i) => i.key === key)?.label ?? L2_FACTORY_PHOTO_ITEMS.find((i) => i.key === key)?.label ?? key;
  return L3_EXPORT_ITEMS.find((i) => i.key === key)?.label ?? key;
}

export function submissionItemRequirement(key: string): string | null {
  return L2_FACTORY_PHOTO_ITEMS.find((i) => i.key === key)?.requirement ?? null;
}

export function requiresHandwrittenCode(key: string): boolean {
  return L2_FACTORY_PHOTO_ITEMS.some((i) => i.key === key && i.requires_code);
}

/** Identifies exactly the evidence and code supplied to a scan. */
export function evidenceSnapshot(
  submission: Pick<SupplierSubmission, "verification_code" | "code_issued_at">,
  items: SupplierSubmissionItem[],
): string {
  return JSON.stringify({
    code: submission.verification_code,
    issued: submission.code_issued_at,
    items: items.map((item) => [item.id, item.checklist_key, item.media_id, item.storage_path])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
}

/** Old results stay visible, but must not be mistaken for a scan of changed evidence. */
export function aiReviewMayBeOutdated(submission: SupplierSubmission, items: SupplierSubmissionItem[]): boolean {
  const review = submission.ai_review;
  return Boolean(review && (!review.evidence_snapshot || review.evidence_snapshot !== evidenceSnapshot(submission, items)));
}

/** Findings are suggestions for a person, never a reason to return or block a case. */
export function aiReviewFindings(review: AiSubmissionReview | null, issuedCode: string | null): string[] {
  if (!review) return [];
  const findings: string[] = [];
  for (const [key, item] of Object.entries(review.items ?? {})) {
    if (!item || typeof item !== "object") continue;
    const details: string[] = [];
    const flags = Array.isArray(item.flags) ? item.flags : [];
    if (item.verdict === "fail" || (item.verdict === "uncertain" && Boolean(item.reason)) || flags.includes("content_mismatch")) {
      details.push(item.reason || "Ảnh có thể chưa phù hợp với mục này.");
    }
    if (requiresHandwrittenCode(key)) {
      const mismatch = codeMatches(issuedCode, item.code_read) === false || flags.includes("code_mismatch");
      const missing = item.code_visible === false || flags.includes("code_missing");
      if (mismatch) details.push("AI đọc mã có thể không khớp mã đã phát hành.");
      else if (missing) details.push("AI chưa thấy tờ mã trong ảnh.");
    }
    if (details.length) findings.push(`${submissionItemLabel(2, key)}: ${[...new Set(details)].join(" ")}`);
  }
  if (review.unscanned_extra_count && Number.isInteger(review.unscanned_extra_count) && review.unscanned_extra_count > 0) {
    findings.push(`AI chưa quét thêm ${review.unscanned_extra_count} ảnh; nhân viên sẽ kiểm tra.`);
  }
  if (review.manipulation_suspected) findings.push("AI nghi ngờ ảnh bị chỉnh sửa hoặc dàn dựng.");
  return findings;
}

/** Thiếu mục nào để nộp hồ sơ. */
export function missingKeys(submission: Pick<SupplierSubmission, "target_level" | "verification_code" | "l2_scope">, items: (Pick<SupplierSubmissionItem, "checklist_key" | "media_id"> & Partial<Pick<SupplierSubmissionItem, "storage_path">>)[]): string[] {
  const have = new Set(items.filter((i) => i.media_id && (submission.target_level !== 2 || submission.l2_scope === "partner_contract" || Boolean(i.storage_path?.trim()))).map((i) => i.checklist_key));
  if (submission.target_level === 3) {
    return L3_EXPORT_ITEMS.some((item) => have.has(item.key)) ? [] : ["any_export_evidence"];
  }
  if (submission.l2_scope === "partner_contract") {
    return items.some((i) => i.checklist_key === "partner_factory_contract" && i.media_id && i.storage_path?.trim()) ? [] : ["partner_factory_contract"];
  }
  return requiredPhotoKeys().filter((key) => !have.has(key));
}

/* --------------------------------- trạng thái --------------------------------- */

/** NCC còn được thêm/thay bằng chứng ở các trạng thái này. */
export function submissionEditable(status: SubmissionStatus): boolean {
  return status === "draft" || status === "returned";
}

/** Đã đủ điều kiện kỹ thuật để chuyển sang chờ Vexim xét duyệt. */
export function readiness(input: {
  submission: Pick<SupplierSubmission, "target_level" | "verification_code" | "code_issued_at" | "l2_scope">;
  items: (Pick<SupplierSubmissionItem, "checklist_key" | "media_id" | "flags"> & Partial<Pick<SupplierSubmissionItem, "storage_path">>)[];
  now?: Date;
}): { ready: boolean; missing: string[]; blockers: string[]; warnings: string[] } {
  const { submission, items } = input;
  const factory = submission.target_level === 2 && submission.l2_scope !== "partner_contract";
  const missing = missingKeys(submission, items).map((key) => submissionItemLabel(submission.target_level, key));
  /** `structural` = thiếu mục/thiếu mã: chặn nộp. Cờ liêm chính chỉ cảnh báo. */
  const structural: string[] = [];
  const warnings: string[] = [];
  if (factory && !submission.verification_code) {
    structural.push("Chưa tạo mã xác minh. Bấm “Tạo mã xác minh”, in/viết tay mã lên giấy rồi chụp cùng các ảnh có đánh dấu 🔖.");
  }
  if (factory && codeExpired(submission, input.now)) {
    structural.push(`Mã xác minh đã quá ${VERIFICATION_CODE_TTL_HOURS} giờ. Hãy tạo mã mới và chụp lại các ảnh 🔖.`);
  }
  if (factory && submission.verification_code && (!submission.code_issued_at || Number.isNaN(Date.parse(submission.code_issued_at)))) {
    structural.push("Không xác định được thời điểm phát hành mã. Hãy tạo mã mới và chụp lại các ảnh 🔖.");
  }
  if (missing.length) structural.push(`Còn thiếu ${missing.length} mục bắt buộc: ${missing.join("; ")}.`);
  const withMedia = items.filter((i) => i.media_id);
  if (!withMedia.length) structural.push("Chưa có bằng chứng nào được tải lên.");

  // A system flag can identify an image uploaded before any code was issued.
  // AI reading a missing/wrong code, including an old `hard` flag, is only a
  // finding: the person reviewing the actual photo decides whether it is valid.
  if (factory && submission.verification_code) {
    const codeProblems = withMedia
      .filter((i) => requiresHandwrittenCode(i.checklist_key))
      .filter((i) => (i.flags ?? []).some((f) => f.source !== "ai" && f.severity === "hard" && (f.flag === "code_missing" || f.flag === "code_mismatch")))
      .map((i) => submissionItemLabel(2, i.checklist_key));
    if (codeProblems.length) {
      structural.push(
        `Tờ mã xác minh chưa đúng ở: ${codeProblems.join("; ")}. In hoặc chép tờ mã ra giấy, đặt cạnh cảnh rồi chụp lại; mã trong ảnh phải khớp mã ${submission.verification_code}.`,
      );
    }
  }

  for (const item of withMedia) {
    for (const flag of item.flags ?? []) {
      // L2 AI results are suggestions even when a historical flag says "hard".
      // Old L3 AI flags are retained in history but do not affect its new flow.
      if (flag.source === "ai" && (submission.target_level === 3 || submission.l2_scope === "partner_contract")) continue;
      // Structural code flags are already explained above; all other historic
      // EXIF/GPS/time flags, even if marked hard, are notes rather than gates.
      if (factory && requiresHandwrittenCode(item.checklist_key) && flag.source !== "ai" && flag.severity === "hard" && (flag.flag === "code_missing" || flag.flag === "code_mismatch")) continue;
      const text = `${flag.source === "ai" ? "AI lưu ý · " : ""}${submissionItemLabel(submission.target_level, item.checklist_key)}: ${flag.detail ?? flag.flag}`;
      warnings.push(text);
    }
  }
  return {
    // AI and integrity flags never determine the decision. Missing mandatory
    // files/code and system-detected pre-code uploads remain structural gates.
    ready: structural.length === 0,
    missing,
    blockers: structural,
    warnings,
  };
}

/* ------------------------------ link nguồn công khai ------------------------------ */

/**
 * Chỉ những domain CÔNG KHAI, không cần đăng nhập này mới được máy chủ truy cập.
 * Ngoài danh sách: link vẫn được lưu để người duyệt tự mở, nhưng hệ thống
 * không fetch — tránh SSRF vào mạng nội bộ và tránh quét trang cần tài khoản.
 */
export const PUBLIC_SOURCE_ALLOWLIST = [
  "vietnamexport.com",
  "customs.gov.vn",
  "thitruongnuocngoai.vn",
  "vietrade.gov.vn",
  "moit.gov.vn",
  "thongtindoanhnghiep.co",
  "masothue.com",
  "albaconsulting.com",
  "tradefairdates.com",
  "alibaba.com",
  "globalsources.com",
  "ecvv.com",
  "tradekey.com",
  "exportersindia.com",
  "goexpo.com",
  "panjiva.com",
  "importgenius.com",
  "volza.com",
  "tradesns.com",
] as const;

export interface SourceLinkAssessment {
  ok: boolean;
  hostname: string | null;
  allowed: boolean;
  reason: string;
}

/** Kiểm tra link NCC khai: giao thức công khai + domain; không bao giờ theo redirect lạ. */
export function assessSourceLink(raw: string): SourceLinkAssessment {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, hostname: null, allowed: false, reason: "Link trống." };
  if (text.length > 800) return { ok: false, hostname: null, allowed: false, reason: "Link quá dài." };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, hostname: null, allowed: false, reason: "Link không hợp lệ." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, hostname: url.hostname, allowed: false, reason: "Chỉ nhận link http/https." };
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[[^\]]+\]$/, "");
  // Chặn dứt khoát địa chỉ riêng / nội bộ dù ai đó thêm vào allowlist.
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      /^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || /^169\.254\./.test(hostname) ||
      /^0\./.test(hostname) || hostname.includes("::")) {
    return { ok: false, hostname, allowed: false, reason: "Không nhận địa chỉ nội bộ/máy cục bộ." };
  }
  if (/(?:^|\.)(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return { ok: false, hostname, allowed: false, reason: "Không nhận link dạng địa chỉ IP." };
  }
  const allowed = PUBLIC_SOURCE_ALLOWLIST.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  return {
    ok: true,
    hostname,
    allowed,
    reason: allowed
      ? "Nguồn công khai được phép quét tự động."
      : `Domain chưa nằm trong danh sách nguồn công khai của Vexim; link được lưu để nhân viên tự mở và đối chiếu.`,
  };
}

/** Hồ sơ đang mở (chưa accepted) của một NCC ở một cấp — dùng để giới hạn spam. */
export function openSubmission<T extends Pick<SupplierSubmission, "target_level" | "status" | "l2_scope">>(submissions: T[], level: 2 | 3, scope?: L2VerificationScope | null): T | null {
  return submissions.find((s) => s.target_level === level && s.status !== "accepted" &&
    (level !== 2 || (s.l2_scope ?? "factory") === (scope ?? "factory"))) ?? null;
}

export function submissionStatusLabel(status: SubmissionStatus): string {
  return status === "draft" ? "Đang soạn"
    : status === "pending_review" ? "Chờ Vexim xét duyệt"
      : status === "returned" ? "Cần bổ sung"
        : "Vexim đã chấp thuận vào đợt kiểm";
}

/** Gộp cờ AI vào cờ kỹ thuật của một mục (AI không ghi đè cờ máy đã tính). */
export function combineItemFlags(technical: SubmissionIntegrityFlag[], ai: SubmissionIntegrityFlag[]): SubmissionIntegrityFlag[] {
  const byFlag = new Map<string, SubmissionIntegrityFlag>();
  for (const flag of [...technical, ...ai]) {
    const current = byFlag.get(flag.flag);
    if (!current || (current.severity === "warning" && flag.severity === "hard")) byFlag.set(flag.flag, flag);
  }
  return [...byFlag.values()];
}
