import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { validateUpload } from "@/lib/media/validate";
import { deleteObject, putObject } from "@/lib/media/storage";
import { prepareSupplierProductImage } from "@/lib/media/prepare-supplier-product-image";
import { privateMediaUrl } from "@/lib/supplier-portal/product-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const BANK_LIMIT = 12;
const prefixFor = (supplierId: string) => `supplier-media/${supplierId}/`;
const safePath = (supplierId: string, path: string) => {
  const prefix = prefixFor(supplierId);
  return path.startsWith(prefix) && /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(path.slice(prefix.length));
};

/**
 * Kho ảnh của nhà cung cấp: tải ảnh lên khi chưa có sản phẩm nào.
 * Tệp nằm ở chế độ nội bộ, chỉ được gắn vào sản phẩm khi nhà cung cấp bấm lưu.
 */
export async function POST(request: Request) {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return fail("Tài khoản chưa được duyệt.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 16 * 1024 * 1024) return fail("Tệp quá lớn.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được tệp."); }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Chưa chọn ảnh.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateUpload("image", bytes, file.name);
  if (!checked.ok || !checked.mime) return fail(checked.message ?? "Tệp không hợp lệ.");
  const db = getSupabaseClient();
  if (db) {
    const strictAccess = await supplierPortalAccess(supabaseStore);
    if (!strictAccess || !portalApproved(strictAccess.supplier) ||
      strictAccess.supplier.id !== access.supplier.id || strictAccess.user.id !== access.user.id)
      return fail("Không xác nhận được tài khoản nhà cung cấp.", 403);
  }
  const current = await access.store.listMedia("supplier", access.supplier.id);
  if (current.filter((asset) => asset.created_by === access.user.id).length >= BANK_LIMIT)
    return fail(`Kho ảnh đã có ${BANK_LIMIT} ảnh. Gắn bớt ảnh vào sản phẩm hoặc xóa ảnh cũ trước.`);
  let prepared: Awaited<ReturnType<typeof prepareSupplierProductImage>> | null = null;
  try { prepared = await prepareSupplierProductImage(bytes); }
  catch { return fail("Ảnh không đọc được hoặc kích thước quá lớn. Chọn ảnh JPG, PNG hoặc WebP khác."); }
  const base = `${prefixFor(access.supplier.id)}${randomUUID()}`;
  const path = `${base}.webp`;
  const thumbPath = `${base}-thumb.webp`;
  try {
    await putObject(path, prepared.main, "image/webp");
    const row = await access.store.createMedia({
      owner_type: "supplier", product_id: null, supplier_id: access.supplier.id, verification_id: null,
      checklist_key: null, kind: "image", audience: "internal", status: "unverified", expires_on: null,
      caption: file.name.slice(0, 150), storage_path: path, thumb_path: thumbPath, external_url: null,
      mime: "image/webp", bytes: prepared.main.length, width: prepared.width, height: prepared.height,
      sort_order: current.length, created_by: access.user.id,
    });
    await putObject(thumbPath, prepared.thumb, "image/webp").catch((error) => {
      console.error("[supplier-media-bank] thumbnail", error);
    });
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "supplier", entity_id: access.supplier.id, action: "supplier.media_bank_uploaded",
      before: null, after: { media_id: row.id } }).catch((error) => console.error("[supplier-media-bank] audit", error));
    revalidatePath("/supplier/portal/products/new");
    return NextResponse.json({ ok: true, message: "Đã thêm ảnh vào kho ảnh của bạn.",
      image: { id: row.id, url: privateMediaUrl(row) } });
  } catch (error) {
    await Promise.all([path, thumbPath].map((p) => deleteObject(p).catch(() => null)));
    console.error("[supplier-media-bank] upload", error);
    return fail("Không lưu được ảnh. Vui lòng thử lại.", 503);
  }
}

/** Chỉ xóa ảnh còn nằm trong kho: ảnh đã gắn vào sản phẩm do trang sản phẩm quản lý. */
export async function DELETE(request: Request) {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return fail("Tài khoản chưa được duyệt.", 403);
  const mediaId = new URL(request.url).searchParams.get("media_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return fail("Mã ảnh không hợp lệ.");
  const asset = await access.store.getMedia(mediaId);
  if (!asset || asset.owner_type !== "supplier" || asset.supplier_id !== access.supplier.id ||
    asset.created_by !== access.user.id)
    return fail("Không có quyền xóa ảnh này.", 403);
  try {
    await access.store.deleteMedia(mediaId);
    const paths = [asset.storage_path, asset.thumb_path].filter((p): p is string => !!p);
    for (const path of paths) {
      if (!safePath(access.supplier.id, path) || await access.store.getMediaByPath(path)) continue;
      await deleteObject(path).catch((error) => console.error("[supplier-media-bank] storage cleanup", path, error));
    }
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "supplier", entity_id: access.supplier.id, action: "supplier.media_bank_deleted",
      before: { media_id: mediaId }, after: null }).catch((error) => console.error("[supplier-media-bank] audit", error));
    revalidatePath("/supplier/portal/products/new");
    return NextResponse.json({ ok: true, message: "Đã xóa ảnh khỏi kho ảnh." });
  } catch (error) {
    console.error("[supplier-media-bank] delete", error);
    return fail("Không xóa được ảnh.", 503);
  }
}
