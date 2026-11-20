/**
 * Nội dung A+ trong mô tả chi tiết sản phẩm (giống A+ Content của Amazon).
 *
 * Gói Basic chỉ có mô tả bằng chữ. Gói có quyền nội dung A+ (Premium/Pro, xem
 * `richContent` trong lib/supplier-plans.ts) thêm được các khối ảnh, ảnh + chữ, lưới ảnh,
 * chữ và video. Gói hết hạn thì khối vẫn lưu nhưng không hiện cho người mua.
 *
 * Ảnh lưu ở `aplus/<supplierId>/<productId>/<uuid>.<ext>`; video là mã video Cloudflare
 * Stream. Tệp không import gì ngoài file cùng thư mục để script kiểm tra nạp thẳng bằng Node.
 */
import { looksVietnamese } from "../vietnamese-text.ts";

export const APLUS_MAX_MODULES = 10;
export const APLUS_TITLE_MAX = 120;
export const APLUS_BODY_MAX = 1200;
export const APLUS_CAPTION_MAX = 160;
export const APLUS_GALLERY_MIN = 2;
export const APLUS_GALLERY_MAX = 4;
/** Video A+ dài tối đa 15 phút, tệp tối đa 200 MB (giới hạn tải lên cơ bản của Cloudflare Stream). */
export const APLUS_VIDEO_MAX_SECONDS = 900;
export const APLUS_VIDEO_MAX_BYTES = 200 * 1024 * 1024;

export const APLUS_MODULE_TYPES = ["image", "image_text", "gallery", "text", "video"] as const;
export type AplusModuleType = (typeof APLUS_MODULE_TYPES)[number];

export type AplusModule =
  | { id: string; type: "image"; image_path: string; caption: string }
  | { id: string; type: "image_text"; image_path: string; title: string; body: string; image_side: "left" | "right" }
  | { id: string; type: "gallery"; items: Array<{ image_path: string; caption: string }> }
  | { id: string; type: "text"; title: string; body: string }
  | { id: string; type: "video"; video_uid: string; title: string; duration?: number; uploaded_at?: string };

export type AplusProblem =
  | { code: "tooMany" } | { code: "invalid"; index: number } | { code: "imageRequired"; index: number }
  | { code: "titleRequired"; index: number } | { code: "tooLong"; index: number }
  | { code: "galleryCount"; index: number } | { code: "video"; index: number }
  | { code: "language"; index: number } | { code: "contact"; index: number };

const ID = /^[a-z0-9-]{8,40}$/i;
const VIDEO_UID = /^[a-f0-9]{32}$/i;

/** Đường dẫn ảnh A+ hợp lệ của đúng sản phẩm này. */
export function isAplusImagePath(path: unknown, supplierId: string, productId: string): path is string {
  if (typeof path !== "string") return false;
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === "aplus" && parts[1] === supplierId && parts[2] === productId &&
    /^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/i.test(parts[3]);
}

const text = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max + 1) : "";

/** Email, số điện thoại, đường link: liên hệ trực tiếp đi qua Vexim, không đặt trong nội dung. */
function hasContact(value: string): boolean {
  return /[\w.+-]+@[\w-]+\.[\w.]+/.test(value) || /(?:\+?\d[\d .-]{8,}\d)/.test(value) ||
    /\b(?:https?:\/\/|www\.)\S+/i.test(value) || /\b(?:zalo|whatsapp|wechat|viber|telegram)\b/i.test(value);
}

/**
 * Chuẩn hoá và kiểm tra danh sách khối. Trả `modules` đã làm sạch hoặc lỗi đầu tiên.
 * Nội dung viết bằng tiếng Anh vì người mua là khách quốc tế.
 */
export function validateAplusModules(raw: unknown, ctx: { supplierId: string; productId: string }):
  { ok: true; modules: AplusModule[] } | { ok: false; problem: AplusProblem } {
  if (!Array.isArray(raw)) return { ok: false, problem: { code: "invalid", index: 0 } };
  if (raw.length > APLUS_MAX_MODULES) return { ok: false, problem: { code: "tooMany" } };
  const modules: AplusModule[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < raw.length; index++) {
    const item = raw[index] as Record<string, unknown> | null;
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !ID.test(item.id) || seen.has(item.id) ||
        !APLUS_MODULE_TYPES.includes(item.type as AplusModuleType)) return { ok: false, problem: { code: "invalid", index } };
    seen.add(item.id);
    const image = (path: unknown) => isAplusImagePath(path, ctx.supplierId, ctx.productId);
    let module: AplusModule;
    switch (item.type as AplusModuleType) {
      case "image": {
        if (!image(item.image_path)) return { ok: false, problem: { code: "imageRequired", index } };
        module = { id: item.id, type: "image", image_path: item.image_path as string, caption: text(item.caption, APLUS_CAPTION_MAX) };
        break;
      }
      case "image_text": {
        if (!image(item.image_path)) return { ok: false, problem: { code: "imageRequired", index } };
        module = { id: item.id, type: "image_text", image_path: item.image_path as string, title: text(item.title, APLUS_TITLE_MAX),
          body: text(item.body, APLUS_BODY_MAX), image_side: item.image_side === "right" ? "right" : "left" };
        if (!module.title) return { ok: false, problem: { code: "titleRequired", index } };
        break;
      }
      case "gallery": {
        const items = Array.isArray(item.items) ? item.items : [];
        if (items.length < APLUS_GALLERY_MIN || items.length > APLUS_GALLERY_MAX) return { ok: false, problem: { code: "galleryCount", index } };
        const cleaned: Array<{ image_path: string; caption: string }> = [];
        for (const entry of items as Array<Record<string, unknown>>) {
          if (!entry || !image(entry.image_path)) return { ok: false, problem: { code: "imageRequired", index } };
          cleaned.push({ image_path: entry.image_path as string, caption: text(entry.caption, APLUS_CAPTION_MAX) });
        }
        module = { id: item.id, type: "gallery", items: cleaned };
        break;
      }
      case "text": {
        module = { id: item.id, type: "text", title: text(item.title, APLUS_TITLE_MAX), body: text(item.body, APLUS_BODY_MAX) };
        if (!module.title) return { ok: false, problem: { code: "titleRequired", index } };
        break;
      }
      case "video": {
        if (typeof item.video_uid !== "string" || !VIDEO_UID.test(item.video_uid)) return { ok: false, problem: { code: "video", index } };
        module = { id: item.id, type: "video", video_uid: item.video_uid.toLowerCase(), title: text(item.title, APLUS_TITLE_MAX) };
        // Thời lượng và ngày tải lên do máy chủ lấy từ Cloudflare khi lưu (dùng cho dữ liệu SEO VideoObject).
        if (typeof item.duration === "number" && Number.isFinite(item.duration) && item.duration > 0 && item.duration <= 86400) module.duration = Math.round(item.duration);
        if (typeof item.uploaded_at === "string" && !Number.isNaN(Date.parse(item.uploaded_at))) module.uploaded_at = new Date(item.uploaded_at).toISOString();
        break;
      }
    }
    // text() cắt ở max + 1 ký tự, nên vượt max nghĩa là nhà cung cấp viết quá dài.
    const limits = aplusModuleLimits(module);
    const strings = aplusModuleText(module);
    if (strings.some((value, i) => value.length > limits[i])) return { ok: false, problem: { code: "tooLong", index } };
    const joined = strings.join(" ");
    if (joined && hasContact(joined)) return { ok: false, problem: { code: "contact", index } };
    if (joined && looksVietnamese(joined)) return { ok: false, problem: { code: "language", index } };
    modules.push(module);
  }
  return { ok: true, modules };
}

/** Các đoạn chữ của một khối (theo thứ tự tiêu đề, nội dung/chú thích). */
export function aplusModuleText(module: AplusModule): string[] {
  switch (module.type) {
    case "image": return [module.caption];
    case "image_text": return [module.title, module.body];
    case "gallery": return module.items.map((item) => item.caption);
    case "text": return [module.title, module.body];
    case "video": return [module.title];
  }
}

/** Độ dài tối đa của từng đoạn chữ, cùng thứ tự với aplusModuleText. */
function aplusModuleLimits(module: AplusModule): number[] {
  switch (module.type) {
    case "image": return [APLUS_CAPTION_MAX];
    case "image_text": case "text": return [APLUS_TITLE_MAX, APLUS_BODY_MAX];
    case "gallery": return module.items.map(() => APLUS_CAPTION_MAX);
    case "video": return [APLUS_TITLE_MAX];
  }
}

/** Mọi đường dẫn ảnh mà nội dung đang dùng. */
export function aplusImagePaths(modules: readonly AplusModule[]): string[] {
  return modules.flatMap((module) => module.type === "image" || module.type === "image_text" ? [module.image_path]
    : module.type === "gallery" ? module.items.map((item) => item.image_path) : []);
}

/** Đọc nội dung đã lưu; dữ liệu hỏng thì bỏ qua khối đó thay vì làm hỏng cả trang. */
export function readAplusModules(raw: unknown, ctx: { supplierId: string; productId: string }): AplusModule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, APLUS_MAX_MODULES).flatMap((item) => {
    const checked = validateAplusModules([item], ctx);
    return checked.ok ? checked.modules : [];
  });
}

/** Cùng điều kiện với ảnh sản phẩm: bản nháp, bản cần sửa, hoặc sản phẩm nhà cung cấp tự đăng đang hiện/tạm ẩn. */
export function canEditAplus(product: { supplier_review_status?: string | null; supplier_originated?: boolean | null }): boolean {
  return product.supplier_review_status === "draft" || product.supplier_review_status === "changes_requested" ||
    ((product.supplier_review_status === "approved" || product.supplier_review_status === "paused") && product.supplier_originated === true);
}

/**
 * Video sản phẩm: một video nằm cùng dãy ảnh sản phẩm (cột `gallery_video`), chỉ gói có quyền
 * video (Premium/Pro). Thời lượng và ngày tải lên do máy chủ lấy từ Cloudflare.
 */
export type ProductGalleryVideo = { video_uid: string; duration?: number; uploaded_at?: string };

export function readGalleryVideo(raw: unknown): ProductGalleryVideo | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.video_uid !== "string" || !VIDEO_UID.test(item.video_uid)) return null;
  const video: ProductGalleryVideo = { video_uid: item.video_uid.toLowerCase() };
  if (typeof item.duration === "number" && Number.isFinite(item.duration) && item.duration > 0 && item.duration <= 86400) video.duration = Math.round(item.duration);
  if (typeof item.uploaded_at === "string" && !Number.isNaN(Date.parse(item.uploaded_at))) video.uploaded_at = new Date(item.uploaded_at).toISOString();
  return video;
}

/** Mọi mã video mà nội dung đang dùng. */
export function aplusVideoUids(modules: readonly AplusModule[]): string[] {
  return modules.flatMap((module) => module.type === "video" ? [module.video_uid] : []);
}

/** Ảnh bìa video do Cloudflare tạo (ảnh tĩnh, nhẹ hơn nhiều so với nạp trình phát). */
export function aplusVideoThumbnailUrl(uid: string, height = 720): string {
  return `https://videodelivery.net/${encodeURIComponent(uid)}/thumbnails/thumbnail.jpg?height=${height}`;
}

/**
 * Trang nhúng video Cloudflare Stream. `poster` dùng ảnh bìa ở trên; `autoplay` khi người mua đã
 * bấm phát (iframe chỉ nạp sau cú bấm đó); mặc định `preload=none` để không tải trước video.
 */
export function aplusVideoEmbedUrl(uid: string, options: { autoplay?: boolean } = {}): string {
  const params = new URLSearchParams({ poster: aplusVideoThumbnailUrl(uid), preload: "none" });
  if (options.autoplay) params.set("autoplay", "true");
  return `https://iframe.videodelivery.net/${encodeURIComponent(uid)}?${params}`;
}

/** Thời lượng theo ISO 8601 (PT1M30S) cho VideoObject. */
export function isoDuration(seconds: number): string {
  const total = Math.max(1, Math.round(seconds));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s ? `${s}S` : ""}`;
}
