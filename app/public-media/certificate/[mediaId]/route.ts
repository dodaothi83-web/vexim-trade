import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { getObject } from "@/lib/media/storage";
import { publicCertificateImage } from "@/lib/public/certificates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ảnh chứng nhận công khai: /public-media/certificate/<mediaId>
 *
 * Trang hồ sơ nhà cung cấp trưng bày chứng nhận dạng danh sách ngang kèm ảnh, nên
 * cần một đường đọc ảnh cho người mua chưa đăng nhập. Tệp gốc vẫn nằm trong kho
 * nội bộ (`audience: internal`) và KHÔNG đi qua route `/public-media/[...path]`.
 *
 * Điều kiện công khai không được chép lại ở đây: `publicCertificateImage()` chạy
 * đúng bộ lọc hồ sơ (`publicSupplierCertificates`) rồi mới cho phép đọc. Chưa duyệt,
 * chưa công khai, bị ẩn, đã bị thay thế, hết hạn hay sai đơn vị đứng tên đều trả
 * 404 như nhau để không ai dò được sự tồn tại của giấy nội bộ.
 *
 * PDF cố tình không phục vụ công khai: chỉ ảnh (JPG/PNG/WebP/GIF/AVIF) mới qua được
 * đây, giấy scan PDF vẫn chỉ xem được trong CRM/cổng nhà cung cấp.
 */

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** 404 dùng chung: không tiết lộ giấy tồn tại hay không. */
function notFound() {
  return new NextResponse("Không tìm thấy ảnh chứng nhận", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params;
  if (!mediaId || mediaId.includes("/")) return notFound();

  const store = getStore();
  const media = await store.getMedia(mediaId).catch(() => null);
  if (!media?.supplier_id) return notFound();

  const certificates = await store.listCertificates(media.supplier_id).catch(() => []);
  const allowed = publicCertificateImage(media, certificates);
  if (!allowed?.storage_path) return notFound();

  const object = await getObject(allowed.storage_path).catch(() => null);
  if (!object) return notFound();

  const ext = allowed.storage_path.split(".").pop()?.toLowerCase() ?? "";
  const contentType = (allowed.mime?.startsWith("image/") ? allowed.mime : null) ?? CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
  if (!contentType.startsWith("image/")) return notFound();

  return new NextResponse(object.data as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(object.data.byteLength),
      // Ngắn có chủ đích: bỏ duyệt/chỉnh hạn một giấy là ảnh ngừng phục vụ trong
      // vòng một phút, kể cả khi trình duyệt đang giữ bản cache.
      "Cache-Control": "public, max-age=60",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
