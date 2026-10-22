import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getObject } from "@/lib/media/storage";
import { portalApproved } from "@/lib/supplier-portal/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf",
};

/** Thư mục bằng chứng của hồ sơ tự gửi trong kho media. */
const PREFIX = "supplier-submissions/";

/**
 * Phục vụ ẢNH GỐC / chứng từ của hồ sơ NCC tự gửi:
 *   /api/supplier-portal/submission-file/supplier-submissions/<submissionId>/<file>
 *
 * Quyền:
 *  - Nhân viên cần `media.internal` (bằng chứng luôn là tài liệu nội bộ).
 *  - NCC chỉ mở được tệp thuộc hồ sơ CỦA CHÍNH doanh nghiệp mình.
 * Không bao giờ phục vụ đường dẫn ngoài thư mục hồ sơ tự gửi.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Cần đăng nhập", { status: 401 });
  const { path: segments } = await params;
  const rel = (segments ?? []).join("/");
  if (!rel || rel.includes("..") || !rel.startsWith(PREFIX)) {
    return new NextResponse("Đường dẫn không hợp lệ", { status: 400 });
  }
  const submissionId = rel.slice(PREFIX.length).split("/")[0];
  if (!submissionId) return new NextResponse("Đường dẫn không hợp lệ", { status: 400 });

  const store = getStore();
  const submission = await store.getSubmission(submissionId);
  if (!submission) return new NextResponse("Không tìm thấy hồ sơ", { status: 404 });

  if (session.role === "supplier") {
    const user = await store.getUser(session.uid);
    const supplier = user?.supplier_id ? await store.getSupplier(user.supplier_id) : null;
    if (!user?.is_active || user.role !== "supplier" || !supplier || !portalApproved(supplier) ||
        user.email.toLowerCase() !== session.email.toLowerCase() ||
        submission.supplier_id !== user.supplier_id) {
      return new NextResponse("Bạn không có quyền xem bằng chứng này", { status: 403 });
    }
  } else if (!hasPermission(session.role, "media.internal")) {
    return new NextResponse("Bạn không có quyền xem tài liệu nội bộ", { status: 403 });
  }

  const asset = await store.getMediaByPath(rel);
  if (asset && asset.audience !== "internal") {
    return new NextResponse("Tệp không thuộc phạm vi hồ sơ tự gửi", { status: 403 });
  }

  const object = await getObject(rel);
  if (!object) return new NextResponse("Tệp chưa có trong kho", { status: 404 });

  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(object.data as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? asset?.mime ?? "application/octet-stream",
      "Content-Length": String(object.data.byteLength),
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
