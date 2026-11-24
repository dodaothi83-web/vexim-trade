"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { canDecideSupplierRole } from "@/lib/auth/supplier-scope";
import { certificateGate, productGate } from "@/lib/auth/supplier-access";
import { getStore } from "@/lib/db";
import { withApprovedProduct } from "@/lib/products/product-certificates";
import { revalidatePublicCatalog } from "@/lib/public/revalidate-public";

export type ProductCertificateDecisionResult = { ok: boolean; message: string };

/**
 * Nhân viên Vexim duyệt hoặc bỏ duyệt liên kết chứng nhận ↔ sản phẩm.
 *
 * Dùng lại `certificates.approved_product_ids` nên không cần bảng mới. Bỏ duyệt cũng
 * rút yêu cầu của nhà cung cấp, để lần sau họ phải xin lại.
 */
export async function decideProductCertificateAction(form: FormData): Promise<ProductCertificateDecisionResult> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || !canDecideSupplierRole(session.role)) {
    return { ok: false, message: "Tài khoản của bạn không được duyệt liên kết chứng nhận." };
  }

  const productId = String(form.get("product_id") ?? "").trim();
  const certificateId = String(form.get("certificate_id") ?? "").trim();
  const decision = String(form.get("decision") ?? "");
  if (!productId || !certificateId) return { ok: false, message: "Yêu cầu không hợp lệ." };
  if (decision !== "approve" && decision !== "revoke") return { ok: false, message: "Yêu cầu không hợp lệ." };
  const scopeGate = (await productGate(productId)) ?? (await certificateGate(certificateId));
  if (scopeGate) return { ok: false, message: scopeGate.message };

  try {
    const store = getStore();
    const [product, certificate] = await Promise.all([store.getProduct(productId), store.getCertificate(certificateId)]);
    if (!product) return { ok: false, message: "Không tìm thấy sản phẩm." };
    if (!certificate) return { ok: false, message: "Không tìm thấy chứng nhận." };
    if (certificate.supplier_id !== product.supplier_id) {
      return { ok: false, message: "Chứng nhận không thuộc nhà cung cấp của sản phẩm này." };
    }
    const patch = withApprovedProduct(certificate, productId, decision === "approve");
    await store.updateCertificate(certificateId, patch);
    revalidatePublicCatalog();
    revalidatePath(`/crm/products/${encodeURIComponent(product.slug ?? product.id)}/edit`);
    revalidatePath(`/crm/suppliers/${encodeURIComponent(certificate.supplier_id)}/audit/documents`);
    return {
      ok: true,
      message: decision === "approve"
        ? "Đã duyệt liên kết. Chứng nhận hiện cùng sản phẩm."
        : "Đã bỏ liên kết. Nhà cung cấp cần xin lại nếu muốn gắn.",
    };
  } catch (error) {
    console.error("[product-certificate] staff decision", error);
    return { ok: false, message: "Chưa lưu được quyết định. Báo người phụ trách kỹ thuật rồi thử lại." };
  }
}

/**
 * Bản dùng trực tiếp trong `<form action>`: React chỉ nhận hàm trả `void`,
 * còn kết quả so sánh ở trên vẫn dùng cho `useActionState` và script kiểm tra.
 */
export async function decideProductCertificateFormAction(form: FormData): Promise<void> {
  await decideProductCertificateAction(form);
}
