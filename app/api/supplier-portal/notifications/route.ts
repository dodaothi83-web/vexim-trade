import { NextResponse } from "next/server";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierNoticeFeed, buildSupplierRfqBoard } from "@/lib/supplier-portal/dashboard";
import { getLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Toàn bộ nội dung của chuông thông báo ở thanh trên. Không có trang thông báo riêng:
 * khung trang không tải dữ liệu nặng, và mọi lỗi đọc đều trả về rỗng để chuông không
 * làm hỏng trang đang mở.
 */
export async function GET() {
  const access = await supplierPortalAccess().catch(() => null);
  if (!access || !portalApproved(access.supplier)) return NextResponse.json({ unread: 0, readsKnown: true, pendingRfqs: 0, rfqsKnown: true, items: [] });
  const { store, supplier, reviews } = access;

  // Thiếu bảng dấu đã đọc thì mọi thông báo hiện như chưa đọc; nói rõ để nút đánh dấu
  // không hiện ra như một nút bấm không có tác dụng.
  let readsKnown = true;
  const reads = await store.listSupplierNoticeReads(supplier.id).catch(() => {
    readsKnown = false;
    return [];
  });
  let rfqsKnown = true;
  const [invites, products, certificates, requests, submissions] = await Promise.all([
    store.listSupplierRfqInvitations(supplier.id).catch((error) => { rfqsKnown = false; console.error("[supplier-notices] RFQ read failed", error); return []; }),
    store.listProductsBySupplier(supplier.id).catch(() => []),
    store.listCertificates(supplier.id).catch(() => []),
    store.listSupplierVerificationRequests(supplier.id).catch(() => []),
    store.listSubmissions(supplier.id).catch(() => []),
  ]);

  // Chuông là một phần của khung đã chuyển, nên nội dung thông báo theo ngôn ngữ đang chọn.
  const language = await getLocale();
  const feed = buildSupplierNoticeFeed({ supplierId: supplier.id, supplier, invites, reads, products, certificates, reviews, requests, submissions, language });
  return NextResponse.json({
    pendingRfqs: buildSupplierRfqBoard({ supplierId: supplier.id, invites, products, days: 30, language }).tasks.length,
    rfqsKnown,
    unread: readsKnown ? feed.unreadCount : 0,
    readsKnown,
    items: feed.notices.slice(0, 40).map((n) => ({
      key: n.key, title: n.title, detail: n.detail, at: n.at, read: n.read, kind: n.kind, href: n.href,
    })),
  });
}
