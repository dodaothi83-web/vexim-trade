/**
 * Demo cashew suppliers — DÙNG CHO PREVIEW NỘI BỘ / demo tại sự kiện.
 *
 *  - Tên đều là mẫu ("Sample Cashew Co.", "Demo Supplier X") – KHÔNG trùng công ty thật.
 *  - Mọi hồ sơ có is_demo=true → listPublicSuppliers tự động loại bỏ
 *    trừ khi VEXIM_SHOW_DEMO="true" hoặc caller truyền includeDemo=true.
 *  - Không dùng email/số điện thoại thật; dữ liệu không xuất hiện trong sitemap hay thống kê.
 *
 * products tuân theo shape SEED_PRODUCTS (dùng normalizeProduct trong local.ts):
 *   { supplier_ref?, name, category, description?, spec?, unit?, moq?, monthly_capacity?,
 *     lead_time_days?, packaging?, oem?, certifications?, export_port?,
 *     ref_price?, currency?, price_valid_until?, incoterm?, incoterm_place?,
 *     payment_terms?, samples? }
 */
import type { Supplier } from "@/lib/types";

interface DemoProductSeed {
  name: string;
  category: string;
  description?: string | null;
  moq?: string | null;
  certifications?: string | null;
  ref_price?: number | null;
  currency?: string | null;
  lead_time_days?: number | null;
}

interface DemoSupplierSeed {
  supplier: Omit<
    Supplier,
    "id" | "created_at" | "updated_at" | "slug" | "display_name" | "is_demo"
  > & { is_demo: true };
  products: DemoProductSeed[];
}

export const DEMO_CASHEW_CATEGORY_ID = "cat-seed-cashew";

const mk = (overrides: Partial<Omit<Supplier, "is_demo">> & {
  name: string;
  trade_name: string | null;
  province: string | null;
  role: Supplier["role"];
  supplier_type: Supplier["supplier_type"];
  verification_level: number;
}) => ({
  contact_name: "[Demo contact]",
  contact_title: "Export Sales",
  email: null,
  phone: null,
  zalo: null,
  website: null,
  country: "Vietnam",
  address: "[Demo address]",
  markets: "Demo markets",
  products: "",
  tax_id: null,
  payment_terms: null,
  lead_time_days: null,
  rating: null,
  rating_avg: null,
  rating_count: 0,
  notes: "[DEMO] Sample profile used for preview only.",
  status: "published" as const,
  founded_year: null,
  employees: null,
  summary_i18n: { en: "[Demo] Sample profile." },
  moq_text: null,
  capacity_per_month: null,
  ports: ["Cat Lai (HCMC)"],
  fob_min: null,
  fob_max: null,
  fob_unit: null,
  fob_currency: null,
  fob_updated_at: null,
  fob_publicly_visible: false,
  verified_at: null,
  next_reverify_at: null,
  private_label: false,
  ...overrides,
  is_demo: true as const,
});

export const DEMO_SUPPLIERS: DemoSupplierSeed[] = [
  {
    supplier: mk({
      name: "Sample Cashew Processing Co., Ltd.",
      trade_name: "Sample Cashew Co. (Factory A)",
      province: "Bình Phước",
      role: "manufacturer",
      supplier_type: "manufacturer",
      markets: "EU, US, Middle East",
      products: "Cashew kernels W240, W320, W450, SW, WS",
      payment_terms: "30% deposit, 70% against B/L copy",
      lead_time_days: 20,
      rating_avg: 4.7,
      rating_count: 12,
      founded_year: 2014,
      employees: 220,
      summary_i18n: {
        en: "[Demo] Mid-size cashew kernel processor in Bình Phước with steam sterilisation and vacuum packing lines.",
      },
      moq_text: "1×20'FCL (~18 MT)",
      capacity_per_month: "120 MT/month",
      fob_updated_at: new Date().toISOString(),
      fob_publicly_visible: true,
      verification_level: 3,
      verified_at: new Date().toISOString(),
      private_label: true,
    }),
    products: [
      { name: "Cashew W240", category: "cashew", moq: "1×20'FCL", certifications: "BRCGS, HACCP", ref_price: 8.4, currency: "USD/kg", lead_time_days: 20 },
      { name: "Cashew W320", category: "cashew", moq: "1×20'FCL", certifications: "BRCGS, HACCP", ref_price: 8.0, currency: "USD/kg", lead_time_days: 20 },
      { name: "Cashew SW",   category: "cashew", moq: "1×20'FCL", certifications: "HACCP",        ref_price: 7.1, currency: "USD/kg", lead_time_days: 20 },
    ],
  },
  {
    supplier: mk({
      name: "Demo Cashew Mill Binh Phuoc",
      trade_name: "Demo Cashew Mill",
      province: "Bình Phước",
      role: "manufacturer",
      supplier_type: "manufacturer",
      markets: "US, EU, Japan",
      products: "Cashew W180, W240, W320, LP",
      payment_terms: "30% T/T, 70% against B/L; L/C at sight",
      lead_time_days: 25,
      rating_avg: 4.5,
      rating_count: 7,
      founded_year: 2010,
      employees: 380,
      summary_i18n: { en: "[Demo] Larger processor; strong on premium whole grades for retail packs." },
      moq_text: "1×20'FCL per grade (~18 MT)",
      capacity_per_month: "260 MT/month",
      fob_updated_at: new Date().toISOString(),
      fob_publicly_visible: true,
      verification_level: 3,
      verified_at: new Date().toISOString(),
      private_label: true,
    }),
    products: [
      { name: "Cashew W180", category: "cashew", moq: "1×20'FCL", certifications: "BRCGS, IFS", ref_price: 9.3, currency: "USD/kg", lead_time_days: 25 },
      { name: "Cashew W240", category: "cashew", moq: "1×20'FCL", certifications: "BRCGS, IFS", ref_price: 8.7, currency: "USD/kg", lead_time_days: 25 },
      { name: "Cashew LP",   category: "cashew", moq: "500 kg trial", certifications: "HACCP", ref_price: 6.0, currency: "USD/kg", lead_time_days: 25 },
    ],
  },
  {
    supplier: mk({
      name: "Highlands Cashew Processing JSC",
      trade_name: "Highlands Cashew (Factory B)",
      province: "Đắk Lắk",
      role: "manufacturer",
      supplier_type: "manufacturer",
      markets: "China, ASEAN, Middle East",
      products: "Cashew W320, W450, SP",
      payment_terms: "30% deposit, 70% against B/L",
      lead_time_days: 18,
      rating_avg: 4.2,
      rating_count: 4,
      founded_year: 2017,
      employees: 140,
      summary_i18n: { en: "[Demo] Smaller Central Highlands mill focused on W320 and SP at competitive FOB." },
      moq_text: "1×20'FCL (~18 MT)",
      capacity_per_month: "80 MT/month",
      fob_updated_at: new Date().toISOString(),
      fob_publicly_visible: true,
      verification_level: 2,
      verified_at: new Date().toISOString(),
      private_label: false,
    }),
    products: [
      { name: "Cashew W320", category: "cashew", moq: "1×20'FCL", certifications: "HACCP, ISO 22000", ref_price: 7.6, currency: "USD/kg", lead_time_days: 18 },
      { name: "Cashew W450", category: "cashew", moq: "1×20'FCL", certifications: "HACCP",           ref_price: 7.0, currency: "USD/kg", lead_time_days: 18 },
      { name: "Cashew SP",   category: "cashew", moq: "1×20'FCL", certifications: "HACCP",           ref_price: 5.0, currency: "USD/kg", lead_time_days: 18 },
    ],
  },
  {
    supplier: mk({
      name: "Mekong Cashew Trading Co.",
      trade_name: "Mekong Cashew Trading",
      province: "Hồ Chí Minh",
      role: "trader",
      supplier_type: "trading",
      markets: "EU, Middle East, India",
      products: "Cashew W240, W320, WS, SP, LP – multi-origin consolidation",
      payment_terms: "L/C at sight preferred",
      lead_time_days: 14,
      rating_avg: 3.9,
      rating_count: 3,
      notes: "[DEMO] Trading company – works with multiple Bình Phước mills.",
      founded_year: 2019,
      employees: 18,
      summary_i18n: { en: "[Demo] HCMC-based trader consolidating from several audited mills; flexible MOQ and mixed containers." },
      moq_text: "1×20'FCL; mixed grades possible",
      capacity_per_month: "60 MT/month",
      fob_publicly_visible: false,
      verification_level: 2,
      verified_at: new Date().toISOString(),
      private_label: true,
    }),
    products: [
      { name: "Cashew W320",      category: "cashew", moq: "1×20'FCL", certifications: "Mill-dependent", lead_time_days: 14 },
      { name: "Cashew WS",        category: "cashew", moq: "500 kg",   certifications: "Mill-dependent", lead_time_days: 14 },
      { name: "Cashew SP/LP mix", category: "cashew", moq: "1 MT",     certifications: "Mill-dependent", lead_time_days: 14 },
    ],
  },
  {
    supplier: mk({
      name: "Dong Nai Cashew Export Ltd.",
      trade_name: "Dong Nai Cashew Export",
      province: "Đồng Nai",
      role: "manufacturer",
      supplier_type: "manufacturer",
      markets: "EU, Australia",
      products: "Cashew W320, W450, roasted & salted retail packs",
      payment_terms: "30% deposit, 70% against B/L",
      lead_time_days: 22,
      rating_count: 0,
      notes: "[DEMO] Documents only — factory visit scheduled.",
      founded_year: 2020,
      employees: 90,
      summary_i18n: { en: "[Demo] Newer processor in Đồng Nai; paperwork reviewed; on-site visit scheduled." },
      moq_text: "1×20'FCL (~18 MT)",
      capacity_per_month: "50 MT/month",
      fob_publicly_visible: false,
      verification_level: 1,
      next_reverify_at: new Date().toISOString(),
      private_label: true,
    }),
    products: [
      { name: "Cashew W320", category: "cashew", moq: "1×20'FCL", certifications: "HACCP", lead_time_days: 22 },
      { name: "Cashew W450", category: "cashew", moq: "1×20'FCL", certifications: "HACCP", lead_time_days: 22 },
    ],
  },
  {
    supplier: mk({
      name: "Southern Kernel Co.",
      trade_name: "Southern Kernel (Audit scheduled)",
      province: "Bình Phước",
      role: "manufacturer",
      supplier_type: "manufacturer",
      markets: "TBD",
      products: "Cashew W320, W450",
      lead_time_days: null,
      rating_count: 0,
      notes: "[DEMO] Under audit — no public badge yet.",
      founded_year: null,
      employees: null,
      summary_i18n: { en: "[Demo] Under audit: paperwork received; factory visit scheduled. Not showing a badge yet." },
      moq_text: null,
      capacity_per_month: null,
      fob_publicly_visible: false,
      verification_level: 0,
      private_label: false,
    }),
    products: [
      { name: "Cashew W320", category: "cashew", moq: "—", certifications: "Pending" },
    ],
  },
];
