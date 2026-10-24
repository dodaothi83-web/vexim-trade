import "server-only";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { ownsDocumentReview } from "./policy";

/** Account identity may exist before the first business profile; never trust form IDs or the signed cookie alone. */
export async function supplierAccountAccess() {
  const session = await getSession();
  if (!session || session.role !== "supplier") return null;
  const store = getStore();
  const user = await store.getUser(session.uid);
  if (!user || user.role !== "supplier" || !user.is_active ||
      user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) return null;
  return { store, user };
}

/** All protected portal actions still require a linked supplier page. */
export async function supplierPortalAccess() {
  const account = await supplierAccountAccess();
  const supplierId = account?.user.supplier_id;
  if (!account || !supplierId) return null;
  const { store, user } = account;
  const supplier = await store.getSupplier(supplierId);
  if (!supplier) return null;
  const reviews = await store.listVerifications(supplier.id);
  /*
   * Một NCC có thể có nhiều đợt kiểm L1: đợt cũ đã duyệt và đợt mới đang mở.
   * Bản ghi lấy theo thứ tự kho dữ liệu nên có lúc trả về đợt cũ, khiến cổng
   * hiện "Đã duyệt" và không cho tải tệp dù đợt mới vẫn đang mở. Chọn đợt mới
   * nhất trong các đợt còn mở; nếu không có đợt nào mở thì lấy đợt mới nhất.
   */
  const docReviews = reviews
    .filter((v) => ownsDocumentReview(user, v))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const review = docReviews.find((v) => v.status === "in_progress" || v.status === "returned")
    ?? docReviews[0]
    ?? null;
  return { store, user, supplier, review, reviews };
}
