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
import { listPublicCategoryProducts, type PublicCategoryProduct } from "@/lib/public/product-catalog";
import { arrangeSupplierProducts, shouldPromoteProductFeed, HOME_FEED_PER_PAGE, HOME_FEED_PER_SUPPLIER } from "@/lib/public/supplier-product-order";
import { HomeProductFeed } from "@/components/home-product-feed";
import { ServiceRegistrationSection, type HomeLocale } from "@/components/service-registration-section";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { buildPopularSearches } from "@/lib/public/popular-searches";
import { HOME_HERO_LINE } from "@/lib/public/meta-copy";
import { Logo } from "@/components/brand-logo";
import { PlatformLegalStrip } from "@/components/platform-legal-strip";
import { SocialLinks } from "@/components/social-links";
import type { Category } from "@/lib/types";

/** Ảnh placeholder khi category chưa upload hero_image */
const FALLBACK_HERO = "/images/home/hero-cashew-texture.jpg";

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

/** Tên hiển thị tiếng Anh chuẩn thương mại B2B cho các danh mục thực phẩm & nông sản */
const CATEGORY_EN_NAMES: Record<string, string> = {
  cashew: "Cashew Kernels & Value-Added Cashew",
  "nuts-kernels": "Nutritional Nuts & Kernels",
  macadamia: "Central Highlands Macadamia Nuts",
  coffee: "Green Coffee Beans & Roasted Coffee",
  pepper: "Vietnamese Black & White Pepper",
  "pepper-spices": "Pepper & Natural Spices",
  cinnamon: "Cassia Cinnamon & Star Anise",
  "star-anise": "Lang Son Whole Star Anise",
  coconut: "Ben Tre Coconut Products",
  rice: "Fragrant & Export Rice Products",
  noodles: "Dried Rice Noodles, Vermicelli & Rice Paper",
  "fruit-veg": "Processed & IQF Fruits & Vegetables",
  "dragon-fruit": "Fresh & IQF Dragon Fruit",
  "dried-fruit": "Soft-Dried & Crispy Fruit Snacks",
  seafood: "Frozen Export Seafood",
  pangasius: "Frozen Pangasius Fillets",
  shrimp: "Black Tiger & Vannamei Shrimp",
  honey: "Natural Export Honey",
  tea: "Green Tea, Black Tea & Oolong Tea",
  "processed-foods": "Processed & Packaged Foods",
};

/** Tên hiển thị tiếng Việt ưu tiên theo slug cho danh mục thực phẩm Việt Nam */
const CATEGORY_VI_NAMES: Record<string, string> = {
  cashew: "Hạt điều & Nhân điều xuất khẩu",
  "nuts-kernels": "Các loại hạt dinh dưỡng",
  macadamia: "Hạt mắc ca Tây Nguyên",
  coffee: "Cà phê Nhân xanh & Rang xay",
  pepper: "Hồ tiêu & Gia vị Việt Nam",
  "pepper-spices": "Hồ tiêu & Gia vị tự nhiên",
  cinnamon: "Quế & Hoa hồi xuất khẩu",
  "star-anise": "Hoa hồi Lạng Sơn",
  coconut: "Sản phẩm từ Dừa Bến Tre",
  rice: "Gạo xuất khẩu & Chế phẩm từ gạo",
  noodles: "Bún, Phở khô & Bánh tráng",
  "fruit-veg": "Trái cây & Rau củ chế biến",
  "dragon-fruit": "Thanh long tươi & đông lạnh",
  "dried-fruit": "Trái cây sấy dẻo & sấy giòn",
  seafood: "Thủy hải sản đông lạnh xuất khẩu",
  pangasius: "Cá tra phi lê đông lạnh",
  shrimp: "Tôm sú & Tôm thẻ chân trắng",
  honey: "Mật ong tự nhiên xuất khẩu",
  tea: "Trà xanh, Trà đen & Trà Ô long",
  "processed-foods": "Thực phẩm chế biến & Đóng gói",
};

function getCategoryTitle(cat: Category, lang: HomeLocale): string {
  if (lang === "vi") {
    return CATEGORY_VI_NAMES[cat.slug] || i18n(cat.name_i18n, "vi", cat.slug);
  }
  return i18n(cat.name_i18n, "en", CATEGORY_EN_NAMES[cat.slug] || cat.slug);
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
    a: "Vexim conducts independent reviews across three areas: (1) Business registration documents & automated quality certificate recognition, (2) On-site factory and production floor photo verification with geolocation and verification code, and (3) Export shipment & delivery record checks.",
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
    a: "Click the corresponding registration button on any of the four service cards above and complete the brief inquiry form. Our team in Hanoi will contact you with a tailored consultation within 1 business day.",
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
    a: "Bạn chỉ cần bấm vào nút Đăng ký tương ứng ở từng thẻ dịch vụ phía trên và điền thông tin liên hệ vào biểu mẫu. Đội ngũ chuyên viên Vexim Trade tại Hà Nội sẽ liên hệ tư vấn chi tiết trong vòng 1 ngày làm việc.",
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

  const homeCategories = activeCategories.filter((c) => c.public_page_ready).slice(0, 4);
  const productGroups = await Promise.all(
    homeCategories.map(async (category) => ({
      category,
      products: await listPublicCategoryProducts(category),
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
  // Thứ tự được chốt ở máy chủ, rồi mới chia trang. Ngưỡng xét trên trang đầu,
  // vì đó là thứ người mở trang chủ nhìn thấy.
  const arrangedOffers = arrangeSupplierProducts(offers, HOME_FEED_PER_SUPPLIER).shown;
  const homeProducts = arrangedOffers.slice(0, HOME_FEED_PER_PAGE);
  const promoteFeed = shouldPromoteProductFeed(homeProducts).promoted;
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
    const viName = (CATEGORY_VI_NAMES[c.slug] ?? "").toLowerCase();
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
  const categoriesToRender =
    displayedCategories.length > 0 ? displayedCategories : homepageCardCategories;
  const popularKeywords = buildPopularSearches({
    categories: allCategories,
    lang,
    titleFor: (category) => getCategoryTitle(category as Category, lang),
  });
  const faqs = isVi ? FAQ_VI : FAQ_EN;

  /*
   * Lưới sản phẩm của trang chủ. Khai báo thành biến để đặt được ở hai vị trí
   * khác nhau: trên lưới danh mục khi đã đủ hàng, dưới lưới danh mục khi chưa.
   * Xem shouldPromoteProductFeed trong lib/public/supplier-product-order.ts.
   */
  const productFeedSection = homeProducts.length > 0 ? (
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
        <Image
          src="/images/home/hero-cashew-texture.jpg"
          alt=""
          preload
          fetchPriority="high"
          fill
          sizes="100vw"
          className="object-cover opacity-20"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-950/90 via-brand-900/80 to-ink-950/90" />

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
              action="/#categories"
              method="get"
              role="search"
              aria-label={
                isVi
                  ? "Tìm kiếm sản phẩm và nhà cung cấp"
                  : "Search food products and verified suppliers"
              }
              className="mt-8 rounded-2xl border-2 border-amber-400 bg-white p-2 shadow-2xl shadow-black/35 sm:p-2.5"
            >
              {isVi && <input type="hidden" name="lang" value="vi" />}
              <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)_auto]">
                <label className="sr-only" htmlFor="home-search-category">
                  {isVi ? "Chọn danh mục ngành hàng" : "Select product category"}
                </label>
                <select
                  id="home-search-category"
                  name="cat"
                  defaultValue={categoryFilter}
                  className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-ink-800 focus:border-brand-600 focus:bg-white focus:outline-none"
                >
                  <option value="">{isVi ? "Tất cả danh mục" : "All categories"}</option>
                  {activeCategories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {getCategoryTitle(c, lang)}
                    </option>
                  ))}
                </select>

                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-3.5 h-5 w-5 text-slate-400" />
                  <input
                    type="search"
                    name="q"
                    defaultValue={query}
                    placeholder={
                      isVi
                        ? "Nhập tên sản phẩm, nhóm nông sản, tiêu chuẩn (HACCP, FDA, Organic)..."
                        : "Search product name, grade, or certification (W320, Robusta, HACCP, FDA, Organic)..."
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

      {/* Sản phẩm đã đủ để đứng trên lưới danh mục. Chưa đủ thì khối này rơi xuống dưới. */}
      {promoteFeed && productFeedSection}

      {/* =====================================================================
          SECTION 2: DANH MỤC SẢN PHẨM (3 CARD / HÀNG + 3-4 NHÓM CON + XEM THÊM)
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

          {/* Lưới 3 card / hàng trên desktop */}
          <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {categoriesToRender.map((c) => {
              const href = `/products/${c.slug}`;
              const childCategories = getChildCategories(c, allCategories);
              const visibleChildren = childCategories.slice(0, 4);
              const hasProducts = Boolean(
                c.public_page_ready || childCategories.some((ch) => ch.public_page_ready),
              );
              const primaryTitle = getCategoryTitle(c, lang);
              const secondaryLabel = isVi
                ? i18n(c.name_i18n, "en", c.slug)
                : (CATEGORY_VI_NAMES[c.slug] || i18n(c.name_i18n, "en", c.slug));
              const kicker = i18n(c.homepage_kicker_i18n, lang, "");
              const introText = i18n(c.intro_i18n, lang, "");

              return (
                <li key={c.slug} className="flex">
                  <div className="group flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-lg">
                    {/* Ảnh danh mục + Nhãn trạng thái */}
                    <Link href={href} className="relative aspect-[16/9] overflow-hidden bg-slate-100">
                      <Image
                        src={heroOf(c)}
                        alt={primaryTitle}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/75 via-ink-950/20 to-transparent" />
                      {hasProducts && (
                        <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white shadow">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />{" "}
                          {isVi ? "Có sẵn nguồn hàng" : "Suppliers available"}
                        </span>
                      )}
                      <div className="absolute inset-x-4 bottom-3 text-white">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                          {kicker || secondaryLabel}
                        </p>
                        <h3 className="mt-0.5 text-lg font-black leading-snug text-white group-hover:text-amber-200">
                          {primaryTitle}
                        </h3>
                      </div>
                    </Link>

                    {/* Chỉ hiển thị danh mục con thực tế từ CRM (nếu có) hoặc mô tả thực tế từ CRM */}
                    <div className="flex flex-1 flex-col justify-between p-5">
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
                        <p className="line-clamp-3 text-[13.5px] leading-relaxed text-ink-600">
                          {introText}
                        </p>
                      ) : null}

                      {/* Dòng chữ cuối card */}
                      <div className="mt-5 border-t border-slate-100 pt-3.5">
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

      {/* Chưa đủ sản phẩm để mở trang bằng lưới sản phẩm. Vẫn hiện, nhưng sau danh mục. */}
      {!promoteFeed && productFeedSection}

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
            <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {latestPosts.map((post) => (
                <li key={post.id} className="min-w-0">
                  <article className="h-full">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-brand-50">
                        {post.featured_image ? (
                          /^\/blog-media\/blog\/[\w-]+\.(?:jpe?g|png|webp|avif)$/i.test(post.featured_image) ? (
                            <Image
                              src={post.featured_image}
                              alt={post.featured_image_alt || ""}
                              fill
                              sizes="(max-width: 639px) calc(100vw - 40px), (max-width: 1023px) calc(50vw - 36px), (max-width: 1279px) calc(25vw - 32px), 320px"
                              className="object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <img
                              src={post.featured_image}
                              alt={post.featured_image_alt || ""}
                              loading="lazy"
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          )
                        ) : (
                          <div className="flex h-full items-center justify-center gap-2 text-brand-700">
                            <FileStack className="h-6 w-6" aria-hidden="true" />
                            <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
                              Vexim Trade · Blog
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        {post.published_at && (
                          <time
                            dateTime={post.published_at}
                            className="text-[11px] font-bold uppercase tracking-wide text-amber-700"
                          >
                            {formatPostDate(post.published_at, lang)}
                          </time>
                        )}
                        <h3 className="mt-1.5 line-clamp-2 text-[15.5px] font-bold leading-snug text-ink-900 group-hover:text-brand-700">
                          {post.title}
                        </h3>
                        {post.excerpt && (
                          <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink-600">
                            {post.excerpt}
                          </p>
                        )}
                        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-bold text-brand-700">
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
      <ServiceRegistrationSection lang={lang} />

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
