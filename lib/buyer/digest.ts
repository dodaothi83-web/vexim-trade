/**
 * Thư giới thiệu cho người mua (đợt 2): chọn nội dung từ dữ liệu đã duyệt trên sàn. Tệp thuần để
 * script kiểm tra nạp thẳng bằng Node; phần đọc dữ liệu và gửi thư ở digest-server.ts.
 *
 * - Thư "products" (thứ Ba): nhà cung cấp gói Pro nổi bật (tối đa 2, luân phiên) và sản phẩm mới/cập
 *   nhật trong ngành người mua chọn (tối đa 9, lưới thẻ ảnh 3 cột, gói Pro xếp trước), kèm mùa vụ.
 * - Thư "brief" (thứ Sáu, mức "twice"): một bài blog của Vexim đúng ngành (hoặc bài tin chung), kèm mùa vụ.
 * - Không lặp lại cùng mục với cùng người mua trong 4 tuần (trừ khi vừa cập nhật); không gửi thư rỗng.
 */
export type DigestKind = "products" | "brief";

export type DigestProduct = {
  id: string; name: string; href: string; imagePath: string | null; categoryId: string; supplierId: string; pro: boolean;
  moq: string; leadTime: string; price: string | null; createdAt: string; updatedAt: string;
  /** Dùng cho thư theo hành vi (so sánh sản phẩm đã lưu). */
  certificates?: string[]; imageCount?: number;
};
export type DigestSupplier = { id: string; name: string; href: string; location: string; type: string; products: string; checks: string[]; categoryIds: string[] };
export type DigestPost = { id: string; title: string; href: string; excerpt: string; imageUrl: string | null; publishedAt: string; categoryIds: string[] };
export type HarvestLike = { windows: Array<{ label: string; start_month: number; end_month: number; regions?: string[]; peak?: boolean }> };
export type DigestCategory = { id: string; slug: string; name: string; harvest?: HarvestLike | null };
export type DigestSeason = { categoryId: string; categoryName: string; label: string; months: string; regions: string[]; now: boolean };
export type DigestItem = { type: "product" | "supplier" | "post"; id: string };
/** Lần gần nhất một mục được gửi cho người mua này (ISO). */
export type RecentShown = Map<string, string>;

export const DIGEST_REPEAT_DAYS = 28;
export const DIGEST_NEW_DAYS = 14;
export const DIGEST_UPDATED_DAYS = 7;
export const DIGEST_POST_DAYS = 21;
/** Lưới thẻ ảnh 3 cột trong thư: tối đa 3 hàng. */
export const DIGEST_MAX_PRODUCTS = 9;
export const DIGEST_MAX_FEATURED = 2;
/** Thư sản phẩm cần ít nhất ngần này mục (nhà cung cấp + sản phẩm), không thì bỏ tuần đó. */
export const DIGEST_MIN_ITEMS = 2;
const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const itemKey = (item: DigestItem) => `${item.type}:${item.id}`;

/** Tuần ISO (ví dụ "2026-W50"): mỗi loại thư tối đa một lần mỗi tuần. */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Thứ trong tuần theo giờ Việt Nam (0 = Chủ nhật). */
export const vietnamWeekday = (date: Date) => new Date(date.getTime() + 7 * 3_600_000).getUTCDay();
/** Thư sản phẩm thứ Ba, thư thị trường thứ Sáu (giờ Việt Nam). */
export const DIGEST_DAY: Record<DigestKind, number> = { products: 2, brief: 5 };

const shownRecently = (recent: RecentShown, key: string, now: Date, since?: string) => {
  const last = recent.get(key);
  if (!last) return false;
  if (since && Date.parse(since) > Date.parse(last)) return false; // vừa cập nhật sau lần gửi trước
  return now.getTime() - Date.parse(last) < DIGEST_REPEAT_DAYS * DAY;
};

/** Sản phẩm mới (14 ngày) hoặc vừa cập nhật (7 ngày) trong ngành người mua chọn; gói Pro xếp trước. */
export function pickProducts(categories: string[], products: DigestProduct[], recent: RecentShown, now: Date): Array<DigestProduct & { badge: "NEW" | "UPDATED" }> {
  const out: Array<DigestProduct & { badge: "NEW" | "UPDATED" }> = [];
  for (const p of products) {
    if (!categories.includes(p.categoryId)) continue;
    const isNew = now.getTime() - Date.parse(p.createdAt) <= DIGEST_NEW_DAYS * DAY;
    const isUpdated = !isNew && now.getTime() - Date.parse(p.updatedAt) <= DIGEST_UPDATED_DAYS * DAY;
    if (!isNew && !isUpdated) continue;
    if (shownRecently(recent, itemKey({ type: "product", id: p.id }), now, p.updatedAt)) continue;
    out.push({ ...p, badge: isNew ? "NEW" : "UPDATED" });
  }
  return out.sort((a, b) => Number(b.pro) - Number(a.pro) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, DIGEST_MAX_PRODUCTS);
}

/** Nhà cung cấp gói Pro trong ngành người mua chọn: chưa giới thiệu trong 4 tuần, luân phiên theo tuần. */
export function pickFeatured(categories: string[], suppliers: DigestSupplier[], recent: RecentShown, now: Date): DigestSupplier[] {
  const week = Number(isoWeek(now).slice(-2));
  const fresh = suppliers.filter((s) => s.categoryIds.some((id) => categories.includes(id)) && !shownRecently(recent, itemKey({ type: "supplier", id: s.id }), now))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!fresh.length) return [];
  const start = week % fresh.length;
  return [...fresh.slice(start), ...fresh.slice(0, start)].slice(0, DIGEST_MAX_FEATURED);
}

/**
 * Ngành của một bài blog: ngành nhân viên gắn khi viết; bài chưa gắn thì đoán theo tên ngành xuất hiện
 * trong tiêu đề/nội dung (ví dụ "cashew" → Cashew kernels).
 */
export function postCategories(post: { title: string; excerpt: string; related: string[] }, categories: DigestCategory[]): string[] {
  if (post.related.length) return post.related;
  const text = `${post.title} ${post.excerpt}`.toLowerCase();
  const generic = new Set(["and", "products", "product", "foods", "food", "beverages", "kernels", "grain", "canned"]);
  return categories.filter((c) => c.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !generic.has(w)).some((w) => text.includes(w))).map((c) => c.id);
}

/** Một bài blog: đúng ngành và mới (21 ngày), chưa gửi; không có thì bài tin chung mới nhất chưa gửi. */
export function pickPost(categories: string[], posts: DigestPost[], recent: RecentShown, now: Date): DigestPost | null {
  const fresh = posts.filter((p) => now.getTime() - Date.parse(p.publishedAt) <= DIGEST_POST_DAYS * DAY && !recent.has(itemKey({ type: "post", id: p.id })))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return fresh.find((p) => p.categoryIds.some((id) => categories.includes(id))) ?? fresh.find((p) => !p.categoryIds.length) ?? null;
}

const inWindow = (month: number, start: number, end: number) => start <= end ? month >= start && month <= end : month >= start || month <= end;

/** Mùa vụ: vụ đang diễn ra hoặc bắt đầu trong 30 ngày tới, theo lịch mùa vụ của ngành (đã có trên sàn). */
export function seasonWatch(categories: string[], all: DigestCategory[], now: Date): DigestSeason[] {
  const month = now.getUTCMonth() + 1;
  const next = new Date(now.getTime() + 30 * DAY).getUTCMonth() + 1;
  const out: DigestSeason[] = [];
  for (const c of all) {
    if (!categories.includes(c.id)) continue;
    for (const w of c.harvest?.windows ?? []) {
      if (w.start_month < 1 || w.start_month > 12 || w.end_month < 1 || w.end_month > 12) continue;
      const active = inWindow(month, w.start_month, w.end_month);
      const starting = !active && w.start_month === next;
      if (!active && !starting) continue;
      out.push({ categoryId: c.id, categoryName: c.name, label: w.label, months: w.start_month === w.end_month ? MONTHS[w.start_month - 1] : `${MONTHS[w.start_month - 1]} to ${MONTHS[w.end_month - 1]}`, regions: w.regions ?? [], now: active });
    }
  }
  return out.slice(0, 3);
}

export type ProductsDigest = { kind: "products"; featured: DigestSupplier[]; products: Array<DigestProduct & { badge: "NEW" | "UPDATED" }>; seasons: DigestSeason[]; items: DigestItem[] };
export type BriefDigest = { kind: "brief"; post: DigestPost; seasons: DigestSeason[]; items: DigestItem[] };

/** Thư sản phẩm cho một người mua; null khi chưa đủ nội dung (không gửi thư rỗng). */
export function buildProductsDigest(categories: string[], data: { products: DigestProduct[]; suppliers: DigestSupplier[]; categories: DigestCategory[] }, recent: RecentShown, now: Date): ProductsDigest | null {
  const featured = pickFeatured(categories, data.suppliers, recent, now);
  const products = pickProducts(categories, data.products, recent, now);
  if (featured.length + products.length < DIGEST_MIN_ITEMS) return null;
  return { kind: "products", featured, products, seasons: seasonWatch(categories, data.categories, now),
    items: [...featured.map((s) => ({ type: "supplier" as const, id: s.id })), ...products.map((p) => ({ type: "product" as const, id: p.id }))] };
}

/** Thư thị trường cho một người mua; null khi không có bài phù hợp chưa gửi. */
export function buildBriefDigest(categories: string[], data: { posts: DigestPost[]; categories: DigestCategory[] }, recent: RecentShown, now: Date): BriefDigest | null {
  const post = pickPost(categories, data.posts, recent, now);
  if (!post) return null;
  return { kind: "brief", post, seasons: seasonWatch(categories, data.categories, now), items: [{ type: "post", id: post.id }] };
}
