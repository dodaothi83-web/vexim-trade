import { NextResponse } from "next/server";
import { prepareVideoUpload } from "@/lib/media/video-quota";

import { getPortalMessages } from "@/lib/i18n/server";
import { createStreamDirectUpload, streamConfig } from "@/lib/media/cloudflare-stream";
import { getObject } from "@/lib/media/storage";
import { validateUpload } from "@/lib/media/validate";
import { canEditAplus, isAplusImageFile } from "@/lib/products/aplus";
import { storeAplusImage } from "@/lib/products/aplus-image-store";
import { suggestAplusAlt } from "@/lib/ai/aplus-alt";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Tải lên cho nội dung A+ của một sản phẩm. `kind=image` lưu ảnh và trả đường dẫn; `kind=video`
 * xin Cloudflare một đường tải lên một lần để trình duyệt gửi thẳng tệp video tới Cloudflare,
 * máy chủ Vexim không nhận tệp video. Nội dung chỉ đổi khi nhà cung cấp bấm Lưu.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { m, locale } = await getPortalMessages();
  const e = m.aplus.errors;
  const access = await supplierPortalAccess().catch(() => null);
  if (!access || !portalApproved(access.supplier)) return fail(e.noAccess, 403);
  const { id } = await params;
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id || !canEditAplus(product)) return fail(e.noAccess, 403);
  if (!supplierPlanRules(access.supplier, new Date(), await readPlanCatalog()).richContent) return fail(e.plan, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 4 * 1024 * 1024) return fail(e.image, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail(e.upload); }

  if (form.get("kind") === "video") {
    if (!streamConfig()) return fail(e.videoUnavailable, 503);
    try {
      const kind = form.get("video_kind") === "product" ? "product" : "aplus";
      const allowance = await prepareVideoUpload(access.supplier, kind, e, locale === "en" ? "en" : "vi");
      if (!allowance.ok) return fail(allowance.message, 409);
      const upload = await createStreamDirectUpload({ supplierId: access.supplier.id, productId: id, maxSeconds: allowance.maxSeconds });
      if (!upload) return fail(e.videoUnavailable, 503);
      return NextResponse.json({ ok: true, uploadURL: upload.uploadURL, uid: upload.uid, maxSeconds: allowance.maxSeconds, tooLongMessage: allowance.tooLongMessage });
    } catch (error) {
      console.error("[aplus] stream direct upload", error);
      return fail(e.upload, 502);
    }
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return fail(e.image, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime || !IMAGE_MIME.has(check.mime)) return fail(e.image);
  // WebP ≤1600px + bản nhỏ 640px, cùng cách xử lý với ảnh sản phẩm.
  const stored = await storeAplusImage(`aplus/${access.supplier.id}/${id}`, bytes);
  if (!stored.ok) return stored.reason === "image" ? fail(e.image) : fail(e.upload, 500);
  // Gợi ý mô tả ảnh (alt) tiếng Anh; trình soạn chỉ điền khi ô còn trống. Lỗi thì bỏ qua.
  const alt = await suggestAplusAlt({ bytes, mime: check.mime, subject: product.name_i18n?.en?.trim() || product.name });
  return NextResponse.json({ ok: true, path: stored.path, ...(alt ? { alt } : {}) });
}

/** Xem trước ảnh A+ cho chính nhà cung cấp, kể cả khi sản phẩm chưa đăng. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await supplierPortalAccess().catch(() => null);
  if (!access) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!isAplusImageFile(path, access.supplier.id, id)) return new NextResponse("Not found", { status: 404 });
  const object = await getObject(path).catch(() => null);
  const mime = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!object || !mime) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(object.data as unknown as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
