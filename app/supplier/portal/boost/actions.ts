"use server";

import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { eligibleSupplierPushProducts, sponsoredRequestStore } from "@/lib/sponsored/requests";
import type { RequestResult } from "./types";

export async function submitSponsoredRequestAction(_previous: RequestResult, form: FormData): Promise<RequestResult> {
  const store = sponsoredRequestStore();
  if (!store) return { ok: false, message: "Chưa thể gửi yêu cầu lúc này. Vui lòng thử lại sau." };
  try {
    // Re-read identity using the same strict store as the request write. Form IDs
    // and a stale signed cookie never confer ownership or portal access.
    const access = await supplierPortalAccess(store);
    if (!access || !portalApproved(access.supplier)) return { ok: false, message: "Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại." };
    const productId = typeof form.get("product") === "string" ? String(form.get("product")).trim() : "";
    const note = typeof form.get("note") === "string" ? String(form.get("note")).trim() : "";
    if (!productId || productId.length > 100) return { ok: false, message: "Hãy chọn một sản phẩm." };
    if (note.length > 500) return { ok: false, message: "Lời nhắn tối đa 500 ký tự." };
    const candidate = (await eligibleSupplierPushProducts(store, access.supplier)).find((p) => p.productId === productId);
    if (!candidate || candidate.supplierId !== access.supplier.id) {
      return { ok: false, message: "Sản phẩm không còn đủ điều kiện. Hãy tải lại trang và kiểm tra sản phẩm." };
    }
    const created = await store.createSponsoredRequest({
      supplier_id: access.supplier.id,
      product_id: candidate.productId,
      requested_by: access.user.id,
      supplier_name: candidate.supplierName.slice(0, 300),
      product_name: candidate.name.slice(0, 300),
      category_slug: candidate.categorySlug.slice(0, 200),
      category_name: candidate.categoryName.slice(0, 300),
      requester_email: access.user.email.trim().slice(0, 320),
      note: note || null,
    });
    revalidatePath("/supplier/portal/boost");
    revalidatePath("/crm/sponsored");
    return { ok: true, requestId: created.id, message: store.mode === "local"
      ? "Đã lưu yêu cầu trong bản xem thử trên máy này. Chưa gửi đến hệ thống thật."
      : "Đã gửi yêu cầu. Nhân viên sẽ kiểm tra và liên hệ để báo giá." };
  } catch (error) {
    const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
    if (detail.includes("SPONSORED_REQUEST_ALREADY_OPEN")) {
      return { ok: false, message: "Sản phẩm này đã có yêu cầu đang xử lý. Bạn có thể xem ở danh sách bên dưới." };
    }
    console.error("[supplier-sponsored] request could not be recorded", error);
    // A network error may occur after the DB commit; do not assert it wasn't saved.
    return { ok: false, message: "Chưa xác nhận được yêu cầu. Hãy tải lại trang để kiểm tra trước khi gửi lại." };
  }
}
