import Link from "next/link";
import {
  ArrowRight, Boxes, ClipboardCheck, FileQuestion, FolderTree, PackageCheck,
  ShieldCheck, Store, UsersRound, Activity,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui";
import { getStore } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { buildMarketplaceSnapshot } from "@/lib/dashboard/marketplace";
import { readSiteTraffic } from "@/lib/traffic/site";
import { buildSiteTrafficReport } from "@/lib/traffic/site-report";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { productReviewApproved, productBelongsToCategory } from "@/lib/public/product-selection";
import type { MediaAsset } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vận hành sàn | Vexim Trade" };

export default async function DashboardPage() {
  const session = await requireSession();
  const canSuppliers = hasPermission(session.role, "suppliers.view");
  const canProducts = hasPermission(session.role, "products.view");
  const canCategories = hasPermission(session.role, "categories.manage");
  const canViewReviews = hasPermission(session.role, "verifications.view");
  const canApprove = hasPermission(session.role, "verifications.approve");
  const canInspect = hasPermission(session.role, "verifications.inspect");
  const canManageSuppliers = hasPermission(session.role, "suppliers.manage");
  // Danh sách tài khoản chưa có hồ sơ nằm ở trang người dùng, chỉ vai trò quản lý tài khoản mở được.
  const canSeeAccounts = hasPermission(session.role, "users.manage");
  const canManageProducts = hasPermission(session.role, "products.manage");
  const canRfqs = hasPermission(session.role, "rfq.view");
  const canTraffic = hasPermission(session.role, "traffic.view");
  const store = getStore();
  const [suppliers, products, categories, verifications, requests, rfqs, trafficRows, supplierLogins] = await Promise.all([
    canSuppliers ? store.listSuppliers() : Promise.resolve([]),
    canProducts ? store.listProducts() : Promise.resolve([]),
    store.listCategories({ publishedOnly: false }),
    canViewReviews ? store.listVerifications() : Promise.resolve([]),
    canViewReviews ? store.listSupplierVerificationRequests().catch((error) => {
      console.error("[dashboard] verification requests unavailable", error);
      return null;
    }) : Promise.resolve(null),
    canRfqs ? store.listRfqs() : Promise.resolve([]),
    canTraffic ? readSiteTraffic(7).catch((error) => {
      console.error("[dashboard] site traffic unavailable", error);
      return null;
    }) : Promise.resolve(null),
    // Tài khoản NCC đã đăng ký nhưng chưa nộp hồ sơ: chưa có hàng suppliers để hiện ở hàng đợi.
    canManageSuppliers ? store.listUsers().catch((error) => {
      console.error("[dashboard] supplier logins unavailable", error);
      return [];
    }) : Promise.resolve([]),
  ]);
  const accountsWithoutProfile = supplierLogins.filter((u) => u.is_active && u.role === "supplier" && !u.supplier_id);
  // Only fetch media for plausible live offers, in bounded batches. Drafts and
  // internal files never become public merely because they are present in storage.
  const publishedIds = new Set(suppliers.filter((s) => s.status === "published" && !isSyntheticSupplier(s)).map((s) => s.id));
  const publishedCategories = categories.filter((c) => c.status === "published" && c.is_published);
  const candidates = products.filter((p) => publishedIds.has(p.supplier_id) && p.ready_for_buyer &&
    productReviewApproved(p) && publishedCategories.some((c) => productBelongsToCategory(p, c, categories)));
  const media: MediaAsset[] = [];
  for (let i = 0; i < candidates.length; i += 80) {
    media.push(...await store.listMediaForProducts(candidates.slice(i, i + 80).map((p) => p.id)));
  }
  const snapshot = buildMarketplaceSnapshot({ suppliers, products, categories, media, verifications,
    requests: requests ?? [], rfqs });
  const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));
  const isSupplierQuestion = (rfq: (typeof snapshot.newRfqs)[number]) =>
    rfq.source_page === "/rfq?intent=question" || rfq.specs?.inquiry_kind === "supplier_question";
  const newSupplierQuestions = snapshot.newRfqs.filter(isSupplierQuestion);
  const newQuoteRfqs = snapshot.newRfqs.filter((rfq) => !isSupplierQuestion(rfq));

  const queue: Array<{ id: string; label: string; detail: string; href: string; when: string; tone: string }> = [];
  if (canSeeAccounts) for (const u of accountsWithoutProfile) queue.push({
    id: `login:${u.id}`, label: u.email, detail: "Tài khoản NCC mới · chưa nộp hồ sơ doanh nghiệp",
    href: "/crm/settings/users", when: u.created_at ?? "", tone: "bg-rose-500",
  });
  if (canManageSuppliers) for (const s of snapshot.pendingSuppliers) queue.push({
    id: `supplier:${s.id}`, label: s.name, detail: "Tài khoản NCC · chờ xác nhận quyền truy cập",
    href: `/crm/suppliers/${s.id}`, when: s.updated_at, tone: "bg-sky-500",
  });
  if (canManageProducts) for (const p of snapshot.pendingProducts) queue.push({
    id: `product:${p.id}`, label: p.name, detail: `${supplierNames.get(p.supplier_id) ?? "NCC"} · sản phẩm chờ Vexim duyệt`,
    href: `/crm/products/${p.id}/edit`,
    when: p.updated_at, tone: "bg-amber-500",
  });
  if (canApprove) for (const v of snapshot.submittedReviews) queue.push({
    id: `review:${v.id}`, label: supplierNames.get(v.supplier_id) ?? "Nhà cung cấp",
    detail: `${v.target_level === 1 ? "Kiểm tra giấy tờ" : v.target_level === 2 ? "Xác thực nhà máy" : "Lịch sử giao hàng"} · chờ xét duyệt`,
    href: "/crm/verifications", when: v.updated_at, tone: "bg-violet-500",
  });
  if (canInspect) for (const r of snapshot.contactRequests) queue.push({
    id: `request:${r.supplier_id}:${r.target_level}`, label: supplierNames.get(r.supplier_id) ?? "Nhà cung cấp",
    detail: `${r.target_level === 2 ? "Xác thực nhà máy" : "Lịch sử giao hàng"} · yêu cầu liên hệ, chưa phải phê duyệt`,
    href: "/crm/verifications", when: r.requested_at, tone: "bg-ink-500",
  });
  if (canRfqs) for (const r of newQuoteRfqs) queue.push({
    id: `rfq:${r.id}`, label: r.code || "RFQ mới", detail: "Buyer gửi yêu cầu · cần tiếp nhận",
    href: "/crm/rfqs", when: r.created_at, tone: "bg-brand-500",
  });
  if (canRfqs) for (const r of newSupplierQuestions) queue.push({
    id: `rfq:${r.id}`, label: r.code || "Câu hỏi mới",
    detail: r.status === "needs_review" ? "Câu hỏi NCC · cần kiểm duyệt" : "Câu hỏi NCC · cần hỗ trợ giao email",
    href: "/crm/rfqs?status=question", when: r.created_at, tone: "bg-teal-500",
  });
  queue.sort((a, b) => b.when.localeCompare(a.when));
  const reviewCount = canViewReviews ? snapshot.submittedReviews.length : 0;
  const contactCount = canViewReviews ? snapshot.contactRequests.length : 0;
  const workload = queue.length;

  return (
    <>
      <PageHeader title="Trung tâm vận hành sàn" sub="Nhà cung cấp, sản phẩm và nội dung công khai là trọng tâm. RFQ và sale là luồng hỗ trợ buyer." />

      <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-ink-900 via-brand-900 to-brand-700 p-6 text-white shadow-lg sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-100">Vexim Trade · Marketplace operations</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Từ hồ sơ NCC đến listing cho buyer</h2>
            <p className="mt-2 text-sm leading-6 text-brand-100">Theo dõi từng cổng duyệt độc lập. NCC có tài khoản không đồng nghĩa được công khai; sản phẩm đã duyệt vẫn cần danh mục, ảnh/catalogue và trạng thái sẵn sàng.</p>
          </div>
          {canProducts && <Link href="/crm/products" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-brand-900 hover:bg-brand-50">Xem kho sản phẩm <ArrowRight className="h-4 w-4" /></Link>}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số vận hành sàn">
        <Metric icon={<Store className="h-5 w-5" />} label="NCC công khai" value={snapshot.publishedSuppliers.length}
          note="Trạng thái hồ sơ published" href={canSuppliers ? "/crm/suppliers" : undefined} />
        <Metric icon={<PackageCheck className="h-5 w-5" />} label="Sản phẩm đang hiển thị" value={snapshot.liveProducts.length}
          note="Đủ các điều kiện buyer-facing" href={canProducts ? "/crm/products" : undefined} />
        <Metric icon={<FolderTree className="h-5 w-5" />} label="Danh mục đã đăng" value={snapshot.publishedCategories.length}
          note={`${snapshot.categoriesWithOffers} danh mục có sản phẩm hiển thị`} href={canCategories ? "/crm/categories" : undefined} />
        <Metric icon={<ClipboardCheck className="h-5 w-5" />} label="Hồ sơ cần xử lý" value={workload}
          note={canViewReviews && requests === null ? "Chưa đọc được một phần yêu cầu kiểm định" : "Chờ xác nhận / duyệt / tiếp nhận"} href={workload ? "#marketplace-queue" : undefined} attention={workload > 0} />
      </div>

      {canTraffic && <Link href="/crm/traffic" className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Activity className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><strong className="block text-sm text-ink-900">Lưu lượng truy cập · 7 ngày</strong>
          <span className="mt-0.5 block text-xs text-ink-500">{trafficRows ? `${buildSiteTrafficReport(trafficRows, 7).total.toLocaleString("vi-VN")} lượt mở trang công khai, không phải người duy nhất` : "Chưa đọc được báo cáo · xem tình trạng kết nối"}</span></span>
        <span className="text-sm font-bold text-brand-700">Xem báo cáo →</span>
      </Link>}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        <Card className="overflow-hidden" >
          <div id="marketplace-queue" className="flex items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
            <div><h2 className="text-base font-bold text-ink-900">Hàng đợi vận hành</h2>
              <p className="mt-1 text-xs text-ink-500">Mở hồ sơ để kiểm tra; lưu hoặc tải file lên không tự phê duyệt.</p></div>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">{workload} mục</span>
          </div>
          {queue.length ? <ul className="divide-y divide-ink-100">
            {queue.slice(0, 7).map((item) => <li key={item.id}>
              <Link href={item.href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-ink-50 focus-visible:outline-offset-[-2px]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.tone}`} aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink-900">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">{item.detail}</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
              </Link>
            </li>)}
          </ul> : <p className="px-5 py-9 text-center text-sm text-ink-500">Chưa có hồ sơ trong các hàng đợi bạn được xem.</p>}
          {queue.length > 7 && <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">Hiển thị 7 mục gần nhất; mở từng khu vực để xem toàn bộ.</p>}
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-base font-bold text-ink-900">Các cổng kiểm soát</h2>
            <p className="mt-1 text-xs text-ink-500">Những bước riêng biệt, không cộng dồn thành một nhãn chứng nhận.</p>
            <div className="mt-4 space-y-2">
              {canManageSuppliers && <FlowRow href="/crm/suppliers" icon={<UsersRound className="h-4 w-4" />} label="Hồ sơ NCC chờ xác nhận" value={snapshot.pendingSuppliers.length} />}
              {canSeeAccounts && <FlowRow href="/crm/settings/users" icon={<UsersRound className="h-4 w-4" />} label="Tài khoản NCC chưa nộp hồ sơ" value={accountsWithoutProfile.length} />}
              {canManageProducts && <FlowRow href="/crm/products?review=pending" icon={<Boxes className="h-4 w-4" />} label="Sản phẩm chờ duyệt" value={snapshot.pendingProducts.length} />}
              {canApprove && <FlowRow href="/crm/verifications" icon={<ShieldCheck className="h-4 w-4" />} label="Đợt kiểm chờ xét duyệt" value={reviewCount} />}
              {canInspect && requests !== null && <FlowRow href="/crm/verifications" icon={<ClipboardCheck className="h-4 w-4" />} label="Yêu cầu liên hệ kiểm định" value={contactCount} />}
            </div>
            {canViewReviews && requests === null && <p className="mt-3 text-xs text-amber-800">Chưa đọc được yêu cầu kiểm định; xem trang xác minh để kiểm tra.</p>}
          </Card>
          {canRfqs && <Card className="p-5">
            <div className="flex items-center gap-2"><FileQuestion className="h-4 w-4 text-brand-700" /><h2 className="text-base font-bold text-ink-900">Nhu cầu từ buyer</h2></div>
            <p className="mt-2 text-sm text-ink-600">{newQuoteRfqs.length} RFQ mới hoặc cần rà soát; {newSupplierQuestions.length} câu hỏi NCC cần kiểm duyệt hoặc hỗ trợ giao. Đây không phải đơn hàng hay doanh thu.</p>
            <Link href="/crm/rfqs" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:underline">Mở hộp thư RFQ <ArrowRight className="h-4 w-4" /></Link>
          </Card>}
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-ink-500">Số liệu là ảnh chụp trạng thái hiện tại của dữ liệu nội bộ, không phải lượt truy cập, doanh số, GMV hay cam kết xác minh sản phẩm.</p>
    </>
  );
}

function Metric({ icon, label, value, note, href, attention = false }: {
  icon: React.ReactNode; label: string; value: number; note: string; href?: string; attention?: boolean;
}) {
  const inner = <><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${attention ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700"}`}>{icon}</span>
    <span className="mt-4 block text-3xl font-black tracking-tight text-ink-900">{value.toLocaleString("vi-VN")}</span>
    <span className="mt-1 block text-sm font-bold text-ink-800">{label}</span>
    <span className="mt-1 block text-xs text-ink-500">{note}</span></>;
  return href ? <Link href={href} className="flex min-h-44 flex-col rounded-xl border border-ink-200 bg-white p-4 shadow-sm transition hover:border-brand-400 hover:shadow-md">{inner}</Link>
    : <div className="flex min-h-44 flex-col rounded-xl border border-ink-200 bg-white p-4 shadow-sm">{inner}</div>;
}

function FlowRow({ href, icon, label, value }: { href: string; icon: React.ReactNode; label: string; value: number }) {
  return <Link href={href} className="flex items-center gap-3 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2.5 text-sm hover:border-brand-300 hover:bg-brand-50">
    <span className="text-brand-700">{icon}</span><span className="min-w-0 flex-1 text-ink-700">{label}</span>
    <strong className="text-ink-900">{value}</strong><ArrowRight className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
  </Link>;
}
