"use server";

import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { certificateLinkable, withRequestedProduct } from "@/lib/products/product-certificates";
import { certificateAppliesToCategory } from "@/lib/certificate-scope";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";

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
  const { m } = await getPortalMessages();
  const a = m.productEditor.productActions;
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) {
    return { ok: false, message: a.noAccess };
  }
  const productId = String(form.get("product_id") ?? "").trim();
  if (!productId) return { ok: false, message: a.missingProductLink };
  const product = await access.store.getProduct(productId);
  if (!product || product.supplier_id !== access.supplier.id) {
    return { ok: false, message: a.productNotYours };
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
        ? a.certificateExpired
        : a.certificateUnchanged,
    };
  }

  revalidatePath(`/supplier/portal/products/${productId}`);
  return {
    ok: true,
    message: expired
      ? `${fill(a.scopeRequested, { count: changed })}${fill(a.scopeSkippedExpired, { count: expired })}`
      : `${fill(a.scopeRequested, { count: changed })}${a.scopeRequestedStaff}`,
  };
}

/**
 * Nhà cung cấp bỏ tick một chứng nhận **thừa hưởng từ danh mục** cho sản phẩm này.
 *
 * Chỉ ghi vào `product_certificate_optouts`; không đụng phạm vi nhân viên đã xác nhận và
 * không xoá chứng nhận. Giấy mà nhân viên gắn thẳng cho sản phẩm thì không bỏ tick được —
 * quyết định đó là của Vexim.
 */
export async function setProductCertificateOptoutAction(form: FormData): Promise<CertificateRequestResult> {
  const { m } = await getPortalMessages();
  const a = m.productEditor.productActions;
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) {
    return { ok: false, message: a.noAccess };
  }
  const productId = String(form.get("product_id") ?? "").trim();
  if (!productId) return { ok: false, message: a.missingProductUpdate };
  const product = await access.store.getProduct(productId);
  if (!product || product.supplier_id !== access.supplier.id) {
    return { ok: false, message: a.productNotYours };
  }
  const wanted = new Set(form.getAll("certificate_ids").map((value) => String(value)).filter(Boolean));
  const certificates = await access.store.listCertificates(access.supplier.id);
  if (certificates.length === 0) return { ok: true, message: a.certificateUnchanged };
  const scopes = typeof access.store.listCertificateScopes === "function"
    ? await access.store.listCertificateScopes(certificates.map((certificate) => certificate.id)).catch(() => [])
    : [];
  if (scopes.length === 0) return { ok: true, message: a.certificateUnchanged };

  // Đường dẫn danh mục của sản phẩm, để biết giấy nào đang thừa hưởng từ danh mục.
  const categories = await access.store.listCategories({ publishedOnly: false }).catch(() => []);
  const category = product.reviewed_category_slug
    ? categories.find((item) => item.slug === product.reviewed_category_slug) ?? null
    : null;
  const parent = category?.parent_id ? categories.find((item) => item.id === category.parent_id) ?? null : null;
  const categoryPath = category ? [category.id, ...(parent ? [parent.id] : [])] : [];
  if (categoryPath.length === 0) return { ok: true, message: a.certificateUnchanged };

  let changed = 0;
  for (const certificate of certificates) {
    // Chỉ giấy thừa hưởng theo danh mục mới có lựa chọn bỏ nhận.
    if (!certificateAppliesToCategory(certificate, scopes, categoryPath)) continue;
    const directScope = scopes.some((scope) => scope.certificate_id === certificate.id &&
      scope.product_id === productId && Boolean(scope.verified_at));
    if (directScope) continue;
    const keep = wanted.has(certificate.id);
    await access.store.setCertificateOptout(access.supplier.id, productId, certificate.id, !keep);
    changed += 1;
  }

  revalidatePath(`/supplier/portal/products/${productId}`);
  if (!changed) return { ok: true, message: a.certificateUnchanged };
  return {
    ok: true,
    message: a.optoutSaved,
  };
}
