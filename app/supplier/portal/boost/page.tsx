import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock3, Eye, Layers3, Megaphone, MousePointerClick, Package, RefreshCw, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { dayKeyDaysAgo, totalsByPush } from "@/lib/sponsored/admin";
import { eligibleSupplierPushProducts, sponsoredRequestStore } from "@/lib/sponsored/requests";
import { supplierPushState, type SupplierPushState } from "@/lib/sponsored/supplier-view";
import type { Category, SupplierProduct, SponsoredPush, SponsoredPushDaily, SponsoredRequest } from "@/lib/types";
import { publicProductTitle } from "@/lib/public/display-name";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import type { PushCandidate } from "@/lib/sponsored/eligibility";
import { readOfferSettings, type OfferSettings } from "@/lib/sponsored/offer-settings";

// Fixed closed until the purchase flow and its safety checks are reviewed.
function supplierBoostClosed(): boolean { return true; }

export const dynamic = "force-dynamic";
export const metadata = { title: "Đẩy sản phẩm", robots: { index: false, follow: false } };

function stamp(value: string): string {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(d) : "—";
}
const stateInfo: Record<SupplierPushState, { label: string; className: string; note?: string }> = {
  draft: { label: "Nháp cũ", className: "bg-amber-50 text-amber-800", note: "Gói chưa bắt đầu và không còn được duyệt thủ công." },
  scheduled: { label: "Chưa bắt đầu", className: "bg-sky-50 text-sky-800" },
  live: { label: "Đang chạy", className: "bg-emerald-50 text-emerald-800", note: "Thẻ được chọn luân phiên." },
  paused: { label: "Tạm dừng", className: "bg-amber-50 text-amber-800", note: "Tạm dừng không kéo dài thời hạn." },
  ended: { label: "Hết hạn", className: "bg-ink-100 text-ink-600" },
  unavailable: { label: "Không hiển thị", className: "bg-rose-50 text-rose-800", note: "Vui lòng liên hệ nhân viên để kiểm tra." },
  unknown: { label: "Chưa xác định", className: "bg-ink-100 text-ink-600", note: "Chưa kiểm tra được điều kiện hiển thị." },
};
const requestLabels: Record<SponsoredRequest["status"], string> = { new: "Đã gửi", contacted: "Đã liên hệ", closed: "Đã kết thúc" };

export default async function SupplierBoostPage() {
  const strictStore = sponsoredRequestStore();
  let access: Awaited<ReturnType<typeof supplierPortalAccess>>;
  try { access = await supplierPortalAccess(strictStore ?? undefined); }
  catch (error) {
    console.error("[supplier-sponsored] could not verify identity", error);
    return <><PageHeader title="Đẩy sản phẩm" sub="Giới thiệu sản phẩm ở đầu trang danh mục." /><div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Chưa tải được trang. Hãy tải lại để thử lại.</div></>;
  }
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");

  // The feature is deliberately closed during setup. Do not make this an
  // environment toggle: reopening requires review of purchase and payment gates.
  if (supplierBoostClosed()) return <>
    <PageHeader title="Đẩy sản phẩm" sub="Tính năng đang được chuẩn bị." />
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      Tính năng đẩy sản phẩm hiện chưa mở. Bạn chưa thể đăng ký hoặc mua gói.
    </div>
  </>;

  let offer: OfferSettings | null = null;
  try { offer = await readOfferSettings(); }
  catch (error) { console.error("[supplier-sponsored] offer settings unavailable", error); }

  let candidates: PushCandidate[] = [];
  let requests: SponsoredRequest[] = [];
  let pushes: SponsoredPush[] = [];
  let ownProducts: SupplierProduct[] = [];
  let categories: Category[] = [];
  let candidateOk = false, requestsOk = false, pushesOk = false, metricsOk = false;
  let daily: SponsoredPushDaily[] = [];
  if (strictStore) {
    // Share scoped reads between the eligibility check and package labels.
    const productRead = strictStore.listProductsBySupplier(access.supplier.id);
    const categoryRead = strictStore.listCategories({ publishedOnly: false });
    const candidatesRead = Promise.all([productRead, categoryRead]).then(([products, categories]) =>
      eligibleSupplierPushProducts(strictStore, access.supplier, { products, categories }));
    const results = await Promise.allSettled([
      candidatesRead,
      strictStore.listSponsoredRequestsForSupplier(access.supplier.id),
      strictStore.listSponsoredPushesForSupplier(access.supplier.id),
      productRead,
      categoryRead,
    ] as const);
    if (results[0].status === "fulfilled") { candidates = results[0].value.filter((c) => c.supplierId === access.supplier.id); candidateOk = true; }
    else console.error("[supplier-sponsored] candidates unavailable", results[0].reason);
    if (results[1].status === "fulfilled") { requests = results[1].value.filter((r) => r.supplier_id === access.supplier.id); requestsOk = true; }
    else console.error("[supplier-sponsored] requests unavailable", results[1].reason);
    if (results[2].status === "fulfilled") { pushes = results[2].value.filter((p) => p.supplier_id === access.supplier.id); pushesOk = true; }
    else console.error("[supplier-sponsored] packages unavailable", results[2].reason);
    if (results[3].status === "fulfilled") ownProducts = results[3].value.filter((p) => p.supplier_id === access.supplier.id);
    else console.error("[supplier-sponsored] product names unavailable", results[3].reason);
    if (results[4].status === "fulfilled") categories = results[4].value;
    else console.error("[supplier-sponsored] category names unavailable", results[4].reason);
    if (pushesOk) {
      try {
        const ids = new Set(pushes.map((p) => p.id));
        daily = ids.size ? (await strictStore.listSponsoredPushDaily([...ids], dayKeyDaysAgo(Date.now(), 6))).filter((r) => ids.has(r.push_id)) : [];
        metricsOk = true;
      } catch (error) { console.error("[supplier-sponsored] metrics unavailable", error); }
    }
  }
  const now = Date.now();
  const totals = totalsByPush(daily, dayKeyDaysAgo(now, 6));
  const eligible = candidateOk ? new Set(candidates.map((p) => `${p.productId}\0${p.categorySlug}`)) : null;
  const candidateNames = new Map(ownProducts.map((p) => [p.id, withoutDirectContacts(publicProductTitle(p))]));
  const categoryNames = new Map(categories.map((c) => [c.slug, c.name_i18n?.vi || c.name_i18n?.en || "Danh mục"]));

  return <>
    <PageHeader title="Đẩy sản phẩm" sub="Giới thiệu sản phẩm ở đầu trang danh mục." />

    {strictStore?.mode === "local" && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><strong>Bản xem thử:</strong> dữ liệu chỉ được xem thử trên máy này, không phải hệ thống thật.</div>}

    <section className="relative overflow-hidden rounded-2xl bg-brand-900 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-7" aria-labelledby="boost-intro">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-28 size-72 rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-3 -top-20 size-56 rounded-full border border-white/10" />
      <div className="relative max-w-3xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-brand-100 uppercase"><Sparkles className="size-3" aria-hidden="true" /> Giới thiệu sản phẩm</span>
        <h2 id="boost-intro" className="mt-3 text-xl font-black tracking-tight sm:text-2xl">Thêm cơ hội được nhìn thấy</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-50/90">Sản phẩm có thể xuất hiện trong vùng tài trợ ở đầu trang danh mục khi khách chưa dùng bộ lọc. Thẻ có nhãn Tài trợ và được chọn luân phiên.</p>
        <div className="mt-5 grid gap-3 border-t border-white/15 pt-4 sm:grid-cols-3 sm:gap-4">
          <div className="flex items-start gap-2"><Layers3 className="mt-0.5 size-4 shrink-0 text-brand-300" aria-hidden="true" /><p className="text-xs leading-5"><strong className="block text-white">Vị trí</strong><span className="text-brand-100/80">Đầu trang danh mục</span></p></div>
          <div className="flex items-start gap-2"><Clock3 className="mt-0.5 size-4 shrink-0 text-brand-300" aria-hidden="true" /><p className="text-xs leading-5"><strong className="block text-white">Thời hạn gói mới</strong><span className="text-brand-100/80">168 giờ từ khi kích hoạt</span></p></div>
          <div className="flex items-start gap-2"><RefreshCw className="mt-0.5 size-4 shrink-0 text-brand-300" aria-hidden="true" /><p className="text-xs leading-5"><strong className="block text-white">Hiển thị</strong><span className="text-brand-100/80">Luân phiên, tối đa 1–3 thẻ tùy số sản phẩm</span></p></div>
        </div>
      </div>
    </section>

    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,390px)]">
      <div className="order-2 min-w-0 space-y-5 xl:order-1">
        <section className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm" aria-labelledby="packages-title">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 px-5 py-4 sm:px-6">
            <div><h2 id="packages-title" className="text-[15px] font-bold text-ink-900">Gói của bạn</h2><p className="mt-1 text-xs leading-5 text-ink-500">Trạng thái và số liệu của các gói đã được ghi nhận.</p></div>
            {pushesOk && <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-600">{pushes.length} gói</span>}
          </div>
          {!pushesOk ? <p role="alert" className="px-5 py-7 text-sm text-amber-800">Chưa tải được danh sách gói. Hãy tải lại trang để thử lại.</p>
            : !pushes.length ? <div className="px-5 py-9 text-center"><span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Megaphone className="size-5" aria-hidden="true" /></span><p className="mt-3 text-sm font-bold text-ink-800">Bạn chưa có gói đẩy sản phẩm</p><p className="mt-1 text-xs leading-5 text-ink-500">Chức năng tự mua gói đang được chuẩn bị.</p></div>
            : <ul className="divide-y divide-ink-100">{pushes.map((push) => {
              const info = stateInfo[supplierPushState(push, now, eligible)];
              const t = totals.get(push.id) ?? { impressions: 0, clicks: 0 };
              return <li key={push.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-bold text-ink-900">{candidateNames.get(push.product_id) || "Sản phẩm trong gói"}</p><p className="mt-1 text-xs text-ink-500">{push.surface === "category" ? categoryNames.get(push.category_slug) || "Danh mục sản phẩm" : "Vị trí cũ"}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${info.className}`}>{info.label}</span></div>
                {info.note && <p className="mt-2 text-xs leading-5 text-ink-500">{info.note}</p>}
                {push.status !== "draft" && <p className="mt-2 text-xs text-ink-500">{stamp(push.starts_at)} – {stamp(push.ends_at)} · giờ Việt Nam</p>}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-ink-100 pt-3 text-xs text-ink-600">
                  <span className="inline-flex items-center gap-1.5"><Eye className="size-4 text-ink-400" aria-hidden="true" /> <strong className="text-ink-800">{metricsOk ? t.impressions.toLocaleString("vi-VN") : "—"}</strong> lượt hiển thị</span>
                  <span className="inline-flex items-center gap-1.5"><MousePointerClick className="size-4 text-ink-400" aria-hidden="true" /> <strong className="text-ink-800">{metricsOk ? t.clicks.toLocaleString("vi-VN") : "—"}</strong> lượt bấm</span>
                  <span className="text-ink-400">7 ngày UTC gần nhất</span>
                </div>
              </li>;
            })}</ul>}
          {pushes.length > 0 && <p className="border-t border-ink-100 px-5 py-3 text-[11px] leading-5 text-ink-500">Lượt hiển thị/lượt bấm đo được, chỉ tính người xem đã đồng ý đo lường tiếp thị; số liệu bắt đầu từ khi hệ thống đo lường mới được triển khai, có thể thiếu và không phải số người xem. {metricsOk ? "Không cam kết số lượt hiển thị." : "Chưa tải được số liệu; dấu — không có nghĩa là 0."}</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm" aria-labelledby="requests-title">
          <div className="border-b border-ink-100 px-5 py-4 sm:px-6"><h2 id="requests-title" className="text-[15px] font-bold text-ink-900">Yêu cầu tư vấn trước đây</h2><p className="mt-1 text-xs text-ink-500">Lịch sử được giữ lại; không còn nhận yêu cầu mới.</p></div>
          {!requestsOk ? <p role="alert" className="px-5 py-7 text-sm text-amber-800">Chưa tải được yêu cầu. Hãy tải lại trang để kiểm tra.</p>
            : !requests.length ? <p className="px-5 py-7 text-sm text-ink-500">Bạn chưa gửi yêu cầu nào.</p>
            : <ul className="divide-y divide-ink-100">{requests.map((r) => <li key={r.id} className="px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-bold text-ink-900">{r.product_name}</p><p className="mt-1 text-xs text-ink-500">{r.category_name} · Gửi lúc {stamp(r.created_at)}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${r.status === "closed" ? "bg-ink-100 text-ink-600" : "bg-brand-50 text-brand-800"}`}>{requestLabels[r.status]}</span></div>
              {r.note && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-ink-600">{r.note}</p>}
            </li>)}</ul>}
        </section>
      </div>
      <div className="order-1 space-y-5 xl:order-2">
        <section id="mua-goi" aria-labelledby="buy-offer-title" className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
          <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">Chưa mở bán</span>
          <h2 id="buy-offer-title" className="mt-3 text-[15px] font-bold text-ink-900">Gói đẩy sản phẩm danh mục</h2>
          <p className="mt-1 text-xs leading-5 text-ink-500">Một sản phẩm · 168 giờ từ khi kích hoạt · hiển thị luân phiên khi chưa dùng bộ lọc.</p>
          <p className={`mt-3 text-sm font-bold text-ink-900 ${offer?.price_vnd != null ? "font-mono tabular-nums" : ""}`}>{!offer ? "Chưa tải được giá" : offer.price_vnd == null ? "Giá chưa được cấu hình" : `${offer.price_vnd.toLocaleString("vi-VN")} ₫`}</p>
          <p className="mt-2 text-xs leading-5 text-ink-500">Đang chuẩn bị chức năng mua, giữ chỗ và thanh toán. Giá và các điều kiện có thể thay đổi trước khi mở bán.</p>
          <button type="button" disabled className="btn btn-primary mt-4 w-full justify-center">Chưa thể mua gói</button>
        </section>
        <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="how-title">
          <h2 id="how-title" className="text-[15px] font-bold text-ink-900">Các bước tiếp theo</h2>
          <ol className="mt-4 space-y-4">{[
            ["1", "Chọn sản phẩm", "Chọn gói và một sản phẩm đủ điều kiện khi mở bán."],
            ["2", "Thanh toán", "Thanh toán trực tuyến sau khi hệ thống giữ chỗ."],
            ["3", "Kích hoạt", "Hệ thống kiểm tra và kích hoạt khi thanh toán được xác nhận."],
          ].map(([n, title, text]) => <li key={n} className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{n}</span><span><strong className="block text-xs text-ink-800">{title}</strong><span className="mt-1 block text-xs leading-5 text-ink-500">{text}</span></span></li>)}</ol>
        </section>
        <Link href="/supplier/portal/products" className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 text-sm font-semibold text-ink-700 shadow-sm hover:border-brand-300 hover:text-brand-800"><Package className="size-5 text-brand-700" aria-hidden="true" /> Quản lý sản phẩm <ArrowRight className="ml-auto size-4" aria-hidden="true" /></Link>
      </div>
    </div>
  </>;
}
