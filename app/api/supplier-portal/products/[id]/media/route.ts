import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { deleteObject, putObject } from "@/lib/media/storage";
import { prepareSupplierProductImage } from "@/lib/media/prepare-supplier-product-image";
import { isExpired } from "@/lib/media/readiness";
import type { MediaKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const canManage = (product: { supplier_review_status?: string; supplier_originated?: boolean }) =>
  product.supplier_review_status === "draft" || product.supplier_review_status === "changes_requested" ||
  ((product.supplier_review_status === "approved" || product.supplier_review_status === "paused") && product.supplier_originated === true);
const lockedMessage = (product: { supplier_review_status?: string }) => product.supplier_review_status === "pending"
  ? "Sản phẩm đang chờ duyệt; tạm khóa quản lý tệp."
  : "Tệp của sản phẩm này do bộ phận hỗ trợ quản lý. Vui lòng liên hệ để thay đổi.";

/** Draft files stay private; files added to an approved product are buyer-visible. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return fail("Tài khoản chưa được duyệt.", 403);
  const { id } = await params;
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) return fail("Sản phẩm không thuộc tài khoản của bạn.", 403);
  if (!canManage(product)) return fail(lockedMessage(product), 409);
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
  let prepared: Awaited<ReturnType<typeof prepareSupplierProductImage>> | null = null;
  if (kind === "image") {
    try { prepared = await prepareSupplierProductImage(bytes); }
    catch { return fail("Ảnh không đọc được hoặc kích thước quá lớn. Chọn ảnh JPG, PNG hoặc WebP khác."); }
  }
  const base = `products/${id}/${randomUUID()}`;
  const path = `${base}.${prepared ? "webp" : extensionFor(checked.mime)}`;
  const thumbPath = prepared ? `${base}-thumb.webp` : null;
  try {
    // Recheck ownership/status after image processing, before writing to storage.
    const fresh = await access.store.getProduct(id);
    if (!fresh || fresh.supplier_id !== access.supplier.id || !canManage(fresh)) return fail("Trạng thái sản phẩm đã thay đổi.", 409);
    await putObject(path, prepared?.main ?? bytes, prepared ? "image/webp" : checked.mime);
    if (prepared && thumbPath) await putObject(thumbPath, prepared.thumb, "image/webp");
    const row = await access.store.createMedia({
      owner_type: "product", product_id: id, supplier_id: access.supplier.id, verification_id: null,
      checklist_key: null, kind, audience: fresh.supplier_review_status === "approved" && fresh.ready_for_buyer ? "buyer" : "internal", status: "unverified", expires_on: null,
      caption: file.name.slice(0, 150), storage_path: path, thumb_path: thumbPath, external_url: null,
      mime: prepared ? "image/webp" : checked.mime, bytes: prepared?.main.length ?? bytes.length,
      width: prepared?.width ?? null, height: prepared?.height ?? null, sort_order: current.length,
      created_by: access.user.id,
    });
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_media_uploaded",
      before: null, after: { media_id: row.id, kind, audience: row.audience } }).catch((error) => console.error("[supplier-product-media] audit", error));
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/crm/products/${id}/edit`);
    return NextResponse.json({ ok: true, message: row.audience === "buyer"
      ? "Đã tải tệp lên sản phẩm đang hiển thị với buyer."
      : "Đã tải tệp nội bộ để kiểm tra; chưa chia sẻ cho buyer." });
  } catch (error) {
    await Promise.all([path, thumbPath].filter((p): p is string => !!p)
      .map((p) => deleteObject(p).catch(() => null)));
    console.error("[supplier-product-media] upload", error);
    return fail("Không lưu được tệp. Vui lòng thử lại.", 503);
  }
}

/** Supplier picks which of the product's own images represents it; picking never publishes or shares anything new. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return fail("Tài khoản chưa được duyệt.", 403);
  const { id } = await params;
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) return fail("Sản phẩm không thuộc tài khoản của bạn.", 403);
  if (!canManage(product)) return fail(lockedMessage(product), 409);
  let mediaId = "";
  try {
    const body = await request.json() as { media_id?: unknown };
    if (typeof body.media_id === "string") mediaId = body.media_id;
  } catch { return fail("Không đọc được yêu cầu."); }
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return fail("Mã ảnh không hợp lệ.");
  const asset = await access.store.getMedia(mediaId);
  // Ảnh đại diện phải là ảnh của đúng sản phẩm này, tài khoản nhìn thấy được và còn hiệu lực.
  if (!asset || asset.owner_type !== "product" || asset.product_id !== id || asset.supplier_id !== access.supplier.id ||
    asset.kind !== "image" || !asset.storage_path || isExpired(asset) ||
    (asset.created_by !== access.user.id && asset.audience !== "buyer"))
    return fail("Chỉ được chọn ảnh của đúng sản phẩm mà tài khoản này thấy được.", 403);
  if ((product.featured_media_id ?? null) === mediaId)
    return NextResponse.json({ ok: true, message: "Ảnh này đang là ảnh đại diện." });
  try {
    const fresh = await access.store.getProduct(id);
    if (!fresh || fresh.supplier_id !== access.supplier.id || !canManage(fresh))
      return fail("Trạng thái sản phẩm đã thay đổi.", 409);
    const updated = await access.store.updateSupplierProductIfState(id, access.supplier.id,
      { review: fresh.supplier_review_status ?? null, ready: fresh.ready_for_buyer }, { featured_media_id: mediaId });
    if (!updated) return fail("Trạng thái sản phẩm đã thay đổi.", 409);
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_featured_image_changed",
      before: { featured_media_id: product.featured_media_id ?? null }, after: { featured_media_id: mediaId } })
      .catch((error) => console.error("[supplier-product-media] audit", error));
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath("/products", "layout");
    return NextResponse.json({ ok: true, message: "Đã đặt ảnh đại diện; ảnh cũ về lại danh sách." });
  } catch (error) { console.error("[supplier-product-media] featured", error); return fail("Không lưu được ảnh đại diện.", 503); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return fail("Tài khoản chưa được duyệt.", 403);
  const { id } = await params;
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) return fail("Sản phẩm không thuộc tài khoản của bạn.", 403);
  if (!canManage(product)) return fail(lockedMessage(product), 409);
  const mediaId = new URL(request.url).searchParams.get("media_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return fail("Mã tệp không hợp lệ.");
  const asset = await access.store.getMedia(mediaId);
  if (!asset || asset.owner_type !== "product" || asset.product_id !== id || asset.supplier_id !== access.supplier.id ||
      asset.created_by !== access.user.id ||
      (product.supplier_review_status === "draft" && asset.audience !== "internal"))
    return fail("Không có quyền xóa tệp này.", 403);
  try {
    // Transaction kiểm tra lại quyền/trạng thái và tuần tự hóa hai lần xóa cùng
    // sản phẩm, nên không thể xóa mất tệp buyer cuối bằng hai yêu cầu đồng thời.
    const deleted = await access.store.deleteSupplierProductMedia(id, access.supplier.id, access.user.id, mediaId);
    if (deleted.status !== "deleted") {
      if (deleted.status === "forbidden") return fail("Không có quyền xóa tệp này.", 403);
      if (deleted.status === "last_file") return fail("Đây là tệp buyer cuối cùng. Hãy tải tệp thay thế trước khi xóa để sản phẩm vẫn hiển thị trên sàn.", 409);
      if (deleted.status === "has_links") return fail("Tệp đang được dữ liệu khác sử dụng. Vui lòng liên hệ bộ phận hỗ trợ để xử lý.", 409);
      return fail("Trạng thái sản phẩm đã thay đổi.", 409);
    }
    const paths = deleted.paths;
    const cleanup = await Promise.allSettled(paths.map(async (path) => {
      const prefix = `products/${id}/`;
      if (!path.startsWith(prefix) || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(path.slice(prefix.length)) ||
          await access.store.getMediaByPath(path)) throw new Error("Tệp nằm ngoài phạm vi sản phẩm hoặc còn được tham chiếu.");
      await deleteObject(path);
    }));
    const pendingPaths = paths.filter((_, index) => cleanup[index].status === "rejected");
    for (const path of pendingPaths) console.error("[supplier-product-media] storage cleanup failed", path);
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_media_deleted",
      before: { media_id: asset.id, kind: deleted.kind },
      after: { files_pending_cleanup: pendingPaths.length, pending_cleanup_paths: pendingPaths } })
      .catch((error) => console.error("[supplier-product-media] audit", error));
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath("/supplier/portal/products");
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath("/products", "layout");
    revalidatePath("/suppliers", "layout");
    revalidatePath("/");
    return NextResponse.json({ ok: true, warning: pendingPaths.length > 0, message: pendingPaths.length
      ? "Đã gỡ tệp khỏi sản phẩm, nhưng chưa dọn hết tệp trong kho. Vui lòng liên hệ bộ phận hỗ trợ để hoàn tất."
      : "Đã xóa tệp khỏi sản phẩm." });
  } catch (error) { console.error("[supplier-product-media] delete", error); return fail("Không xóa được tệp.", 503); }
}
