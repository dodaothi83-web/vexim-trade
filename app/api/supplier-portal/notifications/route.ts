import { NextResponse } from "next/server";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierNoticeFeed } from "@/lib/supplier-portal/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Toàn bộ nội dung của chuông thông báo ở thanh trên. Không có trang thông báo riêng:
 * khung trang không tải dữ liệu nặng, và mọi lỗi đọc đều trả về rỗng để chuông không
 * làm hỏng trang đang mở.
 */
export async function GET() {
  const access = await supplierPortalAccess().catch(() => null);
  if (!access || !portalApproved(access.supplier)) return NextResponse.json({ unread: 0, readsKnown: true, items: [] });
  const { store, supplier, reviews } = access;

  // Thiếu bảng dấu đã đọc thì mọi thông báo hiện như chưa đọc; nói rõ để nút đánh dấu
  // không hiện ra như một nút bấm không có tác dụng.
  let readsKnown = true;
  const reads = await store.listSupplierNoticeReads(supplier.id).catch(() => {
    readsKnown = false;
    return [];
  });
  const [invites, products, certificates, requests, submissions] = await Promise.all([
    store.listSupplierRfqInvitations(supplier.id).catch(() => []),
    store.listProductsBySupplier(supplier.id).catch(() => []),
    store.listCertificates(supplier.id).catch(() => []),
    store.listSupplierVerificationRequests(supplier.id).catch(() => []),
    store.listSubmissions(supplier.id).catch(() => []),
  ]);

  const feed = buildSupplierNoticeFeed({ supplierId: supplier.id, supplier, invites, reads, products, certificates, reviews, requests, submissions });
  return NextResponse.json({
    unread: readsKnown ? feed.unreadCount : 0,
    readsKnown,
    items: feed.notices.slice(0, 40).map((n) => ({
      key: n.key, title: n.title, detail: n.detail, at: n.at, read: n.read, kind: n.kind, href: n.href,
    })),
  });
}
