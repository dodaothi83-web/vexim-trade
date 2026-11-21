/**
 * Nội dung A+ trong mô tả chi tiết sản phẩm (giống A+ Content của Amazon), bản duyệt
 * docs/aplus-editor/index.html (chủ sàn chốt 2026-11-20).
 *
 * Gói Basic chỉ có mô tả bằng chữ. Gói có quyền nội dung A+ (Premium/Pro, xem `richContent` trong
 * lib/supplier-plans.ts) thêm được tối đa 10 khối:
 * - khối B2B: banner có chữ, điểm nổi bật, quy trình theo bước, đóng gói và container, câu hỏi
 *   thường gặp;
 * - khối cơ bản: ảnh lớn, ảnh + chữ, lưới ảnh, văn bản, video.
 * Gói hết hạn thì khối vẫn lưu nhưng không hiện cho người mua.
 *
 * Ngôn ngữ: nhà cung cấp viết tiếng Việt (`vi`, theo đúng thứ tự các ô chữ của khối, xem
 * `aplusSlots`), máy chủ dịch sang tiếng Anh khi lưu. Các trường chữ của khối là bản tiếng Anh
 * người mua thấy. Nhà cung cấp được sửa tay bản tiếng Anh (`en_edited`); `src` là dấu của bản tiếng
 * Việt lúc dịch, để biết bản tiếng Việt đã đổi sau đó (cần dịch lại).
 *
 * Chữ trong phần nội dung cho phép **đậm** và dòng bắt đầu "- " là gạch đầu dòng.
 *
 * Ảnh lưu ở `aplus/<supplierId>/<productId>/<uuid>.<ext>`; video là mã video Cloudflare Stream.
 * Tệp không import gì ngoài file cùng thư mục để script kiểm tra nạp thẳng bằng Node.
 */
import { looksVietnamese } from "../vietnamese-text.ts";

export const APLUS_MAX_MODULES = 10;
/**
 * A+ doanh nghiệp trên trang nhà cung cấp dùng cùng khối, ảnh nằm ở aplus/<supplierId>/company/:
 * truyền `productId: COMPANY_APLUS_ID` cho các hàm kiểm tra ảnh.
 */
export const COMPANY_APLUS_ID = "company";
export const APLUS_TITLE_MAX = 120;
export const APLUS_BODY_MAX = 1200;
export const APLUS_CAPTION_MAX = 160;
export const APLUS_ALT_MAX = 160;
export const APLUS_GALLERY_MIN = 2;
export const APLUS_GALLERY_MAX = 4;
/** Video A+ dài tối đa 15 phút, tệp tối đa 200 MB (giới hạn tải lên cơ bản của Cloudflare Stream). */
export const APLUS_VIDEO_MAX_SECONDS = 900;
export const APLUS_VIDEO_MAX_BYTES = 200 * 1024 * 1024;

/** Số mục tối thiểu, tối đa của các khối có danh sách. */
export const APLUS_ITEM_RANGE = {
  gallery: [APLUS_GALLERY_MIN, APLUS_GALLERY_MAX],
  highlights: [3, 4],
  steps: [3, 6],
  packing: [2, 8],
  faq: [2, 8],
} as const;

export const APLUS_MODULE_TYPES = ["hero", "highlights", "steps", "packing", "faq", "image", "image_text", "gallery", "text", "video"] as const;
export type AplusModuleType = (typeof APLUS_MODULE_TYPES)[number];
/** Khối B2B mới (gắn nhãn "Mới" trong thư viện khối). */
export const APLUS_B2B_TYPES: readonly AplusModuleType[] = ["hero", "highlights", "steps", "packing", "faq"];

/** Biểu tượng cho ô điểm nổi bật: lấy từ bộ biểu tượng Vexim đã duyệt (components/brand/vexim-icons). */
export const APLUS_HIGHLIGHT_ICONS = ["capacity", "lead-time", "minimum-order", "export-port", "payment", "markets", "samples", "oem", "inspection", "delivery", "document", "factory"] as const;
export type AplusHighlightIcon = (typeof APLUS_HIGHLIGHT_ICONS)[number];

/** Ảnh: đường dẫn, mô tả ảnh (alt) và điểm lấy nét khi cắt theo khung (0–100, mặc định giữa). */
type Img = { image_path: string; alt?: string; fx?: number; fy?: number };
/** Bản tiếng Việt, dấu bản đã dịch, đã sửa tay bản tiếng Anh, gợi ý bộ mẫu. */
type Lang = { vi?: string[]; src?: string; en_edited?: true; hint?: string };

export type AplusModule =
  | (Img & Lang & { id: string; type: "hero"; eyebrow: string; headline: string; sub: string })
  | (Lang & { id: string; type: "highlights"; items: Array<{ icon: AplusHighlightIcon; title: string; text: string }> })
  | (Lang & { id: string; type: "steps"; items: Array<Partial<Img> & { image_path: string; title: string; text: string }> })
  | (Img & Lang & { id: string; type: "packing"; title: string; rows: Array<{ label: string; value: string }> })
  | (Lang & { id: string; type: "faq"; items: Array<{ q: string; a: string }> })
  | (Img & Lang & { id: string; type: "image"; caption: string })
  | (Img & Lang & { id: string; type: "image_text"; title: string; body: string; image_side: "left" | "right" })
  | (Lang & { id: string; type: "gallery"; items: Array<Img & { caption: string }> })
  | (Lang & { id: string; type: "text"; title: string; body: string })
  | (Lang & { id: string; type: "video"; video_uid: string; title: string; duration?: number; uploaded_at?: string });

export type AplusProblem =
  | { code: "tooMany" } | { code: "invalid"; index: number } | { code: "imageRequired"; index: number }
  | { code: "titleRequired"; index: number } | { code: "tooLong"; index: number }
  | { code: "galleryCount"; index: number } | { code: "itemCount"; index: number } | { code: "video"; index: number }
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

/**
 * Thông tin liên hệ trực tiếp: email, đường link, ứng dụng nhắn tin, số điện thoại. Người mua liên
 * hệ qua Vexim. Số điện thoại bắt cả khi viết liền hoặc có khoảng trắng, dấu chấm, gạch nối, ngoặc
 * (0912345678, 0912 345 678, 0912.345.678, (028) 3822-1234, +84 912 345 678); không bắt số đo,
 * mã HS hay số lượng ngắn (22.68 kg, 0801.32.00, 1,400 cartons).
 */
export function findContact(value: string): "email" | "link" | "app" | "phone" | null {
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(value)) return "email";
  if (/\b(?:https?:\/\/|www\.)\S+/i.test(value) || /\b[a-z0-9-]+\.(?:com|vn|net|org|biz|info)(?:\/\S*)?\b/i.test(value)) return "link";
  if (/\b(?:zalo|whatsapp|wechat|viber|telegram|skype|line\s*id)\b/i.test(value)) return "app";
  for (const match of value.matchAll(/\+?\(?\d[\d\s().\-/]{6,24}\d/g)) {
    const raw = match[0];
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) continue;
    // Dãy số đo có phần thập phân rời rạc (vd "2 x 22.68 kg") không phải điện thoại: điện thoại
    // bắt đầu bằng +, 0, (0 hoặc mã 84, hoặc là một dãy liền 10+ chữ số.
    if (/^\+|^\(?0|^84/.test(raw.trim()) || /^\d{10,}$/.test(raw.trim())) return "phone";
  }
  return null;
}

type Slot = { key: string; max: number; required: boolean; get: (m: AplusModule) => string };

/**
 * Các ô chữ của một khối, theo thứ tự cố định. Bản tiếng Việt (`vi`) và bản dịch đi theo đúng thứ
 * tự này. Số ô phụ thuộc số mục (ảnh lưới, bước, câu hỏi...).
 */
export function aplusSlots(module: AplusModule): Slot[] {
  const s = (key: string, max: number, required: boolean, get: (m: AplusModule) => string): Slot => ({ key, max, required, get });
  const any = (m: AplusModule) => m as unknown as Record<string, unknown>;
  const field = (name: string) => (m: AplusModule) => String(any(m)[name] ?? "");
  const item = (list: string, i: number, name: string) => (m: AplusModule) =>
    String(((any(m)[list] as Array<Record<string, unknown>> | undefined)?.[i]?.[name]) ?? "");
  switch (module.type) {
    case "hero": return [s("alt", APLUS_ALT_MAX, false, field("alt")), s("eyebrow", 60, false, field("eyebrow")),
      s("headline", APLUS_TITLE_MAX, true, field("headline")), s("sub", 240, false, field("sub"))];
    case "highlights": return module.items.flatMap((_, i) => [s(`items.${i}.title`, 60, true, item("items", i, "title")), s(`items.${i}.text`, 160, false, item("items", i, "text"))]);
    case "steps": return module.items.flatMap((_, i) => [s(`items.${i}.alt`, APLUS_ALT_MAX, false, item("items", i, "alt")),
      s(`items.${i}.title`, 60, true, item("items", i, "title")), s(`items.${i}.text`, 200, false, item("items", i, "text"))]);
    case "packing": return [s("alt", APLUS_ALT_MAX, false, field("alt")), s("title", APLUS_TITLE_MAX, false, field("title")),
      ...module.rows.flatMap((_, i) => [s(`rows.${i}.label`, 60, true, item("rows", i, "label")), s(`rows.${i}.value`, 120, true, item("rows", i, "value"))])];
    case "faq": return module.items.flatMap((_, i) => [s(`items.${i}.q`, 160, true, item("items", i, "q")), s(`items.${i}.a`, 600, true, item("items", i, "a"))]);
    case "image": return [s("alt", APLUS_ALT_MAX, false, field("alt")), s("caption", APLUS_CAPTION_MAX, false, field("caption"))];
    case "image_text": return [s("alt", APLUS_ALT_MAX, false, field("alt")), s("title", APLUS_TITLE_MAX, true, field("title")), s("body", APLUS_BODY_MAX, false, field("body"))];
    case "gallery": return module.items.flatMap((_, i) => [s(`items.${i}.alt`, APLUS_ALT_MAX, false, item("items", i, "alt")), s(`items.${i}.caption`, APLUS_CAPTION_MAX, false, item("items", i, "caption"))]);
    case "text": return [s("title", APLUS_TITLE_MAX, true, field("title")), s("body", APLUS_BODY_MAX, false, field("body"))];
    case "video": return [s("title", APLUS_TITLE_MAX, false, field("title"))];
  }
}

/** Bản tiếng Anh của các ô chữ (cùng thứ tự với aplusSlots). */
export function aplusModuleText(module: AplusModule): string[] {
  return aplusSlots(module).map((slot) => slot.get(module));
}

/** Ghi bản tiếng Anh vào các ô chữ theo khoá của aplusSlots ("title", "items.2.text"...). */
export function withAplusText(module: AplusModule, values: string[]): AplusModule {
  const next = structuredClone(module) as unknown as Record<string, unknown>;
  aplusSlots(module).forEach((slot, i) => {
    const value = values[i] ?? "";
    const parts = slot.key.split(".");
    if (parts.length === 1) next[parts[0]] = value;
    else {
      const list = next[parts[0]] as Array<Record<string, unknown>>;
      if (list?.[Number(parts[1])]) list[Number(parts[1])][parts[2]] = value;
    }
  });
  return next as unknown as AplusModule;
}

/** Dấu của bản tiếng Việt (FNV-1a), để biết bản tiếng Việt đã đổi sau lần dịch. */
export function aplusSourceHash(vi: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const ch of vi.join("␞")) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** Khối cần dịch khi lưu: có bản tiếng Việt, bản tiếng Anh chưa dịch theo bản đó và chưa sửa tay. */
export function aplusNeedsTranslation(module: AplusModule): boolean {
  if (!module.vi?.some((value) => value.trim())) return false;
  if (module.en_edited) return false;
  return module.src !== aplusSourceHash(module.vi);
}

/** Đã sửa tay bản tiếng Anh nhưng bản tiếng Việt đổi sau đó: nên bấm "Dịch lại từ tiếng Việt". */
export function aplusTranslationStale(module: AplusModule): boolean {
  return !!module.en_edited && !!module.vi && module.src !== aplusSourceHash(module.vi);
}

/**
 * Số liệu có ở bản tiếng Việt mà không thấy ở bản tiếng Anh (cảnh báo nhẹ khi sửa tay bản tiếng
 * Anh). So theo giá trị: "22,68" khớp "22.68", "1.400" khớp "1,400" và "1400".
 */
export function aplusNumberDrift(vi: string, en: string): string[] {
  const values = (input: string) => {
    const out = new Set<number>();
    for (const token of input.match(/\d[\d.,]*\d|\d/g) ?? []) {
      const plain = Number(token.replace(/[.,]/g, ""));
      if (Number.isFinite(plain)) out.add(plain);
      const dotDecimal = Number(token.replace(/,/g, ""));
      if (Number.isFinite(dotDecimal)) out.add(dotDecimal);
      const commaDecimal = Number(token.replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(commaDecimal)) out.add(commaDecimal);
    }
    return out;
  };
  const english = values(en);
  const missing: string[] = [];
  for (const token of vi.match(/\d[\d.,]*\d|\d/g) ?? []) {
    const candidates = [Number(token.replace(/[.,]/g, "")), Number(token.replace(/,/g, "")), Number(token.replace(/\./g, "").replace(",", "."))];
    if (!candidates.some((value) => english.has(value)) && !missing.includes(token)) missing.push(token);
  }
  return missing;
}

const focus = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : undefined;
const imgFields = (raw: Record<string, unknown>) => ({
  ...(focus(raw.fx) !== undefined ? { fx: focus(raw.fx) } : {}), ...(focus(raw.fy) !== undefined ? { fy: focus(raw.fy) } : {}),
});

/**
 * Chuẩn hoá và kiểm tra danh sách khối. Trả `modules` đã làm sạch hoặc lỗi đầu tiên.
 *
 * - `draft`: bản nháp trước khi dịch (lưu từ trình soạn): ô bắt buộc chấp nhận chữ ở bản tiếng Việt,
 *   chưa kiểm tra tiếng Anh. Máy chủ dịch xong mới kiểm tra lại đầy đủ.
 * - mặc định: bản người mua thấy, chữ phải là tiếng Anh.
 * Cả hai chế độ đều chặn thông tin liên hệ ở cả hai bản.
 */
export function validateAplusModules(raw: unknown, ctx: { supplierId: string; productId: string }, options: { draft?: boolean } = {}):
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
    const list = (name: string) => Array.isArray(item[name]) ? item[name] as Array<Record<string, unknown>> : [];
    const count = (type: keyof typeof APLUS_ITEM_RANGE, n: number) => n >= APLUS_ITEM_RANGE[type][0] && n <= APLUS_ITEM_RANGE[type][1];
    const id = item.id;
    let module: AplusModule;
    switch (item.type as AplusModuleType) {
      case "hero":
        if (!image(item.image_path)) return { ok: false, problem: { code: "imageRequired", index } };
        module = { id, type: "hero", image_path: item.image_path as string, ...imgFields(item), alt: text(item.alt, APLUS_ALT_MAX),
          eyebrow: text(item.eyebrow, 60), headline: text(item.headline, APLUS_TITLE_MAX), sub: text(item.sub, 240) };
        break;
      case "highlights": {
        const items = list("items");
        if (!count("highlights", items.length)) return { ok: false, problem: { code: "itemCount", index } };
        module = { id, type: "highlights", items: items.map((entry) => ({
          icon: APLUS_HIGHLIGHT_ICONS.includes(entry?.icon as AplusHighlightIcon) ? entry.icon as AplusHighlightIcon : "inspection",
          title: text(entry?.title, 60), text: text(entry?.text, 160) })) };
        break;
      }
      case "steps": {
        const items = list("items");
        if (!count("steps", items.length)) return { ok: false, problem: { code: "itemCount", index } };
        const cleaned = [];
        for (const entry of items) {
          const path = entry?.image_path ?? "";
          if (path !== "" && !image(path)) return { ok: false, problem: { code: "imageRequired", index } };
          cleaned.push({ image_path: String(path), ...imgFields(entry ?? {}), alt: text(entry?.alt, APLUS_ALT_MAX), title: text(entry?.title, 60), text: text(entry?.text, 200) });
        }
        module = { id, type: "steps", items: cleaned };
        break;
      }
      case "packing": {
        if (!image(item.image_path)) return { ok: false, problem: { code: "imageRequired", index } };
        const rows = list("rows");
        if (!count("packing", rows.length)) return { ok: false, problem: { code: "itemCount", index } };
        module = { id, type: "packing", image_path: item.image_path as string, ...imgFields(item), alt: text(item.alt, APLUS_ALT_MAX),
          title: text(item.title, APLUS_TITLE_MAX), rows: rows.map((row) => ({ label: text(row?.label, 60), value: text(row?.value, 120) })) };
        break;
      }
      case "faq": {
        const items = list("items");
        if (!count("faq", items.length)) return { ok: false, problem: { code: "itemCount", index } };
        module = { id, type: "faq", items: items.map((entry) => ({ q: text(entry?.q, 160), a: text(entry?.a, 600) })) };
        break;
      }
      case "image":
        if (!image(item.image_path)) return { ok: false, problem: { code: "imageRequired", index } };
        module = { id, type: "image", image_path: item.image_path as string, ...imgFields(item), alt: text(item.alt, APLUS_ALT_MAX), caption: text(item.caption, APLUS_CAPTION_MAX) };
        break;
      case "image_text":
        if (!image(item.image_path)) return { ok: false, problem: { code: "imageRequired", index } };
        module = { id, type: "image_text", image_path: item.image_path as string, ...imgFields(item), alt: text(item.alt, APLUS_ALT_MAX),
          title: text(item.title, APLUS_TITLE_MAX), body: text(item.body, APLUS_BODY_MAX), image_side: item.image_side === "right" ? "right" : "left" };
        break;
      case "gallery": {
        const items = list("items");
        if (!count("gallery", items.length)) return { ok: false, problem: { code: "galleryCount", index } };
        const cleaned = [];
        for (const entry of items) {
          if (!entry || !image(entry.image_path)) return { ok: false, problem: { code: "imageRequired", index } };
          cleaned.push({ image_path: entry.image_path as string, ...imgFields(entry), alt: text(entry.alt, APLUS_ALT_MAX), caption: text(entry.caption, APLUS_CAPTION_MAX) });
        }
        module = { id, type: "gallery", items: cleaned };
        break;
      }
      case "text":
        module = { id, type: "text", title: text(item.title, APLUS_TITLE_MAX), body: text(item.body, APLUS_BODY_MAX) };
        break;
      case "video": {
        if (typeof item.video_uid !== "string" || !VIDEO_UID.test(item.video_uid)) return { ok: false, problem: { code: "video", index } };
        const video: AplusModule = { id, type: "video", video_uid: item.video_uid.toLowerCase(), title: text(item.title, APLUS_TITLE_MAX) };
        // Thời lượng và ngày tải lên do máy chủ lấy từ Cloudflare khi lưu (dùng cho dữ liệu SEO VideoObject).
        if (typeof item.duration === "number" && Number.isFinite(item.duration) && item.duration > 0 && item.duration <= 86400) video.duration = Math.round(item.duration);
        if (typeof item.uploaded_at === "string" && !Number.isNaN(Date.parse(item.uploaded_at))) video.uploaded_at = new Date(item.uploaded_at).toISOString();
        module = video;
        break;
      }
    }
    const slots = aplusSlots(module);
    // Bản tiếng Việt: đúng số ô của khối; thiếu hoặc thừa thì bỏ (dữ liệu cũ, trình soạn cũ).
    if (Array.isArray(item.vi) && item.vi.length === slots.length && item.vi.every((value) => typeof value === "string"))
      module.vi = (item.vi as string[]).map((value, i) => text(value, slots[i].max));
    if (typeof item.src === "string" && /^[a-f0-9]{8}$/.test(item.src)) module.src = item.src;
    if (item.en_edited === true) module.en_edited = true;
    if (typeof item.hint === "string" && /^[a-z]+:\d{1,2}$/.test(item.hint)) module.hint = item.hint;

    // text() cắt ở max + 1 ký tự, nên vượt max nghĩa là viết quá dài.
    const english = slots.map((slot) => slot.get(module));
    const vi = module.vi ?? [];
    if (english.some((value, i) => value.length > slots[i].max) || vi.some((value, i) => value.length > slots[i].max))
      return { ok: false, problem: { code: "tooLong", index } };
    const filled = (i: number) => options.draft ? !!(vi[i]?.trim() || english[i].trim()) : !!english[i].trim();
    if (slots.some((slot, i) => slot.required && !filled(i))) return { ok: false, problem: { code: "titleRequired", index } };
    const joined = [...english, ...vi].join(" ").trim();
    if (joined && findContact(joined)) return { ok: false, problem: { code: "contact", index } };
    const joinedEnglish = english.join(" ").trim();
    if (!options.draft && joinedEnglish && looksVietnamese(joinedEnglish)) return { ok: false, problem: { code: "language", index } };
    modules.push(module);
  }
  return { ok: true, modules };
}

/** Mọi đường dẫn ảnh mà nội dung đang dùng. */
export function aplusImagePaths(modules: readonly AplusModule[]): string[] {
  return modules.flatMap((module) => {
    switch (module.type) {
      case "hero": case "packing": case "image": case "image_text": return [module.image_path];
      case "gallery": return module.items.map((item) => item.image_path);
      case "steps": return module.items.map((item) => item.image_path).filter(Boolean);
      default: return [];
    }
  });
}

/** Đổi đường dẫn ảnh trong một khối (gắn ảnh chờ vào sản phẩm vừa tạo). */
export function mapAplusImages(module: AplusModule, swap: (path: string) => string): AplusModule {
  switch (module.type) {
    case "hero": case "packing": case "image": case "image_text": return { ...module, image_path: swap(module.image_path) };
    case "gallery": return { ...module, items: module.items.map((item) => ({ ...item, image_path: swap(item.image_path) })) };
    case "steps": return { ...module, items: module.items.map((item) => ({ ...item, image_path: item.image_path ? swap(item.image_path) : "" })) };
    default: return module;
  }
}

/** Đọc nội dung đã lưu; dữ liệu hỏng thì bỏ qua khối đó thay vì làm hỏng cả trang. */
export function readAplusModules(raw: unknown, ctx: { supplierId: string; productId: string }): AplusModule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, APLUS_MAX_MODULES).flatMap((item) => {
    const checked = validateAplusModules([item], ctx);
    return checked.ok ? checked.modules : [];
  });
}

/**
 * Thiếu gì để khối được coi là "đủ" (báo trên tiêu đề khối, tính vào mức hoàn thiện). Mã lỗi để
 * giao diện dịch ra lời nhắc:
 * - image: thiếu ảnh; alt: ảnh chưa có mô tả ảnh;
 * - title: thiếu tiêu đề; body: đoạn chữ quá ngắn;
 * - items: chưa đủ số mục tối thiểu hoặc mục còn trống; answers: câu hỏi chưa có trả lời;
 * - video: chưa tải video.
 * Chữ tính theo bản tiếng Việt nếu có (đang soạn), không thì bản tiếng Anh.
 */
export function aplusBlockIssues(module: AplusModule): string[] {
  const slots = aplusSlots(module);
  const value = (key: string) => {
    const i = slots.findIndex((slot) => slot.key === key);
    if (i < 0) return "";
    return (module.vi?.[i]?.trim() || slots[i].get(module).trim());
  };
  const issues = new Set<string>();
  const needImage = (path: string, altKey: string) => { if (!path) issues.add("image"); else if (!value(altKey)) issues.add("alt"); };
  switch (module.type) {
    case "hero": needImage(module.image_path, "alt"); if (value("headline").length < 10) issues.add("title"); break;
    case "highlights":
      if (module.items.length < 3 || module.items.some((_, i) => !value(`items.${i}.title`) || !value(`items.${i}.text`))) issues.add("items");
      break;
    case "steps":
      if (module.items.length < 3 || module.items.some((_, i) => !value(`items.${i}.title`))) issues.add("items");
      module.items.forEach((item, i) => needImage(item.image_path, `items.${i}.alt`));
      break;
    case "packing":
      needImage(module.image_path, "alt");
      if (module.rows.filter((_, i) => value(`rows.${i}.label`) && value(`rows.${i}.value`)).length < 3) issues.add("items");
      break;
    case "faq":
      if (module.items.length < 3) issues.add("items");
      if (module.items.some((_, i) => !value(`items.${i}.a`))) issues.add("answers");
      break;
    case "image": needImage(module.image_path, "alt"); break;
    case "image_text": needImage(module.image_path, "alt"); if (!value("title")) issues.add("title"); if (value("body").length < 40) issues.add("body"); break;
    case "gallery": if (module.items.length < 2) issues.add("items"); module.items.forEach((item, i) => needImage(item.image_path, `items.${i}.alt`)); break;
    case "text": if (!value("title")) issues.add("title"); if (value("body").length < 80) issues.add("body"); break;
    case "video": if (!module.video_uid) issues.add("video"); if (!value("title")) issues.add("title"); break;
  }
  return [...issues];
}

/**
 * Mức hoàn thiện của cả trang A+ (thanh tiến độ trong trình soạn), 6 tiêu chí:
 * 1. có ít nhất 3 khối;
 * 2. mở đầu bằng banner có chữ hoặc ảnh lớn;
 * 3. mọi khối đủ nội dung (aplusBlockIssues trống, trừ thiếu mô tả ảnh tính ở tiêu chí 4);
 * 4. mọi ảnh có mô tả ảnh;
 * 5. có khối quy trình hoặc đóng gói và container (thông tin người mua B2B hay hỏi);
 * 6. bản tiếng Anh đã dịch đủ, không lệch số liệu so với bản tiếng Việt.
 */
export function aplusCompleteness(modules: readonly AplusModule[]): Array<{ key: "blocks" | "opening" | "complete" | "alt" | "b2b" | "english"; done: boolean }> {
  const issues = modules.map(aplusBlockIssues);
  const englishOk = modules.length > 0 && modules.every((module) => {
    if (aplusNeedsTranslation(module) || aplusTranslationStale(module)) return false;
    const english = aplusModuleText(module);
    // Khối còn trống (vừa thêm từ bộ mẫu) chưa tính là đã có bản tiếng Anh.
    if (module.type !== "video" && !english.some((value) => value.trim())) return false;
    return (module.vi ?? []).every((vi, i) => !vi.trim() || (!!english[i]?.trim() && aplusNumberDrift(vi, english[i]).length === 0));
  });
  return [
    { key: "blocks", done: modules.length >= 3 },
    { key: "opening", done: modules[0]?.type === "hero" || modules[0]?.type === "image" },
    { key: "complete", done: modules.length > 0 && issues.every((list) => list.every((code) => code === "alt")) },
    { key: "alt", done: modules.length > 0 && issues.every((list) => !list.includes("alt") && !list.includes("image")) },
    { key: "b2b", done: modules.some((module) => module.type === "steps" || module.type === "packing") },
    { key: "english", done: englishOk },
  ];
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

/**
 * Chữ có định dạng nhẹ: dòng "- " là gạch đầu dòng, **chữ** là chữ đậm, *chữ* là chữ nghiêng,
 * ***chữ*** là đậm nghiêng; "\\*" là dấu sao thật. Ô soạn (aplus-rich-editor) ghi đúng dạng này.
 */
export type AplusRichRun = { t: string; b?: true; i?: true };
export type AplusRichNode = { kind: "p" | "li"; runs: AplusRichRun[] };
const RICH_MARK = /(\*\*\*|\*\*|\*)(?=\S)((?:\\\*|[^*])*?\S)\1(?!\*)/g;
const unescapeStar = (text: string) => text.replace(/\\\*/g, "*");
function richRuns(line: string): AplusRichRun[] {
  const out: AplusRichRun[] = [];
  let last = 0;
  for (const m of line.matchAll(RICH_MARK)) {
    if (m.index! > 0 && line[m.index! - 1] === "\\") continue;
    if (m.index! > last) out.push({ t: unescapeStar(line.slice(last, m.index)) });
    const level = m[1].length;
    out.push({ t: unescapeStar(m[2]), ...(level >= 2 ? { b: true as const } : {}), ...(level !== 2 ? { i: true as const } : {}) });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push({ t: unescapeStar(line.slice(last)) });
  return out.filter((run) => run.t);
}
export function parseAplusRich(value: string): AplusRichNode[] {
  const nodes: AplusRichNode[] = [];
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) nodes.push({ kind: "p", runs: richRuns(paragraph.join("\n")) }); paragraph = []; };
  for (const raw of value.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^[-•*]\s+/.test(line)) { flush(); nodes.push({ kind: "li", runs: richRuns(line.replace(/^[-•*]\s+/, "")) }); continue; }
    paragraph.push(line);
  }
  flush();
  return nodes.filter((node) => node.runs.some((run) => run.t.trim()));
}

/** Ghi lại chữ có định dạng từ các đoạn/dòng gạch đầu dòng (ngược với parseAplusRich). */
export function serializeAplusRich(nodes: AplusRichNode[]): string {
  const run = (r: AplusRichRun) => {
    const text = r.t.replace(/\*/g, "\\*");
    const mark = r.b && r.i ? "***" : r.b ? "**" : r.i ? "*" : "";
    if (!mark || !text.trim()) return text;
    // Dấu đánh dấu phải sát chữ: khoảng trắng đầu/cuối để ra ngoài.
    const lead = text.match(/^\s*/)![0], trail = text.match(/\s*$/)![0];
    return `${lead}${mark}${text.trim()}${mark}${trail}`;
  };
  const merged = (runs: AplusRichRun[]) => runs.reduce<AplusRichRun[]>((acc, r) => {
    const prev = acc[acc.length - 1];
    if (prev && !prev.b === !r.b && !prev.i === !r.i) prev.t += r.t; else acc.push({ ...r });
    return acc;
  }, []).map(run).join("");
  const out: string[] = [];
  nodes.forEach((node, index) => {
    const text = merged(node.runs);
    if (node.kind === "li") {
      if (index > 0 && nodes[index - 1].kind !== "li") out.push("");
      out.push(`- ${text.replace(/\n/g, " ")}`);
    } else {
      if (index > 0) out.push("");
      out.push(text);
    }
  });
  return out.join("\n").trim();
}
