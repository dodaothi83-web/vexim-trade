import { VeximBuyerAccountIcon } from "@/components/brand/account-role-icons";
import { VeximBuyerEnquiriesIcon, VeximBuyerSavedProductsIcon } from "@/components/brand/buyer-dashboard-icons";
import { BuyerSourcingHistory } from "@/components/buyer-sourcing-history";
import { sourcingStore } from "@/lib/sourcing/store";
import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, ClipboardList, Heart, UserRound, ArrowRight, Search, Headphones, PackageSearch } from "lucide-react";
import { requireBuyerSession } from "@/lib/auth/buyer-session";
import { getStore } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";
import { getPublicProductRecordsByIds, listPublicCategoryProducts, loadPublicProductCatalogSnapshot } from "@/lib/public/product-catalog";
import { buyerRecommendations } from "@/lib/public/buyer-recommendations";
import { HomeProductFeed } from "@/components/home-product-feed";
import { SaveProductButton } from "@/components/buyer-saved-products";
import { BuyerAccountProfile } from "@/components/buyer-account-profile";
import { COMPANY } from "@/lib/config";
import type { Rfq } from "@/lib/types";

export const metadata: Metadata = { title: "Buyer account | Vexim Trade", robots: { index: false, follow: false } };
const panel = "rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6";

function requestStatus(status: Rfq["status"], vi: boolean) {
  switch (status) {
    case "new": return vi ? "Đã nhận" : "Received";
    case "needs_review": case "spam": return vi ? "Đang xem xét" : "Under review";
    case "quoted": return vi ? "Đã gửi báo giá" : "Quote sent";
    case "won": case "lost": return vi ? "Đã kết thúc" : "Closed";
    default: return vi ? "Đang xử lý" : "In progress";
  }
}

export default async function BuyerAccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const query = await searchParams;
  const tab = ["requests", "saved", "profile"].includes(query.tab ?? "") ? query.tab! : "overview";
  const session = await requireBuyerSession(`/buyer/account${tab === "overview" ? "" : `?tab=${tab}`}`);
  const vi = (await getLocale()) === "vi";
  const store = getStore();
  const account = await store.getBuyerUserByEmail(session.email);
  if (!account?.verified_at) throw new Error("Buyer account unavailable");
  const [requests, savedGroups] = await Promise.all([
    store.listBuyerRfqsByEmail(session.email),
    Promise.all(Array.from({ length: Math.ceil(account.saved.products.length / 20) }, (_, i) =>
      getPublicProductRecordsByIds(account.saved.products.slice(i * 20, i * 20 + 20).map((p) => p.id)))),
  ]);
  let sourcingUnavailable = false;
  const sourcing = await (async () => {
    try { return await sourcingStore().listSourcingRequests(session.email); }
    catch (error) { console.error("[buyer] sourcing history unavailable", error); sourcingUnavailable = true; return []; }
  })();
  const savedRecords = savedGroups.flat();
  const savedById = new Map(savedRecords.map((r) => [r.card.id, r]));
  const titles = {
    overview: vi ? "Tổng quan" : "Overview",
    requests: vi ? "Yêu cầu của tôi" : "My enquiries",
    saved: vi ? "Sản phẩm đã lưu" : "Saved products",
    profile: vi ? "Thông tin tài khoản" : "Account details",
  };
  const nav = [{ id: "overview", icon: LayoutDashboard }, { id: "requests", icon: ClipboardList }, { id: "saved", icon: Heart }, { id: "profile", icon: UserRound }] as const;
  const activeSourcing = sourcing.filter((r) => r.status !== "closed").length;
  const activeRequests = requests.filter((r) => r.status !== "won" && r.status !== "lost").length;
  const savedSection = (preview: boolean) => <section className={panel} aria-label={titles.saved}>
    <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-ink-900">{titles.saved}</h2>{preview && account.saved.products.length > 0 && <Link href="/buyer/account?tab=saved" className="text-xs font-semibold text-brand-700">{vi ? "Xem tất cả" : "View all"}</Link>}</div>
    {!account.saved.products.length ? <div className="mt-5 rounded-xl bg-ink-50 px-4 py-8 text-center"><VeximBuyerSavedProductsIcon className="mx-auto h-12 w-12 text-brand-700" /><p className="mt-3 text-sm font-semibold">{vi ? "Chưa có sản phẩm đã lưu." : "No saved products yet."}</p><Link href="/#categories" className="mt-3 inline-block text-sm font-semibold text-brand-700 underline underline-offset-4">{vi ? "Khám phá sản phẩm" : "Explore products"}</Link></div> : <ul className={preview ? "mt-4 space-y-4" : "mt-5 grid gap-5 sm:grid-cols-2"}>
      {(preview ? account.saved.products.slice(0, 3) : account.saved.products).map((saved) => {
        const record = savedById.get(saved.id);
        const href = record ? `/products/${encodeURIComponent(record.category.slug)}/${encodeURIComponent(record.card.id)}` : "/buyer/account?tab=saved";
        const image = record?.card.cardImagePath ?? record?.card.imagePaths[0];
        return <li key={saved.id} className="flex min-w-0 gap-3 rounded-xl border border-ink-100 p-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">{image ? <img src={`/public-media/${image.replace(/^\//, "")}`} alt="" className="h-full w-full object-cover" loading="lazy" /> : <PackageSearch className="h-6 w-6 text-ink-300" />}</div>
          <div className="min-w-0 flex-1">{record ? <Link href={href} className="line-clamp-2 text-sm font-semibold hover:text-brand-700">{record.card.name}</Link> : <p className="text-sm text-ink-500">{vi ? "Sản phẩm không còn công khai." : "This product is no longer public."}</p>}
            <div className="mt-2"><SaveProductButton id={saved.id} href={href} removeOnly /></div>
          </div>
        </li>;
      })}
    </ul>}
  </section>;

  return <div lang={vi ? "vi" : "en"} className="bg-slate-50">
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_290px]">
        <aside className="lg:sticky lg:top-24">
          <p className="mb-4 px-3 text-xs font-bold uppercase tracking-wider text-ink-500">{vi ? "Tài khoản người mua" : "Buyer account"}</p>
          <nav aria-label={vi ? "Điều hướng tài khoản" : "Account navigation"} className="flex gap-1 overflow-x-auto lg:flex-col">{nav.map(({ id, icon: Icon }) => <Link key={id} href={id === "overview" ? "/buyer/account" : `/buyer/account?tab=${id}`} aria-current={tab === id ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${tab === id ? "bg-white text-brand-700 shadow-sm" : "text-ink-600 hover:bg-white"}`}><Icon className="h-4 w-4" aria-hidden />{titles[id]}</Link>)}</nav>
          <Link href="/#categories" className="mt-5 hidden items-center gap-2 px-3 text-sm font-semibold text-brand-700 lg:flex"><Search className="h-4 w-4" />{vi ? "Khám phá sản phẩm" : "Explore products"}</Link>
        </aside>
        <div className="min-w-0 space-y-5">
          <section className={panel}>
            <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><VeximBuyerAccountIcon className="h-8 w-8" /></span><div className="min-w-0"><h1 className="text-xl font-bold text-ink-900">{titles[tab as keyof typeof titles]}</h1><p className="mt-1 break-all text-sm text-ink-500">{account.company_name || account.email}</p></div></div><a href={`mailto:${COMPANY.contactEmail}`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><Headphones className="h-4 w-4" />{vi ? "Liên hệ hỗ trợ" : "Contact support"}</a></div>
            <div className="mt-6 grid grid-cols-3 divide-x divide-ink-200 border-t border-ink-100 pt-5">{[{ value: sourcingUnavailable ? `${requests.length}+` : requests.length + sourcing.length, label: titles.requests, tab: "requests" }, { value: sourcingUnavailable ? `${activeRequests}+` : activeRequests + activeSourcing, label: vi ? "Đang xử lý" : "In progress", tab: "requests" }, { value: account.saved.products.length, label: titles.saved, tab: "saved" }].map((stat, i) => <Link key={i} href={`/buyer/account?tab=${stat.tab}`} className="px-2 text-center"><strong className="block text-2xl text-ink-900">{stat.value}</strong><span className="mt-1 block text-xs text-ink-500 sm:text-sm">{stat.label}</span></Link>)}</div>
          </section>
          {(tab === "overview" || tab === "requests") && <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{titles.requests}</h2><Link href="/rfq" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700">{vi ? "Gửi yêu cầu báo giá" : "Request a quote"}<ArrowRight className="h-4 w-4" /></Link></div>
            {!requests.length ? <div className="py-12 text-center"><VeximBuyerEnquiriesIcon className="mx-auto h-12 w-12 text-brand-700" /><p className="mt-4 font-semibold">{vi ? "Chưa có yêu cầu báo giá hoặc câu hỏi sản phẩm." : "No quote or product enquiries yet."}</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-500">{vi ? "Chọn sản phẩm hoặc mô tả nhu cầu để nhận báo giá." : "Choose a product or describe what you need to request quotes."}</p></div> : <ul className="mt-4 divide-y divide-ink-100">{(tab === "overview" ? requests.slice(0, 5) : requests).map((r) => <li key={r.id} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-ink-500">{r.code} · {new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(r.created_at))}</p><span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{requestStatus(r.status, vi)}</span></div><p className="mt-2 text-xs font-semibold text-brand-700">{r.specs?.inquiry_kind === "supplier_question" ? (vi ? "Câu hỏi sản phẩm" : "Product enquiry") : (vi ? "Yêu cầu báo giá" : "Quote request")}</p><p className="mt-2 font-semibold">{r.product_text}</p><Link href={`/buyer/account/requests/${encodeURIComponent(r.id)}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">{vi ? "Xem chi tiết" : "View details"}<ArrowRight className="h-3 w-3" /></Link></li>)}</ul>}
            {tab === "overview" && requests.length > 5 && <Link href="/buyer/account?tab=requests" className="mt-4 inline-block text-sm font-semibold text-brand-700">{vi ? "Xem tất cả yêu cầu" : "View all requests"}</Link>}
            <p className="mt-4 rounded-xl bg-ink-50 p-3 text-xs leading-5 text-ink-500">{vi ? "Vexim hỗ trợ kết nối. Bạn thỏa thuận và ký hợp đồng trực tiếp với nhà cung cấp." : "Vexim helps you connect. You agree terms and sign contracts directly with the supplier."}</p>
          </section>}
          {(tab === "overview" || tab === "requests") && <BuyerSourcingHistory rows={sourcing} vi={vi} unavailable={sourcingUnavailable} preview={tab === "overview"} />}
          {tab === "saved" && savedSection(false)}
          {tab === "profile" && <section className={panel}><h2 className="font-bold">{titles.profile}</h2><BuyerAccountProfile email={account.email} company={account.company_name ?? ""} isVi={vi} /></section>}
        </div>
        <aside className="min-w-0 space-y-5 lg:col-start-2 xl:col-start-auto">{tab !== "saved" && savedSection(true)}<section className={panel}><h2 className="font-bold">{vi ? "Bạn cần tìm nguồn hàng?" : "Looking for a product?"}</h2><p className="mt-3 text-sm leading-6 text-ink-500">{vi ? "Gửi yêu cầu báo giá miễn phí. Vexim sẽ tìm nhà cung cấp phù hợp." : "Send a quote request free of charge. Vexim will look for suitable suppliers."}</p><Link href="/rfq" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700">{vi ? "Mô tả nhu cầu" : "Tell us what you need"}<ArrowRight className="h-4 w-4" /></Link></section></aside>
      </div>
      <div className="mt-8 lg:ml-[220px] xl:ml-[230px]"><Recommendations savedIds={account.saved.products.map((p) => p.id)} categorySlugs={[...new Set(savedRecords.map((r) => r.category.slug))]} vi={vi} /></div>
    </div>
  </div>;
}

async function Recommendations({ savedIds, categorySlugs, vi }: { savedIds: string[]; categorySlugs: string[]; vi: boolean }) {
  try {
    const categories = (await getStore().listCategories({ publishedOnly: true })).filter((c) => !categorySlugs.length || categorySlugs.includes(c.slug));
    const snapshot = await loadPublicProductCatalogSnapshot({ categories });
    const groups = await Promise.all(categories.map(async (category) => (await listPublicCategoryProducts(category, { snapshot })).map((p) => ({ ...p, categorySlug: category.slug }))));
    const items = buyerRecommendations(groups.flat(), savedIds, categorySlugs);
    return <section className="pb-8"><h2 className="text-xl font-bold">{categorySlugs.length ? (vi ? "Sản phẩm cùng ngành hàng" : "Products in the same categories") : (vi ? "Khám phá thêm sản phẩm" : "Explore more products")}</h2><p className="mt-2 text-sm leading-6 text-ink-500">{categorySlugs.length ? (vi ? "Cùng ngành hàng với sản phẩm đã lưu. Hãy kiểm tra quy cách trước khi gửi yêu cầu." : "From the same categories as your saved products. Check specifications before requesting a quote.") : (vi ? "Các sản phẩm công khai trên Vexim Trade." : "Public products on Vexim Trade.")}</p>{items.length ? <HomeProductFeed items={items} isVi={vi} perPage={10} /> : <p className="mt-5 rounded-xl bg-white p-6 text-sm text-ink-500">{vi ? "Chưa có sản phẩm khác để gợi ý." : "No other products to suggest yet."} <Link href="/#categories" className="font-semibold text-brand-700 underline">{vi ? "Xem ngành hàng" : "Browse categories"}</Link></p>}</section>;
  } catch {
    return <p role="status" className="rounded-xl border border-ink-200 bg-white p-6 text-sm text-ink-600">{vi ? "Chưa tải được gợi ý sản phẩm. Vui lòng thử lại sau." : "Product suggestions could not be loaded. Please try again later."}</p>;
  }
}
