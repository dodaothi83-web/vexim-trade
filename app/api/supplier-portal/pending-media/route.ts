import { NextResponse } from "next/server";
import { prepareVideoUpload } from "@/lib/media/video-quota";
import { randomUUID } from "node:crypto";

import { getPortalMessages } from "@/lib/i18n/server";
import { createStreamDirectUpload, streamConfig } from "@/lib/media/cloudflare-stream";
import { getObject, putObject } from "@/lib/media/storage";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { isAplusImagePath } from "@/lib/products/aplus";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { countRecentPendingUploads, pendingImagePath, PENDING_PRODUCT_ID, PENDING_UPLOADS_PER_DAY, registerPendingUpload } from "@/lib/supplier-portal/pending-media";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Tải ảnh A+ hoặc video khi sản phẩm mới chưa được lưu. Tệp ở trạng thái chờ, gắn vào sản phẩm
 * khi nhà cung cấp lưu (xem lib/supplier-portal/pending-media.ts); bỏ ngang thì tự xoá sau 24 giờ.
 * Chỉ gói có quyền video và A+.
 */
export async function POST(request: Request) {
  const { m, locale } = await getPortalMessages();
  const e = m.aplus.errors;
  const access = await supplierPortalAccess().catch(() => null);
  if (!access || !portalApproved(access.supplier)) return fail(e.noAccess, 403);
  if (!supplierPlanRules(access.supplier, new Date(), await readPlanCatalog()).richContent) return fail(e.plan, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 4 * 1024 * 1024) return fail(e.image, 413);
  if (await countRecentPendingUploads(access.supplier.id) >= PENDING_UPLOADS_PER_DAY) return fail(e.tooManyUploads, 429);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail(e.upload); }

  if (form.get("kind") === "video") {
    if (!streamConfig()) return fail(e.videoUnavailable, 503);
    try {
      const kind = form.get("video_kind") === "product" ? "product" : "aplus";
      const allowance = await prepareVideoUpload(access.supplier, kind, e, locale === "en" ? "en" : "vi");
      if (!allowance.ok) return fail(allowance.message, 409);
      const upload = await createStreamDirectUpload({ supplierId: access.supplier.id, productId: null, maxSeconds: allowance.maxSeconds });
      if (!upload) return fail(e.videoUnavailable, 503);
      await registerPendingUpload(access.supplier.id, "video", upload.uid);
      return NextResponse.json({ ok: true, uploadURL: upload.uploadURL, uid: upload.uid, maxSeconds: allowance.maxSeconds, tooLongMessage: allowance.tooLongMessage });
    } catch (error) {
      console.error("[pending-media] stream direct upload", error);
      return fail(e.upload, 502);
    }
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return fail(e.image, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload("image", bytes, file.name);
  if (!check.ok || !check.mime || !IMAGE_MIME.has(check.mime)) return fail(e.image);
  const path = pendingImagePath(access.supplier.id, `${randomUUID()}.${extensionFor(check.mime)}`);
  try {
    await putObject(path, bytes, check.mime);
    await registerPendingUpload(access.supplier.id, "image", path);
  } catch (error) {
    console.error("[pending-media] image upload", error);
    return fail(e.upload, 500);
  }
  return NextResponse.json({ ok: true, path });
}

/** Xem trước ảnh chờ cho chính nhà cung cấp đã tải lên. */
export async function GET(request: Request) {
  const access = await supplierPortalAccess().catch(() => null);
  if (!access) return new NextResponse("Not found", { status: 404 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!isAplusImagePath(path, access.supplier.id, PENDING_PRODUCT_ID)) return new NextResponse("Not found", { status: 404 });
  const object = await getObject(path).catch(() => null);
  const mime = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!object || !mime) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(object.data as unknown as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
