import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  FileStack,
  Globe,
  HelpCircle,
  Search,
} from "lucide-react";

import { getStore } from "@/lib/db";
import { listPublishedNews } from "@/lib/blog/queries";
import { listPublicCategoryProducts, type PublicCategoryProduct } from "@/lib/public/product-catalog";
import { arrangeSupplierProducts } from "@/lib/public/supplier-product-order";
import { PublicProductCard } from "@/components/public-product-card";
import { ServiceRegistrationSection, type HomeLocale } from "@/components/service-registration-section";
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

/**
 * Danh sách 3-4 nhóm con sản phẩm đặc trưng (Tiếng Anh - mặc định)
 */
const CATEGORY_SUBGROUPS_EN: Record<string, string[]> = {
  cashew: [
    "Whole white cashew kernels (WW180, WW240, WW320, WW450)",
    "Scorched & broken kernels for bakery & confectionery (WS, LP, SP)",
    "Roasted salted, skin-on & flavored retail cashew (OEM)",
    "Cashew butter & private-label nutritional nut packs",
  ],
  "nuts-kernels": [
    "Export-grade cashew kernels (W240, W320, W450)",
    "Central Highlands macadamia nuts (in-shell & kernel)",
    "Blanched peanuts & dried lotus seeds",
    "Custom roasted & seasoned nut mixes (Private Label)",
  ],
  coffee: [
    "Green Robusta coffee beans (G1, G2, S16, S18 – Wet/Dry)",
    "Cau Dat & Son La washed Arabica green coffee beans",
    "Whole-bean roasted & ground coffee for filter and espresso",
    "Spray-dried & freeze-dried instant coffee (pure & 3-in-1)",
  ],
  pepper: [
    "Whole black pepper (FAQ 500g/l, 550g/l & ASTA grade)",
    "Double-washed white peppercorns (White Pepper)",
    "Steam-sterilised ground & cracked black pepper",
    "Freeze-dried green pepper, red pepper & certified organic pepper",
  ],
  "pepper-spices": [
    "Export-grade black & white peppercorns",
    "Yen Bai cassia cinnamon tubes, split & powder",
    "Lang Son dried star anise & black cardamom",
    "Dried sliced ginger, turmeric & natural spice powders",
  ],
  cinnamon: [
    "Yen Bai cigarette & stick cassia cinnamon (Stick / Cigarette)",
    "Split, broken & pressed-bale cassia cinnamon",
    "High-oil pure cassia cinnamon powder (2% – 4% volatile oil)",
    "Lang Son whole star anise & natural cinnamon essential oil",
  ],
  coconut: [
    "Desiccated coconut (Fine / Medium grade, High Fat)",
    "Canned & aseptic coconut milk, coconut cream & milk powder",
    "UHT pure coconut water, canned coconut water & nata de coco",
    "Cold-pressed Virgin Coconut Oil (VCO) & RBD coconut oil",
  ],
  rice: [
    "Specialty fragrant rice (ST25, ST24 & Jasmine 85)",
    "Long-grain white rice for export (5%, 15%, 25% broken)",
    "Japonica round-grain rice (Sushi) & glutinous rice",
    "Dried rice vermicelli, Pho noodles & export rice paper",
  ],
  seafood: [
    "Frozen Pangasius fillets (Well-trimmed / Untrimmed)",
    "Vannamei & Black Tiger shrimp (HLSO, PD, PTO, Nobashi)",
    "Frozen squid, octopus & breaded value-added seafood",
    "Surimi fish paste & retail-ready frozen seafood packs",
  ],
  "fruit-veg": [
    "IQF frozen tropical fruits (mango, dragon fruit, durian)",
    "Soft-dried & vacuum-fried fruit snacks for export",
    "Aseptic fruit puree & juice concentrates in drums",
    "Export-grade frozen & canned vegetables",
  ],
};

/**
 * Danh sách 3-4 nhóm con sản phẩm đặc trưng (Tiếng Việt)
 */
const CATEGORY_SUBGROUPS_VI: Record<string, string[]> = {
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

function getCategoryTitle(cat: Category, lang: HomeLocale): string {
  if (lang === "vi") {
    return CATEGORY_VI_NAMES[cat.slug] || i18n(cat.name_i18n, "vi", cat.slug);
  }
  return CATEGORY_EN_NAMES[cat.slug] || i18n(cat.name_i18n, "en", cat.slug);
}

function getSubgroupsForCategory(
  cat: Category,
  allCategories: Category[],
  lang: HomeLocale,
): string[] {
  const children = allCategories
    .filter((c) => c.parent_id === cat.id)
    .map((c) => getCategoryTitle(c, lang));
  const preset =
    lang === "vi"
      ? (CATEGORY_SUBGROUPS_VI[cat.slug] ?? [])
      : (CATEGORY_SUBGROUPS_EN[cat.slug] ?? []);
  const combined = [...children, ...preset];
  const unique = [...new Set(combined.filter(Boolean))];
  if (unique.length >= 3) return unique.slice(0, 4);

  const fromFacts = (cat.buying_facts ?? []).map((f) => `${f.label}: ${f.value}`);
  const fallback =
    lang === "vi"
      ? [
          ...unique,
          ...fromFacts,
          "Nguồn hàng trực tiếp từ nhà máy & vùng nguyên liệu Việt Nam",
          "Đầy đủ hồ sơ pháp lý và chứng nhận ATTP / HACCP / ISO",
          "Nhận cung ứng số lượng sỉ, gia công OEM / nhãn riêng",
        ]
      : [
          ...unique,
          ...fromFacts,
          "Direct sourcing from Vietnamese factories & growing regions",
          "Verified business documents & food safety certifications (HACCP / ISO / BRC)",
          "Bulk export volume, OEM & private-label capability",
        ];
  return [...new Set(fallback)].slice(0, 4);
}

const FAQ_EN = [
  {
    q: "Is searching products and submitting a Request for Quotation (RFQ) free for buyers?",
    a: "Yes, 100% free for buyers. You can browse verified Vietnamese food & agricultural suppliers, request a quote directly from the supplier you choose, or send your open requirements so Vexim can shortlist matching factories.",
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

const POPULAR_KEYWORDS_EN = [
  { label: "Cashew W320", href: "/products/cashew" },
  { label: "Robusta Coffee", href: "/products/coffee" },
  { label: "Black Pepper ASTA", href: "/products/pepper" },
  { label: "Cassia Cinnamon", href: "/products/cinnamon" },
  { label: "Desiccated Coconut", href: "/products/coconut" },
  { label: "ST25 Fragrant Rice", href: "/products/rice" },
];

const POPULAR_KEYWORDS_VI = [
  { label: "Hạt điều W320", href: "/products/cashew" },
  { label: "Cà phê Robusta", href: "/products/coffee" },
  { label: "Hồ tiêu đen ASTA", href: "/products/pepper" },
  { label: "Quế ống Yên Bái", href: "/products/cinnamon" },
  { label: "Cơm dừa sấy khô", href: "/products/coconut" },
  { label: "Gạo thơm ST25", href: "/products/rice" },
];

function buildSwitchHref(
  targetLang: HomeLocale,
  query: string,
  categoryFilter: string,
): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (categoryFilter) params.set("cat", categoryFilter);
  if (targetLang === "vi") params.set("lang", "vi");
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

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

  // Lọc danh mục theo thanh tìm kiếm (hỗ trợ tìm bằng cả tiếng Anh & tiếng Việt)
  const normalizedQuery = query.trim().toLowerCase();
  const displayedCategories = activeCategories.filter((c) => {
    if (categoryFilter && c.slug !== categoryFilter) return false;
    if (!normalizedQuery) return true;
    const viName = (CATEGORY_VI_NAMES[c.slug] ?? "").toLowerCase();
    const enName = (CATEGORY_EN_NAMES[c.slug] ?? i18n(c.name_i18n, "en", c.slug)).toLowerCase();
    const subsEn = getSubgroupsForCategory(c, allCategories, "en").join(" ").toLowerCase();
    const subsVi = getSubgroupsForCategory(c, allCategories, "vi").join(" ").toLowerCase();
    return (
      viName.includes(normalizedQuery) ||
      enName.includes(normalizedQuery) ||
      c.slug.toLowerCase().includes(normalizedQuery) ||
      subsEn.includes(normalizedQuery) ||
      subsVi.includes(normalizedQuery)
    );
  });
  const categoriesToRender = displayedCategories.length > 0 ? displayedCategories : activeCategories;
  const popularKeywords = isVi ? POPULAR_KEYWORDS_VI : POPULAR_KEYWORDS_EN;
  const faqs = isVi ? FAQ_VI : FAQ_EN;

  const enHref = buildSwitchHref("en", query, categoryFilter);
  const viHref = buildSwitchHref("vi", query, categoryFilter);

  return (
    <div lang={lang} className="bg-slate-50 text-ink-900">
      {/* =====================================================================
          SECTION 1: HERO + THANH TÌM KIẾM SẢN PHẨM + NÚT SONG NGỮ ANH - VIỆT
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

        <div className="relative mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-18 lg:px-8">
          {/* Thanh nút chuyển ngôn ngữ Anh - Việt (Mặc định: Tiếng Anh) */}
          <div className="mb-5 flex justify-center">
            <div
              role="group"
              aria-label="Language Switcher / Chuyển đổi ngôn ngữ Anh - Việt"
              className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-ink-950/60 p-1 text-xs font-bold text-white shadow-lg backdrop-blur-xs"
            >
              <span className="inline-flex items-center gap-1 pl-2.5 pr-1 text-[11px] font-semibold text-amber-300">
                <Globe className="h-3.5 w-3.5" />
                {isVi ? "Ngôn ngữ:" : "Language:"}
              </span>
              <Link
                href={enHref}
                scroll={false}
                aria-current={!isVi ? "true" : undefined}
                className={`rounded-full px-3 py-1 transition ${
                  !isVi
                    ? "bg-amber-400 font-black text-ink-950 shadow-xs"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                EN · English
              </Link>
              <Link
                href={viHref}
                scroll={false}
                aria-current={isVi ? "true" : undefined}
                className={`rounded-full px-3 py-1 transition ${
                  isVi
                    ? "bg-amber-400 font-black text-ink-950 shadow-xs"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                VI · Tiếng Việt
              </Link>
            </div>
          </div>

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
                : "Browse verified Vietnamese suppliers and request a quote from the one you choose. Haven’t found the right fit? Send us your requirements and Vexim will shortlist suppliers that match."}
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

            {/* Từ khóa phổ biến & thống kê nhanh */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-white/90">
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
            </div>

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
              const hasProducts = Boolean(c.public_page_ready);
              const primaryTitle = getCategoryTitle(c, lang);
              const secondaryLabel = isVi
                ? i18n(c.name_i18n, "en", c.slug)
                : (CATEGORY_VI_NAMES[c.slug] || i18n(c.name_i18n, "en", c.slug));
              const subgroups = getSubgroupsForCategory(c, allCategories, lang).slice(0, 4);

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
                          {secondaryLabel}
                        </p>
                        <h3 className="mt-0.5 text-lg font-black leading-snug text-white group-hover:text-amber-200">
                          {primaryTitle}
                        </h3>
                      </div>
                    </Link>

                    {/* Danh sách 3-4 nhóm con sản phẩm tương ứng */}
                    <div className="flex flex-1 flex-col justify-between p-5">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          {isVi
                            ? `Nhóm sản phẩm chính (${subgroups.length})`
                            : `Key Product Sub-groups (${subgroups.length})`}
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

      {/* Sản phẩm sẵn sàng chào giá */}
      {homeProducts.length > 0 && (
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
