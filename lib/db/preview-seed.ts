/**
 * Dữ liệu xem thử cho trang công khai ở chế độ local.
 *
 * Chỉ chạy khi app dùng kho local (`data/local-db.json`), tức là khi chưa cấu hình
 * Supabase hoặc máy không mở được kết nối trong sandbox. Không có dòng nào ở đây
 * đi vào Supabase, nên không thể làm bẩn dữ liệu production.
 *
 * Mục đích: nhìn được ba danh mục ra mắt với sản phẩm thật trong lưới, khối giá
 * và biểu đồ mùa vụ, trước khi có nhà cung cấp thật đăng ký.
 *
 * Vì sao không đánh dấu is_demo: hồ sơ demo bị loại khỏi khoảng giá tham khảo và
 * khỏi lưới sản phẩm trang chủ, nên sẽ không thấy được đúng thứ cần xem. Đổi lại,
 * các dòng ở đây phải nằm trong file local và không bao giờ được chuyển sang
 * Supabase. Nếu cần nhìn trạng thái demo, dùng VEXIM_SHOW_DEMO thay vì sửa file này.
 *
 * Ảnh: ba ảnh có sẵn trong public/images/categories được copy sang data/media khi
 * seed, vì kho media ở chế độ local đọc từ đó.
 */
import fs from "node:fs";
import path from "node:path";

import type { Category, HarvestCalendar, MediaAsset, Supplier, SupplierProduct, Verification } from "@/lib/types";

const IMAGE_FOR_CATEGORY: Record<string, string> = {
  "cashew-kernels": "cashew-grade.jpg",
  pepper: "pepper.jpg",
  "cinnamon-star-anise": "cinnamon.jpg",
};

function copyImage(productId: string, source: string): string | null {
  const target = path.join(process.cwd(), "data", "media", "products", productId, "preview.jpg");
  const from = path.join(process.cwd(), "public", "images", "categories", source);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.copyFileSync(from, target);
    return `products/${productId}/preview.jpg`;
  } catch {
    // Không copy được thì bỏ ảnh, thẻ hiện ô giữ chỗ. Không làm hỏng seed.
    return null;
  }
}

const CASHEW_HARVEST: HarvestCalendar = {
  windows: [
    {
      id: "main",
      label: "Main crop",
      start_month: 1,
      end_month: 5,
      regions: ["Dong Nai", "Dak Lak", "Gia Lai", "Lam Dong"],
      peak: true,
      note: "Picking starts in January in the area that was Binh Phuoc, now part of Dong Nai, and finishes in April. The rest of Dong Nai and the Central Highlands follow two to four weeks later.",
    },
  ],
  note_i18n: {
    en: "Processors also buy raw nuts from West Africa and Cambodia, so kernels leave the factory in every month. These months are when the domestic crop arrives, which is when raw nut prices move.",
  },
  reviewed_on: "2026-10-23",
};

const CINNAMON_HARVEST: HarvestCalendar = {
  windows: [
    {
      id: "spring",
      label: "Spring crop",
      start_month: 3,
      end_month: 5,
      regions: ["Yen Bai", "Lao Cai", "Lang Son"],
      peak: true,
      note: "Cassia bark is stripped from March to May. Star anise flowers in spring and is picked much later.",
    },
    {
      id: "autumn",
      label: "Autumn crop",
      start_month: 8,
      end_month: 11,
      regions: ["Yen Bai", "Lang Son", "Cao Bang"],
      peak: false,
      note: "Second cassia bark season from August to October, and star anise from August to November. The autumn anise carries the stronger aroma.",
    },
  ],
  note_i18n: {
    en: "Dried bark and anise keep, so orders run all year. Picking peaks twice, which is when the freshest material reaches the mills and when the price at the mill moves.",
  },
  reviewed_on: "2026-10-23",
};

export const PREVIEW_PEPPER_HARVEST: HarvestCalendar = {
  windows: [
    {
      id: "main",
      label: "Main crop",
      start_month: 2,
      end_month: 4,
      regions: ["Dak Lak", "Gia Lai", "Dak Nong", "Dong Nai", "Ba Ria - Vung Tau"],
      peak: true,
      note: "Picking starts late in February and finishes at the end of April.",
    },
  ],
  note_i18n: {
    en: "Pepper is dried and stored, so it ships all year. These months are when the crop is picked, which is when farm-gate prices move.",
  },
  reviewed_on: "2026-10-23",
};

/** Danh mục ra mắt chưa có trong seed cũ của kho local. Bổ sung để khớp production. */
export function previewCategories(now: string): Category[] {
  const base = {
    parent_id: null,
    faq_i18n: [],
    spec_columns: [],
    spec_rows: [],
    buying_facts: [],
    filters: [],
    product_fields: [],
    is_published: true,
    status: "published" as const,
    public_page_ready: true,
    seo_indexable: false,
    active_on_homepage: true,
    created_at: now,
    updated_at: now,
  };
  return [
    {
      ...base,
      id: "cat-seed-cashew-kernels",
      slug: "cashew-kernels",
      name_i18n: { en: "Cashew kernels", vi: "Hạt điều nhân" },
      h1_i18n: { en: "Cashew kernel suppliers in Vietnam" },
      intro_i18n: { en: "Vietnamese cashew kernels graded to the AFI count system, from W180 whole kernels down to splits and pieces. Compare the grade, the packing and what has been checked on each profile, then deal with the processor directly." },
      body_i18n: { en: "<p>Vietnam processes more cashew than any other country, and supplies most of the kernels traded worldwide. The raw nuts mostly come in from West Africa and Cambodia, with the domestic crop a smaller share, so the factories run all year.</p><p>Kernels are graded by count per pound under the AFI system. W240 means roughly 240 whole kernels to a pound, and the lower the number the larger the kernel and the higher the price.</p>" },
      seo_title_i18n: { en: "Cashew Kernel Suppliers in Vietnam | W180 to W450 | Vexim Trade" },
      seo_desc_i18n: { en: "Vietnamese cashew kernels graded to AFI counts, from W180 wholes to splits and pieces. Compare grade, packing and verification, then contact the processor directly." },
      hero_image: "/images/categories/cashew-hero.jpg",
      hero_alt_i18n: { en: "Vietnamese cashew kernels graded by count" },
      homepage_kicker_i18n: { en: "W180 to SP, AFI grades" },
      spec_columns: [
        { key: "code", label: "Grade", width: "w-20", emphasis: true },
        { key: "count", label: "Kernels per lb", width: "w-32" },
        { key: "use", label: "What it is usually bought for" },
      ],
      spec_rows: [
        { key: "w180", values: { code: "W180", count: "170 to 180", use: "Premium retail and gift packs" } },
        { key: "w240", values: { code: "W240", count: "220 to 240", use: "Premium retail" } },
        { key: "w320", values: { code: "W320", count: "300 to 320", use: "The most traded grade" } },
        { key: "w450", values: { code: "W450", count: "400 to 450", use: "Snacks, bakery and confectionery" } },
        { key: "ws", values: { code: "WS", count: "Not graded by count", use: "White splits for snacks and cereals" } },
        { key: "lp", values: { code: "LP", count: "Not graded by count", use: "Large pieces for bakery" } },
      ],
      buying_facts: [
        { key: "grade", icon: "tag", label: "Grades", value: "AFI counts from W180 to W450, plus splits and pieces." },
        { key: "inco", icon: "ship", label: "Incoterms", value: "FOB Ho Chi Minh City is the usual basis." },
        { key: "season", icon: "calendar", label: "Season", value: "Domestic nuts arrive from January to May. Kernels ship all year." },
      ],
      product_fields: [{ key: "grade", label: "Grade", type: "select", options: ["W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"], filterable: true }],
      filters: [{ key: "grade", label: "Grades", options: [
        { value: "W180", label: "W180" }, { value: "W240", label: "W240" }, { value: "W320", label: "W320" },
        { value: "W450", label: "W450" }, { value: "WS", label: "WS" }, { value: "LP", label: "LP" },
      ] }],
      harvest: CASHEW_HARVEST,
      price_unit: "kg",
      sort_order: 10,
    } as Category,
    {
      ...base,
      id: "cat-seed-cinnamon-star-anise",
      slug: "cinnamon-star-anise",
      name_i18n: { en: "Cinnamon and star anise", vi: "Quế và hồi" },
      h1_i18n: { en: "Cassia cinnamon and star anise suppliers in Vietnam" },
      intro_i18n: { en: "Whole cassia bark and star anise from the northern highlands, the two crops that fill the same spice-house order. Compare grade, oil content and packing, then contact the mill directly. Vexim steps in only when the spec you need is not listed here." },
      body_i18n: { en: "<p>Cassia cinnamon and star anise grow in the northern highlands, mostly in Yen Bai, Lao Cai, Lang Son and Cao Bang. Vietnam is the largest supplier of both.</p><p>Cassia is not the same product as Ceylon cinnamon. It is thicker, darker and stronger, and it is what most industrial buyers mean when they buy cinnamon in volume.</p>" },
      seo_title_i18n: { en: "Cassia Cinnamon and Star Anise Suppliers in Vietnam | Vexim Trade" },
      seo_desc_i18n: { en: "Whole cassia bark and star anise from Yen Bai, Lao Cai and Lang Son. Compare grade, oil content and packing, then contact the mill directly." },
      hero_image: "/images/categories/cinnamon.jpg",
      hero_alt_i18n: { en: "Vietnamese cassia cinnamon bark and star anise" },
      homepage_kicker_i18n: { en: "Cassia bark and star anise" },
      spec_columns: [
        { key: "product", label: "Product", width: "w-32", emphasis: true },
        { key: "crop", label: "Crop", width: "w-32" },
        { key: "use", label: "What it is usually bought for" },
      ],
      spec_rows: [
        { key: "cassia-whole", values: { product: "Cassia, whole bark", crop: "Spring and autumn", use: "Spice houses that cut and pack in the destination market" } },
        { key: "cassia-split", values: { product: "Cassia, split", crop: "Spring and autumn", use: "Grinding and blending" } },
        { key: "anise-autumn", values: { product: "Star anise, autumn", crop: "Autumn", use: "Oil extraction and premium retail" } },
        { key: "anise-spring", values: { product: "Star anise, spring", crop: "Spring", use: "Volume buyers where price matters more than aroma" } },
      ],
      buying_facts: [
        { key: "grade", icon: "tag", label: "Grades", value: "Cassia by tube diameter and wall thickness. Star anise by flower size, colour and moisture." },
        { key: "inco", icon: "ship", label: "Incoterms", value: "FOB named port is the usual basis." },
        { key: "season", icon: "calendar", label: "Season", value: "Two crops a year, March to May and August to November." },
      ],
      product_fields: [{ key: "product_type", label: "Product", type: "select", options: ["Cassia whole", "Cassia split", "Cassia powder", "Star anise", "Star anise oil"], filterable: true }],
      filters: [{ key: "product_type", label: "Products", options: [
        { value: "Cassia whole", label: "Cassia whole" }, { value: "Cassia split", label: "Cassia split" },
        { value: "Star anise", label: "Star anise" }, { value: "Star anise oil", label: "Star anise oil" },
      ] }],
      harvest: CINNAMON_HARVEST,
      price_unit: "mt",
      sort_order: 30,
    } as Category,
  ];
}

interface PreviewSupplier {
  slug: string;
  name: string;
  display: string;
  province: string;
  type: "manufacturer" | "trading" | "cooperative";
  steps: Array<1 | 2 | 3>;
  markets: string;
}

const SUPPLIERS: PreviewSupplier[] = [
  { slug: "dong-nai-cashew", name: "Dong Nai Cashew Processing JSC", display: "Dong Nai Cashew", province: "Dong Nai", type: "manufacturer", steps: [1, 2, 3], markets: "EU, US, Japan" },
  { slug: "binh-phuoc-kernel", name: "Binh Phuoc Nut and Kernel Co.", display: "Binh Phuoc Kernel", province: "Dong Nai", type: "manufacturer", steps: [1, 2], markets: "EU, Middle East" },
  { slug: "dak-lak-pepper-mill", name: "Dak Lak Pepper Mill", display: "Dak Lak Pepper", province: "Dak Lak", type: "manufacturer", steps: [1, 2, 3], markets: "EU, US" },
  { slug: "yen-bai-cassia", name: "Yen Bai Cassia and Anise", display: "Yen Bai Cassia", province: "Yen Bai", type: "cooperative", steps: [1, 2], markets: "EU, China" },
  { slug: "lang-son-anise", name: "Lang Son Star Anise Cooperative", display: "Lang Son Anise", province: "Lang Son", type: "cooperative", steps: [1, 2, 3], markets: "EU, India" },
  // Ba danh mục ra mắt cần đủ ba niêm yết mỗi quy cách thì khối giá mới hiện số,
  // nên mỗi quy cách chủ lực có thêm hai nhà cung cấp.
  { slug: "long-an-cashew", name: "Long An Cashew Export JSC", display: "Long An Cashew", province: "Long An", type: "manufacturer", steps: [1, 2], markets: "US, EU" },
  { slug: "gia-lai-pepper", name: "Gia Lai Pepper Trading Co.", display: "Gia Lai Pepper", province: "Gia Lai", type: "trading", steps: [1, 2], markets: "EU, Middle East" },
  { slug: "binh-phuoc-pepper", name: "Binh Phuoc Pepper Cooperative", display: "Binh Phuoc Pepper", province: "Binh Phuoc", type: "cooperative", steps: [1], markets: "EU" },
  { slug: "lao-cai-cassia", name: "Lao Cai Cassia Mill", display: "Lao Cai Cassia", province: "Lao Cai", type: "manufacturer", steps: [1, 2], markets: "China, EU" },
  { slug: "cao-bang-cassia", name: "Cao Bang Cassia Cooperative", display: "Cao Bang Cassia", province: "Cao Bang", type: "cooperative", steps: [1, 2, 3], markets: "EU, India" },
];

interface PreviewProduct {
  supplier: string;
  name: string;
  category: string;
  spec: string;
  grade: string;
  unit: "kg" | "mt";
  price: number;
  priceMax?: number;
  moq: string;
  leadTime: number;
  port: string;
}

const PRODUCTS: PreviewProduct[] = [
  // Hạt điều nhân
  { supplier: "dong-nai-cashew", name: "Cashew kernels W320", category: "cashew-kernels", spec: "AFI W320, moisture 5% max, 22.68 kg carton", grade: "W320", unit: "kg", price: 7.35, priceMax: 7.6, moq: "1 x 20ft (15.9 MT)", leadTime: 21, port: "Cat Lai" },
  { supplier: "dong-nai-cashew", name: "Cashew kernels W240", category: "cashew-kernels", spec: "AFI W240, vacuum carton", grade: "W240", unit: "kg", price: 8.1, moq: "1 x 20ft", leadTime: 21, port: "Cat Lai" },
  { supplier: "binh-phuoc-kernel", name: "Cashew kernels W320, steam treated", category: "cashew-kernels", spec: "AFI W320, steam sterilised, 2 x 11.34 kg", grade: "W320", unit: "kg", price: 7.55, priceMax: 7.8, moq: "5 MT", leadTime: 18, port: "Cat Lai" },
  { supplier: "binh-phuoc-kernel", name: "Cashew kernels W450", category: "cashew-kernels", spec: "AFI W450, 20 kg carton", grade: "W450", unit: "kg", price: 6.6, moq: "5 MT", leadTime: 18, port: "Cat Lai" },
  { supplier: "long-an-cashew", name: "Cashew kernels W320, vacuum packed", category: "cashew-kernels", spec: "AFI W320, vacuum carton, 22.68 kg", grade: "W320", unit: "kg", price: 7.45, priceMax: 7.7, moq: "1 x 20ft", leadTime: 19, port: "Cat Lai" },
  { supplier: "binh-phuoc-kernel", name: "Cashew white splits WS", category: "cashew-kernels", spec: "White splits, 22.68 kg carton", grade: "WS", unit: "kg", price: 4.9, moq: "5 MT", leadTime: 20, port: "Cat Lai" },
  // Hồ tiêu
  { supplier: "dak-lak-pepper-mill", name: "Black pepper 550 g/L, machine cleaned", category: "pepper", spec: "550 g/L min, moisture 12.5% max, 25 kg PP", grade: "550 g/L", unit: "mt", price: 6350, priceMax: 6550, moq: "5 MT", leadTime: 14, port: "Cat Lai" },
  { supplier: "dak-lak-pepper-mill", name: "Black pepper 500 g/L, FAQ", category: "pepper", spec: "500 g/L min, moisture 13% max, 25 kg PP", grade: "500 g/L", unit: "mt", price: 6100, moq: "5 MT", leadTime: 14, port: "Cat Lai" },
  { supplier: "dak-lak-pepper-mill", name: "White pepper 600 g/L", category: "pepper", spec: "600 g/L min, moisture 13% max, 25 kg PP", grade: "White pepper", unit: "mt", price: 9350, priceMax: 9600, moq: "3 MT", leadTime: 16, port: "Cat Lai" },
  { supplier: "gia-lai-pepper", name: "Black pepper 550 g/L, FAQ", category: "pepper", spec: "550 g/L min, moisture 12.5% max, 25 kg PP", grade: "550 g/L", unit: "mt", price: 6440, moq: "5 MT", leadTime: 15, port: "Cat Lai" },
  { supplier: "binh-phuoc-pepper", name: "Black pepper 550 g/L, sun dried", category: "pepper", spec: "550 g/L min, moisture 12.5% max, 25 kg PP", grade: "550 g/L", unit: "mt", price: 6520, moq: "3 MT", leadTime: 16, port: "Cat Lai" },
  { supplier: "yen-bai-cassia", name: "Black pepper 570 g/L, ASTA cleaned", category: "pepper", spec: "570 g/L min, admixture 0.2% max", grade: "570 g/L", unit: "mt", price: 6600, moq: "5 MT", leadTime: 20, port: "Hai Phong" },
  // Quế và hồi
  { supplier: "yen-bai-cassia", name: "Cassia whole bark, 3 mm split", category: "cinnamon-star-anise", spec: "Tube 3 mm, oil 2% min, 25 kg bundle", grade: "Cassia whole", unit: "mt", price: 3850, priceMax: 4100, moq: "5 MT", leadTime: 25, port: "Hai Phong" },
  { supplier: "yen-bai-cassia", name: "Cassia split, 4 mm", category: "cinnamon-star-anise", spec: "Tube 4 mm, moisture 13.5% max", grade: "Cassia split", unit: "mt", price: 3200, moq: "5 MT", leadTime: 25, port: "Hai Phong" },
  { supplier: "lao-cai-cassia", name: "Cassia whole bark, 4 mm", category: "cinnamon-star-anise", spec: "Tube 4 mm, oil 1.8% min, 25 kg bundle", grade: "Cassia whole", unit: "mt", price: 4050, moq: "5 MT", leadTime: 24, port: "Hai Phong" },
  { supplier: "lao-cai-cassia", name: "Cassia split, 5 mm", category: "cinnamon-star-anise", spec: "Tube 5 mm, moisture 13.5% max", grade: "Cassia split", unit: "mt", price: 3300, moq: "5 MT", leadTime: 24, port: "Hai Phong" },
  { supplier: "cao-bang-cassia", name: "Cassia whole bark, 2.5 mm", category: "cinnamon-star-anise", spec: "Tube 2.5 mm, oil 2.2% min, 25 kg bundle", grade: "Cassia whole", unit: "mt", price: 3950, moq: "3 MT", leadTime: 26, port: "Hai Phong" },
  { supplier: "lang-son-anise", name: "Star anise, autumn crop", category: "cinnamon-star-anise", spec: "8 points, oil 3.5% min, 10 kg carton", grade: "Star anise", unit: "mt", price: 8900, priceMax: 9400, moq: "3 MT", leadTime: 22, port: "Hai Phong" },
  { supplier: "lang-son-anise", name: "Star anise, spring crop", category: "cinnamon-star-anise", spec: "8 points, oil 3% min, 10 kg carton", grade: "Star anise", unit: "mt", price: 7600, moq: "3 MT", leadTime: 22, port: "Hai Phong" },
];

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function packagingFor(category: string, grade: string): string | null {
  if (category === "cashew-kernels") return "22.68 kg carton";
  if (category === "pepper") return "25 kg PP bag";
  if (category === "cinnamon-star-anise") return grade === "Star anise" ? "10 kg carton" : "25 kg bundle";
  return null;
}

export interface PreviewSeedRows {
  suppliers: Supplier[];
  products: SupplierProduct[];
  media: MediaAsset[];
  verifications: Verification[];
}

/**
 * Sinh các dòng xem thử. `nowISO(offset)` lấy từ kho local để đồng bộ mốc thời gian.
 */
export function previewSeedRows(nowISO: (offsetDays?: number) => string): PreviewSeedRows {
  const now = nowISO(0);
  const suppliers: Supplier[] = SUPPLIERS.map((s) => {
    const id = `sup-preview-${s.slug}`;
    return {
      id,
      name: s.name,
      trade_name: s.display,
      display_name: s.display,
      slug: s.slug,
      contact_name: null,
      contact_title: null,
      email: null,
      phone: null,
      zalo: null,
      website: null,
      country: "Vietnam",
      address: null,
      province: s.province,
      role: s.type === "manufacturer" ? "manufacturer" : "exporter",
      supplier_type: s.type,
      markets: s.markets,
      products: "Cashew kernels, pepper, cassia and star anise",
      tax_id: null,
      payment_terms: null,
      lead_time_days: 21,
      rating: 5,
      notes: "Dữ liệu xem thử ở kho local. Không có trong Supabase.",
      status: "published",
      onboarding_status: "approved",
      founded_year: 2008,
      employees: 120,
      summary_i18n: { en: `${s.display} processes and exports from ${s.province}.` },
      moq_text: null,
      capacity_per_month: null,
      ports: ["Cat Lai"],
      incoterms: ["FOB"],
      export_markets: s.markets.split(",").map((m) => m.trim()),
      is_demo: false,
      verification_level: Math.max(...s.steps),
      verified_at: nowISO(30),
      next_reverify_at: null,
      rating_avg: 5,
      rating_count: 3,
      fob_min: null,
      fob_max: null,
      fob_unit: null,
      fob_currency: "USD",
      // Hai trường này là cổng bắt buộc để giá được phép hiện công khai.
      fob_updated_at: now,
      fob_publicly_visible: true,
      created_at: nowISO(120),
      updated_at: now,
    } as unknown as Supplier;
  });

  const bySlug = new Map(SUPPLIERS.map((s) => [s.slug, `sup-preview-${s.slug}`]));
  const products: SupplierProduct[] = [];
  const media: MediaAsset[] = [];

  PRODUCTS.forEach((p, index) => {
    const id = `prod-preview-${index + 1}`;
    const imagePath = copyImage(id, IMAGE_FOR_CATEGORY[p.category] ?? "cashew-grade.jpg");
    products.push({
      id,
      supplier_id: bySlug.get(p.supplier)!,
      name: p.name,
      slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      name_i18n: { en: p.name },
      category: p.category,
      description: p.spec,
      description_i18n: { en: p.spec },
      description_detail: null,
      spec: p.spec,
      spec_i18n: { en: p.spec },
      // Khoá phải khớp trường quy cách mà danh mục khai báo, nếu không bộ lọc và
      // phần tách khoảng giá theo quy cách sẽ không đọc được giá trị.
      specs: { [p.category === "cinnamon-star-anise" ? "product_type" : "grade"]: p.grade },
      unit: p.unit,
      moq: p.moq,
      monthly_capacity: "500 MT per month",
      lead_time_days: p.leadTime,
      // Bao bì theo mặt hàng, không dùng một giá trị chung: hạt điều đóng thùng
      // carton, hồ tiêu đóng bao PP, quế đóng bó và hoa hồi đóng thùng nhỏ.
      packaging: packagingFor(p.category, p.grade),
      oem: false,
      odm: false,
      certifications: "HACCP, ISO 22000",
      export_port: p.port,
      ref_price: p.price,
      ref_price_max: p.priceMax ?? null,
      price_publicly_visible: true,
      currency: "USD",
      price_valid_until: isoDaysFromNow(150),
      incoterm: "FOB",
      incoterm_place: p.port,
      payment_terms: null,
      samples: true,
      ready_for_buyer: true,
      supplier_review_status: "approved",
      supplier_originated: false,
      reviewed_category_slug: p.category,
      featured_media_id: null,
      created_at: nowISO(20),
      updated_at: nowISO(index % 5),
    } as unknown as SupplierProduct);

    if (imagePath) {
      media.push({
        id: `media-preview-${index + 1}`,
        owner_type: "product",
        product_id: id,
        supplier_id: bySlug.get(p.supplier)!,
        kind: "image",
        audience: "buyer",
        status: "checked",
        expires_on: null,
        caption: p.name,
        storage_path: imagePath,
        thumb_path: null,
        external_url: null,
        mime: "image/jpeg",
        bytes: null,
        width: null,
        height: null,
        sort_order: 0,
        created_at: nowISO(20),
        updated_at: nowISO(20),
      } as unknown as MediaAsset);
    }
  });

  const verifications: Verification[] = [];
  for (const s of SUPPLIERS) {
    for (const level of s.steps) {
      verifications.push({
        id: `ver-preview-${s.slug}-${level}`,
        supplier_id: `sup-preview-${s.slug}`,
        target_level: level,
        status: "approved",
        inspector_id: null,
        visit_date: level === 2 ? nowISO(40) : null,
        visit_lat: null,
        visit_lng: null,
        visit_address: null,
        shipment_ref: level === 3 ? "PREVIEW-BL-001" : null,
        shipped_on: level === 3 ? nowISO(60) : null,
        shipment_destination: level === 3 ? "Rotterdam" : null,
        checklist: {},
        checklist_notes: {},
        return_reason: null,
        public_summary_i18n: {},
        approved_at: nowISO(35),
        approved_by: "preview",
        created_at: nowISO(45),
        updated_at: nowISO(35),
      } as unknown as Verification);
    }
  }

  return { suppliers, products, media, verifications };
}
