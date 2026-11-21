/**
 * Thư theo hành vi của người mua: chọn nội dung từ việc chính người mua đã làm trên sàn.
 * Tệp thuần (không import) để script kiểm tra nạp thẳng; đọc dữ liệu và gửi thư ở alerts-server.ts.
 *
 * Bốn loại, gộp chung một thư mỗi ngày:
 * 1. saved:  sản phẩm người mua đã lưu vừa đổi giá, MOQ, thời gian giao, thêm chứng nhận hoặc ảnh.
 * 2. new:    nhà cung cấp người mua đã lưu sản phẩm hoặc gửi RFQ vừa đăng sản phẩm mới (7 ngày).
 * 3. rfq:    RFQ gửi được 3 đến 14 ngày mà chưa có báo giá: báo Vexim đang ghép, gợi ý nhà cung cấp cùng ngành.
 * 4. season: ngành người mua chọn bắt đầu mùa thu hoạch trong tháng này.
 *
 * Giới hạn chung với thư hằng tuần: tối đa 1 thư mỗi ngày (giờ Việt Nam) và 4 thư trong 7 ngày.
 * Mục chưa gửi được vì giới hạn vẫn còn đó và đi vào lần gửi sau.
 */
import type { DigestCategory, DigestProduct, DigestSupplier } from "./digest";

export const ALERT_MAX_PER_WEEK = 4;
export const ALERT_NEW_DAYS = 7;
export const ALERT_RFQ_MIN_DAYS = 3;
export const ALERT_RFQ_MAX_DAYS = 14;
export const ALERT_MAX_SAVED = 5;
export const ALERT_MAX_NEW = 6;
export const ALERT_MAX_SUGGESTIONS = 3;
const DAY = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type AlertSnapshot = { price: string | null; moq: string; leadTime: string; certificates: string[]; images: number };
export type AlertItem = { type: "saved" | "new" | "rfq" | "season"; id: string };
export type SavedChange = { product: DigestProduct; changes: string[]; snapshot: AlertSnapshot };
export type RfqFollowUp = { id: string; code: string; product: string; sentAt: string; href: string; categoryName: string | null; suppliers: DigestSupplier[] };
export type SeasonStart = { category: DigestCategory; label: string; months: string; regions: string[]; products: DigestProduct[]; key: string };
export type BuyerAlerts = {
  saved: SavedChange[];
  fresh: DigestProduct[];
  rfqs: RfqFollowUp[];
  seasons: SeasonStart[];
  items: AlertItem[];
};

export const alertKey = (item: AlertItem) => `${item.type}:${item.id}`;

/** Ngày theo giờ Việt Nam, ví dụ "2026-11-24". */
export const vietnamDay = (date: Date) => new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export function snapshotOf(p: DigestProduct): AlertSnapshot {
  return { price: p.price ?? null, moq: p.moq, leadTime: p.leadTime, certificates: [...(p.certificates ?? [])].sort(), images: p.imageCount ?? 0 };
}

/** Chuỗi so sánh ổn định: trùng nhau nghĩa là không có gì mới. */
export const snapshotSignature = (s: AlertSnapshot) => JSON.stringify([s.price, s.moq, s.leadTime, s.certificates, s.images]);

/** Mô tả thay đổi bằng câu ngắn cho người mua. Chỉ nêu điều có lợi cho quyết định mua; bớt ảnh thì không báo. */
export function describeChanges(before: AlertSnapshot, after: AlertSnapshot): string[] {
  const out: string[] = [];
  if (before.price !== after.price && after.price) out.push(`Price is now ${after.price}`);
  if (before.moq !== after.moq && after.moq) out.push(`Minimum order is now ${after.moq}`);
  if (before.leadTime !== after.leadTime && after.leadTime) out.push(`Lead time is now ${after.leadTime}`);
  const added = after.certificates.filter((c) => !before.certificates.includes(c));
  if (added.length) out.push(`New certificate: ${added.join(", ")}`);
  const photos = after.images - before.images;
  if (photos > 0) out.push(photos === 1 ? "1 new photo" : `${photos} new photos`);
  return out;
}

/** Còn được gửi hôm nay không: chưa có thư nào hôm nay (giờ Việt Nam) và dưới 4 thư trong 7 ngày. */
export function capAllows(sentAt: readonly string[], now: Date): boolean {
  const today = vietnamDay(now);
  if (sentAt.some((at) => vietnamDay(new Date(at)) === today)) return false;
  return sentAt.filter((at) => now.getTime() - Date.parse(at) < 7 * DAY).length < ALERT_MAX_PER_WEEK;
}

export type AlertInput = {
  now: Date;
  /** Người mua đồng ý nhận giới thiệu: mới nhận loại 1, 2, 4. Loại 3 gắn với RFQ của chính họ. */
  consented: boolean;
  categories: string[];
  allCategories: DigestCategory[];
  products: DigestProduct[];
  directory: DigestSupplier[];
  parentOf: Record<string, string>;
  /** Sản phẩm đã lưu kèm ảnh chụp lần trước (null: chưa có, lần này chỉ ghi mốc). */
  saved: Array<{ id: string; before: AlertSnapshot | null }>;
  /** Nhà cung cấp người mua quan tâm (đã lưu sản phẩm hoặc gửi RFQ). */
  followedSuppliers: string[];
  rfqs: Array<{ id: string; code: string; product: string; createdAt: string; categoryId: string | null; preferredSupplierIds: string[]; open: boolean; hasQuote: boolean }>;
  /** Khoá đã gửi trước đây (alertKey). */
  sent: ReadonlySet<string>;
};

export function buildAlerts(input: AlertInput): BuyerAlerts | null {
  const { now, sent } = input;
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const savedIds = new Set(input.saved.map((s) => s.id));
  const items: AlertItem[] = [];

  const saved: SavedChange[] = [];
  if (input.consented) {
    for (const entry of input.saved) {
      const product = byId.get(entry.id);
      if (!product || !entry.before) continue;
      const snapshot = snapshotOf(product);
      const changes = describeChanges(entry.before, snapshot);
      if (!changes.length) continue;
      saved.push({ product, changes, snapshot });
      if (saved.length >= ALERT_MAX_SAVED) break;
    }
    for (const s of saved) items.push({ type: "saved", id: `${s.product.id}:${hash(snapshotSignature(s.snapshot))}` });
  }

  const fresh: DigestProduct[] = [];
  if (input.consented && input.followedSuppliers.length) {
    const followed = new Set(input.followedSuppliers);
    for (const p of [...input.products].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
      if (!followed.has(p.supplierId) || savedIds.has(p.id)) continue;
      if (now.getTime() - Date.parse(p.createdAt) > ALERT_NEW_DAYS * DAY) continue;
      if (sent.has(alertKey({ type: "new", id: p.id }))) continue;
      fresh.push(p);
      if (fresh.length >= ALERT_MAX_NEW) break;
    }
    for (const p of fresh) items.push({ type: "new", id: p.id });
  }

  const names = new Map(input.allCategories.map((c) => [c.id, c.name]));
  const rfqs: RfqFollowUp[] = [];
  for (const r of input.rfqs) {
    const age = now.getTime() - Date.parse(r.createdAt);
    if (!r.open || r.hasQuote || age < ALERT_RFQ_MIN_DAYS * DAY || age > ALERT_RFQ_MAX_DAYS * DAY) continue;
    if (sent.has(alertKey({ type: "rfq", id: r.id }))) continue;
    const top = r.categoryId ? (input.parentOf[r.categoryId] ?? r.categoryId) : null;
    const suppliers = top ? input.directory
      .filter((s) => s.categoryIds.includes(top) && !r.preferredSupplierIds.includes(s.id))
      .sort((a, b) => b.checks.length - a.checks.length || a.name.localeCompare(b.name))
      .slice(0, ALERT_MAX_SUGGESTIONS) : [];
    rfqs.push({ id: r.id, code: r.code, product: r.product, sentAt: r.createdAt, href: `/buyer/account/requests/${encodeURIComponent(r.id)}`,
      categoryName: top ? names.get(top) ?? null : null, suppliers });
    items.push({ type: "rfq", id: r.id });
  }

  const seasons: SeasonStart[] = [];
  if (input.consented) {
    const month = new Date(now.getTime() + 7 * 3_600_000).getUTCMonth() + 1;
    const year = new Date(now.getTime() + 7 * 3_600_000).getUTCFullYear();
    for (const c of input.allCategories) {
      if (!input.categories.includes(c.id)) continue;
      for (const w of c.harvest?.windows ?? []) {
        if (w.start_month !== month) continue;
        const key = `${c.id}:${year}-${month}:${w.label}`;
        if (sent.has(alertKey({ type: "season", id: key }))) continue;
        const months = w.start_month === w.end_month ? MONTHS[w.start_month - 1] : `${MONTHS[w.start_month - 1]} to ${MONTHS[w.end_month - 1]}`;
        const products = input.products.filter((p) => p.categoryId === c.id)
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 3);
        seasons.push({ category: c, label: w.label, months, regions: w.regions ?? [], products, key });
        items.push({ type: "season", id: key });
      }
    }
  }

  return items.length ? { saved, fresh, rfqs, seasons, items } : null;
}

/** Băm ngắn (FNV-1a) để khoá "saved" đổi khi sản phẩm đổi lần nữa. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
