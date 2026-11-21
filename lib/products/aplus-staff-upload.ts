import "server-only";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { createStreamDirectUpload, streamConfig } from "@/lib/media/cloudflare-stream";
import { getObject, putObject } from "@/lib/media/storage";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { COMPANY_APLUS_ID, isAplusImagePath } from "@/lib/products/aplus";

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

/**
 * Nhân viên Vexim tải ảnh/video khi soạn A+ hộ nhà cung cấp (CRM). Tệp vào đúng thư mục A+ của nhà
 * cung cấp (aplus/<nhà cung cấp>/<sản phẩm | company>/); nội dung chỉ đổi khi nhân viên bấm Lưu.
 * Video xin Cloudflare đường tải lên một lần, gắn đúng sản phẩm/nhà cung cấp.
 */
export async function staffAplusUpload(request: Request, target: { supplierId: string; productId: string | null }, permission: Permission) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, permission)) return fail("Bạn không có quyền soạn A+ cho nhà cung cấp này.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 4 * 1024 * 1024) return fail("Chọn ảnh JPG, PNG hoặc WebP, tối đa 3 MB.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Chưa tải được tệp. Thử lại."); }
  if (form.get("kind") === "video") {
    if (!streamConfig()) return fail("Chức năng tải video chưa được thiết lập.", 503);
    try {
      const upload = await createStreamDirectUpload(target.productId
        ? { supplierId: target.supplierId, productId: target.productId }
        : { supplierId: target.supplierId, productId: null, purpose: "company" });
      if (!upload) return fail("Chức năng tải video chưa được thiết lập.", 503);
      return NextResponse.json({ ok: true, uploadURL: upload.uploadURL, uid: upload.uid });
    } catch (error) {
      console.error("[crm-aplus] stream direct upload", error);
      return fail("Chưa tải được video. Thử lại.", 502);
    }
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return fail("Chọn ảnh JPG, PNG hoặc WebP, tối đa 3 MB.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime || !IMAGE_MIME.has(check.mime)) return fail("Chọn ảnh JPG, PNG hoặc WebP, tối đa 3 MB.");
  const path = `aplus/${target.supplierId}/${target.productId ?? COMPANY_APLUS_ID}/${randomUUID()}.${extensionFor(check.mime)}`;
  try { await putObject(path, bytes, check.mime); } catch (error) {
    console.error("[crm-aplus] image upload", error);
    return fail("Chưa tải được ảnh. Thử lại.", 500);
  }
  return NextResponse.json({ ok: true, path });
}

/** Nhân viên xem ảnh A+ của đúng chỗ đang soạn. */
export async function staffAplusPreview(request: Request, target: { supplierId: string; productId: string | null }, permission: Permission) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, permission)) return new NextResponse("Not found", { status: 404 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!isAplusImagePath(path, target.supplierId, target.productId ?? COMPANY_APLUS_ID)) return new NextResponse("Not found", { status: 404 });
  const object = await getObject(path).catch(() => null);
  const mime = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!object || !mime) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(object.data as unknown as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
