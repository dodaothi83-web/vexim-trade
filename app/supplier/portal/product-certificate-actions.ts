"use server";

import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { certificateLinkable, withRequestedProduct } from "@/lib/products/product-certificates";

export type CertificateRequestResult = { ok: boolean; message: string };

/**
 * Nhà cung cấp xin gắn chứng nhận đã nộp (hồ sơ Giấy tờ L1) vào một sản phẩm.
 *
 * Quy tắc:
 *  - Chỉ chứng nhận thuộc đúng nhà cung cấp và còn hạn mới được xin gắn.
 *  - Nhà cung cấp chỉ ghi vào `requested_product_ids`; quyền duyệt
 *    (`approved_product_ids`) thuộc về nhân viên Vexim.
 *  - Không tạo chứng nhận mới ở đây: hồ sơ L1 vẫn là nguồn duy nhất.
 */
export async function requestProductCertificatesAction(form: FormData): Promise<CertificateRequestResult> {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) {
    return { ok: false, message: "Tài khoản nhà cung cấp chưa được mở quyền sử dụng cổng." };
  }
  const productId = String(form.get("product_id") ?? "").trim();
  if (!productId) return { ok: false, message: "Thiếu sản phẩm cần gắn chứng nhận." };
  const product = await access.store.getProduct(productId);
  if (!product || product.supplier_id !== access.supplier.id) {
    return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
  }

  const selected = new Set(
    form.getAll("certificate_ids").map((value) => String(value)).filter(Boolean),
  );
  const certificates = await access.store.listCertificates(access.supplier.id);
  let changed = 0;
  let expired = 0;

  for (const certificate of certificates) {
    const wantLink = selected.has(certificate.id);
    const alreadyLinked = (certificate.approved_product_ids ?? []).includes(productId);
    if (wantLink && alreadyLinked) continue;
    if (wantLink && !certificateLinkable(certificate)) {
      expired += 1;
      continue;
    }
    const next = withRequestedProduct(certificate, productId, wantLink);
    const current = certificate.requested_product_ids ?? [];
    if (next.length === current.length && next.every((id, index) => id === current[index])) continue;
    await access.store.updateCertificate(certificate.id, { requested_product_ids: next });
    changed += 1;
  }

  if (!changed) {
    return {
      ok: true,
      message: expired
        ? "Chứng nhận đã hết hạn nên chưa gắn được. Cập nhật giấy mới ở mục Giấy tờ rồi thử lại."
        : "Danh sách chứng nhận không thay đổi.",
    };
  }

  revalidatePath(`/supplier/portal/products/${productId}`);
  return {
    ok: true,
    message: expired
      ? `Đã gửi ${changed} chứng nhận để Vexim duyệt gắn. ${expired} chứng nhận hết hạn nên bỏ qua.`
      : `Đã gửi ${changed} chứng nhận để Vexim duyệt gắn. Vexim phản hồi trong 24 giờ.`,
  };
}
