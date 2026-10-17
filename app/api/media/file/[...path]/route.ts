import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getObject } from "@/lib/media/storage";
import { ownsDocumentReview } from "@/lib/supplier-portal/policy";
import { portalApproved } from "@/lib/supplier-portal/onboarding";

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

  const store = getStore();
  if (session.role === "supplier") {
    const user = await store.getUser(session.uid);
    const supplier = user?.supplier_id ? await store.getSupplier(user.supplier_id) : null;
    if (!user?.is_active || user.role !== "supplier" || user.email.toLowerCase() !== session.email.toLowerCase() ||
        !supplier || !portalApproved(supplier)) return new NextResponse("Tài khoản NCC chưa được Vexim xác nhận", { status: 403 });
  }
  const asset = await store.getMediaByPath(rel);
  if (!asset) {
    return new NextResponse("Không tìm thấy tệp", { status: 404 });
  }
  if (session.role === "supplier") {
    const user = await store.getUser(session.uid);
    if (!user?.supplier_id || asset.supplier_id !== user.supplier_id) {
      return new NextResponse("Tệp không thuộc nhà cung cấp này", { status: 403 });
    }
  }

  if (asset.audience === "internal" && !hasPermission(session.role, "media.internal")) {
    const store = getStore();
    const user = session.role === "supplier" ? await store.getUser(session.uid) : null;
    const review = asset.owner_type === "verification" && asset.verification_id && asset.created_by === user?.id
      ? await store.getVerification(asset.verification_id) : null;
    const product = user && asset.owner_type === "product" && asset.product_id && asset.created_by === user.id
      ? await store.getProduct(asset.product_id) : null;
    const ownProductFile = !!user && !!product && user.role === "supplier" &&
      product.supplier_id === user.supplier_id && asset.supplier_id === user.supplier_id;
    const ownDocument = ownsDocumentReview(user, review) && !!asset.checklist_key;
    const ownCertificate = !!user && user.role === "supplier" && asset.owner_type === "supplier" &&
      asset.kind === "certificate" && asset.created_by === user.id && asset.supplier_id === user.supplier_id;
    if ((!ownDocument && !ownProductFile && !ownCertificate) || user?.email.toLowerCase() !== session.email.toLowerCase()) {
      return new NextResponse("Bạn không có quyền xem tài liệu nội bộ", { status: 403 });
    }
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
