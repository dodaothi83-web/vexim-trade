import { NextResponse } from "next/server";

import { getObject } from "@/lib/media/storage";
import { getStore } from "@/lib/db";
import { isExpired } from "@/lib/media/readiness";
import { isTestOnlyProduct, productReviewApproved } from "@/lib/public/product-selection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function relAllowed(rel: string): boolean {
  if (rel.startsWith("categories/") || rel.startsWith("blog/")) return PUBLIC_IMAGE_EXT.test(rel);
  if (rel.startsWith("products/")) return /^products\/[a-z0-9_-]+\/[a-z0-9_-]+\.(jpe?g|png|webp)$/i.test(rel);
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

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const rel = (segments ?? []).join("/");

  if (!rel || rel.includes("..") || !relAllowed(rel)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isProductImage = rel.startsWith("products/");
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
      asset.audience !== "buyer" || isExpired(asset) ||
      (asset.storage_path !== rel && asset.thumb_path !== rel)) return new NextResponse("Not found", { status: 404 });
    const product = await store.getProduct(asset.product_id);
    if (!product || !productReviewApproved(product) || isTestOnlyProduct(product.name)) return new NextResponse("Not found", { status: 404 });
    const supplier = await store.getSupplier(product.supplier_id);
    if (!supplier || supplier.status !== "published" || (supplier.is_demo && process.env.VEXIM_SHOW_DEMO !== "true") ||
      (!product.ready_for_buyer && !supplier.is_demo)) return new NextResponse("Not found", { status: 404 });
  }

  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";

  try {
    const object = await getObject(rel);
    if (!object) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(new Uint8Array(object.data), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(object.data.byteLength),
        "Cache-Control": isProductImage ? "no-store" : "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
