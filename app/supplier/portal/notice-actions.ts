"use server";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierNoticeFeed } from "@/lib/supplier-portal/dashboard";

/** Read receipts can be set only for an event currently visible to this supplier. */
export async function markSupplierNoticeReadAction(form: FormData): Promise<void> {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return;
  const key = String(form.get("notice_key") ?? "");
  if (key.length > 100 || !/^(rfq|selected|returned|approved|contacted|product-approved|product-changes|cert-approved|cert-changes|cert-rejected|cert-published|cert-expiring|onboarding-approved|submission-queued|submission-returned|submission-accepted):[a-z0-9-]+$/i.test(key)) return;
  const { store, supplier, reviews } = access;
  // Bảng hồ sơ tự gửi có thể chưa được migrate; thiếu thì chỉ mất nhóm thông báo đó.
  const submissions = store.listSubmissions ? await store.listSubmissions(supplier.id).catch(() => []) : [];
  const [invites, requests, products, certificates] = await Promise.all([
    store.listSupplierRfqInvitations(supplier.id), store.listSupplierVerificationRequests(supplier.id),
    store.listProductsBySupplier(supplier.id), store.listCertificates(supplier.id),
  ]);
  const visible = buildSupplierNoticeFeed({ supplierId: supplier.id, supplier, invites, requests, reviews,
    products, certificates, submissions, reads: [] }).notices.some((n) => n.key === key);
  if (!visible) return;
  // Thiếu bảng dấu đã đọc (migration chưa chạy) thì bỏ qua thay vì làm sập cả trang.
  // Chuông đã ẩn nút này khi không đọc được trạng thái, đây là lớp chặn thứ hai.
  try {
    await store.markSupplierNoticeRead(supplier.id, key);
  } catch (error) {
    console.error("[supplier-portal] không lưu được dấu đã đọc thông báo", error);
  }
}
