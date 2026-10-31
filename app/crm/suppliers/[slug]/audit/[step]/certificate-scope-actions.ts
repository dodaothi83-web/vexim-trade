"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { certificateSchemeLabel, isScopeableCertificateScheme } from "@/lib/certificate-scheme";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const result = (ok: boolean, message: string) => ({ ok, message });

function refresh(supplierId: string, slug?: string | null) {
  revalidatePath(`/crm/suppliers/${supplierId}`);
  revalidatePath(`/crm/suppliers/${supplierId}/audit/documents`);
  revalidatePath("/crm/certificates");
  revalidatePath("/supplier/portal");
  revalidatePath("/supplier/portal/documents");
  if (slug) revalidatePath(`/suppliers/${slug}`);
}

function briefReason(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error ?? "")).replace(/\s+/g, " ").trim();
  return text.slice(0, 180) || "không rõ nguyên nhân";
}

async function authorize(supplierId: string, certificateId: string) {
  if ((await guard("verifications.inspect")) !== null) {
    return { error: result(false, "Bạn không có quyền xác nhận phạm vi chứng nhận.") };
  }
  const session = await getSession();
  if (!session || !hasPermission(session.role, "verifications.inspect")) {
    return { error: result(false, "Bạn không có quyền xác nhận phạm vi chứng nhận.") };
  }
  if (!uuid.test(supplierId) || !uuid.test(certificateId)) {
    return { error: result(false, "Mã chứng nhận không hợp lệ.") };
  }
  const store = getStore();
  const [supplier, certificate] = await Promise.all([
    store.getSupplier(supplierId),
    store.getCertificate(certificateId),
  ]);
  if (!supplier || !certificate || certificate.supplier_id !== supplier.id) {
    return { error: result(false, "Không tìm thấy chứng nhận của nhà cung cấp này.") };
  }
  return { store, supplier, certificate, session };
}

/**
 * Xác nhận một phạm vi cho chứng nhận: một danh mục hoặc một sản phẩm.
 *
 * Chỉ giấy chất lượng đã xếp loại mới có phạm vi; giấy pháp lý và giấy theo lô không
 * bao giờ được gắn sản phẩm, nên không thể thành nhãn hay chip cho người mua.
 */
export async function addCertificateScopeAction(
  supplierId: string,
  certificateId: string,
  target: { categoryId?: string | null; productId?: string | null },
) {
  try {
    const auth = await authorize(supplierId, certificateId);
    if (auth.error) return auth.error;
    const { store, supplier, certificate, session } = auth;
    if (!isScopeableCertificateScheme(certificate.certificate_scheme ?? null)) {
      return result(false, certificate.certificate_scheme
        ? `“${certificate.name}” là ${certificateSchemeLabel(certificate.certificate_scheme, "vi")} — loại giấy này không gắn sản phẩm.`
        : "Chưa phân loại loại giấy nên chưa gắn được phạm vi. Chọn loại trước.");
    }
    const categoryId = (target.categoryId ?? "").trim() || null;
    const productId = (target.productId ?? "").trim() || null;
    if (Boolean(categoryId) === Boolean(productId)) {
      return result(false, "Mỗi dòng phạm vi chỉ gắn cho một danh mục hoặc một sản phẩm.");
    }
    if (categoryId) {
      const category = await store.getCategory(categoryId);
      if (!category) return result(false, "Danh mục không hợp lệ.");
    }
    if (productId) {
      const product = await store.getProduct(productId);
      if (!product || product.supplier_id !== supplier.id) {
        return result(false, "Sản phẩm không thuộc nhà cung cấp này.");
      }
    }
    const existing = await store.listCertificateScopes([certificate.id]);
    if (existing.some((scope) => (categoryId ? scope.category_id === categoryId : scope.product_id === productId))) {
      return result(true, "Phạm vi này đã có.");
    }
    await store.createCertificateScope({
      certificate_id: certificate.id,
      category_id: categoryId,
      product_id: productId,
      verified_by: session.email,
      verified_at: new Date().toISOString(),
    });
    await store
      .addAuditLog({
        actor_id: session.uid,
        actor_email: session.email,
        entity: "supplier",
        entity_id: supplier.id,
        action: "certificate.scope_add",
        before: null,
        after: { certificate_id: certificate.id, category_id: categoryId, product_id: productId },
      })
      .catch((error) => console.error("[certificate] scope audit", error));
    refresh(supplier.id, supplier.slug);
    return result(true, `Đã xác nhận phạm vi cho “${certificate.name}”.`);
  } catch (error) {
    console.error("[certificate] add scope failed", error);
    return result(false, `Chưa lưu được phạm vi (${briefReason(error)}).`);
  }
}

/** Bỏ một dòng phạm vi đã xác nhận. */
export async function removeCertificateScopeAction(supplierId: string, certificateId: string, scopeId: string) {
  try {
    const auth = await authorize(supplierId, certificateId);
    if (auth.error) return auth.error;
    const { store, supplier, certificate, session } = auth;
    if (!uuid.test(scopeId)) return result(false, "Phạm vi không hợp lệ.");
    const scopes = await store.listCertificateScopes([certificate.id]);
    const scope = scopes.find((row) => row.id === scopeId);
    if (!scope) return result(false, "Không tìm thấy phạm vi của chứng nhận này.");
    await store.deleteCertificateScope(scope.id);
    await store
      .addAuditLog({
        actor_id: session.uid,
        actor_email: session.email,
        entity: "supplier",
        entity_id: supplier.id,
        action: "certificate.scope_remove",
        before: { certificate_id: certificate.id, category_id: scope.category_id, product_id: scope.product_id },
        after: null,
      })
      .catch((error) => console.error("[certificate] scope audit", error));
    refresh(supplier.id, supplier.slug);
    return result(true, `Đã bỏ một phạm vi của “${certificate.name}”.`);
  } catch (error) {
    console.error("[certificate] remove scope failed", error);
    return result(false, `Chưa bỏ được phạm vi (${briefReason(error)}).`);
  }
}

/** Công khai / để nội bộ một chứng nhận đã duyệt. */
export async function setCertificateVisibilityAction(supplierId: string, certificateId: string, isPublic: boolean) {
  try {
    const auth = await authorize(supplierId, certificateId);
    if (auth.error) return auth.error;
    const { store, supplier, certificate, session } = auth;
    if (isPublic && certificate.review_status !== "approved") {
      return result(false, "Chứng nhận chưa duyệt nên chưa công khai được.");
    }
    if (isPublic && certificate.superseded_by_certificate_id) {
      return result(false, "Giấy này đã được thay bằng bản mới; không bật lại bản cũ.");
    }
    const updated = await store.updateCertificate(certificate.id, { publicly_visible: isPublic });
    if (!updated) return result(false, "Không cập nhật được chế độ công khai.");
    await store
      .addAuditLog({
        actor_id: session.uid,
        actor_email: session.email,
        entity: "supplier",
        entity_id: supplier.id,
        action: "certificate.visibility",
        before: { id: certificate.id, publicly_visible: Boolean(certificate.publicly_visible) },
        after: { id: certificate.id, publicly_visible: isPublic },
      })
      .catch((error) => console.error("[certificate] visibility audit", error));
    refresh(supplier.id, supplier.slug);
    return result(true, isPublic
      ? `“${certificate.name}” đã chuyển sang công khai (chỉ hiện khi còn hạn và có phạm vi).`
      : `“${certificate.name}” đã chuyển sang nội bộ; người mua không còn thấy.`);
  } catch (error) {
    console.error("[certificate] visibility failed", error);
    return result(false, `Chưa đổi được chế độ công khai (${briefReason(error)}).`);
  }
}

/**
 * Duyệt yêu cầu mở rộng phạm vi của nhà cung cấp: chuyển `requested_product_ids`
 * thành một dòng phạm vi cho đúng sản phẩm đó (hoặc rút yêu cầu đi).
 */
export async function answerCertificateScopeRequestAction(
  supplierId: string,
  certificateId: string,
  productId: string,
  approve: boolean,
) {
  try {
    const auth = await authorize(supplierId, certificateId);
    if (auth.error) return auth.error;
    const { store, supplier, certificate, session } = auth;
    if (!uuid.test(productId)) return result(false, "Sản phẩm không hợp lệ.");
    const product = await store.getProduct(productId);
    if (!product || product.supplier_id !== supplier.id) {
      return result(false, "Sản phẩm không thuộc nhà cung cấp này.");
    }
    if (approve && !isScopeableCertificateScheme(certificate.certificate_scheme ?? null)) {
      return result(false, "Chưa phân loại loại giấy nên chưa mở được phạm vi.");
    }
    const requested = (certificate.requested_product_ids ?? []).filter((id) => id !== productId);
    await store.updateCertificate(certificate.id, { requested_product_ids: requested });
    if (approve) {
      const scopes = await store.listCertificateScopes([certificate.id]);
      const already = scopes.some((scope) => scope.product_id === productId);
      if (!already) {
        await store.createCertificateScope({
          certificate_id: certificate.id,
          category_id: null,
          product_id: productId,
          verified_by: session.email,
          verified_at: new Date().toISOString(),
        });
      }
    }
    await store
      .addAuditLog({
        actor_id: session.uid,
        actor_email: session.email,
        entity: "supplier",
        entity_id: supplier.id,
        action: approve ? "certificate.scope_grant" : "certificate.scope_request_declined",
        before: { certificate_id: certificate.id, product_id: productId },
        after: null,
      })
      .catch((error) => console.error("[certificate] scope request audit", error));
    refresh(supplier.id, supplier.slug);
    return result(true, approve
      ? `Đã mở phạm vi “${certificate.name}” cho sản phẩm này.`
      : `Đã từ chối yêu cầu mở rộng phạm vi của “${certificate.name}”.`);
  } catch (error) {
    console.error("[certificate] scope request failed", error);
    return result(false, `Chưa xử lý được yêu cầu (${briefReason(error)}).`);
  }
}
