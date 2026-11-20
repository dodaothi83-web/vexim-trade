import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { randomUUID } from "node:crypto";

import { getStore } from "@/lib/db";
import { createStreamDirectUpload, streamConfig } from "@/lib/media/cloudflare-stream";
import { getObject, putObject } from "@/lib/media/storage";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { activeDesignConsent } from "@/lib/supplier-portal/storefront-design";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Nhân viên xem ảnh nội dung A+ trong CRM, kể cả khi sản phẩm chưa đăng. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "products.view")) return new NextResponse("Not found", { status: 404 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!/^aplus\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpe?g|png|webp)$/i.test(path)) return new NextResponse("Not found", { status: 404 });
  const object = await getObject(path).catch(() => null);
  const mime = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!object || !mime) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(object.data as unknown as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Nhân viên tải ảnh, video A+ khi sửa hộ (dịch vụ thiết kế bán ngoài hệ thống). Cần quyền
 * products.manage, đồng ý phạm vi "Trang + A+" đang hiệu lực và gói còn quyền A+.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "products.manage")) return fail("Không có quyền.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 4 * 1024 * 1024) return fail("Ảnh tối đa 3 MB.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Chưa tải được tệp."); }
  const productId = String(form.get("product_id") ?? "");
  const store = getStore();
  const product = /^[0-9a-f-]{36}$/i.test(productId) ? await store.getProduct(productId) : null;
  if (!product) return fail("Không tìm thấy sản phẩm.", 404);
  const supplier = await store.getSupplier(product.supplier_id);
  if (!supplier) return fail("Không tìm thấy nhà cung cấp.", 404);
  if (!supplierPlanRules(supplier, new Date(), await readPlanCatalog()).richContent) return fail("Gói nhà cung cấp không có nội dung A+.", 403);
  if ((await activeDesignConsent(supplier.id))?.scope !== "storefront_aplus") return fail("Chưa ghi nhận đồng ý sửa hộ nội dung A+.", 403);
  if (form.get("kind") === "video") {
    if (!streamConfig()) return fail("Chức năng tải video chưa được thiết lập.", 503);
    try {
      const upload = await createStreamDirectUpload({ supplierId: supplier.id, productId: product.id });
      if (!upload) return fail("Chức năng tải video chưa được thiết lập.", 503);
      return NextResponse.json({ ok: true, uploadURL: upload.uploadURL, uid: upload.uid });
    } catch (error) {
      console.error("[crm-aplus] video", error);
      return fail("Chưa xin được đường tải video.", 502);
    }
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return fail("Chọn ảnh JPG, PNG hoặc WebP, tối đa 3 MB.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime || !IMAGE_MIME.has(check.mime)) return fail("Chọn ảnh JPG, PNG hoặc WebP, tối đa 3 MB.");
  const path = `aplus/${supplier.id}/${product.id}/${randomUUID()}.${extensionFor(check.mime)}`;
  try { await putObject(path, bytes, check.mime); } catch (error) {
    console.error("[crm-aplus] image", error);
    return fail("Chưa tải được ảnh.", 500);
  }
  return NextResponse.json({ ok: true, path });
}
