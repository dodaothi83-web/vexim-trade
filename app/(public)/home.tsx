import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  FileStack,
  HelpCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  LockKeyhole,
  Plus,
} from "lucide-react";

import { getStore } from "@/lib/db";
import { listPublishedNews } from "@/lib/blog/queries";
import { listPublicCategoryProducts, loadPublicProductCatalogSnapshot, type PublicCategoryProduct } from "@/lib/public/product-catalog";
import { balanceHomepageCategories, HOME_FEED_PER_SUPPLIER } from "@/lib/public/supplier-product-order";
import { HomeProductFeed } from "@/components/home-product-feed";
import { ServiceRegistrationSection, type HomeLocale } from "@/components/service-registration-section";
import { buildPopularSearches } from "@/lib/public/popular-searches";
import { getCategoryTitle } from "@/lib/public/category-names";
import { HOME_HERO_LINE } from "@/lib/public/meta-copy";
import { PlatformLegalStrip } from "@/components/platform-legal-strip";
import type { Category } from "@/lib/types";

/** Ảnh placeholder khi category chưa upload hero_image */
const FALLBACK_HERO = "/images/home/hero-cashew-texture.jpg";

// Ảnh thật: Vietnamese Farmer Sorting Coffee Beans, 1500m Coffee, Lâm Đồng.
// Nguồn: https://www.pexels.com/photo/vietnamese-farmer-sorting-coffee-beans-30658831/
// Pexels cho phép dùng miễn phí trên website. CDN trả WebP đúng độ rộng, không dùng ảnh AI.
const HOME_HERO_PHOTO = "https://images.pexels.com/photos/30658831/pexels-photo-30658831/free-photo-of-vietnamese-farmer-sorting-coffee-beans.jpeg";
const homeHeroUrl = (width: number) =>
  `${HOME_HERO_PHOTO}?auto=compress&cs=tinysrgb&fm=webp&w=${width}&q=72`;
const HOME_HERO_SRC = homeHeroUrl(1600);
const HOME_HERO_SRCSET = [640, 960, 1280, 1600, 1920]
  .map((width) => `${homeHeroUrl(width)} ${width}w`)
  .join(", ");

// Giữ câu mô tả mô hình kết nối cho kiểm thử ngữ nghĩa:
// Câu mô tả lấy từ lib/public/meta-copy.ts, không viết lại tại đây.
// Browse products →

function i18n(
  m: Category["intro_i18n"] | Category["homepage_kicker_i18n"] | Category["name_i18n"] | null | undefined,
  lang: HomeLocale = "en",
  fallback = "",
): string {
  if (!m || typeof m !== "object") return fallback;
  const record = m as Record<string, string>;
  const v =
    lang === "vi"
      ? (record.vi ?? record.en ?? Object.values(record)[0])
      : (record.en ?? record.vi ?? Object.values(record)[0]);
  return typeof v === "string" ? v : fallback;
}

/**
 * Chỉ lấy các danh mục con thực tế được cấu hình trong CRM (parent_id === cat.id),
 * không dùng bất kỳ dữ liệu nhóm con demo cứng nào.
 */
function getChildCategories(cat: Category, allCategories: Category[]): Category[] {
  return allCategories
    .filter((c) => c.parent_id === cat.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.slug.localeCompare(b.slug));
}

const FAQ_EN = [
  {
    q: "Is searching products and submitting a Request for Quotation (RFQ) free for buyers?",
    a: "Yes, 100% free for buyers. You can browse verified Vietnamese food & agricultural suppliers, request a quote directly from the supplier you choose, or send your open requirements so we can look for factories that match.",
  },
  {
    q: "How can I tell if a certificate on a supplier profile belongs to the supplier or a partner factory?",
    a: "Vexim may use automated tools to read the certificate holder and expiry date. Eligible certificates may show the holder and expiry information, but this does not prove the issuing authority has authenticated the document. A certificate is linked to a product or category only after Vexim staff confirm its scope.",
  },
  {
    q: "How does Vexim verify suppliers listed on the platform?",
    a: "Vexim records three separate checks: (1) business registration review and the tax number supplied by the company; the tax number is not independently checked with the tax authority, (2) factory evidence or a partner-factory contract depending on the supplier, and (3) suitable shipment evidence. Quality certificates are reviewed separately. A partner contract does not prove ownership or an on-site factory inspection.",
  },
  {
    q: "How can a Vietnamese food manufacturer or exporter list products on Vexim Trade?",
    a: "Simply click 'Register Free Listing' in the Business Solutions section above to submit your company details, or create a supplier account to upload your business license, factory evidence, and product catalog.",
  },
  {
    q: "What happens when a supplier's food safety certificate is approaching expiration?",
    a: "Our system automatically sends renewal notifications and emails to the supplier 60, 30, 7, and 1 day before expiration. Once the supplier uploads the renewed certificate in their portal, the new expiration date is automatically recognized and updated.",
  },
  {
    q: "How do I register for International Trade Website Design, Featured Placement, or US FDA Compliance?",
    a: "Use the inquiry form on the relevant service card. For Featured Placement, our team will discuss your business banner advertising inquiry.",
  },
];

const FAQ_VI = [
  {
    q: "Tìm kiếm sản phẩm và gửi yêu cầu báo giá (RFQ) trên Vexim Trade có mất phí không?",
    a: "Hoàn toàn miễn phí cho người mua hàng. Bạn có thể tra cứu theo từng nhóm ngành thực phẩm, xem hồ sơ nhà cung cấp đã được kiểm duyệt và gửi yêu cầu báo giá trực tiếp cho nhà cung cấp mình chọn hoặc nhờ Vexim sàng lọc nhà máy phù hợp.",  // copy-allow: FAQ công khai, câu dài có chủ đích
  },
  {
    q: "Làm sao biết chứng nhận trên hồ sơ nhà cung cấp là chính chủ hay của đơn vị đối tác?",
    a: "Vexim có thể dùng công cụ tự động để đọc đơn vị đứng tên và ngày hết hạn. Chứng nhận đủ điều kiện có thể hiển thị các thông tin này, nhưng việc quét không xác nhận tính thật của giấy. Chứng nhận chỉ gắn với danh mục hoặc sản phẩm sau khi nhân viên Vexim xác nhận phạm vi áp dụng.",  // copy-allow: FAQ công khai, câu dài có chủ đích
  },
  {
    q: "Quy trình xác thực nhà cung cấp của Vexim gồm những hạng mục nào?",
    a: "Vexim ghi nhận riêng ba bước: (1) xem GCN ĐKKD và ghi nhận mã số thuế doanh nghiệp cung cấp; mã số thuế không được xác minh riêng với cơ quan thuế, (2) bằng chứng nhà máy hoặc hợp đồng nhà máy đối tác tùy loại hình, và (3) chứng từ giao hàng phù hợp. Chứng nhận chất lượng được xét riêng. Hợp đồng đối tác không chứng minh quyền sở hữu hay việc Vexim đã kiểm tra tại chỗ.",  // copy-allow: FAQ công khai, câu dài có chủ đích
  },
  {
    q: "Doanh nghiệp thực phẩm tại Việt Nam đăng ký lên sàn như thế nào?",
    a: "Doanh nghiệp chỉ cần bấm nút 'Đăng ký lên sàn miễn phí' ở mục Dịch vụ phía trên để gửi thông tin, hoặc tạo tài khoản nhà cung cấp để khai báo hồ sơ pháp nhân, tải giấy phép kinh doanh và đăng tải sản phẩm.",  // copy-allow: FAQ công khai, câu dài có chủ đích
  },
  {
    q: "Khi chứng nhận ATTP / HACCP / ISO sắp hết hạn thì cập nhật lại như thế nào?",
    a: "Trước khi chứng nhận hết hạn 60, 30, 7 và 1 ngày, hệ thống tự động gửi thông báo và email nhắc nhà cung cấp. Doanh nghiệp chỉ cần vào mục Giấy tờ trên cổng nhà cung cấp tải bản gia hạn mới lên, hệ thống sẽ tự động nhận diện lại ngày hết hạn mới và cập nhật hiển thị.",  // copy-allow: FAQ công khai, câu dài có chủ đích
  },
  {
    q: "Tôi muốn đăng ký gói Thiết kế website quốc tế, Quảng cáo nổi bật hoặc Tuân thủ pháp lý FDA thì làm thế nào?",
    a: "Điền biểu mẫu trên thẻ dịch vụ tương ứng. Với Quảng cáo nổi bật, Vexim sẽ liên hệ tư vấn banner doanh nghiệp.",
  },
];

export default async function HomeContent({
  query = "",
  categoryFilter = "",
  lang = "en",
  heroSrc,
}: {
  query?: string;
  categoryFilter?: string;
  lang?: HomeLocale;
  /** Ảnh nền riêng trong public/images/home; không truyền thì dùng ảnh Pexels bên dưới. */
  heroSrc?: string | null;
} = {}) {
  const isVi = lang === "vi";
  const store = getStore();
  const allCategories = await store.listCategories({ publishedOnly: true });
  const supCount = (await store.listSuppliers()).filter((s) => s.status === "published").length;

  // Section 3: Lấy 4 bài blog mới nhất (4 bài / hàng)
  const latestPosts = (
    await listPublishedNews().catch((error) => {
      console.error("[home] could not load published news", error);
      return [];
    })
  ).slice(0, 4);

  const activeCategories = allCategories
    .filter((c) => c.active_on_homepage)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Nếu danh mục cha đã bật hiển thị trên trang chủ, các danh mục con thuộc cha đó
  // sẽ nằm gọn bên trong thẻ danh mục cha thay vì lặp thành một thẻ lớn riêng biệt.
  const activeParentIds = new Set(
    activeCategories.filter((c) => !c.parent_id).map((c) => c.id),
  );
  const homepageCardCategories = activeCategories.filter(
    (c) => !c.parent_id || !activeParentIds.has(c.parent_id),
  );

  const homeCategories = activeCategories.filter((c) => c.public_page_ready).slice(0, 8);
  // One server-only catalogue per request; do not re-read the entire catalogue
  // once for each homepage category. Ranking and per-supplier caps stay unchanged.
  const snapshot = homeCategories.length ? await loadPublicProductCatalogSnapshot() : null;
  const productGroups = await Promise.all(
    homeCategories.map(async (category) => ({
      category,
      products: await listPublicCategoryProducts(category, { snapshot: snapshot! }),
    })),
  );
  // One offer per category per round; retain category-local ranking and public gates.
  // Enforce the supplier cap during selection so earlier categories cannot take
  // all available slots before other industries get a turn.
  const arrangedOffers = balanceHomepageCategories(
    productGroups.map(({ category, products }) => products
      .filter((product) => !product.isDemo)
      .map((product) => ({ ...product, categorySlug: category.slug }))),
    HOME_FEED_PER_SUPPLIER,
  );
  // Điều kiện duy nhất để hiện khối: có ít nhất một sản phẩm. Số thẻ mỗi trang do
  // HomeProductFeed tự tính theo bề rộng màn hình.
  const hasFeedProducts = arrangedOffers.length > 0;
  const heroOf = (c: Category) => c.hero_image || FALLBACK_HERO;

  // Lọc danh mục theo thanh tìm kiếm (chỉ dựa trên dữ liệu thực tế từ CRM)
  const normalizedQuery = query.trim().toLowerCase();
  const displayedCategories = homepageCardCategories.filter((c) => {
    const children = getChildCategories(c, allCategories);
    if (
      categoryFilter &&
      c.slug !== categoryFilter &&
      !children.some((ch) => ch.slug === categoryFilter)
    ) {
      return false;
    }
    if (!normalizedQuery) return true;
    const viName = getCategoryTitle(c, "vi").toLowerCase();
    const enName = getCategoryTitle(c, "en").toLowerCase();
    const introText = i18n(c.intro_i18n, lang, "").toLowerCase();
    const childNames = children
      .map((ch) => `${getCategoryTitle(ch, "en")} ${getCategoryTitle(ch, "vi")} ${ch.slug}`)
      .join(" ")
      .toLowerCase();
    return (
      viName.includes(normalizedQuery) ||
      enName.includes(normalizedQuery) ||
      c.slug.toLowerCase().includes(normalizedQuery) ||
      introText.includes(normalizedQuery) ||
      childNames.includes(normalizedQuery)
    );
  });
  const categoriesToRender = (
    displayedCategories.length > 0 ? displayedCategories : homepageCardCategories
  ).slice(0, 8);
  const popularKeywords = buildPopularSearches({
    categories: allCategories,
    lang,
    titleFor: (category) => getCategoryTitle(category as Category, lang),
  });
  const faqs = isVi ? FAQ_VI : FAQ_EN;

  // Khai báo một lần và luôn đặt trước danh mục khi có sản phẩm.
  const productFeedSection = hasFeedProducts ? (
    <section aria-labelledby="home-products-title" className="border-t border-slate-200 bg-white py-14">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-700">
              {isVi ? "Sản phẩm nổi bật trên sàn" : "Featured Marketplace Offers"}
            </p>
            <h2 id="home-products-title" className="mt-1.5 text-2xl font-black text-ink-900 sm:text-3xl">
              {isVi
                ? "Nguồn hàng thực phẩm sẵn sàng báo giá"
                : "Export-Ready Food Products from Verified Suppliers"}
            </h2>
            <p className="mt-1.5 text-sm text-ink-600">
              {isVi
                ? "Sản phẩm thực tế từ các nhà cung cấp đã được kiểm duyệt hồ sơ trên hệ thống."
                : "Direct product offers from Vietnamese suppliers with reviewed documentation and capabilities."}
            </p>
          </div>
          <a href="#categories" className="text-sm font-semibold text-brand-700 hover:underline">
            {isVi ? "Xem tất cả danh mục →" : "Browse all categories →"}
          </a>
        </div>
        <HomeProductFeed items={arrangedOffers} isVi={isVi} />
      </div>
    </section>
  ) : null;

  return (
    <div lang={lang} className="bg-slate-50 text-ink-900">
      {/* =====================================================================
          SECTION 1: HERO + THANH TÌM KIẾM SẢN PHẨM
         ===================================================================== */}
      <section aria-labelledby="home-hero-title" className="border-b border-ink-200 bg-brand-50 text-ink-900">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-12 lg:px-8">
          <h1 id="home-hero-title" className="max-w-[960px] text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-[44px]">
            {isVi
              ? "Tìm nguồn thực phẩm từ nhà cung cấp Việt Nam đã được kiểm tra."
              : "Source food from checked Vietnamese suppliers."}
          </h1>
          <p className="mt-4 max-w-5xl text-base leading-relaxed text-ink-700">
            {isVi
              ? "So sánh sản phẩm, gửi yêu cầu báo giá và kết nối trực tiếp với nhà cung cấp bạn chọn."
              : "Compare products, request quotes, and connect directly with the supplier you choose."}
          </p>

          <form action="/search" method="get" role="search" aria-label={isVi ? "Tìm sản phẩm" : "Search products"}
            className="mt-6 max-w-[1000px] overflow-hidden rounded-full border border-ink-300 bg-white shadow-sm sm:rounded-xl focus-within:ring-2 focus-within:ring-brand-500">
            <input type="hidden" name="lang" value={lang} />
            <div className="flex items-center p-1 sm:grid sm:grid-cols-[210px_minmax(0,1fr)_auto] sm:p-0">
              <label className="sr-only" htmlFor="home-search-category">{isVi ? "Danh mục" : "Category"}</label>
              <div className="relative h-11 w-11 shrink-0 rounded-full focus-within:ring-2 focus-within:ring-inset focus-within:ring-brand-600 sm:h-14 sm:w-auto sm:rounded-none">
                <SlidersHorizontal aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-brand-700 sm:hidden" />
              <select id="home-search-category" name="cat" defaultValue={categoryFilter}
                className="absolute inset-0 h-full w-full min-w-0 cursor-pointer rounded-full border-0 bg-white px-4 text-base font-semibold text-ink-900 opacity-0 focus-visible:outline-offset-[-3px] sm:static sm:rounded-none sm:border-r sm:border-ink-200 sm:text-sm sm:opacity-100">
                <option value="">{isVi ? "Tất cả danh mục" : "All categories"}</option>
                {activeCategories.map((c) => <option key={c.slug} value={c.slug}>{getCategoryTitle(c, lang)}</option>)}
              </select>
              </div>
              <label htmlFor="home-search-query" className="sr-only">{isVi ? "Sản phẩm hoặc quy cách" : "Product or grade"}</label>
              <input id="home-search-query" type="search" name="q" maxLength={120} defaultValue={query}
                placeholder={isVi ? "Tìm sản phẩm hoặc quy cách, ví dụ: W320, 550 g/l, quế" : "Search a product or grade, e.g. W320, 550 g/l, cassia"}
                className="h-11 w-full min-w-0 flex-1 bg-white px-2 text-base text-ink-900 sm:h-14 sm:px-4 sm:text-sm placeholder:text-ink-500 focus-visible:outline-offset-[-3px]" />
              <button type="submit" className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-700 sm:h-14 sm:w-auto sm:rounded-none sm:px-7 text-sm font-bold text-white transition hover:bg-brand-800 focus-visible:outline-offset-[-3px]">
                <Search className="h-4 w-4" aria-hidden="true" /><span className="sr-only sm:not-sr-only">{isVi ? "Tìm kiếm" : "Search"}</span>
              </button>
            </div>
          </form>
          <p className="mt-3 text-sm text-ink-700">
            {isVi ? "Chưa biết tìm gì? " : "Not sure what to search for? "}
            <Link href="/rfq" className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
              {isVi ? "Cho biết bạn cần gì" : "Tell us what you need"} <span aria-hidden="true">→</span>
            </Link>
          </p>
          <ul className="mt-7 grid gap-x-7 gap-y-4 text-[13px] leading-5 text-ink-700 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: ShieldCheck, text: isVi ? "Xem rõ từng hạng mục đã kiểm tra" : "See which supplier checks are complete" },
              { Icon: SlidersHorizontal, text: isVi ? "So sánh chi tiết từng sản phẩm" : "Compare product details" },
              { Icon: LockKeyhole, text: isVi ? "Giữ kín thông tin đến khi bạn đồng ý kết nối" : "Your contact details stay private until you agree to connect" },
              { Icon: Plus, text: isVi ? "Gửi yêu cầu báo giá miễn phí" : "Send quote requests free of charge" },
            ].map(({ Icon, text }) => <li key={text} className="flex items-start gap-2">
              <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /><span>{text}</span>
            </li>)}
          </ul>
        </div>
      </section>

      {/* Sản phẩm luôn đứng trên danh mục khi có dữ liệu. */}
      {productFeedSection}

      {/* =====================================================================
          SECTION 2: DANH MỤC SẢN PHẨM (4 CARD / HÀNG + 3-4 NHÓM CON + XEM THÊM)
         ===================================================================== */}
      <section id="categories" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <span className="inline-block rounded-md bg-brand-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-900">
                {isVi ? "Danh mục nguồn hàng Vexim Trade" : "Vexim Trade Sourcing Directory"}
              </span>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
                {isVi
                  ? "Danh mục sản phẩm & nhóm nguồn hàng chủ lực"
                  : "Core Food & Agricultural Product Categories"}
              </h2>
              <p className="mt-1.5 text-sm text-ink-600">
                {isVi
                  ? "Chọn nhóm ngành hàng bên dưới để tra cứu chi tiết quy cách sản phẩm và danh sách nhà cung cấp tại Việt Nam."
                  : "Select a product category below to explore export specifications, key sub-groups, and verified suppliers in Vietnam."}
              </p>
            </div>
            <Link
              href="/rfq"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-4 py-2 text-xs font-bold text-brand-800 shadow-2xs transition hover:border-brand-400 hover:bg-brand-50"
            >
              {isVi ? "Gửi yêu cầu tìm nguồn hàng riêng" : "Submit custom sourcing request"}{" "}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {(query || categoryFilter) && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-300 bg-brand-50 px-4 py-3 text-sm text-brand-950">
              <span>
                {isVi ? (
                  <>
                    Kết quả tra cứu cho{" "}
                    {query ? <strong>“{query}”</strong> : <strong>danh mục đã chọn</strong>}:{" "}
                    {displayedCategories.length > 0
                      ? `tìm thấy ${displayedCategories.length} nhóm ngành hàng phù hợp.`
                      : "chưa có danh mục khớp chính xác — đang hiển thị toàn bộ danh mục chủ lực."}
                  </>
                ) : (
                  <>
                    Search results for{" "}
                    {query ? <strong>“{query}”</strong> : <strong>selected category</strong>}:{" "}
                    {displayedCategories.length > 0
                      ? `found ${displayedCategories.length} matching product categories.`
                      : "no exact category match — showing all core product categories."}
                  </>
                )}
              </span>
              <Link
                href={isVi ? "/?lang=vi" : "/"}
                className="text-xs font-bold text-brand-800 underline"
              >
                {isVi ? "Xóa bộ lọc" : "Clear filter"}
              </Link>
            </div>
          )}

          {/* Tối đa 8 danh mục: 2 cột ở màn nhỏ, 4 cột và 2 hàng trên desktop. */}
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
            {categoriesToRender.map((c) => {
              const href = `/products/${c.slug}`;
              const childCategories = getChildCategories(c, allCategories);
              const visibleChildren = childCategories.slice(0, 4);
              // Readiness alone does not mean a supplier has a public offer.
              const categoryIds = new Set([c.id, ...childCategories.map((child) => child.id)]);
              const hasProducts = productGroups.some(({ category, products }) =>
                categoryIds.has(category.id) && products.some((product) => !product.isDemo),
              );
              const primaryTitle = getCategoryTitle(c, lang);
              const kicker = i18n(c.homepage_kicker_i18n, lang, "");
              const introText = i18n(c.intro_i18n, lang, "");

              return (
                <li key={c.slug} className="flex">
                  <div className="group flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg">
                    {/* Ảnh danh mục + Nhãn trạng thái */}
                    <Link href={href} className="relative aspect-[4/3] overflow-hidden bg-slate-100 sm:aspect-[16/9]">
                      <Image
                        src={heroOf(c)}
                        alt={primaryTitle}
                        fill
                        sizes="(max-width: 639px) calc(50vw - 26px), (max-width: 1023px) calc(50vw - 36px), (max-width: 1279px) calc(25vw - 32px), 280px"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/75 via-ink-950/20 to-transparent" />
                      {hasProducts && (
                        <span className="absolute left-3.5 top-3.5 hidden items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-brand-700 shadow-sm sm:inline-flex">
                          {isVi ? "Có nhà cung cấp" : "Suppliers available"}
                        </span>
                      )}
                      <div className="absolute inset-x-3 bottom-3 text-white sm:inset-x-4">
                        {kicker && (
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-brand-200 sm:text-[11px]">
                            {kicker}
                          </p>
                        )}
                        <h3 className="mt-0.5 text-sm font-black leading-snug text-white group-hover:text-brand-200 sm:text-lg">
                          {primaryTitle}
                        </h3>
                      </div>
                    </Link>

                    {/* Chỉ hiển thị danh mục con thực tế từ CRM (nếu có) hoặc mô tả thực tế từ CRM */}
                    <div className={visibleChildren.length > 0
                      ? "flex flex-1 flex-col justify-between p-3 sm:p-5"
                      : "hidden flex-1 flex-col justify-between p-5 sm:flex"}>
                      {visibleChildren.length > 0 ? (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            {isVi
                              ? `Nhóm sản phẩm con (${childCategories.length})`
                              : `Product Sub-categories (${childCategories.length})`}
                          </p>
                          <ul className="mt-2.5 space-y-2">
                            {visibleChildren.map((child) => (
                              <li key={child.id}>
                                <Link
                                  href={`/products/${child.slug}`}
                                  className="flex items-start gap-2 rounded-lg px-1.5 py-1 text-[13.5px] leading-snug text-ink-700 transition hover:bg-brand-50 hover:text-brand-800"
                                >
                                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                                  <span className="line-clamp-1 font-medium">
                                    {getCategoryTitle(child, lang)}
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : introText ? (
                        <p className="hidden text-[13.5px] leading-relaxed text-ink-600 sm:line-clamp-3">
                          {introText}
                        </p>
                      ) : null}

                      {/* Dòng chữ cuối card */}
                      <div className="mt-5 hidden border-t border-slate-100 pt-3.5 sm:block">
                        <Link
                          href={href}
                          className="inline-flex w-full items-center justify-between text-[13px] font-bold text-brand-700 group-hover:text-brand-900"
                        >
                          <span>
                            {isVi ? "Xem thêm thông tin sản phẩm" : "Browse products →"}
                          </span>
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* =====================================================================
          SECTION 3: DANH SÁCH BLOG (4 BÀI / HÀNG)
         ===================================================================== */}
      <section aria-labelledby="home-news-title" className="border-t border-slate-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-700">
                {isVi ? "Tin tức & Cẩm nang nguồn hàng" : "Market Insights & Sourcing Guides"}
              </p>
              <h2
                id="home-news-title"
                className="mt-1.5 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl"
              >
                {isVi
                  ? "Bài viết & phân tích thị trường mới nhất"
                  : "Latest articles & market analysis"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {isVi
                  ? "Kiến thức thu mua nông sản thực phẩm, tiêu chuẩn xuất khẩu và cập nhật mùa vụ từ đội ngũ Vexim Trade."
                  : "Practical guides on Vietnamese agricultural harvests, export grading standards, and compliance from the Vexim Trade team."}
              </p>
            </div>
            <Link
              href="/blog"
              className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-800"
            >
              {isVi ? "Xem tất cả bài viết" : "View all articles"} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {latestPosts.length ? (
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
              {latestPosts.map((post) => (
                <li key={post.id} className="min-w-0">
                  <article className="h-full">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="group flex h-full flex-row overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:flex-col"
                    >
                      <div className="relative min-h-[112px] w-[34%] shrink-0 overflow-hidden bg-brand-50 sm:aspect-[4/3] sm:min-h-0 sm:w-full">
                        {post.featured_image ? (
                          /^\/blog-media\/blog\/[\w-]+\.(?:jpe?g|png|webp|avif)$/i.test(post.featured_image) ? (
                            <Image
                              src={post.featured_image}
                              alt={post.featured_image_alt || ""}
                              fill
                              sizes="(max-width: 639px) calc(34vw - 14px), (max-width: 1023px) calc(50vw - 36px), (max-width: 1279px) calc(25vw - 32px), 320px"
                              className="object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <img
                              src={post.featured_image}
                              alt={post.featured_image_alt || ""}
                              loading="lazy"
                              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          )
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center text-brand-700 sm:gap-2">
                            <FileStack className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.18em]">
                              Vexim Trade · Blog
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center p-3 sm:justify-start sm:p-4">
                        {post.published_at && (
                          <time
                            dateTime={post.published_at}
                            className="text-[10px] font-bold uppercase tracking-wide text-brand-700 sm:text-[11px]"
                          >
                            {formatPostDate(post.published_at, lang)}
                          </time>
                        )}
                        <h3 className="mt-1 line-clamp-2 text-[14px] font-bold leading-5 text-ink-900 group-hover:text-brand-700 sm:mt-1.5 sm:text-[15.5px] sm:leading-snug">
                          {post.title}
                        </h3>
                        {post.excerpt && (
                          <p className="mt-2 hidden text-[13px] leading-relaxed text-ink-600 sm:line-clamp-3">
                            {post.excerpt}
                          </p>
                        )}
                        <span className="mt-auto hidden items-center gap-1 pt-4 text-xs font-bold text-brand-700 sm:inline-flex">
                          {isVi ? "Đọc bài viết" : "Read article"}{" "}
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <div
              className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-ink-600"
              role="status"
            >
              {isVi
                ? "Chưa có bài viết nào được xuất bản (No articles published yet)."
                : "No articles published yet."}{" "}
              <Link href="/blog" className="font-semibold text-brand-700 underline hover:text-brand-800">
                Visit our news page
              </Link>
              .
            </div>
          )}
        </div>
      </section>

      {/* =====================================================================
          SECTION 4: 4 DỊCH VỤ DOANH NGHIỆP + FORM ĐĂNG KÝ RIÊNG (SONG NGỮ EN/VI)
         ===================================================================== */}
      <ServiceRegistrationSection
        lang={lang}
      />

      {/* =====================================================================
          SECTION 5: BỘ CÂU HỎI VÀ TRẢ LỜI (FAQ)
         ===================================================================== */}
      <section id="faq" className="border-t border-slate-200 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-5 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-800">
              <HelpCircle className="h-3.5 w-3.5" />{" "}
              {isVi ? "Giải đáp thắc mắc" : "Frequently Asked Questions"}
            </span>
            <h2 className="mt-2.5 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
              {isVi ? "Bộ câu hỏi và trả lời" : "Questions & Answers"}
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              {isVi
                ? "Những câu hỏi thường gặp về tra cứu nguồn hàng, cơ chế nhận diện chứng nhận tự động và dịch vụ dành cho doanh nghiệp."
                : "Common questions about sourcing Vietnamese food products, supplier checks, certificates, and supplier solutions."}
            </p>
          </div>

          <ul className="mt-10 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {faqs.map((f, i) => (
              <li key={f.q} className="p-5 sm:p-6">
                <h3 className="flex items-start gap-3 text-[15.5px] font-bold text-ink-900">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-black tabular-nums text-brand-900">
                    0{i + 1}
                  </span>
                  <span>{f.q}</span>
                </h3>
                <p className="mt-2 pl-9 text-sm leading-relaxed text-ink-600">{f.a}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PlatformLegalStrip variant="footer" />
    </div>
  );
}

function formatPostDate(iso: string, lang: HomeLocale): string {
  return new Date(iso).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}
