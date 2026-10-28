import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  FileStack,
  HelpCircle,
  Search,
} from "lucide-react";

import { getStore } from "@/lib/db";
import { listPublishedNews } from "@/lib/blog/queries";
import { listPublicCategoryProducts, loadPublicProductCatalogSnapshot, type PublicCategoryProduct } from "@/lib/public/product-catalog";
import { arrangeSupplierProducts, HOME_FEED_PER_SUPPLIER } from "@/lib/public/supplier-product-order";
import { HomeProductFeed } from "@/components/home-product-feed";
import { ServiceRegistrationSection, type HomeLocale } from "@/components/service-registration-section";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { buildPopularSearches } from "@/lib/public/popular-searches";
import { getCategoryTitle } from "@/lib/public/category-names";
import { HOME_HERO_LINE } from "@/lib/public/meta-copy";
import { Logo } from "@/components/brand-logo";
import { PlatformLegalStrip } from "@/components/platform-legal-strip";
import { SocialLinks } from "@/components/social-links";
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
    a: "When a supplier uploads certificates (HACCP, ISO 22000, BRC, Halal, FDA, Organic...), Vexim's automated recognition scans the certified holder name and expiration date: if it matches the supplier's legal entity, it is labeled 'Owner'; if issued to a co-packer or affiliated plant, it is transparently labeled 'Partner Entity' along with its valid-until date.",
  },
  {
    q: "How does Vexim verify suppliers listed on the platform?",
    a: "Vexim conducts independent reviews across three areas: (1) Business registration documents & automated quality certificate recognition, (2) factory evidence or a partner-factory contract, depending on supplier type, and (3) export or shipment evidence checked by staff. A partner contract does not establish ownership or a factory inspection.",
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
    a: "Hoàn toàn miễn phí cho người mua hàng. Bạn có thể tra cứu theo từng nhóm ngành thực phẩm, xem hồ sơ nhà cung cấp đã được kiểm duyệt và gửi yêu cầu báo giá trực tiếp cho nhà cung cấp mình chọn hoặc nhờ Vexim sàng lọc nhà máy phù hợp.",
  },
  {
    q: "Làm sao biết chứng nhận trên hồ sơ nhà cung cấp là chính chủ hay của đơn vị đối tác?",
    a: "Khi nhà cung cấp tải chứng nhận (ATTP, HACCP, ISO 22000, BRC, Halal, FDA...) lên hệ thống, công nghệ nhận diện tự động của Vexim quét tên đơn vị được cấp và ngày hết hạn: nếu khớp pháp nhân sẽ hiển thị 'Chính chủ', nếu đứng tên nhà máy gia công/liên kết sẽ ghi rõ 'Đơn vị đối tác' kèm ngày hết hiệu lực.",
  },
  {
    q: "Quy trình xác thực nhà cung cấp của Vexim gồm những hạng mục nào?",
    a: "Vexim đánh giá độc lập qua 3 hạng mục: (1) Kiểm tra giấy tờ pháp lý doanh nghiệp & nhận diện tự động chứng nhận chất lượng, (2) Xác thực nhà máy thực tế qua bộ ảnh chụp hiện trường sản xuất kèm toạ độ và mã xác minh, và (3) Đối chiếu chứng từ lịch sử lô hàng đã xuất khẩu.",
  },
  {
    q: "Doanh nghiệp thực phẩm tại Việt Nam đăng ký lên sàn như thế nào?",
    a: "Doanh nghiệp chỉ cần bấm nút 'Đăng ký lên sàn miễn phí' ở mục Dịch vụ phía trên để gửi thông tin, hoặc tạo tài khoản nhà cung cấp để khai báo hồ sơ pháp nhân, tải giấy phép kinh doanh và đăng tải sản phẩm.",
  },
  {
    q: "Khi chứng nhận ATTP / HACCP / ISO sắp hết hạn thì cập nhật lại như thế nào?",
    a: "Trước khi chứng nhận hết hạn 60, 30, 7 và 1 ngày, hệ thống tự động gửi thông báo và email nhắc nhà cung cấp. Doanh nghiệp chỉ cần vào mục Giấy tờ trên cổng nhà cung cấp tải bản gia hạn mới lên, hệ thống sẽ tự động nhận diện lại ngày hết hạn mới và cập nhật hiển thị.",
  },
  {
    q: "Tôi muốn đăng ký gói Thiết kế website quốc tế, Quảng cáo nổi bật hoặc Tuân thủ pháp lý FDA thì làm thế nào?",
    a: "Hãy điền biểu mẫu trên thẻ dịch vụ tương ứng. Với Quảng cáo nổi bật, đội ngũ Vexim sẽ liên hệ tư vấn về banner doanh nghiệp.",
  },
];

export default async function HomeContent({
  query = "",
  categoryFilter = "",
  lang = "en",
}: {
  query?: string;
  categoryFilter?: string;
  lang?: HomeLocale;
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
  const seen = new Set<string>();
  const offers: Array<PublicCategoryProduct & { categorySlug: string }> = [];
  for (const { category, products } of productGroups) {
    for (const p of products) {
      if (p.isDemo || seen.has(p.id)) continue;
      seen.add(p.id);
      offers.push({ ...p, categorySlug: category.slug });
    }
  }
  // Thứ tự được chốt ở máy chủ rồi mới chia trang. Giới hạn hai thẻ mỗi nhà
  // cung cấp được giữ nguyên để một công ty không chiếm toàn bộ lưới.
  const arrangedOffers = arrangeSupplierProducts(offers, HOME_FEED_PER_SUPPLIER).shown;
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
      <section className="relative overflow-hidden border-b-4 border-amber-400 bg-gradient-to-b from-brand-900 via-brand-900 to-ink-950 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HOME_HERO_SRC}
          srcSet={HOME_HERO_SRCSET}
          sizes="100vw"
          alt=""
          width={1600}
          height={1067}
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-[60%_center]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-950/85 via-brand-900/65 to-ink-950/75" />

        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-3.5 py-1 text-xs font-black uppercase tracking-[0.16em] text-ink-950 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-brand-900" />
              {isVi
                ? "Vexim Trade · Kết nối giao thương thực phẩm & nông sản Việt Nam"
                : "Vexim Trade · Verified Vietnam Food & Agriculture Sourcing"}
            </span>

            <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-[44px]">
              {isVi
                ? "Tìm sản phẩm và nhà cung cấp nguồn hàng thực phẩm tại Việt Nam"
                : "Find Verified Food & Agricultural Products and Suppliers in Vietnam"}
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/90 sm:text-base">
              {isVi
                ? "Tra cứu trực tiếp danh mục ngành hàng nông sản & thực phẩm chế biến, đối chiếu hồ sơ pháp lý, năng lực nhà máy, lịch sử xuất khẩu và kết nối báo giá nhanh."
                : HOME_HERO_LINE}
            </p>

            {/* THANH TÌM KIẾM SẢN PHẨM */}
            <form
              action="/search"
              method="get"
              role="search"
              aria-label={
                isVi
                  ? "Tìm kiếm sản phẩm và nhà cung cấp"
                  : "Search food products and verified suppliers"
              }
              className="mt-8 rounded-2xl border-2 border-amber-400 bg-white p-2 shadow-2xl shadow-black/35 sm:p-2.5"
            >
              <input type="hidden" name="lang" value={lang} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_minmax(0,1fr)_auto]">
                <label className="sr-only" htmlFor="home-search-category">
                  {isVi ? "Chọn danh mục ngành hàng" : "Select product category"}
                </label>
                <select
                  id="home-search-category"
                  name="cat"
                  defaultValue={categoryFilter}
                  className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-ink-800 focus:border-brand-600 focus:bg-white focus:outline-none"
                >
                  <option value="">{isVi ? "Tất cả danh mục" : "All categories"}</option>
                  {activeCategories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {getCategoryTitle(c, lang)}
                    </option>
                  ))}
                </select>

                <div className="relative flex min-w-0 items-center">
                  <Search className="pointer-events-none absolute left-3.5 h-5 w-5 text-slate-400" aria-hidden="true" />
                  <label htmlFor="home-search-query" className="sr-only">
                    {isVi ? "Tên sản phẩm, quy cách hoặc nhà cung cấp" : "Product, grade or supplier"}
                  </label>
                  <input
                    id="home-search-query"
                    type="search"
                    name="q"
                    maxLength={120}
                    defaultValue={query}
                    placeholder={
                      isVi
                        ? "Tên sản phẩm, quy cách hoặc nhà cung cấp"
                        : "Product, grade or supplier name"
                    }
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-ink-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 text-sm font-black text-ink-950 shadow-sm transition hover:bg-amber-300"
                >
                  <Search className="h-4 w-4" />
                  {isVi ? "Tìm kiếm" : "Search"}
                </button>
              </div>
            </form>

            {/* Từ khóa phổ biến: chỉ hiện chip của danh mục đang có trang thật. */}
            {popularKeywords.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-white/90">
              <span className="font-semibold text-amber-300">
                {isVi ? "Tìm nhanh:" : "Popular searches:"}
              </span>
              {popularKeywords.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 font-medium text-white transition hover:border-amber-300 hover:bg-amber-400/20"
                >
                  {item.label}
                </Link>
              ))}
            </div>}

            {supCount >= 10 && (
              <p className="mt-4 text-xs text-white/80">
                {isVi ? (
                  <>
                    Đang niêm yết <strong>{supCount}</strong> hồ sơ nhà cung cấp công khai · Phản hồi báo giá trong 1 ngày làm việc.
                  </>
                ) : (
                  <>
                    Featuring <strong>{supCount}</strong> published Vietnamese supplier profiles · Quote response within 1 business day.
                  </>
                )}
              </p>
            )}
          </div>
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
              <span className="inline-block rounded-md bg-amber-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-900">
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
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
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
              const hasProducts = Boolean(
                c.public_page_ready || childCategories.some((ch) => ch.public_page_ready),
              );
              const primaryTitle = getCategoryTitle(c, lang);
              const kicker = i18n(c.homepage_kicker_i18n, lang, "");
              const introText = i18n(c.intro_i18n, lang, "");

              return (
                <li key={c.slug} className="flex">
                  <div className="group flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-lg">
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
                        <span className="absolute left-3.5 top-3.5 hidden items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white shadow sm:inline-flex">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />{" "}
                          {isVi ? "Có sẵn nguồn hàng" : "Suppliers available"}
                        </span>
                      )}
                      <div className="absolute inset-x-3 bottom-3 text-white sm:inset-x-4">
                        {kicker && (
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-300 sm:text-[11px]">
                            {kicker}
                          </p>
                        )}
                        <h3 className="mt-0.5 text-sm font-black leading-snug text-white group-hover:text-amber-200 sm:text-lg">
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
                                  className="flex items-start gap-2 rounded-lg px-1.5 py-1 text-[13.5px] leading-snug text-ink-700 transition hover:bg-amber-50 hover:text-brand-800"
                                >
                                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
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
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-700">
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
                            className="text-[10px] font-bold uppercase tracking-wide text-amber-700 sm:text-[11px]"
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
                : "Common questions about sourcing Vietnamese food products, automated certificate verification, and supplier solutions."}
            </p>
          </div>

          <ul className="mt-10 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {faqs.map((f, i) => (
              <li key={f.q} className="p-5 sm:p-6">
                <h3 className="flex items-start gap-3 text-[15.5px] font-bold text-ink-900">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 font-mono text-xs font-black text-amber-900">
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

      {/* FOOTER */}
      <footer className="border-t border-ink-200 bg-white text-[13px] text-ink-600">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <Logo className="h-10 w-10" />
                <span className="text-[16px] font-black tracking-tight text-ink-900">Vexim Trade</span>
              </div>
              <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-ink-500">
                {isVi
                  ? "Nền tảng kết nối nguồn hàng thực phẩm & nông sản Việt Nam với khách mua trong nước và quốc tế."
                  : "B2B sourcing platform connecting global and domestic buyers with verified Vietnamese food & agricultural suppliers."}
              </p>
              <p className="mt-5 text-[12.5px] text-ink-400">
                © 2026 Vexim Global Co., Ltd., Hanoi, Vietnam
              </p>
              <SocialLinks className="mt-2" />
            </div>

            <FooterCol title={isVi ? "Danh mục ngành hàng" : "Product Categories"}>
              {activeCategories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/products/${c.slug}`} className="hover:text-brand-700">
                    {getCategoryTitle(c, lang)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/rfq" className="hover:text-brand-700">
                  {isVi ? "Gửi yêu cầu mặt hàng khác →" : "Request other products →"}
                </Link>
              </li>
            </FooterCol>

            <FooterCol title={isVi ? "Dịch vụ & Nền tảng" : "Platform & Verification"}>
              <li>
                <Link href="/how-we-verify" className="hover:text-brand-700">
                  {isVi ? "Quy trình xác thực nhà cung cấp" : "How we verify suppliers"}
                </Link>
              </li>
              <li>
                <Link href="/for-suppliers" className="hover:text-brand-700">
                  {isVi ? "Dành cho nhà cung cấp" : "For suppliers"}
                </Link>
              </li>
              <li>
                <Link href="/login" prefetch={false} className="hover:text-brand-700">
                  {isVi ? "Đăng nhập" : "Sign in"}
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className="hover:text-brand-700">
                  {isVi ? "Chính sách bảo mật (Privacy Policy)" : "Privacy Policy"}
                </Link>
              </li>
              <li>
                <Link href="/cookie-policy" className="hover:text-brand-700">
                  Cookie Policy
                </Link>
              </li>
              <li>
                <CookieSettingsButton className="hover:text-brand-700" />
              </li>
              <li>
                <Link href="/terms-of-service" className="hover:text-brand-700">
                  {isVi ? "Điều khoản dịch vụ (Terms of Service)" : "Terms of Service"}
                </Link>
              </li>
              <li>
                <a href="mailto:contact@veximglobal.com" className="hover:text-brand-700">
                  contact@veximglobal.com
                </a>
              </li>
            </FooterCol>

            <FooterCol title={isVi ? "Khách mua hàng" : "For Buyers"}>
              <li>
                <Link href="/rfq" className="hover:text-brand-700">
                  {isVi ? "Gửi yêu cầu báo giá (Request a quote)" : "Request a quote"}
                </Link>
              </li>
              <li>
                <Link href="/compare" className="hover:text-brand-700">
                  {isVi ? "So sánh nhà cung cấp" : "Compare suppliers"}
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-brand-700">
                  {isVi ? "Tin tức & Cẩm nang nguồn hàng" : "Market Insights & Guides"}
                </Link>
              </li>
            </FooterCol>
          </div>
        </div>
        <PlatformLegalStrip />
      </footer>
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

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11.5px] font-bold uppercase tracking-[0.18em] text-ink-900">{title}</h4>
      <ul className="mt-3 space-y-2 text-[13px] text-ink-500">{children}</ul>
    </div>
  );
}
