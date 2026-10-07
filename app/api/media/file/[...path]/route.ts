import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getObject } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/**
 * Phục vụ tệp media: /api/media/file/<đường dẫn trong kho>
 *
 * Yêu cầu ĐĂNG NHẬP. Tài liệu nội bộ (giấy tờ xác minh NCC) chỉ phục vụ cho
 * người có quyền `media.internal` — đây là chỗ phân quyền thật cho tệp, không
 * chỉ dựa vào việc ẩn khỏi giao diện.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  if (!session) {
    return new NextResponse("Cần đăng nhập", { status: 401 });
  }

  const { path: segments } = await params;
  const rel = (segments ?? []).join("/");

  if (!rel || rel.includes("..")) {
    return new NextResponse("Đường dẫn không hợp lệ", { status: 400 });
  }

  const asset = await getStore().getMediaByPath(rel);
  if (!asset) {
    return new NextResponse("Không tìm thấy tệp", { status: 404 });
  }

  if (asset.audience === "internal" && !hasPermission(session.role, "media.internal")) {
    return new NextResponse("Bạn không có quyền xem tài liệu nội bộ", { status: 403 });
  }

  const object = await getObject(rel);
  if (!object) {
    return new NextResponse("Tệp chưa có trong kho (có thể chưa tải lên)", { status: 404 });
  }

  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_BY_EXT[ext] ?? asset.mime ?? "application/octet-stream";

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(object.data.byteLength),
    "Cache-Control": "private, max-age=300",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
  });

  return new NextResponse(object.data as unknown as BodyInit, { status: 200, headers });
}
