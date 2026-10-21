import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  FileStack,
  Globe2,
  HelpCircle,
  Megaphone,
  Search,
  ShieldCheck,
  Store,
} from "lucide-react";

import { getStore } from "@/lib/db";
import { listPublishedNews } from "@/lib/blog/queries";
import { listPublicCategoryProducts, type PublicCategoryProduct } from "@/lib/public/product-catalog";
import { arrangeSupplierProducts } from "@/lib/public/supplier-product-order";
import { PublicProductCard } from "@/components/public-product-card";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { Logo } from "@/components/brand-logo";
import { PlatformLegalStrip } from "@/components/platform-legal-strip";
import { SocialLinks } from "@/components/social-links";
import type { Category } from "@/lib/types";

/** Ảnh placeholder khi category chưa upload hero_image */
const FALLBACK_HERO = "/images/home/hero-cashew-texture.jpg";

// Giữ câu mô tả mô hình kết nối cho kiểm thử ngữ nghĩa:
// Browse verified Vietnamese suppliers and request a quote from the one you choose. Haven’t found the right fit? Send us your requirements and Vexim will shortlist suppliers that match.
// Browse products →

function i18n(
  m: Category["intro_i18n"] | Category["homepage_kicker_i18n"] | Category["name_i18n"] | null | undefined,
  fallback = "",
): string {
  if (!m || typeof m !== "object") return fallback;
  const record = m as Record<string, string>;
  const v = record.vi ?? record.en ?? Object.values(record)[0];
  return typeof v === "string" ? v : fallback;
}

/** Tên hiển thị tiếng Việt ưu tiên theo slug cho giao diện Trang Vàng thực phẩm Việt Nam */
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

/**
 * Danh sách 3-4 nhóm con sản phẩm đặc trưng cho từng danh mục ngành hàng
 * để hiển thị gọn trong từng card kiểu Trang Vàng (không quá 4 dòng/card).
 */
const CATEGORY_SUBGROUPS: Record<string, string[]> = {
  cashew: [
    "Nhân điều trắng nguyên hạt (WW180, WW240, WW320, WW450)",
    "Nhân điều vỡ & mảnh làm bánh kẹo (WS, LP, SP)",
    "Hạt điều rang muối, vỏ lụa & tẩm vị ăn liền (OEM)",
    "Bơ hạt điều & hạt dinh dưỡng đóng gói bán lẻ",
  ],
  "nuts-kernels": [
    "Nhân hạt điều xuất khẩu các cấp hạng (W240, W320)",
    "Hạt mắc ca nứt vỏ & nhân mắc ca Tây Nguyên",
    "Đậu phộng (lạc nhân) & hạt sen sấy khô",
    "Hạt hỗn hợp rang sấy gia công nhãn riêng (Private Label)",
  ],
  coffee: [
    "Cà phê nhân xanh Robusta (G1, G2, S16, S18 – Wet/Dry)",
    "Cà phê nhân xanh Arabica Cầu Đất & Sơn La",
    "Cà phê hạt rang mộc & cà phê bột pha phin/pha máy",
    "Cà phê hòa tan sấy phun & sấy thăng hoa (3in1, nguyên chất)",
  ],
  pepper: [
    "Hồ tiêu đen nguyên hạt (FAQ 500g/l, 550g/l & ASTA)",
    "Hồ tiêu sọ trắng (White Pepper Double Washed)",
    "Tiêu xay & tiêu nghiền tiệt trùng hơi nước (Steam-sterilised)",
    "Tiêu xanh sấy lạnh, tiêu đỏ & tiêu hữu cơ (Organic)",
  ],
  "pepper-spices": [
    "Hồ tiêu đen & tiêu trắng xuất khẩu",
    "Quế ống, quế vụn & bột quế Yên Bái",
    "Hoa hồi khô Lạng Sơn & thảo quả",
    "Gừng, nghệ thái lát sấy khô & tinh bột gia vị",
  ],
  cinnamon: [
    "Quế ống điếu & quế cuộn Yên Bái (Stick / Cigarette Cassia)",
    "Quế chẻ, quế ống sáo & quế vụn ép kiện (Split / Broken)",
    "Bột quế nguyên chất hàm lượng tinh dầu cao (2% – 4%)",
    "Hoa hồi khô Lạng Sơn & tinh dầu quế hồi tự nhiên",
  ],
  coconut: [
    "Cơm dừa nạo sấy (Desiccated Coconut Fine / Medium, High Fat)",
    "Nước cốt dừa, kem dừa & bột sữa dừa đóng lon / Aseptic",
    "Nước dừa tươi đóng hộp UHT, đóng lon & thạch dừa",
    "Dầu dừa tinh khiết ép lạnh (VCO) & dầu dừa tinh luyện",
  ],
  rice: [
    "Gạo thơm đặc sản ST25, ST24 & Jasmine 85",
    "Gạo trắng hạt dài xuất khẩu (5%, 15%, 25% tấm)",
    "Gạo tròn Japonica (Sushi) & gạo nếp cái hoa vàng",
    "Bún khô, phở khô, bánh tráng & chế phẩm từ gạo",
  ],
  seafood: [
    "Cá tra phi lê đông lạnh (Well-trimmed / Untrimmed)",
    "Tôm thẻ chân trắng & tôm sú (HLSO, PD, PTO, Nobashi)",
    "Mực ống, bạch tuộc & hải sản chế biến tẩm bột",
    "Chả cá Surimi & thủy sản đóng gói bán lẻ",
  ],
  "fruit-veg": [
    "Trái cây nhiệt đới cấp đông IQF (xoài, thanh long, sầu riêng)",
    "Trái cây sấy dẻo & sấy giòn xuất khẩu",
    "Nước ép trái cây cô đặc & Puree đóng phuy Aseptic",
    "Rau củ đông lạnh & đóng lon tiêu chuẩn xuất khẩu",
  ],
};

function getSubgroupsForCategory(cat: Category, allCategories: Category[]): string[] {
  const children = allCategories
    .filter((c) => c.parent_id === cat.id)
    .map((c) => CATEGORY_VI_NAMES[c.slug] || i18n(c.name_i18n, c.slug));
  const preset = CATEGORY_SUBGROUPS[cat.slug] ?? [];
  const combined = [...children, ...preset];
  const unique = [...new Set(combined.filter(Boolean))];
  if (unique.length >= 3) return unique.slice(0, 4);

  const fromFacts = (cat.buying_facts ?? []).map((f) => `${f.label}: ${f.value}`);
  const fallback = [
    ...unique,
    ...fromFacts,
    "Nguồn hàng trực tiếp từ nhà máy & vùng nguyên liệu Việt Nam",
    "Đầy đủ hồ sơ pháp lý L1, chứng nhận ATTP / HACCP / ISO",
    "Nhận cung ứng số lượng sỉ, gia công OEM / nhãn riêng",
  ];
  return [...new Set(fallback)].slice(0, 4);
}

const SERVICES = [
  {
    step: "01",
    icon: Store,
    title: "Đăng ký lên sàn Miễn phí",
    description:
      "Tạo gian hàng doanh nghiệp và đưa danh mục sản phẩm thực phẩm lên Trang Vàng Vexim Trade hoàn toàn miễn phí.",
    bullets: [
      "Khởi tạo hồ sơ pháp nhân nhà máy, công ty thương mại hoặc hợp tác xã nhanh chóng",
      "Đăng tải sản phẩm kèm quy cách, MOQ, giá tham khảo và năng lực gia công OEM/ODM",
      "AI tự động quét chứng nhận L1 (ATTP, HACCP, ISO, BRC...) gắn nhãn Chính chủ / Đối tác",
      "Nhận yêu cầu báo giá (RFQ) đã xác thực từ khách mua hàng trong nước và quốc tế",
    ],
    ctaLabel: "Đăng ký gian hàng ngay",
    ctaHref: "/for-suppliers",
  },
  {
    step: "02",
    icon: Globe2,
    title: "Thiết kế website chuẩn thương mại quốc tế",
    description:
      "Xây dựng website B2B đa ngôn ngữ chuyên nghiệp, tối ưu chuyển đổi cho doanh nghiệp xuất khẩu thực phẩm & nông sản.",
    bullets: [
      "Cấu trúc chuẩn thương mại quốc tế: bảng quy cách, đóng gói, cảng xuất, Incoterms",
      "Tối ưu SEO đa ngôn ngữ & dữ liệu cấu trúc Schema giúp nhà nhập khẩu dễ tìm thấy",
      "Tích hợp biểu mẫu nhận yêu cầu báo giá (RFQ) và đồng bộ hồ sơ năng lực nhà máy",
      "Tốc độ tải nhanh toàn cầu, giao diện hiện đại trên cả máy tính và điện thoại",
    ],
    ctaLabel: "Tư vấn thiết kế website",
    ctaHref: "/rfq",
  },
  {
    step: "03",
    icon: Megaphone,
    title: "Quảng cáo nổi bật",
    description:
      "Đưa gian hàng và sản phẩm chủ lực lên vị trí ưu tiên tại trang ngành hàng để tiếp cận đúng khách mua đang tìm nguồn hàng.",
    bullets: [
      "Hiển thị ưu tiên ở đầu danh mục ngành hàng thực phẩm và khu vực tìm kiếm",
      "Gắn nhãn nhận diện gian hàng nổi bật giúp tăng tỷ lệ nhấp xem hồ sơ và sản phẩm",
      "Báo cáo minh bạch lượt xem gian hàng, lượt mở sản phẩm theo chu kỳ 7 – 90 ngày",
      "Tách biệt rõ ràng với kết quả kiểm duyệt độc lập — giữ trọn độ tin cậy với buyer",
    ],
    ctaLabel: "Đăng ký vị trí nổi bật",
    ctaHref: "/for-suppliers",
  },
  {
    step: "04",
    icon: ShieldCheck,
    title: "Tuân thủ pháp lý FDA",
    description:
      "Tư vấn và hoàn thiện trọn gói hồ sơ pháp lý xuất khẩu thực phẩm sang thị trường Hoa Kỳ và các thị trường khó tính.",
    bullets: [
      "Đăng ký & gia hạn mã số cơ sở thực phẩm FDA (Food Facility Registration) + U.S. Agent",
      "Rà soát, chỉnh sửa nhãn sản phẩm (Nutrition Facts, thành phần, chất gây dị ứng) chuẩn FDA",
      "Hỗ trợ hồ sơ FSVP, khai báo Prior Notice và đăng ký FCE/SID cho thực phẩm đóng hộp",
      "Cập nhật chứng nhận lên hồ sơ L1 kèm lịch nhắc tự động trước 60 / 30 / 7 / 1 ngày hết hạn",
    ],
    ctaLabel: "Tư vấn hồ sơ FDA",
    ctaHref: "/rfq",
  },
];

const FAQ = [
  {
    q: "Tìm kiếm sản phẩm và gửi yêu cầu báo giá (RFQ) trên Vexim Trade có mất phí không?",
    a: "Hoàn toàn miễn phí cho người mua hàng. Bạn có thể tra cứu theo từng nhóm ngành thực phẩm, xem hồ sơ nhà cung cấp đã được kiểm duyệt và gửi yêu cầu báo giá trực tiếp cho nhà cung cấp mình chọn hoặc nhờ Vexim sàng lọc nhà máy phù hợp.",
  },
  {
    q: "Làm sao biết chứng nhận trên hồ sơ nhà cung cấp là chính chủ hay của đơn vị đối tác?",
    a: "Khi nhà cung cấp tải chứng nhận (ATTP, HACCP, ISO 22000, BRC, Halal, FDA...) lên bước Kiểm tra giấy tờ L1, hệ thống AI của Vexim tự động quét tên đơn vị được cấp và ngày hết hạn: nếu khớp pháp nhân sẽ hiển thị 'Chính chủ', nếu đứng tên nhà máy gia công/liên kết sẽ ghi rõ 'Đơn vị đối tác' kèm ngày hết hiệu lực.",
  },
  {
    q: "Doanh nghiệp thực phẩm tại Việt Nam đăng ký lên sàn như thế nào?",
    a: "Doanh nghiệp chỉ cần vào mục 'Dành cho nhà cung cấp' (/for-suppliers) để tạo tài khoản miễn phí, khai báo thông tin pháp nhân và tải giấy phép kinh doanh cùng các chứng nhận L1. Sau khi được mở cổng, bạn có thể đăng sản phẩm và nhận RFQ.",
  },
  {
    q: "Hệ thống xác thực nhà cung cấp của Vexim gồm những bước nào?",
    a: "Vexim đánh giá độc lập theo 3 cấp độ: (L1) Kiểm tra giấy tờ pháp lý & AI quét chứng nhận, (L2) Xác thực nhà máy thực tế qua bộ 9 ảnh chụp hiện trường kèm toạ độ/mã xác minh, và (L3) Đối chiếu chứng từ lịch sử lô hàng đã xuất khẩu.",
  },
  {
    q: "Khi chứng nhận ATTP / HACCP / ISO sắp hết hạn thì cập nhật lại ở đâu?",
    a: "Trước khi chứng nhận hết hạn 60, 30, 7 và 1 ngày, hệ thống tự động gửi thông báo và email nhắc nhà cung cấp. Doanh nghiệp chỉ cần vào mục Giấy tờ L1 tải bản gia hạn mới lên, AI sẽ tự quét lại ngày hết hạn mới và cập nhật hiển thị.",
  },
  {
    q: "Tôi muốn đăng ký gói Thiết kế website quốc tế, Quảng cáo nổi bật hoặc Tuân thủ pháp lý FDA thì làm thế nào?",
    a: "Bạn có thể nhấn vào nút tư vấn ở từng dịch vụ phía trên hoặc gửi yêu cầu tại trang Liên hệ / Báo giá (/rfq). Đội ngũ chuyên viên Vexim tại Hà Nội sẽ liên hệ tư vấn chi tiết trong vòng 1 ngày làm việc.",
  },
];

const POPULAR_KEYWORDS = [
  { label: "Hạt điều W320", href: "/products/cashew" },
  { label: "Cà phê Robusta", href: "/products/coffee" },
  { label: "Hồ tiêu đen ASTA", href: "/products/pepper" },
  { label: "Quế ống Yên Bái", href: "/products/cinnamon" },
  { label: "Cơm dừa sấy khô", href: "/products/coconut" },
  { label: "Gạo thơm ST25", href: "/products/rice" },
];

export default async function HomeContent({
  query = "",
  categoryFilter = "",
}: {
  query?: string;
  categoryFilter?: string;
} = {}) {
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
  const homeProducts = arrangeSupplierProducts(offers, 2).shown.slice(0, 8);
  const heroOf = (c: Category) => c.hero_image || FALLBACK_HERO;

  // Lọc danh mục theo thanh tìm kiếm (nếu người dùng nhập từ khóa hoặc chọn danh mục)
  const normalizedQuery = query.trim().toLowerCase();
  const displayedCategories = activeCategories.filter((c) => {
    if (categoryFilter && c.slug !== categoryFilter) return false;
    if (!normalizedQuery) return true;
    const viName = (CATEGORY_VI_NAMES[c.slug] ?? "").toLowerCase();
    const enName = i18n(c.name_i18n, c.slug).toLowerCase();
    const subs = getSubgroupsForCategory(c, allCategories).join(" ").toLowerCase();
    return (
      viName.includes(normalizedQuery) ||
      enName.includes(normalizedQuery) ||
      c.slug.toLowerCase().includes(normalizedQuery) ||
      subs.includes(normalizedQuery)
    );
  });
  const categoriesToRender = displayedCategories.length > 0 ? displayedCategories : activeCategories;

  return (
    <div className="bg-slate-50 text-ink-900">
      {/* =====================================================================
          SECTION 1: HERO TRANG VÀNG + THANH TÌM KIẾM SẢN PHẨM
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
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/15 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
               niên giám &amp; trang vàng B2B thực phẩm Việt Nam
            </span>

            <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-[44px]">
              Tìm sản phẩm và nhà cung cấp nguồn hàng thực phẩm tại Việt Nam
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-brand-100/90 sm:text-base">
              Tra cứu trực tiếp danh bạ ngành hàng nông sản &amp; thực phẩm chế biến, đối chiếu chứng nhận pháp lý L1 – nhà máy L2 – xuất khẩu L3 và kết nối báo giá nhanh.
            </p>

            {/* THANH TÌM KIẾM SẢN PHẨM KIỂU TRANG VÀNG */}
            <form
              action="/#categories"
              method="get"
              role="search"
              aria-label="Tìm kiếm sản phẩm và nhà cung cấp"
              className="mt-8 rounded-2xl border-2 border-amber-400 bg-white p-2 shadow-2xl shadow-black/35 sm:p-2.5"
            >
              <div className="grid gap-2 sm:grid-cols-[210px_minmax(0,1fr)_auto]">
                <label className="sr-only" htmlFor="home-search-category">
                  Chọn danh mục ngành hàng
                </label>
                <select
                  id="home-search-category"
                  name="cat"
                  defaultValue={categoryFilter}
                  className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-ink-800 focus:border-brand-600 focus:bg-white focus:outline-none"
                >
                  <option value="">Tất cả danh mục</option>
                  {activeCategories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {CATEGORY_VI_NAMES[c.slug] || i18n(c.name_i18n, c.slug)}
                    </option>
                  ))}
                </select>

                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-3.5 h-5 w-5 text-slate-400" />
                  <input
                    type="search"
                    name="q"
                    defaultValue={query}
                    placeholder="Nhập tên sản phẩm, nhóm nông sản, tiêu chuẩn (HACCP, FDA, Organic)..."
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-ink-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 text-sm font-black text-ink-950 shadow-sm transition hover:bg-amber-300"
                >
                  <Search className="h-4 w-4" />
                  Tìm kiếm
                </button>
              </div>
            </form>

            {/* Từ khóa phổ biến & thống kê nhanh */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-brand-100/90">
              <span className="font-semibold text-amber-300">Tìm nhanh:</span>
              {POPULAR_KEYWORDS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 font-medium text-white transition hover:border-amber-300 hover:bg-amber-400/20"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {supCount >= 10 && (
              <p className="mt-4 text-xs text-brand-100/75">
                Đang niêm yết <strong>{supCount}</strong> hồ sơ nhà cung cấp công khai · Phản hồi báo giá trong 1 ngày làm việc.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 2: DANH MỤC SẢN PHẨM (3 CARD / HÀNG + 3-4 NHÓM CON + XEM THÊM)
         ===================================================================== */}
      <section id="categories" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <span className="inline-block rounded-md bg-amber-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-900">
                Danh bạ ngành hàng thực phẩm
              </span>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
                Danh mục sản phẩm &amp; nhóm nguồn hàng chủ lực
              </h2>
              <p className="mt-1.5 text-sm text-ink-600">
                Chọn nhóm ngành hàng bên dưới để tra cứu chi tiết quy cách sản phẩm và danh sách nhà cung cấp tại Việt Nam.
              </p>
            </div>
            <Link
              href="/rfq"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-4 py-2 text-xs font-bold text-brand-800 shadow-2xs transition hover:border-brand-400 hover:bg-brand-50"
            >
              Gửi yêu cầu tìm nguồn hàng riêng <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {(query || categoryFilter) && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <span>
                Kết quả tra cứu cho{" "}
                {query ? <strong>“{query}”</strong> : <strong>danh mục đã chọn</strong>}:{" "}
                {displayedCategories.length > 0
                  ? `tìm thấy ${displayedCategories.length} nhóm ngành hàng phù hợp.`
                  : "chưa có danh mục khớp chính xác — đang hiển thị toàn bộ danh mục chủ lực."}
              </span>
              <Link href="/" className="text-xs font-bold text-brand-800 underline">
                Xóa bộ lọc
              </Link>
            </div>
          )}

          {/* Lưới 3 card / hàng trên desktop theo đúng cấu trúc Trang Vàng */}
          <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {categoriesToRender.map((c) => {
              const href = `/products/${c.slug}`;
              const hasProducts = Boolean(c.public_page_ready);
              const viTitle = CATEGORY_VI_NAMES[c.slug] || i18n(c.name_i18n, c.slug);
              const enSubtitle = i18n(c.name_i18n, c.slug);
              const subgroups = getSubgroupsForCategory(c, allCategories).slice(0, 4);

              return (
                <li key={c.slug} className="flex">
                  <div className="group flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-lg">
                    {/* Ảnh danh mục + Nhãn trạng thái */}
                    <Link href={href} className="relative aspect-[16/9] overflow-hidden bg-slate-100">
                      <Image
                        src={heroOf(c)}
                        alt={viTitle}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/75 via-ink-950/20 to-transparent" />
                      {hasProducts && (
                        <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white shadow">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" /> Có sẵn nguồn hàng
                        </span>
                      )}
                      <div className="absolute inset-x-4 bottom-3 text-white">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                          {enSubtitle}
                        </p>
                        <h3 className="mt-0.5 text-lg font-black leading-snug text-white group-hover:text-amber-200">
                          {viTitle}
                        </h3>
                      </div>
                    </Link>

                    {/* Danh sách 3-4 nhóm con sản phẩm tương ứng */}
                    <div className="flex flex-1 flex-col justify-between p-5">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Nhóm sản phẩm chính ({subgroups.length})
                        </p>
                        <ul className="mt-2.5 space-y-2">
                          {subgroups.map((sub) => (
                            <li key={sub}>
                              <Link
                                href={href}
                                className="flex items-start gap-2 rounded-lg px-1.5 py-1 text-[13.5px] leading-snug text-ink-700 transition hover:bg-amber-50 hover:text-brand-800"
                              >
                                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                <span className="line-clamp-1 font-medium">{sub}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Dòng chữ cuối card: Xem thêm thông tin sản phẩm */}
                      <div className="mt-5 border-t border-slate-100 pt-3.5">
                        <Link
                          href={href}
                          className="inline-flex w-full items-center justify-between text-[13px] font-bold text-brand-700 group-hover:text-brand-900"
                        >
                          <span>Xem thêm thông tin sản phẩm</span>
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

      {/* Sản phẩm sẵn sàng chào giá (giữ liên kết dữ liệu thực tế với catalog sản phẩm) */}
      {homeProducts.length > 0 && (
        <section aria-labelledby="home-products-title" className="border-t border-slate-200 bg-white py-14">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-brand-700">
                  Sản phẩm nổi bật trên sàn
                </p>
                <h2 id="home-products-title" className="mt-1.5 text-2xl font-black text-ink-900 sm:text-3xl">
                  Nguồn hàng thực phẩm sẵn sàng báo giá
                </h2>
                <p className="mt-1.5 text-sm text-ink-600">
                  Sản phẩm thực tế từ các nhà cung cấp đã được kiểm duyệt hồ sơ trên hệ thống.
                </p>
              </div>
              <a href="#categories" className="text-sm font-semibold text-brand-700 hover:underline">
                Xem tất cả danh mục →
              </a>
            </div>
            <ul className="mt-6 grid grid-cols-2 items-stretch gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {homeProducts.map((p) => (
                <li key={p.id} className="min-w-0">
                  <PublicProductCard
                    href={`/products/${encodeURIComponent(p.categorySlug)}/${encodeURIComponent(p.id)}`}
                    imagePath={p.cardImagePath ?? p.imagePaths[0]}
                    name={p.name}
                    moq={p.moq}
                    price={p.price}
                    fob={p.incoterm?.toUpperCase() === "FOB"}
                    leadTimeDays={p.leadTimeDays}
                    supplierName={p.supplierName}
                    supplierHref={`/suppliers/${encodeURIComponent(p.supplierSlug || p.supplierId)}`}
                    verificationSteps={p.verificationSteps}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* =====================================================================
          SECTION 3: DANH SÁCH BLOG (4 BÀI / HÀNG)
         ===================================================================== */}
      <section aria-labelledby="home-news-title" className="border-t border-slate-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-700">
                Tin tức &amp; Cẩm nang nguồn hàng
              </p>
              <h2
                id="home-news-title"
                className="mt-1.5 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl"
              >
                Bài viết &amp; phân tích thị trường mới nhất
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Kiến thức thu mua nông sản thực phẩm, tiêu chuẩn xuất khẩu và cập nhật mùa vụ từ đội ngũ Vexim Trade.
              </p>
            </div>
            <Link
              href="/blog"
              className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-800"
            >
              Xem tất cả bài viết (View all articles) <ArrowRight className="h-4 w-4" />
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
                            {formatPostDate(post.published_at)}
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
                          Đọc bài viết <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
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
              Chưa có bài viết nào được xuất bản (No articles published yet).{" "}
              <Link href="/blog" className="font-semibold text-brand-700 underline hover:text-brand-800">
                Visit our news page
              </Link>
              .
            </div>
          )}
        </div>
      </section>

      {/* =====================================================================
          SECTION 4: ĐƯA DOANH NGHIỆP CỦA BẠN ĐƯỢC TÌM - ĐƯỢC TIN - ĐƯỢC CHỌN (4 DỊCH VỤ)
         ===================================================================== */}
      <section
        id="services"
        className="border-t border-slate-200 bg-gradient-to-b from-brand-950 via-brand-900 to-ink-950 py-16 text-white sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-block rounded-full border border-amber-300/40 bg-amber-400/15 px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-amber-300">
              Giải pháp dành cho nhà sản xuất &amp; cung ứng Việt Nam
            </span>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">
              Đưa doanh nghiệp của bạn được tìm - được tin - được chọn
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-brand-100/85 sm:text-base">
              Hệ sinh thái hỗ trợ toàn diện từ niêm yết gian hàng B2B, chuẩn hóa hiện diện số quốc tế đến quảng bá nổi bật và tuân thủ pháp lý xuất khẩu.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((svc) => {
              const Icon = svc.icon;
              return (
                <div
                  key={svc.title}
                  className="flex flex-col justify-between rounded-2xl border border-white/15 bg-white/95 p-6 text-ink-900 shadow-xl transition hover:-translate-y-1"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400 text-ink-950 shadow-sm">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="font-mono text-xs font-black tracking-widest text-brand-700">
                        DỊCH VỤ {svc.step}
                      </span>
                    </div>

                    <h3 className="mt-4 text-lg font-black leading-snug text-ink-950">
                      {svc.title}
                    </h3>

                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
                      {svc.description}
                    </p>

                    <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-[13px] leading-snug text-ink-700">
                      {svc.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 pt-2">
                    <Link
                      href={svc.ctaHref}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-900"
                    >
                      {svc.ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 5: BỘ CÂU HỎI VÀ TRẢ LỜI (FAQ)
         ===================================================================== */}
      <section id="faq" className="border-t border-slate-200 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-5 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-800">
              <HelpCircle className="h-3.5 w-3.5" /> Giải đáp thắc mắc
            </span>
            <h2 className="mt-2.5 text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
              Bộ câu hỏi và trả lời
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              Những câu hỏi thường gặp về tra cứu nguồn hàng, cơ chế AI quét chứng nhận L1 và dịch vụ dành cho doanh nghiệp.
            </p>
          </div>

          <ul className="mt-10 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {FAQ.map((f, i) => (
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
                Trang Vàng kết nối nguồn hàng thực phẩm &amp; nông sản Việt Nam với khách mua trong nước và quốc tế.
              </p>
              <p className="mt-5 text-[12.5px] text-ink-400">
                © 2026 Vexim Global Co., Ltd., Hanoi, Vietnam
              </p>
              <SocialLinks className="mt-2" />
            </div>

            <FooterCol title="Danh mục ngành hàng">
              {activeCategories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/products/${c.slug}`} className="hover:text-brand-700">
                    {CATEGORY_VI_NAMES[c.slug] || i18n(c.name_i18n, c.slug)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/rfq" className="hover:text-brand-700">
                  Gửi yêu cầu mặt hàng khác →
                </Link>
              </li>
            </FooterCol>

            <FooterCol title="Dịch vụ & Nền tảng">
              <li>
                <Link href="/how-we-verify" className="hover:text-brand-700">
                  Quy trình xác thực L1 · L2 · L3
                </Link>
              </li>
              <li>
                <Link href="/for-suppliers" className="hover:text-brand-700">
                  Đăng ký nhà cung cấp miễn phí
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className="hover:text-brand-700">
                  Chính sách bảo mật (Privacy Policy)
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
                  Điều khoản dịch vụ (Terms of Service)
                </Link>
              </li>
              <li>
                <a href="mailto:contact@veximglobal.com" className="hover:text-brand-700">
                  contact@veximglobal.com
                </a>
              </li>
            </FooterCol>

            <FooterCol title="Khách mua hàng">
              <li>
                <Link href="/rfq" className="hover:text-brand-700">
                  Gửi yêu cầu báo giá (Request a quote)
                </Link>
              </li>
              <li>
                <Link href="/compare" className="hover:text-brand-700">
                  So sánh nhà cung cấp
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-brand-700">
                  Tin tức &amp; Cẩm nang nguồn hàng
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

function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "2-digit",
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
