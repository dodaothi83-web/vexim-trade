import {
  L2_CALL_ITEMS,
  L2_CALL_PARTNER_ITEMS,
  L2_PUBLIC_PHOTOS_MAX,
  L2_PUBLIC_PHOTOS_MIN,
  type L2ReviewMethod,
  type L2VerificationScope,
  type MediaAsset,
  type SupplierSubmission,
  type Verification,
} from "@/lib/types";

/**
 * Quy tắc thuần (không I/O) của L2 xác minh qua cuộc gọi video / thực địa.
 * Dùng chung cho action CRM, cổng nhà cung cấp, báo cáo PDF và script kiểm tra.
 *
 * Ranh giới giữ nguyên chính sách hệ thống: đây là Vexim tự xem xét, không phải
 * kiểm định độc lập của bên thứ ba, không chứng nhận sản phẩm.
 */

export type L2CallItem = {
  key: string; group: string; label: string; labelEn: string; hint: string; hintEn: string;
  required: boolean; photo: boolean; foodOnly?: boolean;
};

export function isCallReview(v: Pick<Verification, "target_level" | "review_method">): boolean {
  return v.target_level === 2 && (v.review_method === "video_call" || v.review_method === "on_site");
}

export function callItems(scope: L2VerificationScope | null | undefined): L2CallItem[] {
  const base = L2_CALL_ITEMS as readonly L2CallItem[];
  return scope === "partner_contract" ? [...base, ...(L2_CALL_PARTNER_ITEMS as readonly L2CallItem[])] : [...base];
}

export function isReviewMethod(value: unknown): value is L2ReviewMethod {
  return value === "video_call" || value === "on_site";
}

/** Mã báo cáo dễ đọc qua điện thoại: VXR-2611-7KQM4T. Bỏ ký tự dễ nhầm 0/O/1/I. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function issueReportCode(now = new Date()): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  let tail = "";
  for (const byte of bytes) tail += ALPHABET[byte % ALPHABET.length];
  const yymm = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `VXR-${yymm}-${tail}`;
}

export function normalizeReportCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
}

/** Ảnh hợp lệ cho một mục / cho báo cáo: ảnh thật của đúng đợt kiểm. */
export function callReviewImages(v: Pick<Verification, "id" | "supplier_id">, media: MediaAsset[]): MediaAsset[] {
  return media.filter((m) => m.owner_type === "verification" && m.verification_id === v.id && m.supplier_id === v.supplier_id &&
    m.kind === "image" && Boolean(m.storage_path?.trim()));
}

export interface CallReviewDraft {
  review_method: L2ReviewMethod | null;
  call_started_at: string | null;
  call_ended_at: string | null;
  supplier_participants: string | null;
  checklist: Verification["checklist"];
  checklist_notes: Verification["checklist_notes"];
  public_photo_ids: string[];
  partner_factory_name?: string | null;
}

/**
 * Các lỗi chặn DUYỆT. Lưu nháp thì không cần đủ. Trả về danh sách câu tiếng Việt
 * cho trưởng kiểm duyệt đọc; rỗng nghĩa là đủ điều kiện.
 */
export function callReviewBlockers(input: {
  draft: CallReviewDraft;
  scope: L2VerificationScope | null | undefined;
  media: MediaAsset[];
  verification: Pick<Verification, "id" | "supplier_id">;
  confirmations: { observed: boolean; photos: boolean };
  now?: Date;
}): string[] {
  const { draft, scope, media, verification } = input;
  const out: string[] = [];
  if (!draft.review_method) out.push("Chọn phương thức: gọi video hoặc đến thực địa.");
  if (!draft.call_started_at) out.push("Ghi thời điểm bắt đầu cuộc gọi / buổi kiểm.");
  if (draft.call_started_at && Date.parse(draft.call_started_at) > (input.now ?? new Date()).getTime() + 5 * 60_000) {
    out.push("Thời điểm bắt đầu không thể ở tương lai.");
  }
  if (draft.call_started_at && draft.call_ended_at && Date.parse(draft.call_ended_at) < Date.parse(draft.call_started_at)) {
    out.push("Thời điểm kết thúc phải sau thời điểm bắt đầu.");
  }
  if (!draft.supplier_participants?.trim()) out.push("Ghi người tham gia phía nhà cung cấp (họ tên, chức vụ).");
  const images = callReviewImages(verification, media);
  for (const item of callItems(scope)) {
    const value = draft.checklist[item.key];
    if (item.required && value !== true) out.push(`Mục bắt buộc “${item.label}” phải là Đã thấy.`);
    if (!item.required && value === "not_applicable" && !draft.checklist_notes[item.key]?.trim()) {
      out.push(`Mục “${item.label}” chọn Không áp dụng cần ghi lý do.`);
    }
    if (item.required && item.photo && !images.some((m) => m.checklist_key === item.key)) {
      out.push(`Mục “${item.label}” cần ít nhất một ảnh chụp màn hình/ảnh thực địa.`);
    }
  }
  if (scope === "partner_contract") {
    if (!draft.partner_factory_name?.trim()) out.push("Ghi tên nhà máy đối tác đúng như trên hợp đồng.");
    const contract = media.filter((m) => m.verification_id === verification.id && m.checklist_key === "partner_factory_contract" && m.storage_path);
    if (!contract.length) out.push("Cần tệp hợp đồng với nhà máy đối tác trong đợt kiểm.");
    else if (!contract.some((m) => m.status === "checked")) out.push("Mở hợp đồng và bấm “Đánh dấu đã kiểm” trước khi duyệt.");
  }
  const chosen = draft.public_photo_ids.filter((id) => images.some((m) => m.id === id));
  if (chosen.length < L2_PUBLIC_PHOTOS_MIN) out.push(`Chọn ít nhất ${L2_PUBLIC_PHOTOS_MIN} ảnh cho báo cáo người mua.`);
  if (draft.public_photo_ids.length > L2_PUBLIC_PHOTOS_MAX) out.push(`Báo cáo chỉ nhận tối đa ${L2_PUBLIC_PHOTOS_MAX} ảnh.`);
  if (!input.confirmations.photos) out.push("Xác nhận ảnh công khai không có mặt người nhận diện được và không lộ giá, mã lô, khách hàng.");
  if (!input.confirmations.observed) out.push("Tích ô xác nhận đã trực tiếp quan sát các mục Đã thấy.");
  return out;
}

/* ------------------------------ đặt lịch (cổng NCC) ------------------------------ */

const SLOT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Giữ khung giờ hợp lệ, không trùng, tối đa 3; dạng `YYYY-MM-DDTHH:mm` giờ Việt Nam. */
export function cleanBookingSlots(values: unknown[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim().slice(0, 16);
    if (!SLOT_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}:00+07:00`))) continue;
    if (!out.includes(value)) out.push(value);
    if (out.length === 3) break;
  }
  return out;
}

/** Giờ Việt Nam (UTC+7) → ISO UTC, dùng để so với hiện tại. */
export function vnSlotToIso(slot: string): string {
  return new Date(`${slot}:00+07:00`).toISOString();
}

export type BookingMissing = "method" | "contact_name" | "contact_phone" | "address" | "slots" | "future_slot" | "consent" | "contract" | "partner_name";

export function bookingMissing(submission: Pick<SupplierSubmission, "l2_scope" | "booking_method" | "booking_contact_name" | "booking_contact_phone" | "booking_factory_address" | "booking_slots" | "booking_consent_at" | "partner_factory_name">,
  hasContract: boolean, now = new Date()): BookingMissing[] {
  const missing: BookingMissing[] = [];
  if (!isReviewMethod(submission.booking_method)) missing.push("method");
  if (!submission.booking_contact_name?.trim()) missing.push("contact_name");
  if (!/^\+?[0-9 ().-]{8,20}$/.test(submission.booking_contact_phone?.trim() ?? "")) missing.push("contact_phone");
  if (!submission.booking_factory_address?.trim()) missing.push("address");
  const slots = submission.booking_slots ?? [];
  if (!slots.length) missing.push("slots");
  else if (!slots.some((slot) => Date.parse(vnSlotToIso(slot)) > now.getTime())) missing.push("future_slot");
  if (!submission.booking_consent_at) missing.push("consent");
  if (submission.l2_scope === "partner_contract") {
    if (!hasContract) missing.push("contract");
    if (!submission.partner_factory_name?.trim()) missing.push("partner_name");
  }
  return missing;
}

/** Ngày giờ theo giờ Việt Nam để in lên báo cáo / màn hình. */
export function formatVnDateTime(iso: string | null | undefined, locale: "vi" | "en" = "vi"): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date) + (locale === "en" ? " (GMT+7)" : "");
}

/** Thời lượng cuộc gọi tính bằng phút; null nếu chưa ghi kết thúc. */
export function callDurationMinutes(v: Pick<Verification, "call_started_at" | "call_ended_at">): number | null {
  if (!v.call_started_at || !v.call_ended_at) return null;
  const minutes = Math.round((Date.parse(v.call_ended_at) - Date.parse(v.call_started_at)) / 60_000);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}
