/**
 * Bố cục trang nhà cung cấp gói Premium/Pro ("Thiết kế trang", bản mẫu duyệt 2026-11-20 ở
 * docs/storefront-designer/index.html).
 *
 * Trang gồm phần đầu cố định do Vexim quản lý (tên, khiên xác minh, nút RFQ; nhà cung cấp chỉ
 * chọn tông màu và câu giới thiệu; một kiểu đầu trang chung cho mọi nhà cung cấp) và danh sách khối sắp xếp được: banner, năng lực sản
 * xuất, sản phẩm nổi bật, ảnh kèm chữ, thị trường xuất khẩu.
 *
 * Nhà cung cấp (hoặc nhân viên Vexim thiết kế hộ khi đã ghi nhận đồng ý) sửa bản nháp
 * `storefront_layout_draft`; bấm Áp dụng thì bản nháp thành `storefront_layout`, người mua
 * mới thấy. Chữ viết bằng tiếng Anh, không có thông tin liên hệ. Số liệu và thị trường lấy
 * từ hồ sơ, không nhập tay.
 *
 * Ảnh dùng chung thư mục ảnh khối nội dung cũ: `suppliers/<supplierId>/showcase-<uuid>.<ext>`.
 *
 * Tệp chỉ import tệp thuần để script kiểm tra nạp thẳng bằng Node.
 */
import {
  STOREFRONT_MAX_STATS, STOREFRONT_STATS, STOREFRONT_TAGLINE_MAX, STOREFRONT_TONES,
  normalizeStorefrontTheme, type StorefrontStat, type StorefrontTone,
} from "./storefront-theme.ts";
import { normalizeShowcaseBlocks, showcaseHasContact } from "./supplier-showcase.ts";
import { looksVietnamese } from "./vietnamese-text.ts";

export const LAYOUT_BLOCK_TYPES = ["banner", "stats", "products", "about", "markets", "video", "categories", "certificates", "company", "checks", "trade", "details", "gallery", "text"] as const;
/** Khối mục (lấy từ hồ sơ hoặc có bố cục riêng); "text" là đoạn văn tự do của trình soạn. */
export const SECTION_BLOCK_TYPES = LAYOUT_BLOCK_TYPES.filter((type) => type !== "text");
/**
 * Các mục chung của trang (giới thiệu, xác minh, điều kiện giao dịch, thư viện ảnh) thành khối
 * sắp xếp được (chủ sàn yêu cầu 2026-11-20). "checks" (xác minh của Vexim) là khối bắt buộc:
 * luôn hiện, chỉ đổi vị trí, không ẩn hay xoá được.
 */
export const REQUIRED_BLOCKS: readonly LayoutBlockType[] = ["checks"];
/** Phiên bản bố cục; bố cục cũ (chưa có các mục chung thành khối) được thêm khối mặc định khi đọc. */
export const LAYOUT_VERSION = 2;
/** Khối chỉ gói Pro (giai đoạn 2, theo bản mẫu duyệt 2026-11-20). */
export const PRO_ONLY_BLOCKS: readonly LayoutBlockType[] = ["video", "categories"];
export const VIDEO_TITLE_MAX = 120;
export type LayoutBlockType = (typeof LAYOUT_BLOCK_TYPES)[number];

/** Tối đa khối trên trang (đoạn văn tự do giữa các mục cũng tính là khối). */
export const LAYOUT_MAX_BLOCKS = 30;
export const LAYOUT_MAX_ABOUT = 6;
export const BANNER_MAX_IMAGES = 3;
export const GALLERY_MAX_IMAGES = 12;
export const COMPANY_MAX_IMAGES = 3;
export const BANNER_EYEBROW_MAX = 60;
export const BANNER_HEADLINE_MAX = 120;
export const FEATURED_MAX_PRODUCTS = 8;
export const ABOUT_TITLE_MAX = 80;
export const ABOUT_BODY_MAX = 600;
/**
 * Đoạn văn tự do (trình soạn kiểu Notion, chủ sàn chốt 2026-11-20): đoạn văn, tiêu đề H2/H3,
 * danh sách, ảnh kèm chú thích. Chỉ chữ đậm, nghiêng; không link, không màu, không cỡ chữ, để
 * trang thống nhất và HTML sạch cho SEO.
 */
export const TEXT_NODE_KINDS = ["p", "h2", "h3", "ul", "ol", "img"] as const;
export const TEXT_MAX_NODES = 60;
export const TEXT_MAX_CHARS = 5000;
export const TEXT_MAX_IMAGES = 6;
export const TEXT_CAPTION_MAX = 140;
export type TextRun = { t: string; b?: true; i?: true };
export type TextNode =
  | { kind: "p" | "h2" | "h3" | "ul" | "ol"; runs: TextRun[] }
  | { kind: "img"; path: string; caption: string };

export type LayoutBlock =
  | { id: string; type: "banner"; hidden?: boolean; images: string[]; eyebrow: string; headline: string }
  | { id: string; type: "stats"; hidden?: boolean; stats: StorefrontStat[] }
  | { id: string; type: "products"; hidden?: boolean; product_ids: string[] }
  | { id: string; type: "about"; hidden?: boolean; image_path: string; title: string; body: string }
  | { id: string; type: "markets"; hidden?: boolean }
  /** Video nhà máy (Cloudflare Stream); thời lượng, ngày tải lên do máy chủ lấy từ Cloudflare. */
  | { id: string; type: "video"; hidden?: boolean; video_uid: string; title: string; duration?: number; uploaded_at?: string }
  /** Nhóm sản phẩm đang đăng theo danh mục, tự dựng từ sản phẩm. */
  | { id: string; type: "categories"; hidden?: boolean }
  /** Chứng nhận Vexim đã kiểm tra, còn hiệu lực; tự lấy, không nhập tay. */
  | { id: string; type: "certificates"; hidden?: boolean }
  /** Giới thiệu và chi tiết kinh doanh, lấy từ hồ sơ. */
  | {
    id: string; type: "company"; hidden?: boolean;
    /** Ảnh giới thiệu (tối đa 3, gói Premium/Pro). */
    images?: string[];
    /** Video giới thiệu (gói Pro), giống khối Video nhà máy. */
    video_uid?: string; video_title?: string; duration?: number; uploaded_at?: string;
  }
  /** Xác minh của Vexim (bắt buộc, không ẩn). */
  | { id: string; type: "checks"; hidden?: boolean }
  /** Điều kiện giao dịch và nút gửi yêu cầu qua Vexim. */
  | { id: string; type: "trade"; hidden?: boolean }
  /** Thông tin công ty: tên pháp lý, địa chỉ đăng ký lấy từ hồ sơ Vexim giữ. */
  | { id: string; type: "details"; hidden?: boolean }
  /**
   * Thư viện ảnh: ảnh nhà cung cấp tự tải trong "Thiết kế trang" (tối đa 12). Chưa có ảnh riêng
   * thì hiện ảnh công ty Vexim đã chia sẻ cho người mua.
   */
  | { id: string; type: "gallery"; hidden?: boolean; images?: string[] }
  /** Đoạn văn tự do viết bằng trình soạn. */
  | { id: string; type: "text"; hidden?: boolean; nodes: TextNode[] };

export interface StorefrontLayout {
  /** 2: các mục chung đã là khối. Thiếu thì là bố cục cũ. */
  v?: number;
  tone: StorefrontTone;
  tagline: string;
  blocks: LayoutBlock[];
}

export type LayoutProblem =
  | { code: "invalid"; index: number }
  | { code: "tooMany" }
  | { code: "duplicate"; index: number }
  | { code: "imageRequired"; index: number }
  | { code: "titleRequired"; index: number }
  | { code: "productsRequired"; index: number }
  | { code: "tooLong"; index: number }
  | { code: "contact"; index: number }
  | { code: "language"; index: number }
  | { code: "tagline" }
  | { code: "plan"; index: number }
  | { code: "video"; index: number };

const ID = /^[a-z0-9-]{6,40}$/i;
const PRODUCT_ID = /^[a-z0-9-]{8,64}$/i;

/** Ảnh trang của đúng nhà cung cấp này (chung thư mục với ảnh khối nội dung cũ). */
export function isLayoutImagePath(path: unknown, supplierId: string): path is string {
  if (typeof path !== "string") return false;
  const prefix = `suppliers/${supplierId}/showcase-`;
  return path.startsWith(prefix) && !path.includes("..") && /^[a-f0-9-]{20,}\.(jpe?g|png|webp)$/i.test(path.slice(prefix.length));
}

const text = (value: unknown) => typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

/**
 * Chuẩn hoá và kiểm tra bố cục trước khi lưu. `productIds` là sản phẩm của chính nhà cung cấp
 * (sản phẩm nổi bật chỉ chọn trong danh sách này).
 */
export function validateStorefrontLayout(raw: unknown, ctx: { supplierId: string; productIds: ReadonlySet<string>; pro?: boolean; ensureChecks?: boolean }):
  { ok: true; layout: StorefrontLayout } | { ok: false; problem: LayoutProblem } {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  if (!value || !Array.isArray(value.blocks)) return { ok: false, problem: { code: "invalid", index: 0 } };
  if (value.blocks.length > LAYOUT_MAX_BLOCKS) return { ok: false, problem: { code: "tooMany" } };
  const tagline = text(value.tagline);
  if (tagline.length > STOREFRONT_TAGLINE_MAX || (tagline && (showcaseHasContact(tagline) || looksVietnamese(tagline)))) return { ok: false, problem: { code: "tagline" } };
  const blocks: LayoutBlock[] = [];
  const seenIds = new Set<string>();
  const seenTypes = new Set<LayoutBlockType>();
  let aboutCount = 0;
  for (let index = 0; index < value.blocks.length; index++) {
    const item = value.blocks[index] as Record<string, unknown> | null;
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !ID.test(item.id) || seenIds.has(item.id) || !isOneOf(LAYOUT_BLOCK_TYPES, item.type))
      return { ok: false, problem: { code: "invalid", index } };
    seenIds.add(item.id);
    const type = item.type;
    if (type === "about") { if (++aboutCount > LAYOUT_MAX_ABOUT) return { ok: false, problem: { code: "tooMany" } }; }
    else if (type !== "text" && seenTypes.has(type)) return { ok: false, problem: { code: "duplicate", index } };
    seenTypes.add(type);
    if (ctx.pro === false && PRO_ONLY_BLOCKS.includes(type)) return { ok: false, problem: { code: "plan", index } };
    const hidden = item.hidden === true ? { hidden: true as const } : {};
    let block: LayoutBlock;
    let strings: Array<[string, number]> = [];
    switch (type) {
      case "banner": {
        const images = Array.isArray(item.images) ? item.images.filter((path) => isLayoutImagePath(path, ctx.supplierId)) as string[] : [];
        if (!images.length || images.length > BANNER_MAX_IMAGES || images.length !== (item.images as unknown[]).length)
          return { ok: false, problem: { code: "imageRequired", index } };
        block = { id: item.id, type, ...hidden, images: [...new Set(images)], eyebrow: text(item.eyebrow), headline: text(item.headline) };
        strings = [[block.eyebrow, BANNER_EYEBROW_MAX], [block.headline, BANNER_HEADLINE_MAX]];
        break;
      }
      case "stats": {
        const stats = Array.isArray(item.stats) ? [...new Set(item.stats.filter((stat): stat is StorefrontStat => isOneOf(STOREFRONT_STATS, stat)))] : [];
        if (!stats.length || stats.length > STOREFRONT_MAX_STATS) return { ok: false, problem: { code: "invalid", index } };
        block = { id: item.id, type, ...hidden, stats };
        break;
      }
      case "products": {
        const ids = Array.isArray(item.product_ids) ? [...new Set(item.product_ids.filter((id): id is string => typeof id === "string" && PRODUCT_ID.test(id) && ctx.productIds.has(id)))] : [];
        if (!ids.length || ids.length > FEATURED_MAX_PRODUCTS) return { ok: false, problem: { code: "productsRequired", index } };
        block = { id: item.id, type, ...hidden, product_ids: ids };
        break;
      }
      case "about": {
        if (!isLayoutImagePath(item.image_path, ctx.supplierId)) return { ok: false, problem: { code: "imageRequired", index } };
        block = { id: item.id, type, ...hidden, image_path: item.image_path, title: text(item.title), body: text(item.body) };
        if (!block.title) return { ok: false, problem: { code: "titleRequired", index } };
        strings = [[block.title, ABOUT_TITLE_MAX], [block.body, ABOUT_BODY_MAX]];
        break;
      }
      case "markets":
      case "categories":
      case "certificates":
        block = { id: item.id, type, ...hidden };
        break;
      case "company": {
        const raw = Array.isArray(item.images) ? item.images : [];
        const images = raw.filter((path) => isLayoutImagePath(path, ctx.supplierId)) as string[];
        if (images.length !== raw.length || images.length > COMPANY_MAX_IMAGES) return { ok: false, problem: { code: "imageRequired", index } };
        const company: Extract<LayoutBlock, { type: "company" }> = { id: item.id, type, ...hidden, ...(images.length ? { images: [...new Set(images)] } : {}) };
        if (item.video_uid !== undefined && item.video_uid !== "") {
          if (typeof item.video_uid !== "string" || !/^[a-f0-9]{32}$/i.test(item.video_uid)) return { ok: false, problem: { code: "video", index } };
          if (ctx.pro === false) return { ok: false, problem: { code: "plan", index } };
          company.video_uid = item.video_uid.toLowerCase();
          company.video_title = text(item.video_title);
          if (typeof item.duration === "number" && Number.isFinite(item.duration) && item.duration > 0 && item.duration <= 86400) company.duration = Math.round(item.duration);
          if (typeof item.uploaded_at === "string" && !Number.isNaN(Date.parse(item.uploaded_at))) company.uploaded_at = new Date(item.uploaded_at).toISOString();
          strings = [[company.video_title ?? "", VIDEO_TITLE_MAX]];
        }
        block = company;
        break;
      }
      case "trade":
      case "details":
        block = { id: item.id, type, ...hidden };
        break;
      case "gallery": {
        const raw = Array.isArray(item.images) ? item.images : [];
        const images = raw.filter((path) => isLayoutImagePath(path, ctx.supplierId)) as string[];
        if (images.length !== raw.length || images.length > GALLERY_MAX_IMAGES) return { ok: false, problem: { code: "imageRequired", index } };
        block = { id: item.id, type, ...hidden, ...(images.length ? { images: [...new Set(images)] } : {}) };
        break;
      }
      case "checks":
        block = { id: item.id, type };
        break;
      case "text": {
        const nodes = readTextNodes(item.nodes, ctx.supplierId);
        if (!nodes) return { ok: false, problem: { code: "invalid", index } };
        if (nodes.filter((node) => node.kind === "img").length > TEXT_MAX_IMAGES) return { ok: false, problem: { code: "tooMany" } };
        const captions = nodes.flatMap((node) => node.kind === "img" ? [node.caption] : []);
        if (captions.some((caption) => caption.length > TEXT_CAPTION_MAX)) return { ok: false, problem: { code: "tooLong", index } };
        const body = textNodesPlain(nodes);
        if (body.length > TEXT_MAX_CHARS) return { ok: false, problem: { code: "tooLong", index } };
        block = { id: item.id, type, ...hidden, nodes };
        strings = [[body, TEXT_MAX_CHARS]];
        break;
      }
      case "video": {
        if (typeof item.video_uid !== "string" || !/^[a-f0-9]{32}$/i.test(item.video_uid)) return { ok: false, problem: { code: "video", index } };
        const video: LayoutBlock = { id: item.id, type, ...hidden, video_uid: item.video_uid.toLowerCase(), title: text(item.title) };
        if (typeof item.duration === "number" && Number.isFinite(item.duration) && item.duration > 0 && item.duration <= 86400) video.duration = Math.round(item.duration);
        if (typeof item.uploaded_at === "string" && !Number.isNaN(Date.parse(item.uploaded_at))) video.uploaded_at = new Date(item.uploaded_at).toISOString();
        block = video;
        strings = [[video.title, VIDEO_TITLE_MAX]];
        break;
      }
    }
    if (strings.some(([value, max]) => value.length > max)) return { ok: false, problem: { code: "tooLong", index } };
    const joined = strings.map(([value]) => value).join(" ").trim();
    if (joined && showcaseHasContact(joined)) return { ok: false, problem: { code: "contact", index } };
    if (joined && looksVietnamese(joined)) return { ok: false, problem: { code: "language", index } };
    blocks.push(block);
  }
  if (ctx.ensureChecks !== false && !blocks.some((block) => block.type === "checks")) blocks.push({ id: "b-checks", type: "checks" });
  return {
    ok: true,
    layout: {
      v: LAYOUT_VERSION,
      tone: isOneOf(STOREFRONT_TONES, value.tone) ? value.tone : "champagne",
      tagline,
      blocks,
    },
  };
}

/**
 * Đọc bố cục đã lưu (bản nháp hoặc bản đang hiện). Khối hỏng bị bỏ thay vì làm hỏng cả trang;
 * sản phẩm không còn thuộc nhà cung cấp được lọc lúc hiển thị.
 */
export function readStorefrontLayout(raw: unknown, supplierId: string): StorefrontLayout | null {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  if (!value || !Array.isArray(value.blocks)) return null;
  const blocks: LayoutBlock[] = [];
  const allIds = new Set(value.blocks.flatMap((b) => b && typeof b === "object" && Array.isArray((b as { product_ids?: unknown }).product_ids)
    ? ((b as { product_ids: unknown[] }).product_ids.filter((id): id is string => typeof id === "string")) : []));
  for (const item of value.blocks.slice(0, LAYOUT_MAX_BLOCKS)) {
    const checked = validateStorefrontLayout({ ...value, tagline: "", blocks: [...blocks, item] }, { supplierId, productIds: allIds, ensureChecks: false });
    if (checked.ok) blocks.push(checked.layout.blocks.at(-1)!);
  }
  // Bố cục cũ: các mục chung từng nằm cố định dưới các khối; thêm vào cuối để không mất nội dung.
  if (value.v !== LAYOUT_VERSION) for (const block of defaultCommonBlocks()) if (!blocks.some((b) => b.type === block.type)) blocks.push(block);
  if (!blocks.some((block) => block.type === "checks")) blocks.push({ id: "b-checks", type: "checks" });
  const tagline = text(value.tagline);
  return {
    v: LAYOUT_VERSION,
    tone: isOneOf(STOREFRONT_TONES, value.tone) ? value.tone : "champagne",
    tagline: tagline.length <= STOREFRONT_TAGLINE_MAX && !showcaseHasContact(tagline) && !looksVietnamese(tagline) ? tagline : "",
    blocks,
  };
}

/** Các mục chung mặc định, theo thứ tự trang cũ: giới thiệu, xác minh, chứng nhận, thư viện ảnh, giao dịch. */
export function defaultCommonBlocks(): LayoutBlock[] {
  return [
    { id: "b-company", type: "company" }, { id: "b-checks", type: "checks" }, { id: "b-certificates", type: "certificates" },
    { id: "b-gallery", type: "gallery" }, { id: "b-trade", type: "trade" }, { id: "b-details", type: "details" },
  ];
}

/** Mã video Cloudflare trong bố cục. */
export function layoutVideoUids(layout: StorefrontLayout | null): string[] {
  if (!layout) return [];
  return layout.blocks.flatMap((block) => block.type === "video" ? [block.video_uid] : block.type === "company" && block.video_uid ? [block.video_uid] : []);
}

/** Bỏ khối chỉ dành cho gói Pro khi gói hiện tại không phải Pro (gói hạ thì khối ẩn, không xoá). */
export function layoutForPlan(layout: StorefrontLayout, pro: boolean): StorefrontLayout {
  if (pro) return layout;
  return { ...layout, blocks: layout.blocks.filter((block) => !PRO_ONLY_BLOCKS.includes(block.type)).map((block) => {
    if (block.type !== "company" || !block.video_uid) return block;
    // Video giới thiệu là quyền gói Pro: gói hạ thì ẩn video, giữ ảnh và chữ.
    const { video_uid: _uid, video_title: _title, duration: _d, uploaded_at: _u, ...rest } = block;
    void _uid; void _title; void _d; void _u;
    return rest;
  }) };
}

/**
 * Đọc danh sách đoạn của khối văn bản: bỏ kiểu không cho phép, gộp chữ trống. Ảnh phải là ảnh của
 * đúng nhà cung cấp; ảnh lạ làm cả khối hỏng (null) thay vì âm thầm bỏ.
 */
export function readTextNodes(raw: unknown, supplierId: string): TextNode[] | null {
  if (!Array.isArray(raw) || raw.length > TEXT_MAX_NODES) return null;
  const nodes: TextNode[] = [];
  for (const item of raw) {
    const node = item && typeof item === "object" ? item as Record<string, unknown> : null;
    if (!node || !isOneOf(TEXT_NODE_KINDS, node.kind)) return null;
    if (node.kind === "img") {
      if (!isLayoutImagePath(node.path, supplierId)) return null;
      nodes.push({ kind: "img", path: node.path, caption: text(node.caption).replace(/\s+/g, " ") });
      continue;
    }
    const runs: TextRun[] = (Array.isArray(node.runs) ? node.runs : []).flatMap((run) => {
      const r = run && typeof run === "object" ? run as Record<string, unknown> : null;
      if (!r || typeof r.t !== "string" || !r.t) return [];
      return [{ t: r.t.replace(/\r\n?/g, "\n").slice(0, TEXT_MAX_CHARS), ...(r.b === true ? { b: true as const } : {}), ...(r.i === true ? { i: true as const } : {}) }];
    });
    if (!runs.some((run) => run.t.trim())) continue;
    nodes.push({ kind: node.kind, runs });
  }
  return nodes.length ? nodes : null;
}

/** Chữ thuần của khối văn bản (kiểm tra độ dài, tiếng Anh, thông tin liên hệ; mô tả SEO). */
export function textNodesPlain(nodes: TextNode[]): string {
  return nodes.map((node) => node.kind === "img" ? node.caption : node.runs.map((run) => run.t).join("")).filter(Boolean).join("\n").trim();
}

/** Mọi ảnh bố cục đang dùng. */
export function layoutImagePaths(layout: StorefrontLayout | null): string[] {
  if (!layout) return [];
  return layout.blocks.flatMap((block) => block.type === "banner" ? block.images : block.type === "about" ? [block.image_path]
    : block.type === "gallery" || block.type === "company" ? block.images ?? []
      : block.type === "text" ? block.nodes.flatMap((node) => node.kind === "img" ? [node.path] : []) : []);
}

export function newLayoutBlockId(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `b-${random}`.slice(0, 40);
}

export interface ProfileLayoutInput {
  supplierId: string;
  theme: unknown;
  showcase: unknown;
  /** Sản phẩm đang công khai, theo thứ tự ưu tiên hiển thị. */
  productIds: string[];
  /** Có số liệu (giá trị khác rỗng) cho từng loại; quyết định khối Năng lực. */
  statValues: Partial<Record<StorefrontStat, string>>;
  hasMarkets: boolean;
  /** Có chứng nhận Vexim đã kiểm tra, còn hiệu lực. */
  hasCertificates?: boolean;
  /** Có ảnh nhà cung cấp chia sẻ cho người mua. */
  hasGallery?: boolean;
  /** Gói Pro và sản phẩm thuộc từ 2 danh mục trở lên: thêm khối Nhóm sản phẩm. */
  categoryGroups?: boolean;
  province: string;
  foundedYear: number | null;
}

/**
 * "Tạo nhanh từ hồ sơ": dựng bố cục từ dữ liệu sẵn có. Không bịa nội dung: chỉ dùng ảnh và chữ
 * nhà cung cấp đã có (khối nội dung cũ, câu giới thiệu), số liệu và thị trường lấy từ hồ sơ.
 */
export function buildLayoutFromProfile(input: ProfileLayoutInput): StorefrontLayout {
  const theme = normalizeStorefrontTheme(input.theme);
  const showcase = normalizeShowcaseBlocks(input.showcase)
    .filter((block) => isLayoutImagePath(block.image_path, input.supplierId) && !looksVietnamese(`${block.title} ${block.body}`) && !showcaseHasContact(`${block.title} ${block.body}`));
  const tagline = theme.tagline && !looksVietnamese(theme.tagline) && !showcaseHasContact(theme.tagline) ? theme.tagline : "";
  const blocks: LayoutBlock[] = [];
  if (showcase.length) {
    const eyebrow = [input.province, input.foundedYear ? `Since ${input.foundedYear}` : ""].filter(Boolean).join(" · ").slice(0, BANNER_EYEBROW_MAX);
    blocks.push({ id: newLayoutBlockId(), type: "banner", images: showcase.slice(0, BANNER_MAX_IMAGES).map((block) => block.image_path),
      eyebrow: looksVietnamese(eyebrow) ? "" : eyebrow, headline: tagline.slice(0, BANNER_HEADLINE_MAX) });
  }
  const stats = (theme.stats.length ? theme.stats : STOREFRONT_STATS).filter((stat) => input.statValues[stat]);
  const fallbackStats = STOREFRONT_STATS.filter((stat) => input.statValues[stat] && !stats.includes(stat));
  const chosenStats = [...stats, ...fallbackStats].slice(0, STOREFRONT_MAX_STATS);
  if (chosenStats.length) blocks.push({ id: newLayoutBlockId(), type: "stats", stats: chosenStats });
  if (input.productIds.length) blocks.push({ id: newLayoutBlockId(), type: "products", product_ids: input.productIds.slice(0, 4) });
  for (const block of showcase.slice(0, LAYOUT_MAX_ABOUT))
    blocks.push({ id: newLayoutBlockId(), type: "about", image_path: block.image_path, title: block.title.slice(0, ABOUT_TITLE_MAX), body: block.body.slice(0, ABOUT_BODY_MAX) });
  if (input.categoryGroups) blocks.push({ id: newLayoutBlockId(), type: "categories" });
  if (input.hasMarkets) blocks.push({ id: newLayoutBlockId(), type: "markets" });
  // Các mục chung: giới thiệu, xác minh (bắt buộc), chứng nhận, thư viện ảnh, điều kiện giao dịch.
  blocks.push({ id: newLayoutBlockId(), type: "company" }, { id: newLayoutBlockId(), type: "checks" });
  if (input.hasCertificates) blocks.push({ id: newLayoutBlockId(), type: "certificates" });
  if (input.hasGallery) blocks.push({ id: newLayoutBlockId(), type: "gallery" });
  blocks.push({ id: newLayoutBlockId(), type: "trade" }, { id: newLayoutBlockId(), type: "details" });
  return { v: LAYOUT_VERSION, tone: theme.tone, tagline, blocks };
}
