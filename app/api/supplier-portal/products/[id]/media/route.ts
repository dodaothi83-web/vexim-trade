import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { deleteObject, putObject } from "@/lib/media/storage";
import type { MediaKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

/** Supplier files remain internal/unverified; only Vexim may promote them to buyer-visible. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return fail("Tài khoản chưa được duyệt.", 403);
  const { id } = await params;
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) return fail("Sản phẩm không thuộc tài khoản của bạn.", 403);
  if (product.supplier_review_status !== "draft" && product.supplier_review_status !== "changes_requested") return fail("Sản phẩm đang chờ hoặc đã được Vexim duyệt; sửa bản nháp trước khi tải tệp.", 409);
  if (Number(request.headers.get("content-length") ?? 0) > 16 * 1024 * 1024) return fail("Tệp quá lớn.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được tệp."); }
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "image") as MediaKind;
  if (!(file instanceof File) || !["image", "catalogue"].includes(kind)) return fail("Chỉ nhận ảnh sản phẩm hoặc catalogue PDF.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateUpload(kind, bytes, file.name);
  if (!checked.ok || !checked.mime) return fail(checked.message ?? "Tệp không hợp lệ.");
  const current = await access.store.listMedia("product", id);
  if (current.filter((m) => m.created_by === access.user.id).length >= 12) return fail("Tối đa 12 tệp trên mỗi sản phẩm.");
  const path = `products/${id}/${randomUUID()}.${extensionFor(checked.mime)}`;
  try {
    // Recheck ownership/status after parsing before writing to storage.
    const fresh = await access.store.getProduct(id);
    if (!fresh || fresh.supplier_id !== access.supplier.id || !["draft", "changes_requested"].includes(fresh.supplier_review_status ?? "")) return fail("Trạng thái sản phẩm đã thay đổi.", 409);
    await putObject(path, bytes, checked.mime);
    const row = await access.store.createMedia({
      owner_type: "product", product_id: id, supplier_id: access.supplier.id, verification_id: null,
      checklist_key: null, kind, audience: "internal", status: "unverified", expires_on: null,
      caption: file.name.slice(0, 150), storage_path: path, thumb_path: null, external_url: null,
      mime: checked.mime, bytes: bytes.length, width: null, height: null, sort_order: current.length,
      created_by: access.user.id,
    });
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_media_uploaded",
      before: null, after: { media_id: row.id, kind, audience: "internal" } }).catch((error) => console.error("[supplier-product-media] audit", error));
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/crm/products/${id}/edit`);
    return NextResponse.json({ ok: true, message: "Đã tải tệp nội bộ để Vexim kiểm tra; chưa chia sẻ cho buyer." });
  } catch (error) {
    await deleteObject(path).catch(() => null);
    console.error("[supplier-product-media] upload", error);
    return fail("Không lưu được tệp. Vui lòng thử lại.", 503);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return fail("Tài khoản chưa được duyệt.", 403);
  const { id } = await params;
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) return fail("Sản phẩm không thuộc tài khoản của bạn.", 403);
  if (!["draft", "changes_requested"].includes(product.supplier_review_status ?? "")) return fail("Chỉ được xóa tệp khi sản phẩm là bản nháp.", 409);
  const mediaId = new URL(request.url).searchParams.get("media_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return fail("Mã tệp không hợp lệ.");
  const asset = await access.store.getMedia(mediaId);
  if (!asset || asset.owner_type !== "product" || asset.product_id !== id || asset.supplier_id !== access.supplier.id ||
      asset.created_by !== access.user.id || asset.audience !== "internal") return fail("Không có quyền xóa tệp này.", 403);
  try {
    const fresh = await access.store.getProduct(id);
    if (!fresh || fresh.supplier_id !== access.supplier.id || !["draft", "changes_requested"].includes(fresh.supplier_review_status ?? ""))
      return fail("Trạng thái sản phẩm đã thay đổi.", 409);
    await access.store.deleteMedia(asset.id);
    await Promise.all([asset.storage_path, asset.thumb_path].filter((p): p is string => !!p)
      .map((path) => deleteObject(path).catch((error) => console.error("[supplier-product-media] storage cleanup", error))));
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_media_deleted",
      before: { media_id: asset.id, kind: asset.kind }, after: null })
      .catch((error) => console.error("[supplier-product-media] audit", error));
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/crm/products/${id}/edit`);
    return NextResponse.json({ ok: true, message: "Đã xóa tệp nháp." });
  } catch (error) { console.error("[supplier-product-media] delete", error); return fail("Không xóa được tệp.", 503); }
}
