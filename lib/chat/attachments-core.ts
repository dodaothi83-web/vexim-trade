/**
 * Tệp đính kèm trong chat người mua ↔ nhà cung cấp: quy tắc dùng chung cho máy chủ, trình duyệt
 * và script kiểm tra. Tệp không import gì để script nạp thẳng bằng Node.
 *
 * Chủ dự án duyệt 24/11/2026:
 *  - Loại tệp: PDF, ảnh (JPG/PNG/WebP), Excel (.xlsx), Word (.docx), CSV. Không nhận tệp chạy
 *    được, tệp nén hay loại khác.
 *  - Tối đa 10 MB mỗi tệp, 5 tệp mỗi tin.
 *  - Hạn mức lưu trữ theo gói: Basic 200 MB, Premium 2 GB, Pro 10 GB.
 *  - Tệp chỉ giữ 6 tháng kể từ lúc gửi, sau đó tự xoá (tin nhắn vẫn còn, tệp hiện "đã hết hạn").
 *  - Tệp tải lên mà không gửi đi bị dọn sau 24 giờ.
 */

export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_FILES_PER_MESSAGE = 5;
/** Vercel nhận tối đa khoảng 4,5 MB mỗi yêu cầu: đường tải qua máy chủ (dự phòng) chỉ nhận tới 4 MB. */
export const CHAT_SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const CHAT_FILE_RETENTION_DAYS = 180;
export const CHAT_UNSENT_TTL_HOURS = 24;
/** Chống lạm dụng: số tệp một bên được bắt đầu tải lên trong một giờ. */
export const CHAT_UPLOADS_PER_HOUR = 40;

const MB = 1024 * 1024;
export const CHAT_STORAGE_QUOTA_BYTES = {
  basic: 200 * MB,
  premium: 2 * 1024 * MB,
  pro: 10 * 1024 * MB,
  /** Người mua không có gói: dùng mức của Basic. */
  buyer: 200 * MB,
} as const;

export type ChatQuotaPlan = keyof typeof CHAT_STORAGE_QUOTA_BYTES;

export type ChatFileKind = "image" | "pdf" | "sheet" | "doc" | "csv";

interface ChatFileType { kind: ChatFileKind; mime: string; label: string }

/** Đuôi tệp → loại và MIME chuẩn. MIME trình duyệt gửi lên không được tin; máy chủ dựa vào đuôi + nội dung. */
export const CHAT_FILE_TYPES: Record<string, ChatFileType> = {
  pdf: { kind: "pdf", mime: "application/pdf", label: "PDF" },
  jpg: { kind: "image", mime: "image/jpeg", label: "JPG" },
  jpeg: { kind: "image", mime: "image/jpeg", label: "JPG" },
  png: { kind: "image", mime: "image/png", label: "PNG" },
  webp: { kind: "image", mime: "image/webp", label: "WebP" },
  xlsx: { kind: "sheet", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" },
  docx: { kind: "doc", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
  csv: { kind: "csv", mime: "text/csv", label: "CSV" },
};

/** Giá trị `accept` cho ô chọn tệp. */
export const CHAT_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx,.csv,application/pdf,image/jpeg,image/png,image/webp";

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

export function chatFileType(name: string): ChatFileType | null {
  return CHAT_FILE_TYPES[fileExtension(name)] ?? null;
}

/**
 * Tên tệp an toàn để lưu và hiển thị: bỏ đường dẫn, ký tự điều khiển và ký tự làm hỏng tiêu đề
 * tải xuống; giữ chữ có dấu. Tối đa 120 ký tự, luôn giữ đuôi.
 */
export function cleanFileName(raw: string): string {
  const base = String(raw ?? "").split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  let name = base.normalize("NFC").replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "").replace(/\s+/g, " ").trim();
  name = name.replace(/^\.+/, "");
  if (name.length > 120) {
    const ext = fileExtension(name);
    const stem = name.slice(0, 120 - (ext ? ext.length + 1 : 0)).trim();
    name = ext ? `${stem}.${ext}` : stem;
  }
  return name;
}

export type ChatFileCheck =
  | { ok: true; name: string; kind: ChatFileKind; mime: string }
  | { ok: false; error: "type" | "size" | "name" };

/** Kiểm tra tên + dung lượng trước khi cho tải lên (cả trình duyệt lẫn máy chủ dùng). */
export function checkChatFile(input: { name: string; size: number }): ChatFileCheck {
  const name = cleanFileName(input.name);
  if (!name || !fileExtension(name)) return { ok: false, error: "name" };
  const type = chatFileType(name);
  if (!type) return { ok: false, error: "type" };
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > CHAT_FILE_MAX_BYTES) return { ok: false, error: "size" };
  return { ok: true, name, kind: type.kind, mime: type.mime };
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

/**
 * Nội dung thật có khớp loại tệp không (đọc vài KB đầu). Chặn tệp chạy được đổi đuôi thành .pdf,
 * .jpg… Tệp Office hiện đại là gói ZIP; CSV phải là chữ (không có byte 0).
 */
export function contentMatchesKind(kind: ChatFileKind, mime: string, head: Uint8Array): boolean {
  if (kind === "pdf") {
    // Một số trình xuất PDF chèn vài byte rác trước "%PDF-": tìm trong 1 KB đầu như trình đọc PDF.
    const text = new TextDecoder("latin1").decode(head.slice(0, 1024));
    return text.includes("%PDF-");
  }
  if (kind === "image") {
    if (mime === "image/jpeg") return startsWith(head, [0xff, 0xd8, 0xff]);
    if (mime === "image/png") return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (mime === "image/webp") return startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8);
    return false;
  }
  if (kind === "sheet" || kind === "doc") return startsWith(head, [0x50, 0x4b, 0x03, 0x04]);
  if (kind === "csv") {
    if (startsWith(head, [0x50, 0x4b]) || startsWith(head, [0x4d, 0x5a]) || startsWith(head, [0x7f, 0x45, 0x4c, 0x46])) return false;
    return !head.slice(0, 4096).includes(0);
  }
  return false;
}

/** Ảnh và PDF mở thẳng trên trình duyệt; Excel/Word/CSV luôn tải về. */
export function opensInline(kind: ChatFileKind): boolean {
  return kind === "image" || kind === "pdf";
}

export function chatQuotaBytes(plan: ChatQuotaPlan): number {
  return CHAT_STORAGE_QUOTA_BYTES[plan];
}

/** Còn chỗ cho tệp mới không (tệp đã có bản giống hệt của cùng bên thì không tính thêm). */
export function withinChatQuota(usedBytes: number, newBytes: number, plan: ChatQuotaPlan): boolean {
  return usedBytes + newBytes <= chatQuotaBytes(plan);
}

export function chatFileExpiresAt(sentAt: string | Date): string {
  const at = typeof sentAt === "string" ? new Date(sentAt) : sentAt;
  return new Date(at.getTime() + CHAT_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** "1,2 MB" / "850 KB" theo ngôn ngữ hiển thị. */
export function formatChatFileSize(bytes: number, locale = "en"): string {
  const fmt = (n: number) => new Intl.NumberFormat(locale.startsWith("vi") ? "vi-VN" : "en-GB", { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
  if (bytes >= MB) return `${fmt(bytes / MB)} MB`;
  return `${fmt(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** Câu xem trước của tin chỉ có tệp (danh sách cuộc, email báo tin): tên các tệp. */
export function attachmentsPreview(names: string[], max = 140): string {
  const text = names.filter(Boolean).join(", ");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Khoá lưu trên kho: theo bên tải lên + mã băm nội dung, nên cùng một tệp (vd. catalogue gửi cho
 * nhiều người mua) chỉ lưu một bản. `scope` là mã băm của bên tải lên, không chứa email.
 */
export function chatStorageKey(scope: string, sha256: string, ext: string): string {
  return `chat/${scope}/${sha256}${ext ? `.${ext}` : ""}`;
}
