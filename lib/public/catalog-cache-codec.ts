import { gunzipSync, gzipSync } from "node:zlib";

/**
 * Đóng gói dữ liệu catalogue công khai trước khi lưu vào cache dùng chung (unstable_cache).
 *
 * Vercel không lưu mục cache lớn hơn 2 MB và không báo lỗi; khi đó mỗi lượt xem trang danh
 * mục, sản phẩm, tìm kiếm phải đọc lại toàn bộ nhà cung cấp và sản phẩm từ Supabase. Để mục
 * cache luôn nhỏ:
 * 1. Bỏ các trường chỉ trang chi tiết sản phẩm dùng (trang đó đọc thẳng `store.getProduct`).
 * 2. Thẻ nhà cung cấp chỉ giữ id sản phẩm chính thay vì chép lại cả sản phẩm.
 * 3. Nén gzip rồi lưu dạng chuỗi base64.
 *
 * Mở gói trả lại đúng dữ liệu cũ (trừ các trường ở bước 1), nên trang hiển thị y như trước.
 */

/** Chỉ trang chi tiết sản phẩm đọc các trường này, và trang đó không lấy sản phẩm từ cache. */
export const CACHE_DROPPED_PRODUCT_FIELDS = ["description_detail", "description_detail_i18n", "aplus_content"] as const;

const PREFIX = "gz1:";

export function slimCachedProduct<T extends object>(product: T): T {
  const copy = { ...product } as Record<string, unknown>;
  for (const field of CACHE_DROPPED_PRODUCT_FIELDS) delete copy[field];
  return copy as T;
}

export function encodeCachePayload(value: unknown): string {
  return PREFIX + gzipSync(Buffer.from(JSON.stringify(value), "utf8")).toString("base64");
}

export function decodeCachePayload<T>(payload: string): T {
  if (typeof payload !== "string" || !payload.startsWith(PREFIX)) throw new Error("Unknown catalogue cache payload");
  return JSON.parse(gunzipSync(Buffer.from(payload.slice(PREFIX.length), "base64")).toString("utf8")) as T;
}

type ProductLike = { id: string };
type SupplierLike<P> = { main_products: P[] };
/** Sản phẩm chính: id khi trùng đúng đối tượng trong danh sách sản phẩm, còn lại giữ nguyên (đã bỏ trường nặng). */
type PackedMainProduct<P> = string | P;
type PackedSupplier<S, P> = Omit<S, "main_products"> & { main_products: PackedMainProduct<P>[] };

export interface CatalogBase<S, P, C> {
  suppliers: S[];
  products: P[];
  categories: C[];
}

export function packCatalogBase<S extends SupplierLike<P>, P extends ProductLike, C>(base: CatalogBase<S, P, C>): string {
  const byId = new Map(base.products.map((product) => [product.id, product]));
  const suppliers: PackedSupplier<S, P>[] = base.suppliers.map((supplier) => ({
    ...supplier,
    // Cùng một đối tượng thì chỉ lưu id; khác (đã bị biến đổi) thì giữ bản đầy đủ để không mất dữ liệu.
    main_products: supplier.main_products.map((product) => byId.get(product.id) === product ? product.id : slimCachedProduct(product)),
  }));
  return encodeCachePayload({ suppliers, products: base.products.map(slimCachedProduct), categories: base.categories });
}

export function unpackCatalogBase<S extends SupplierLike<P>, P extends ProductLike, C>(payload: string): CatalogBase<S, P, C> {
  const packed = decodeCachePayload<{ suppliers: PackedSupplier<S, P>[]; products: P[]; categories: C[] }>(payload);
  const byId = new Map(packed.products.map((product) => [product.id, product]));
  const suppliers = packed.suppliers.map((supplier) => ({
    ...supplier,
    main_products: supplier.main_products.flatMap((entry) => {
      if (typeof entry !== "string") return [entry];
      const product = byId.get(entry);
      return product ? [product] : [];
    }),
  })) as unknown as S[];
  return { suppliers, products: packed.products, categories: packed.categories };
}

/** Thẻ nhà cung cấp trong chỉ mục tìm kiếm: bỏ trường nặng của sản phẩm chính. */
export function slimSupplierCards<S extends SupplierLike<P>, P extends object>(suppliers: S[]): S[] {
  return suppliers.map((supplier) => ({ ...supplier, main_products: supplier.main_products.map(slimCachedProduct) }));
}

/** Vercel không lưu mục cache lớn hơn 2 MB (và không báo lỗi). */
export const CACHE_ITEM_LIMIT_BYTES = 2 * 1024 * 1024;
/** Báo sớm từ 60% giới hạn để còn thời gian chia nhỏ cache; từ 90% là mức khẩn. */
export const CACHE_WARN_RATIO = 0.6;
export const CACHE_CRITICAL_RATIO = 0.9;

export interface CacheSizeAlert {
  level: "warning" | "error";
  /** Câu cố định để Sentry gộp các lần báo vào cùng một issue. */
  message: string;
  bytes: number;
  percent: number;
}

/** Trả về cảnh báo khi mục cache đã đóng gói chạm ngưỡng; dưới ngưỡng trả về null. */
export function cacheSizeAlert(name: string, payload: string): CacheSizeAlert | null {
  // Chuỗi base64 chỉ có ký tự ASCII nên độ dài chuỗi bằng số byte.
  const bytes = payload.length;
  const ratio = bytes / CACHE_ITEM_LIMIT_BYTES;
  if (ratio < CACHE_WARN_RATIO) return null;
  const critical = ratio >= CACHE_CRITICAL_RATIO;
  return {
    level: critical ? "error" : "warning",
    message: critical
      ? `Cache "${name}" is close to the 2 MB Vercel limit: split the cache now`
      : `Cache "${name}" passed 60% of the 2 MB Vercel limit: plan to split the cache`,
    bytes,
    percent: Math.round(ratio * 1000) / 10,
  };
}
