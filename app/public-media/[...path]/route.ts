import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getObject } from "@/lib/media/storage";
import { getStore } from "@/lib/db";
import { isExpired } from "@/lib/media/readiness";
import { isTestOnlyProduct, productReviewApproved } from "@/lib/public/product-selection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vì sao gallery từng "giật" khi chuyển ảnh và 3 lớp đang xử lý:
 *
 * 1. Browser cache + ETag/304 — ảnh được xem trong ≤60 giây không phải tải lại
 *    byte; hết hạn thì trình duyệt hỏi lại bằng If-None-Match và nhận 304 (không
 *    byte) thay vì tải nguyên file như hồi `no-store`. ACL vẫn chạy trước khi tra
 *    ETag nên thu hồi quyền chia sẻ vẫn chặn ngay khi trình duyệt hỏi lại; đổi
 *    khá trị là cửa sổ lỗi thời tối đa 60 giây trong bộ nhớ cache của trình duyệt.
 * 2. Đệm LRU trong-process — route không phải chờ Supabase Storage mỗi lần đổi
 *    ảnh; ACL vẫn chạy TRƯỚC khi tra đệm nên đệm không bao giờ vượt quyền.
 * 3. Widget gallery preload ảnh kề cạnh + crossfade (xem product-media-gallery).
 *
 * Ảnh tĩnh công khai (categories/blog/profile-cover) giữ cache 7 ngày immutable.
 */

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/**
 * Phục vụ ảnh công khai (hero category, ảnh trang category, ảnh blog, ảnh đại diện/bìa
 * nhà cung cấp và gallery chia sẻ buyer):
 *   /public-media/<prefix>/<tên tệp>
 *
 * Tiền tố công khai: categories/, blog/, suppliers/.
 * - suppliers/<id>/profile-* và suppliers/<id>/cover-* luôn mở (định danh/ảnh bìa công khai).
 * - suppliers/<id>/* còn lại: chỉ ảnh (đuôi ảnh) — MediaManager đánh dấu audience=buyer khi
 *   nhà quản lý cho phép chia sẻ với buyer; tầng chặn ở đây dựa trên đuôi file để tránh
 *   vô tình phát tán PDF nội bộ. Giấy tờ chứng nhận/phim không qua route này.
 *
 * Cache 7 ngày (ảnh tĩnh).
 */
const PUBLIC_IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

type ObjectCacheEntry = { data: Uint8Array; etag: string; at: number };

const OBJECT_CACHE_TTL_MS = 10 * 60_000;   // đệm byte trong-process — đủ cho một phiên duyệt gallery
const OBJECT_CACHE_MAX_ENTRIES = 128;
const OBJECT_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const OBJECT_CACHE_MAX_ENTRY_BYTES = 4 * 1024 * 1024; // ảnh lớn hơn: stream thẳng, không đệm

const globalForPublicMedia = globalThis as unknown as { __veximPublicMediaCache?: Map<string, ObjectCacheEntry> };
const objectCache: Map<string, ObjectCacheEntry> = globalForPublicMedia.__veximPublicMediaCache ?? new Map();
globalForPublicMedia.__veximPublicMediaCache = objectCache;
let objectCacheBytes = 0;

function cacheGet(rel: string): ObjectCacheEntry | null {
  const hit = objectCache.get(rel);
  if (!hit) return null;
  if (Date.now() - hit.at > OBJECT_CACHE_TTL_MS) {
    objectCache.delete(rel);
    objectCacheBytes -= hit.data.byteLength;
    return null;
  }
  objectCache.delete(rel);
  objectCache.set(rel, hit); // chạm LRU: vừa dùng → đưa về cuối hàng đẩy ra
  return hit;
}

function cachePut(rel: string, entry: ObjectCacheEntry) {
  if (entry.data.byteLength > OBJECT_CACHE_MAX_ENTRY_BYTES) return;
  const prev = objectCache.get(rel);
  if (prev) objectCacheBytes -= prev.data.byteLength;
  objectCache.set(rel, entry);
  objectCacheBytes += entry.data.byteLength;
  while (objectCache.size > OBJECT_CACHE_MAX_ENTRIES || objectCacheBytes > OBJECT_CACHE_MAX_BYTES) {
    const oldest = objectCache.keys().next().value;
    if (oldest === undefined) break;
    objectCacheBytes -= objectCache.get(oldest)?.data.byteLength ?? 0;
    objectCache.delete(oldest);
  }
}

function relAllowed(rel: string): boolean {
  if (rel.startsWith("categories/") || rel.startsWith("blog/")) return PUBLIC_IMAGE_EXT.test(rel);
  if (rel.startsWith("products/")) return /^products\/[a-z0-9_-]+\/[a-z0-9_-]+\.(jpe?g|png|webp)$/i.test(rel);
  if (rel.startsWith("product-form-images/")) return /^product-form-images\/[a-f0-9-]{36}\/[a-f0-9-]{36}(?:-thumb)?\.webp$/i.test(rel);
  if (rel.startsWith("suppliers/")) {
    // Chỉ cho ảnh (đuôi ảnh), chặn PDF/doc và mọi file khác.
    if (!PUBLIC_IMAGE_EXT.test(rel)) return false;
    // Không cho đường dẫn quá sâu / chứa các từ khóa nhạy cảm
    const parts = rel.slice("suppliers/".length).split("/");
    if (parts.length < 2) return false; // phải suppliers/<id>/<file>
    const fname = parts[parts.length - 1].toLowerCase();
    // Mọi ảnh supplier đều có tên dạng random uuid, trừ profile-*/cover-* — cho tất cả.
    if (fname.startsWith("profile-") || fname.startsWith("cover-")) return parts.length === 2;
    // uuid-like filename (36 kí tự có gạch ngang) — là file upload qua MediaManager.
    return /^[a-f0-9-]{20,}\.([a-z]+)$/i.test(fname);
  }
  return false;
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const rel = (segments ?? []).join("/");

  if (!rel || rel.includes("..") || !relAllowed(rel)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const formImage = rel.startsWith("product-form-images/");
  const isProductImage = rel.startsWith("products/") || formImage;
  const supplierImage = rel.startsWith("suppliers/") && !/^(profile-|cover-)/i.test(rel.split("/").at(-1) ?? "");
  if (supplierImage) {
    // Shared supplier vault files (including certificate scans) must not become public merely
    // because someone knows a UUID-like JPG path. Profile/cover are handled separately.
    const store = getStore();
    const supplierId = rel.split("/")[1];
    const asset = await store.getMediaByPath(rel);
    if (!asset || asset.owner_type !== "supplier" || asset.supplier_id !== supplierId || asset.kind !== "image" ||
        asset.audience !== "buyer" || isExpired(asset) ||
        (asset.storage_path !== rel && asset.thumb_path !== rel)) return new NextResponse("Not found", { status: 404 });
    const supplier = await store.getSupplier(supplierId);
    if (!supplier || supplier.status !== "published" ||
        (supplier.is_demo && process.env.VEXIM_SHOW_DEMO !== "true")) return new NextResponse("Not found", { status: 404 });
  }
  if (isProductImage) {
    // Media metadata, not a guess from the filename, determines public access.
    const store = getStore();
    const asset = await store.getMediaByPath(rel);
    if (!asset || asset.owner_type !== "product" || !asset.product_id || asset.kind !== "image" ||
      asset.audience !== "buyer" || isExpired(asset) || (formImage && asset.product_id !== rel.split("/")[1]) ||
      (asset.storage_path !== rel && asset.thumb_path !== rel)) return new NextResponse("Not found", { status: 404 });
    const product = await store.getProduct(asset.product_id);
    if (!product || !productReviewApproved(product) || isTestOnlyProduct(product.name)) return new NextResponse("Not found", { status: 404 });
    const supplier = await store.getSupplier(product.supplier_id);
    if (!supplier || supplier.status !== "published" || (supplier.is_demo && process.env.VEXIM_SHOW_DEMO !== "true") ||
      (!product.ready_for_buyer && !supplier.is_demo)) return new NextResponse("Not found", { status: 404 });
  }

  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
  // Ảnh qua ACL (sản phẩm + gallery chia sẻ buyer) có thể bị thu hồi → chỉ browser
  // được cache 60 giây rồi bắt buộc xác nhận lại bằng ETag. Ảnh danh mục/blog/
  // profile-cover là tĩnh công khai → immutable 7 ngày.
  const aclGated = isProductImage || supplierImage;
  const cacheControl = aclGated
    ? "private, max-age=60, must-revalidate"
    : "public, max-age=604800, immutable";
  const responseHeaders = (etag: string): Record<string, string> => ({
    "Content-Type": mime,
    "Cache-Control": cacheControl,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  });

  try {
    // ACL đã chạy ở trên — từ đây mọi thứ đều là "được phép phát".
    const cached = cacheGet(rel);
    if (cached) return objectResponse(request, cached, responseHeaders);
    const object = await getObject(rel);
    if (!object) return new NextResponse("Not found", { status: 404 });
    const etag = `"${createHash("sha256").update(object.data).digest("hex").slice(0, 32)}"`;
    const entry = { data: object.data, etag, at: Date.now() };
    cachePut(rel, entry);
    return objectResponse(request, entry, responseHeaders);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

/** Trả byte từ đệm, kèm 304 khi trình duyệt còn ETag khớp (không chảy byte nào). */
function objectResponse(
  request: Request,
  entry: ObjectCacheEntry,
  responseHeaders: (etag: string) => Record<string, string>,
): NextResponse {
  if (request.headers.get("if-none-match") === entry.etag) {
    return new NextResponse(null, { status: 304, headers: responseHeaders(entry.etag) });
  }
  return new NextResponse(new Uint8Array(entry.data), {
    status: 200,
    headers: { ...responseHeaders(entry.etag), "Content-Length": String(entry.data.byteLength) },
  });
}
