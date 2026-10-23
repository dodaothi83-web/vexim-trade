import { NextResponse } from "next/server";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierNoticeFeed } from "@/lib/supplier-portal/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tóm tắt thông báo cho chuông ở thanh trên.
 *
 * Cố ý chỉ trả vài dòng mới nhất: khung trang không được tải dữ liệu nặng, và mọi
 * lỗi đọc đều trả về rỗng để chuông không làm hỏng trang đang mở.
 */
export async function GET() {
  const access = await supplierPortalAccess().catch(() => null);
  if (!access || !portalApproved(access.supplier)) return NextResponse.json({ unread: 0, items: [] });
  const { store, supplier, reviews } = access;

  const [invites, reads, products, certificates, requests, submissions] = await Promise.all([
    store.listSupplierRfqInvitations(supplier.id).catch(() => []),
    store.listSupplierNoticeReads(supplier.id).catch(() => []),
    store.listProductsBySupplier(supplier.id).catch(() => []),
    store.listCertificates(supplier.id).catch(() => []),
    store.listSupplierVerificationRequests(supplier.id).catch(() => []),
    store.listSubmissions(supplier.id).catch(() => []),
  ]);

  const feed = buildSupplierNoticeFeed({ supplierId: supplier.id, supplier, invites, reads, products, certificates, reviews, requests, submissions });
  return NextResponse.json({
    unread: feed.unreadCount,
    items: feed.notices.slice(0, 5).map((n) => ({ key: n.key, title: n.title, at: n.at, read: n.read, kind: n.kind })),
  });
}
