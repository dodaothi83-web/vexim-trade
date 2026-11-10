import { VeximBuyerAccountIcon } from "@/components/brand/account-role-icons";
import { VeximBuyerEnquiriesIcon, VeximBuyerSavedProductsIcon } from "@/components/brand/buyer-dashboard-icons";
import { BuyerSourcingHistory } from "@/components/buyer-sourcing-history";
import { sourcingStore } from "@/lib/sourcing/store";
import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, ClipboardList, Heart, UserRound, ArrowRight, Search, Headphones, PackageSearch, MessageCircle } from "lucide-react";
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
import { buyerDirectOutcome, buyerMatchHasUpdate, buyerMatchHasNewQuote } from "@/lib/rfq/portal-core";
import { deskHasNewReply } from "@/lib/rfq/mediated";
import { linkedSourcingRequestId, rfqChannel } from "@/lib/rfq/channel";

export const metadata: Metadata = { title: "Buyer account | Vexim Trade", robots: { index: false, follow: false } };
const panel = "rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6";

function requestStatus(rfq: Rfq, vi: boolean, published: boolean, outcome: "declined" | "no_response" | null = null) {
  const direct = rfqChannel(rfq) === "direct";
  if (direct && !published && outcome && (rfq.status === "matching" || rfq.status === "quoted")) {
    return outcome === "declined" ? (vi ? "Nhà cung cấp đã từ chối" : "Supplier declined")
      : (vi ? "Nhà cung cấp chưa phản hồi" : "No supplier reply yet");
  }
  switch (rfq.status) {
    case "new": return direct
      ? rfq.specs?.direct_delivery_version === "portal_direct_v2"
        ? (vi ? "Đang chuyển tới nhà cung cấp" : "Supplier delivery pending")
        : (vi ? "Chưa xác nhận đã chuyển" : "Delivery unconfirmed")
      : (vi ? "Vexim đã nhận" : "Received by Vexim");
    case "needs_review": case "spam": return vi ? "Đang kiểm tra yêu cầu" : "Request under review";
    case "matching": return direct
      ? (vi ? "Đã chuyển tới nhà cung cấp" : "Sent to supplier")
      : (vi ? "Vexim đang điều phối" : "Vexim coordinating");
    case "quoted": return published
      ? (vi ? "Có báo giá" : "Quote available")
      : (vi ? "Chưa có báo giá công bố" : "No published quote yet");
    case "sampling": return direct
      ? (vi ? "Yêu cầu đang mở" : "Request open")
      : (vi ? "Đang gửi mẫu" : "Samples in progress");
    case "won": case "lost": return vi ? "Đã kết thúc" : "Closed";
    default: return direct
      ? (vi ? "Yêu cầu đang mở" : "Request open")
      : (vi ? "Vexim đang xem yêu cầu" : "Vexim reviewing");
  }
}

export default async function BuyerAccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const query = await searchParams;
  const tab = ["requests", "vexim", "saved", "profile"].includes(query.tab ?? "") ? query.tab! : "overview";
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
  const directRequests = requests.filter((r) => rfqChannel(r) !== "sourcing");
  const sourcingRfqs = requests.filter((r) => rfqChannel(r) === "sourcing");
  const linkedRfqs = new Map(sourcingRfqs.map((r) => [linkedSourcingRequestId(r), { id: r.id, code: r.code }] as const)
    .filter((entry): entry is readonly [string, { id: string; code: string }] => !!entry[0]));
  const unlinkedSourcing = sourcing.filter((r) => !linkedRfqs.has(r.id));
  const countedRfqs = requests.filter((r) => rfqChannel(r) !== "question");
  const rfqById = new Map(requests.map((r) => [r.id, r]));
  // Only the verified buyer's RFQ IDs are queried; no other buyer's drafts or supplier data.
  const updates = await store.listRfqMatchUpdates(requests.filter((r) => rfqChannel(r) !== "question").map((r) => r.id))
    .catch((error) => { console.error("[buyer] RFQ notices unavailable", error); return []; });
  const publishedRequests = new Set(updates.filter((row) => !!row.sent_to_buyer_at).map((row) => row.rfq_id));
  const directOutcomes = new Map(directRequests.filter((r) => rfqChannel(r) === "direct").map((r) =>
    [r.id, buyerDirectOutcome(updates.filter((row) => row.rfq_id === r.id))] as const));
  const unreadByRequest = new Map<string, number>();
  for (const update of updates) {
    const request = rfqById.get(update.rfq_id);
    if (!request || !(rfqChannel(request) === "sourcing" ? buyerMatchHasNewQuote(update) : buyerMatchHasUpdate(update))) continue;
    unreadByRequest.set(update.rfq_id, (unreadByRequest.get(update.rfq_id) ?? 0) + 1);
  }
  let deskUnavailable = false;
  const desks = await store.listRfqMediatedThreads(sourcingRfqs.map((r) => r.id))
    .catch((error) => { console.error("[buyer] Vexim conversations unavailable", error); deskUnavailable = true; return []; });
  for (const desk of desks) if (desk.audience === "buyer" && deskHasNewReply(desk, "party")) {
    unreadByRequest.set(desk.rfq_id, (unreadByRequest.get(desk.rfq_id) ?? 0) + 1);
  }
  const unreadDirect = directRequests.filter((r) => unreadByRequest.has(r.id)).length;
  const unreadVexim = sourcingRfqs.filter((r) => unreadByRequest.has(r.id)).length;
  const savedRecords = savedGroups.flat();
  const savedById = new Map(savedRecords.map((r) => [r.card.id, r]));
  const titles = {
    overview: vi ? "Tổng quan" : "Overview",
    requests: vi ? "RFQ trực tiếp và câu hỏi cũ" : "Direct RFQs & previous questions",
    vexim: vi ? "Tìm nguồn qua Vexim" : "Vexim sourcing",
    messages: vi ? "Tin nhắn" : "Messages",
    saved: vi ? "Sản phẩm đã lưu" : "Saved products",
    profile: vi ? "Thông tin tài khoản" : "Account details",
  };
  // The menu uses short labels so six items fit a narrow rail (and a phone row) without
  // wrapping; the page heading keeps the full title.
  const navLabels = {
    overview: titles.overview, messages: titles.messages,
    requests: vi ? "RFQ trực tiếp" : "Direct RFQs",
    vexim: vi ? "Tìm nguồn" : "Sourcing",
    saved: vi ? "Đã lưu" : "Saved",
    profile: vi ? "Tài khoản" : "Account",
  };
  const nav = [{ id: "overview", icon: LayoutDashboard }, { id: "messages", icon: MessageCircle }, { id: "requests", icon: ClipboardList }, { id: "vexim", icon: Headphones }, { id: "saved", icon: Heart }, { id: "profile", icon: UserRound }] as const;
  // A converted free-form request and its linked RFQ are one buyer request.
  // Historical product questions are not RFQs and cannot still be "in progress".
  const activeSourcing = unlinkedSourcing.filter((r) => r.status !== "closed").length;
  const activeRequests = countedRfqs.filter((r) => !["won", "lost", "spam"].includes(r.status)).length;
  const day = (at: string) => new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(at));
  // One scannable, fully clickable row per request: what was asked, its reference, its state.
  const requestRow = (r: Rfq, input: { kind?: string; status: string; update?: string | null }) => <li key={r.id}>
    <Link prefetch={false} href={`/buyer/account/requests/${encodeURIComponent(r.id)}`}
      className="group -mx-2 flex flex-col gap-2 rounded-lg px-2 py-3 hover:bg-ink-50 sm:flex-row sm:items-center sm:gap-3 focus-visible:outline-2 focus-visible:outline-brand-600">
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-sm font-semibold text-ink-900 group-hover:text-brand-700">{r.product_text}</span>
        <span className="mt-0.5 block text-xs text-ink-500">{r.code} · {day(r.created_at)}{input.kind ? ` · ${input.kind}` : ""}</span>
      </span>
      <span className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
        {input.update && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900">{input.update}</span>}
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{input.status}</span>
      </span>
      <ArrowRight className="hidden h-4 w-4 shrink-0 text-ink-400 group-hover:text-brand-700 sm:block" aria-hidden />
    </Link>
  </li>;
  const viewAll = (href: string, count: number) => <Link href={href} className="text-sm font-semibold text-brand-700 hover:underline">{vi ? `Xem tất cả (${count})` : `View all (${count})`}</Link>;
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
        <aside className="min-w-0 lg:sticky lg:top-24">
          <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-ink-500 lg:mb-4">{vi ? "Tài khoản người mua" : "Buyer account"}</p>
          <nav aria-label={vi ? "Điều hướng tài khoản" : "Account navigation"} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">{nav.map(({ id, icon: Icon }) => <Link key={id} href={id === "overview" ? "/buyer/account" : id === "messages" ? "/buyer/account/messages" : `/buyer/account?tab=${id}`} aria-current={tab === id ? "page" : undefined} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold lg:gap-3 ${tab === id ? "bg-white text-brand-700 shadow-sm" : "text-ink-600 hover:bg-white"}`}><Icon className="h-4 w-4 shrink-0" aria-hidden />{navLabels[id]}{(id === "requests" ? unreadDirect : id === "vexim" ? unreadVexim : 0) > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 lg:ml-auto" aria-label={vi ? `${id === "vexim" ? unreadVexim : unreadDirect} yêu cầu có cập nhật mới` : `${id === "vexim" ? unreadVexim : unreadDirect} enquiries with new updates`}>{id === "vexim" ? unreadVexim : unreadDirect}</span>}</Link>)}</nav>
          <Link href="/#categories" className="mt-5 hidden items-center gap-2 px-3 text-sm font-semibold text-brand-700 lg:flex"><Search className="h-4 w-4" />{vi ? "Khám phá sản phẩm" : "Explore products"}</Link>
        </aside>
        <div className="min-w-0 space-y-5">
          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><VeximBuyerAccountIcon className="h-8 w-8" /></span><div className="min-w-0"><h1 className="text-xl font-bold text-ink-900">{titles[tab as keyof typeof titles]}</h1><p className="mt-1 break-all text-sm text-ink-500">{account.company_name || account.email}</p></div></div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/rfq" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{vi ? "Tạo RFQ tìm nguồn" : "New sourcing RFQ"}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
                <Link href="/suppliers" className="inline-flex min-h-10 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-800 hover:border-brand-300">{vi ? "Chọn nhà cung cấp" : "Choose a supplier"}</Link>
                <a href={`mailto:${COMPANY.contactEmail}`} className="inline-flex min-h-10 items-center gap-2 px-2 text-sm font-semibold text-brand-700 hover:underline"><Headphones className="h-4 w-4" aria-hidden />{vi ? "Hỗ trợ" : "Support"}</a>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 divide-x divide-ink-200 border-t border-ink-100 pt-4">{[{ value: sourcingUnavailable ? `${countedRfqs.length}+` : countedRfqs.length + unlinkedSourcing.length, label: vi ? "RFQ và tìm nguồn" : "RFQs & sourcing" }, { value: sourcingUnavailable ? `${activeRequests}+` : activeRequests + activeSourcing, label: vi ? "Đang mở" : "Open requests" }, { value: account.saved.products.length, label: titles.saved }].map((stat, i) => <p key={i} className="px-2 text-center"><strong className="block text-2xl text-ink-900">{stat.value}</strong><span className="mt-1 block text-xs text-ink-500 sm:text-sm">{stat.label}</span></p>)}</div>
          </section>
          {(tab === "overview" || tab === "requests") && <section className={panel} aria-label={titles.requests}>
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{titles.requests}</h2>{tab === "overview" && directRequests.length > 5 && viewAll("/buyer/account?tab=requests", directRequests.length)}</div>
            {!directRequests.length ? <div className="py-12 text-center"><VeximBuyerEnquiriesIcon className="mx-auto h-12 w-12 text-brand-700" /><p className="mt-4 font-semibold">{vi ? "Chưa có yêu cầu báo giá hoặc câu hỏi sản phẩm." : "No quote or product enquiries yet."}</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-500">{vi ? "Chọn nhà cung cấp hoặc sản phẩm để gửi RFQ trực tiếp. Tìm nguồn chung nằm ở mục Vexim." : "Choose a supplier or product for a direct RFQ. General sourcing is in the Vexim tab."}</p></div> : <ul className="mt-2 divide-y divide-ink-100">{(tab === "overview" ? directRequests.slice(0, 5) : directRequests).map((r) => {
              const question = rfqChannel(r) === "question";
              const updates = unreadByRequest.get(r.id) ?? 0;
              return requestRow(r, {
                kind: question ? (vi ? "Lịch sử câu hỏi" : "Previous product question") : undefined,
                status: question ? (vi ? "Câu hỏi cũ · chỉ để xem" : "Previous question · read-only")
                  : requestStatus(r, vi, publishedRequests.has(r.id), directOutcomes.get(r.id) ?? null),
                update: updates ? (vi ? `${updates} cập nhật mới` : `${updates} new update${updates === 1 ? "" : "s"}`) : null,
              });
            })}</ul>}
            {tab === "requests" && <p className="mt-4 rounded-xl bg-ink-50 p-3 text-xs leading-5 text-ink-500">{vi ? "RFQ trực tiếp trao đổi với nhà cung cấp. Câu hỏi cũ chỉ để xem. Chưa chọn được bên phù hợp? Tạo RFQ tìm nguồn MỚI." : "For direct RFQs, talk to your chosen supplier. Previous questions are read-only; use Chat with supplier for new ones. If no supplier fits, create a NEW sourcing RFQ."}</p>}
          </section>}
          {(tab === "overview" || tab === "vexim") && <section className={panel} aria-label={titles.vexim}>
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{titles.vexim}</h2>{tab === "overview" && sourcingRfqs.length > 5 && viewAll("/buyer/account?tab=vexim", sourcingRfqs.length)}</div>
            {tab === "vexim" && <p className="mt-2 text-sm leading-6 text-ink-600">{vi ? "Vexim trình các báo giá đã công bố trong RFQ liên kết. Liên hệ của bạn chỉ ở Vexim; mọi trao đổi tìm nguồn qua Vexim." : "Vexim presents published supplier quotes on the linked RFQ. Your contact stays with Vexim; all sourcing messages go through Vexim."}</p>}
            {deskUnavailable && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{vi ? "Chưa tải được cập nhật trao đổi. Thử lại sau." : "Conversation updates are temporarily unavailable. Please retry."}</p>}
            {!sourcingRfqs.length ? <p className="mt-4 text-sm text-ink-500">{vi ? "Chưa có RFQ tìm nguồn qua Vexim." : "No Vexim sourcing RFQs yet."}</p>
              : <ul className="mt-2 divide-y divide-ink-100">{(tab === "overview" ? sourcingRfqs.slice(0, 5) : sourcingRfqs).map((r) => requestRow(r, {
                status: requestStatus(r, vi, publishedRequests.has(r.id)),
                update: unreadByRequest.get(r.id) ? (vi ? "Có cập nhật từ Vexim" : "New Vexim update") : null,
              }))}</ul>}
          </section>}
          {(tab === "overview" || tab === "vexim") && <BuyerSourcingHistory rows={sourcing} vi={vi} unavailable={sourcingUnavailable} preview={tab === "overview"} linkedRfqs={linkedRfqs} />}
          {tab === "saved" && savedSection(false)}
          {tab === "profile" && <section className={panel}><h2 className="font-bold">{titles.profile}</h2><BuyerAccountProfile email={account.email} company={account.company_name ?? ""} isVi={vi} /></section>}
        </div>
        <aside className="min-w-0 space-y-5 lg:col-start-2 xl:col-start-auto">{tab !== "saved" && savedSection(true)}</aside>
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
