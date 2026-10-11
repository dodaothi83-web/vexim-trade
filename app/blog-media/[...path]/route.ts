import { NextResponse } from "next/server";

import { getObject } from "@/lib/media/storage";

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
 * Phục vụ ảnh bài viết công khai: /blog-media/blog/<tên tệp>.
 * Chỉ mở tiền tố `blog/`; mọi tệp media khác (hồ sơ NCC, sản phẩm) vẫn cần đăng nhập
 * qua /api/media/file.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const rel = (segments ?? []).join("/");

  if (!rel.startsWith("blog/") || rel.includes("..") || !/^blog\/[\w-]+\.[a-z]+$/i.test(rel)) {
    return new NextResponse("Không tìm thấy ảnh", { status: 404 });
  }

  const object = await getObject(rel);
  if (!object) return new NextResponse("Không tìm thấy ảnh", { status: 404 });

  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  const headers = new Headers({
    "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
    "Content-Length": String(object.data.byteLength),
    // Tên tệp là UUID nên có thể cache lâu
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });

  return new NextResponse(object.data as unknown as BodyInit, { status: 200, headers });
}
