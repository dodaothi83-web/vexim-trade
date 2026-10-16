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
 * Phục vụ ảnh công khai (hero category, ảnh trang category, ảnh blog):
 *   /public-media/<prefix>/<tên tệp>
 *
 * Mở các tiền tố công khai: categories/, blog/.
 * Mọi tệp khác (hồ sơ NCC, giấy tờ, email) — 404.
 * Cache 7 ngày (ảnh tĩnh).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const rel = (segments ?? []).join("/");

  if (
    !rel ||
    rel.includes("..") ||
    !(rel.startsWith("categories/") || rel.startsWith("blog/")) ||
    !/^[\w/-]+\.[a-z]+$/i.test(rel)
  ) {
    return new NextResponse("Not found", { status: 404 });
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
        "Cache-Control": "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
