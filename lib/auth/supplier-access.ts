import "server-only";

import { notFound } from "next/navigation";

import { getSession, type GateFailure, type SessionUser } from "@/lib/auth/session";
import { isSupplierScopedRole, ownsSupplier, supplierOwnerScope } from "@/lib/auth/supplier-scope";
import { getStore } from "@/lib/db";
import type { MediaAsset } from "@/lib/types";

/**
 * Kiểm tra phạm vi nhà cung cấp ở máy chủ cho mọi thao tác có mã nhà cung cấp,
 * sản phẩm, chứng nhận, đợt kiểm, hồ sơ NCC gửi hoặc tệp.
 *
 * Luôn gọi SAU khi đã kiểm tra quyền bằng `guard(...)`. Vai trò không bị giới hạn
 * (admin, trưởng kiểm duyệt...) đi qua ngay, không tốn thêm truy vấn.
 */
export const SUPPLIER_SCOPE_DENIED = "Nhà cung cấp này không do bạn phụ trách.";

const deny = (): GateFailure => ({ ok: false, message: SUPPLIER_SCOPE_DENIED });
const expired = (): GateFailure => ({ ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." });

async function scopedSession(): Promise<{ session: SessionUser | null; scoped: boolean }> {
  const session = await getSession();
  return { session, scoped: !!session && isSupplierScopedRole(session.role) };
}

/** Người dùng hiện tại có được thao tác trên nhà cung cấp này không. */
export async function canAccessSupplierId(session: SessionUser | null, supplierId: string | null | undefined): Promise<boolean> {
  if (!session) return false;
  if (!isSupplierScopedRole(session.role)) return true;
  if (!supplierId) return false;
  const supplier = await getStore().getSupplier(supplierId);
  return ownsSupplier(session, supplier);
}

export async function supplierGate(supplierId: string | null | undefined): Promise<GateFailure | null> {
  const { session, scoped } = await scopedSession();
  if (!session) return expired();
  if (!scoped) return null;
  return (await canAccessSupplierId(session, supplierId)) ? null : deny();
}

export async function productGate(productId: string | null | undefined): Promise<GateFailure | null> {
  const { session, scoped } = await scopedSession();
  if (!session) return expired();
  if (!scoped) return null;
  if (!productId) return deny();
  const product = await getStore().getProduct(productId);
  return product && (await canAccessSupplierId(session, product.supplier_id)) ? null : deny();
}

export async function certificateGate(certificateId: string | null | undefined): Promise<GateFailure | null> {
  const { session, scoped } = await scopedSession();
  if (!session) return expired();
  if (!scoped) return null;
  if (!certificateId) return deny();
  const certificate = await getStore().getCertificate(certificateId);
  return certificate && (await canAccessSupplierId(session, certificate.supplier_id)) ? null : deny();
}

export async function verificationGate(verificationId: string | null | undefined): Promise<GateFailure | null> {
  const { session, scoped } = await scopedSession();
  if (!session) return expired();
  if (!scoped) return null;
  if (!verificationId) return deny();
  const verification = await getStore().getVerification(verificationId);
  return verification && (await canAccessSupplierId(session, verification.supplier_id)) ? null : deny();
}

export async function submissionGate(submissionId: string | null | undefined): Promise<GateFailure | null> {
  const { session, scoped } = await scopedSession();
  if (!session) return expired();
  if (!scoped) return null;
  if (!submissionId) return deny();
  const submission = await getStore().getSubmission(submissionId);
  return submission && (await canAccessSupplierId(session, submission.supplier_id)) ? null : deny();
}

/** Tìm nhà cung cấp sở hữu một tệp (trực tiếp, qua sản phẩm, đợt kiểm hoặc hồ sơ gửi). */
export async function supplierIdOfMedia(media: Pick<MediaAsset, "supplier_id" | "product_id" | "verification_id" | "submission_id">): Promise<string | null> {
  if (media.supplier_id) return media.supplier_id;
  const store = getStore();
  if (media.product_id) return (await store.getProduct(media.product_id))?.supplier_id ?? null;
  if (media.verification_id) return (await store.getVerification(media.verification_id))?.supplier_id ?? null;
  if (media.submission_id) return (await store.getSubmission(media.submission_id))?.supplier_id ?? null;
  return null;
}

export async function mediaGate(mediaId: string | null | undefined): Promise<GateFailure | null> {
  const { session, scoped } = await scopedSession();
  if (!session) return expired();
  if (!scoped) return null;
  if (!mediaId) return deny();
  const media = await getStore().getMedia(mediaId);
  if (!media) return deny();
  return (await canAccessSupplierId(session, await supplierIdOfMedia(media))) ? null : deny();
}

export async function mediaAssetAllowed(session: SessionUser | null, media: Pick<MediaAsset, "supplier_id" | "product_id" | "verification_id" | "submission_id">): Promise<boolean> {
  if (!session) return false;
  if (!isSupplierScopedRole(session.role)) return true;
  return canAccessSupplierId(session, await supplierIdOfMedia(media));
}

/**
 * Tập id nhà cung cấp người dùng được thấy; null = tất cả.
 * Dùng để lọc danh sách (sản phẩm, chứng nhận, hàng chờ duyệt...).
 */
export async function allowedSupplierIds(session: SessionUser | null): Promise<Set<string> | null> {
  if (!session) return new Set();
  const scope = supplierOwnerScope(session);
  if (scope === null) return null;
  const suppliers = await getStore().listSuppliers();
  return new Set(suppliers.filter((s) => (s.owner_user_id ?? "") === scope).map((s) => s.id));
}

/** Ở tầng trang: nhà cung cấp không thuộc phạm vi thì trả 404, không lộ là có tồn tại. */
export async function requireSupplierInScope(session: SessionUser, supplierId: string | null | undefined): Promise<void> {
  if (!(await canAccessSupplierId(session, supplierId))) notFound();
}
