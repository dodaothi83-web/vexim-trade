import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  Activity,
  AppUser,
  AppUserInput,
  AppUserRecord,
  AuditLogEntry,
  Buyer,
  BuyerInput,
  Category,
  Certificate,
  Introduction,
  Prospect,
  ProspectInput,
  ProspectActivity,
  ProspectActivityChannel,
  EmailAttachment,
  EmailMessage,
  MediaAsset,
  MediaInput,
  MediaOwnerType,
  Post,
  PostStatus,
  Rfq,
  RfqAttachment,
  RfqMatch,
  SupplierNoticeRead,
  Supplier,
  SupplierCategory,
  SupplierInput,
  SupplierSubmission,
  SupplierSubmissionItem,
  SupplierSubmissionLink,
  SupplierVerificationRequest,
  SupplierProduct,
  SupplierProductInput,
  TemplateOverride,
  ProspectOutreachTemplate,
  Verification,
} from "@/lib/types";
import { SEED_BUYERS, SEED_PRODUCTS, SEED_SUPPLIERS } from "@/lib/db/seed";
import { DEMO_SUPPLIERS } from "@/lib/db/demo-suppliers";
import { isTestOnlyProduct, productBelongsToCategory, productReviewApproved } from "@/lib/public/product-selection";
import {
  CASHEW_CATEGORY_CONFIG,
  DEFAULT_CATEGORY_CONFIG,
} from "./category-seed";
import type { DataStore } from "@/lib/db/types";

interface LocalShape {
  users: AppUserRecord[];
  buyers: Buyer[];
  prospects: Prospect[];
  prospect_activities: ProspectActivity[];
  suppliers: Supplier[];
  products: SupplierProduct[];
  media: MediaAsset[];
  activities: Activity[];
  messages: EmailMessage[];
  template_overrides: TemplateOverride[];
  prospect_outreach_template_overrides: ProspectOutreachTemplate[];
  posts: Post[];
  attachments: EmailAttachment[];
  // RFQ FOUNDATION
  categories: Category[];
  supplier_categories: SupplierCategory[];
  supplier_verification_requests: SupplierVerificationRequest[];
  supplier_submissions: SupplierSubmission[];
  supplier_submission_items: SupplierSubmissionItem[];
  supplier_submission_links: SupplierSubmissionLink[];
  certificates: Certificate[];
  verifications: Verification[];
  rfqs: Rfq[];
  rfq_attachments: RfqAttachment[];
  rfq_matches: RfqMatch[];
  supplier_portal_notice_reads?: SupplierNoticeRead[];
  introductions: Introduction[];
  audit_log: AuditLogEntry[];
}

const FILE = path.join(process.cwd(), "data", "local-db.json");

const g = globalThis as unknown as { __veximLocal?: LocalShape };

function nowISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString();
}

function seed(): LocalShape {
  function normalizeSupplier(s: Omit<Supplier, "id" | "created_at" | "updated_at">, idx: number): Supplier {
    const slugBase = (s.trade_name || s.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `supplier-${idx + 1}`;
    // Map role cũ -> supplier_type
    const supplier_type =
      s.role === "manufacturer"
        ? "manufacturer"
        : s.role === "trader" || s.role === "agent" || s.role === "exporter"
          ? "trading"
          : null;
    return {
      ...s,
      slug: `${slugBase}-${idx + 1}`,
      display_name: s.trade_name || s.name,
      supplier_type,
      founded_year: null,
      employees: null,
      summary_i18n: { en: s.products ?? "" },
      moq_text: null,
      capacity_per_month: null,
      ports: [],
      incoterms: [],
      export_markets: (s.markets ?? "").split(",").map((m) => m.trim()).filter(Boolean),
      private_label: false,
      verification_level: 1,
      verified_at: nowISO(60 + idx * 5),
      next_reverify_at: null,
      rating_avg: s.rating ?? null,
      rating_count: s.rating ? 3 : 0,
      fob_min: null,
      fob_max: null,
      fob_unit: null,
      fob_currency: "USD",
      fob_updated_at: null,
      fob_publicly_visible: false,
    } as unknown as Supplier;
  }

  const suppliers: Supplier[] = SEED_SUPPLIERS.map((s, i) => ({
    ...normalizeSupplier(s, i),
    id: `sup-seed-${i + 1}`,
    created_at: nowISO(60 + i * 5),
    updated_at: nowISO(60 + i * 5),
  }));

  const buyers: Buyer[] = SEED_BUYERS.map((raw, i) => {
    const { supplier_ref, ...rest } = raw;
    const supplier =
      supplier_ref === null || supplier_ref === undefined
        ? null
        : suppliers[supplier_ref] ?? null;
    return {
      ...rest,
      id: `buy-seed-${i + 1}`,
      supplier_id: supplier ? supplier.id : null,
      created_at: nowISO(45 - i * 4),
      updated_at: nowISO(Math.max(0, 12 - i * 2)),
    } satisfies Buyer;
  });

  const activities: Activity[] = buyers.flatMap((b, i) => {
    const rows: Activity[] = [
      {
        id: randomUUID(),
        buyer_id: b.id,
        type: "created",
        from_stage: null,
        to_stage: "lead",
        message: `Tạo khách hàng "${b.company}"`,
        created_by: b.owner,
        created_at: b.created_at,
      },
    ];
    if (b.stage !== "lead") {
      rows.push({
        id: randomUUID(),
        buyer_id: b.id,
        type: "stage_change",
        from_stage: "lead",
        to_stage: b.stage,
        message: `Chuyển trạng thái sang ${b.stage}`,
        created_by: b.owner,
        created_at: b.updated_at,
      });
    }
    void i;
    return rows;
  });

  function normalizeProduct(raw: typeof SEED_PRODUCTS[number], idx: number, supId: string): SupplierProduct {
    const { supplier_ref: _sr, ...rest } = raw;
    const name = (rest as Partial<SupplierProduct>).name ?? `Product ${idx + 1}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `product-${idx + 1}`;
    return {
      ...(rest as SupplierProduct),
      name,
      slug,
      name_i18n: { en: name },
      specs: {},
      images: [],
      moq_qty: null,
      moq_unit: null,
      supplier_id: supId,
      ready_for_buyer: false,
    } as SupplierProduct;
  }

  const products: SupplierProduct[] = SEED_PRODUCTS.map((raw, i) => {
    const supId = suppliers[raw.supplier_ref]?.id ?? "";
    return {
      ...normalizeProduct(raw, i, supId),
      id: `prod-seed-${i + 1}`,
      created_at: nowISO(40 - i),
      updated_at: nowISO(Math.max(0, 10 - i)),
    } satisfies SupplierProduct;
  });

  // Seed categories ở local để trang công khai render trong dev — nội dung chi tiết
  // (spec/buying facts/FAQ) được điền qua migrateCategoryDefaults() từ category-seed.ts.
  type CatSeed = { slug: string; nameEn: string; introEn: string; seoEn: string; order: number; parent?: string; content?: keyof typeof seedContentMap };
  const seedContentMap = {
    cashew: CASHEW_CATEGORY_CONFIG,
    pepper: { ...DEFAULT_CATEGORY_CONFIG, hero_image: "/images/categories/pepper.jpg", kicker: "FAQ / cleaned / ASTA", active_on_homepage: true },
    coffee: { ...DEFAULT_CATEGORY_CONFIG, hero_image: "/images/categories/coffee.jpg", kicker: "Robusta & Arabica", active_on_homepage: true },
    cinnamon: { ...DEFAULT_CATEGORY_CONFIG, hero_image: "/images/categories/cinnamon.jpg", kicker: "Sticks, split, powder", active_on_homepage: true },
    coconut: { ...DEFAULT_CATEGORY_CONFIG, hero_image: "/images/categories/coconut.jpg", kicker: "Desiccated, milk, oil", active_on_homepage: true },
    rice: { ...DEFAULT_CATEGORY_CONFIG, hero_image: "/images/categories/rice.jpg", kicker: "Jasmine, ST25, Japonica", active_on_homepage: true },
  } as const;
  const catSeeds: CatSeed[] = [
    { slug: "nuts-kernels", nameEn: "Nuts & kernels", introEn: "Vietnamese cashew kernels, macadamia and processed nuts from audited factories.", seoEn: "Verified Vietnamese nut & kernel suppliers by grade, MOQ and certification.", order: 10 },
    { slug: "cashew", nameEn: "Cashew kernels", introEn: CASHEW_CATEGORY_CONFIG.intro!, seoEn: CASHEW_CATEGORY_CONFIG.seo_desc!, order: 11, parent: "nuts-kernels", content: "cashew" },
    { slug: "macadamia", nameEn: "Macadamia", introEn: "Vietnamese macadamia kernels and in-shell from Tây Nguyên plantations.", seoEn: "Vietnamese macadamia suppliers – graded kernels & in-shell.", order: 12, parent: "nuts-kernels" },
    { slug: "coffee", nameEn: "Coffee", introEn: "Robusta and Arabica green coffee from Central Highlands; washed, natural and honey-processed lots.", seoEn: "Vietnamese Robusta/Arabica green coffee exporters.", order: 20, content: "coffee" },
    { slug: "pepper-spices", nameEn: "Pepper & spices", introEn: "Vietnamese black/white/red pepper, cinnamon, star anise, ginger and turmeric – steam-sterilised.", seoEn: "Vietnamese pepper & spice suppliers with food-safety certs.", order: 30 },
    { slug: "pepper", nameEn: "Pepper", introEn: "Vietnamese black pepper (FAQ/cleaned/ASTA), white pepper and red pepper.", seoEn: "Vietnamese black/white/red pepper exporters.", order: 31, parent: "pepper-spices", content: "pepper" },
    { slug: "cinnamon", nameEn: "Cassia cinnamon", introEn: "Vietnamese cassia cinnamon (Yên Bái) in sticks, split, broken and powder.", seoEn: "Vietnamese cassia cinnamon suppliers.", order: 32, parent: "pepper-spices", content: "cinnamon" },
    { slug: "star-anise", nameEn: "Star anise", introEn: "Vietnamese autumn and spring star anise from Lạng Sơn.", seoEn: "Vietnamese star anise exporters.", order: 33, parent: "pepper-spices" },
    { slug: "coconut", nameEn: "Coconut products", introEn: "Desiccated coconut, coconut milk/cream powder, VCO and coconut water from Bến Tre.", seoEn: "Vietnamese coconut product exporters.", order: 40, content: "coconut" },
    { slug: "rice", nameEn: "Rice", introEn: "Vietnamese Jasmine, ST25, Japonica and glutinous rice from Đồng bằng Sông Cửu Long.", seoEn: "Vietnamese rice exporters – Jasmine, ST25, Japonica.", order: 50, content: "rice" },
    { slug: "noodles", nameEn: "Noodles & vermicelli", introEn: "Rice noodles, instant noodles, rice paper and rice vermicelli.", seoEn: "Vietnamese noodle and rice-paper suppliers.", order: 60 },
    { slug: "fruit-veg", nameEn: "Fruit & vegetables", introEn: "Fresh/frozen tropical fruit and frozen vegetables.", seoEn: "Vietnamese tropical fruit & vegetable exporters.", order: 70 },
    { slug: "dragon-fruit", nameEn: "Dragon fruit", introEn: "Vietnamese white- and red-flesh dragon fruit from Bình Thuận.", seoEn: "Vietnamese dragon fruit exporters.", order: 71, parent: "fruit-veg" },
    { slug: "dried-fruit", nameEn: "Dried fruit", introEn: "Dried mango, jackfruit, banana, coconut chips and tropical fruit snacks.", seoEn: "Vietnamese dried fruit suppliers.", order: 72, parent: "fruit-veg" },
    { slug: "seafood", nameEn: "Seafood", introEn: "Pangasius, black tiger shrimp, Vannamei shrimp and squid from ASC/MSC/BAP-certified processors.", seoEn: "Vietnamese seafood exporters with ASC/BAP/BRC certs.", order: 80 },
    { slug: "pangasius", nameEn: "Pangasius", introEn: "Frozen pangasius fillets and value-added items.", seoEn: "Vietnamese pangasius exporters.", order: 81, parent: "seafood" },
    { slug: "shrimp", nameEn: "Shrimp", introEn: "Black tiger and Vannamei shrimp from certified Mekong processors.", seoEn: "Vietnamese shrimp exporters.", order: 82, parent: "seafood" },
    { slug: "honey", nameEn: "Honey", introEn: "Vietnamese multi-flower, coffee and lychee honey, export-ready.", seoEn: "Vietnamese honey exporters.", order: 90 },
    { slug: "tea", nameEn: "Tea", introEn: "Vietnamese black, green, oolong and lotus teas.", seoEn: "Vietnamese tea exporters.", order: 95 },
    { slug: "processed-foods", nameEn: "Processed & convenience foods", introEn: "Spring rolls, sauces, canned fruit and Asian ready meals.", seoEn: "Vietnamese processed food suppliers for private label.", order: 100 },
  ];
  const catId = (slug: string) => `cat-seed-${slug}`;
  const now = nowISO(100);
  const categories: Category[] = catSeeds.map((c) => {
    const content = c.content ? seedContentMap[c.content] : DEFAULT_CATEGORY_CONFIG;
    return {
      id: catId(c.slug),
      slug: c.slug,
      parent_id: c.parent ? catId(c.parent) : null,
      name_i18n: { en: c.nameEn },
      intro_i18n: { en: c.introEn },
      h1_i18n: content.h1 ? { en: content.h1 } : null,
      body_i18n: content.body ? { en: content.body } : null,
      faq_i18n: content.faqs ?? [],
      seo_title_i18n: { en: content.seo_title ?? `${c.nameEn} Suppliers in Vietnam – Verified | Vexim Trade` },
      seo_desc_i18n: { en: content.seo_desc ?? c.seoEn },
      hero_image: content.hero_image ?? null,
      hero_alt_i18n: content.hero_alt ? { en: content.hero_alt } : null,
      homepage_kicker_i18n: content.kicker ? { en: content.kicker } : null,
      spec_columns: content.spec_columns ?? [],
      spec_rows: content.spec_rows ?? [],
      buying_facts: content.buying_facts ?? [],
      filters: content.filters ?? [],
      active_on_homepage: content.active_on_homepage ?? false,
      public_page_ready: content.public_page_ready ?? false,
      seo_indexable: content.seo_indexable ?? false,
      status: "published",
      previous_slugs: [],
      created_by: null,
      updated_by: null,
      is_published: true,
      sort_order: c.order,
      created_at: now,
      updated_at: now,
    } as Category;
  });

  return {
    users: [],
    buyers,
    prospects: [],
    prospect_activities: [],
    suppliers,
    products,
    media: [],
    activities,
    messages: [],
    attachments: [],
    template_overrides: [],
    prospect_outreach_template_overrides: [],
    posts: [],
    categories,
    supplier_categories: [],
    supplier_verification_requests: [],
    supplier_submissions: [],
    supplier_submission_items: [],
    supplier_submission_links: [],
    certificates: [],
    verifications: [],
    rfqs: [],
    rfq_attachments: [],
    rfq_matches: [],
    introductions: [],
    audit_log: [],
  };
}

function inferTargetProduct(sourceList: string | null | undefined): string | null {
  const value = (sourceList ?? "").toLocaleLowerCase("vi");
  return /m[iìỳ] ăn liền/.test(value) ? "Mì ăn liền" : null;
}

function normalizeProspects(prospects: Prospect[]) {
  for (const prospect of prospects) {
    if (!prospect.data_source) prospect.data_source = "Apollo";
    if (prospect.target_product === undefined) {
      prospect.target_product = inferTargetProduct(prospect.source_list);
    }
    if (prospect.ai_company_summary === undefined) prospect.ai_company_summary = null;
    if (!Array.isArray(prospect.ai_company_sources)) prospect.ai_company_sources = [];
    if (prospect.ai_company_analyzed_at === undefined) prospect.ai_company_analyzed_at = null;
    if (prospect.ai_products === undefined || (prospect.ai_products && !Array.isArray(prospect.ai_products.products))) {
      prospect.ai_products = null;
    }
  }
}

/**
 * Nếu categories hiện tại chỉ là bản seed cũ (chỉ có cashew), bổ sung đầy đủ
 * các danh mục đa ngành thực phẩm VN. Không ghi đè category do người dùng tự thêm.
 */
function ensureSeedCategories(db: LocalShape) {
  if (!Array.isArray(db.categories)) db.categories = [];

  // Master seed — THỂ HIỆN DANH MỤC GỐC. Thêm dòng ở đây để tạo category mới khi DB trống;
  // sau khi tạo rồi, admin quản lý trong /crm/categories.
  type CatSeed = {
    slug: string; nameEn: string; introEn: string; seoEn: string; order: number; parent?: string;
    content?: keyof typeof CONTENT_MAP;
  };
  const withDefaults = (overrides: Partial<typeof CASHEW_CATEGORY_CONFIG>): typeof CASHEW_CATEGORY_CONFIG => ({
    ...DEFAULT_CATEGORY_CONFIG,
    hero_image: null, kicker: null, active_on_homepage: false, public_page_ready: false, seo_indexable: false,
    spec_columns: [], spec_rows: [], buying_facts: [], faqs: [], filters: [],
    body: null, h1: null, seo_title: null, seo_desc: null, hero_alt: null,
    ...overrides,
  });
  const CONTENT_MAP: Record<string, typeof CASHEW_CATEGORY_CONFIG> = {
    cashew: CASHEW_CATEGORY_CONFIG,
    pepper: withDefaults({ hero_image: "/images/categories/pepper.jpg", kicker: "FAQ / cleaned / ASTA", active_on_homepage: true }),
    coffee: withDefaults({ hero_image: "/images/categories/coffee.jpg", kicker: "Robusta & Arabica", active_on_homepage: true }),
    cinnamon: withDefaults({ hero_image: "/images/categories/cinnamon.jpg", kicker: "Sticks, split, powder", active_on_homepage: true }),
    coconut: withDefaults({ hero_image: "/images/categories/coconut.jpg", kicker: "Desiccated, milk, oil", active_on_homepage: true }),
    rice: withDefaults({ hero_image: "/images/categories/rice.jpg", kicker: "Jasmine, ST25, Japonica", active_on_homepage: true }),
  };

  const seeds: CatSeed[] = [
    { slug: "nuts-kernels", nameEn: "Nuts & kernels", introEn: "Vietnamese cashew kernels, macadamia and processed nuts from audited factories.", seoEn: "Verified Vietnamese nut & kernel suppliers by grade, MOQ and certification.", order: 10 },
    { slug: "cashew", nameEn: "Cashew kernels", introEn: CASHEW_CATEGORY_CONFIG.intro!, seoEn: CASHEW_CATEGORY_CONFIG.seo_desc!, order: 11, parent: "nuts-kernels", content: "cashew" },
    { slug: "macadamia", nameEn: "Macadamia", introEn: "Vietnamese macadamia kernels and in-shell from Tây Nguyên plantations.", seoEn: "Vietnamese macadamia suppliers – graded kernels & in-shell.", order: 12, parent: "nuts-kernels" },
    { slug: "coffee", nameEn: "Coffee", introEn: "Robusta and Arabica green coffee from Central Highlands; washed, natural and honey-processed lots.", seoEn: "Vietnamese Robusta/Arabica green coffee exporters.", order: 20, content: "coffee" },
    { slug: "pepper-spices", nameEn: "Pepper & spices", introEn: "Vietnamese black/white/red pepper, cinnamon, star anise, ginger and turmeric – steam-sterilised.", seoEn: "Vietnamese pepper & spice suppliers with food-safety certs.", order: 30 },
    { slug: "pepper", nameEn: "Pepper", introEn: "Vietnamese black pepper (FAQ/cleaned/ASTA), white pepper and red pepper.", seoEn: "Vietnamese black/white/red pepper exporters.", order: 31, parent: "pepper-spices", content: "pepper" },
    { slug: "cinnamon", nameEn: "Cassia cinnamon", introEn: "Vietnamese cassia cinnamon (Yên Bái) in sticks, split, broken and powder.", seoEn: "Vietnamese cassia cinnamon suppliers.", order: 32, parent: "pepper-spices", content: "cinnamon" },
    { slug: "star-anise", nameEn: "Star anise", introEn: "Vietnamese autumn and spring star anise from Lạng Sơn.", seoEn: "Vietnamese star anise exporters.", order: 33, parent: "pepper-spices" },
    { slug: "coconut", nameEn: "Coconut products", introEn: "Desiccated coconut, coconut milk/cream powder, VCO and coconut water from Bến Tre.", seoEn: "Vietnamese coconut product exporters.", order: 40, content: "coconut" },
    { slug: "rice", nameEn: "Rice", introEn: "Vietnamese Jasmine, ST25, Japonica and glutinous rice from Đồng bằng Sông Cửu Long.", seoEn: "Vietnamese rice exporters – Jasmine, ST25, Japonica.", order: 50, content: "rice" },
    { slug: "noodles", nameEn: "Noodles & vermicelli", introEn: "Rice noodles, instant noodles, rice paper and rice vermicelli.", seoEn: "Vietnamese noodle and rice-paper suppliers.", order: 60 },
    { slug: "fruit-veg", nameEn: "Fruit & vegetables", introEn: "Fresh/frozen tropical fruit and frozen vegetables.", seoEn: "Vietnamese tropical fruit & vegetable exporters.", order: 70 },
    { slug: "dragon-fruit", nameEn: "Dragon fruit", introEn: "Vietnamese white- and red-flesh dragon fruit from Bình Thuận.", seoEn: "Vietnamese dragon fruit exporters.", order: 71, parent: "fruit-veg" },
    { slug: "dried-fruit", nameEn: "Dried fruit", introEn: "Dried mango, jackfruit, banana, coconut chips and tropical fruit snacks.", seoEn: "Vietnamese dried fruit suppliers.", order: 72, parent: "fruit-veg" },
    { slug: "seafood", nameEn: "Seafood", introEn: "Pangasius, black tiger shrimp, Vannamei shrimp and squid from ASC/MSC/BAP-certified processors.", seoEn: "Vietnamese seafood exporters with ASC/BAP/BRC certs.", order: 80 },
    { slug: "pangasius", nameEn: "Pangasius", introEn: "Frozen pangasius fillets and value-added items.", seoEn: "Vietnamese pangasius exporters.", order: 81, parent: "seafood" },
    { slug: "shrimp", nameEn: "Shrimp", introEn: "Black tiger and Vannamei shrimp from certified Mekong processors.", seoEn: "Vietnamese shrimp exporters.", order: 82, parent: "seafood" },
    { slug: "honey", nameEn: "Honey", introEn: "Vietnamese multi-flower, coffee and lychee honey, export-ready.", seoEn: "Vietnamese honey exporters.", order: 90 },
    { slug: "tea", nameEn: "Tea", introEn: "Vietnamese black, green, oolong and lotus teas.", seoEn: "Vietnamese tea exporters.", order: 95 },
    { slug: "processed-foods", nameEn: "Processed & convenience foods", introEn: "Spring rolls, sauces, canned fruit and Asian ready meals.", seoEn: "Vietnamese processed food suppliers for private label.", order: 100 },
  ];
  const now = new Date().toISOString();
  const have = new Set(db.categories.map((c) => c.slug));
  for (const c of seeds) {
    if (have.has(c.slug)) continue;
    const content = c.content ? CONTENT_MAP[c.content] : DEFAULT_CATEGORY_CONFIG;
    db.categories.push({
      id: `cat-seed-${c.slug}`,
      slug: c.slug,
      parent_id: c.parent ? `cat-seed-${c.parent}` : null,
      name_i18n: { en: c.nameEn },
      intro_i18n: { en: c.introEn },
      h1_i18n: content.h1 ? { en: content.h1 } : null,
      body_i18n: content.body ? { en: content.body } : null,
      faq_i18n: content.faqs ?? [],
      seo_title_i18n: { en: content.seo_title ?? `${c.nameEn} Suppliers in Vietnam – Verified | Vexim Trade` },
      seo_desc_i18n: { en: content.seo_desc ?? c.seoEn },
      hero_image: content.hero_image ?? null,
      hero_alt_i18n: content.hero_alt ? { en: content.hero_alt } : null,
      homepage_kicker_i18n: content.kicker ? { en: content.kicker } : null,
      spec_columns: content.spec_columns ?? [],
      spec_rows: content.spec_rows ?? [],
      buying_facts: content.buying_facts ?? [],
      filters: content.filters ?? [],
      active_on_homepage: content.active_on_homepage ?? false,
      public_page_ready: content.public_page_ready ?? false,
      seo_indexable: content.seo_indexable ?? false,
      status: "published",
      previous_slugs: [],
      created_by: null,
      updated_by: null,
      is_published: true,
      sort_order: c.order,
      created_at: now,
      updated_at: now,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }
}

/**
 * Điền giá trị mặc định cho các field mới (hero_image, filters, buying_facts, …)
 * cho category đã tồn tại sẵn trong DB người dùng — chỉ điền khi field đang
 * null/undefined, KHÔNG ghi đè cấu hình thủ công.
 */
function migrateCategoryDefaults(db: LocalShape) {
  if (!Array.isArray(db.categories)) return;
  const defaults: Record<string, Partial<import("@/lib/types").Category>> = {
    cashew: {
      h1_i18n: { en: CASHEW_CATEGORY_CONFIG.h1! },
      body_i18n: { en: CASHEW_CATEGORY_CONFIG.body! },
      hero_image: CASHEW_CATEGORY_CONFIG.hero_image!,
      hero_alt_i18n: { en: CASHEW_CATEGORY_CONFIG.hero_alt! },
      homepage_kicker_i18n: { en: CASHEW_CATEGORY_CONFIG.kicker! },
      spec_columns: CASHEW_CATEGORY_CONFIG.spec_columns,
      spec_rows: CASHEW_CATEGORY_CONFIG.spec_rows,
      buying_facts: CASHEW_CATEGORY_CONFIG.buying_facts,
      faq_i18n: CASHEW_CATEGORY_CONFIG.faqs,
      filters: CASHEW_CATEGORY_CONFIG.filters,
      active_on_homepage: true,
      public_page_ready: true,
      seo_indexable: false,
      status: "published",
    },
    pepper:   { hero_image: "/images/categories/pepper.jpg",   homepage_kicker_i18n: { en: "FAQ / cleaned / ASTA" },          active_on_homepage: true },
    coffee:   { hero_image: "/images/categories/coffee.jpg",   homepage_kicker_i18n: { en: "Robusta & Arabica" },              active_on_homepage: true },
    cinnamon: { hero_image: "/images/categories/cinnamon.jpg", homepage_kicker_i18n: { en: "Sticks, split, powder" },          active_on_homepage: true },
    coconut:  { hero_image: "/images/categories/coconut.jpg",  homepage_kicker_i18n: { en: "Desiccated, milk, oil" },          active_on_homepage: true },
    rice:     { hero_image: "/images/categories/rice.jpg",     homepage_kicker_i18n: { en: "Jasmine, ST25, Japonica" },        active_on_homepage: true },
  };
  for (const c of db.categories) {
    // Map is_published -> status cho DB cũ
    if (!c.status) c.status = c.is_published ? "published" : "draft";
    if (c.faq_i18n === undefined || c.faq_i18n === null) c.faq_i18n = [];
    if (!Array.isArray(c.previous_slugs)) c.previous_slugs = [];
    if (c.active_on_homepage === undefined) c.active_on_homepage = false;
    if (c.public_page_ready === undefined) c.public_page_ready = false;
    if (c.seo_indexable === undefined) c.seo_indexable = false;
    if (!c.spec_columns) c.spec_columns = [];
    if (!c.spec_rows) c.spec_rows = [];
    if (!c.buying_facts) c.buying_facts = [];
    if (!c.filters) c.filters = [];
    if (c.created_by === undefined) c.created_by = null;
    if (c.updated_by === undefined) c.updated_by = null;
    if (c.h1_i18n === undefined) c.h1_i18n = null;
    if (c.body_i18n === undefined) c.body_i18n = null;
    if (c.hero_alt_i18n === undefined) c.hero_alt_i18n = null;
    const d = defaults[c.slug];
    if (d) {
      for (const [k, v] of Object.entries(d)) {
        const key = k as string;
        const cur = (c as unknown as Record<string, unknown>)[key];
        if (cur === undefined || cur === null || (Array.isArray(cur) && cur.length === 0)) {
          (c as unknown as Record<string, unknown>)[key] = v as unknown;
        }
      }
    }
    // Đồng bộ hoá: is_published = (status === "published")
    c.is_published = c.status === "published";
  }
  // public_page_ready LÀ TRƯỜNG COMPUTED, được tính trong listCategories/getCategory/getCategoryBySlug
  // (không ghi vào cache/disk, tránh làm bẩn dữ liệu đã persist).
  // Đặt mặc định false cho record mới tạo; getter sẽ decorate lại khi trả cho caller.
  const allProducts = db.products ?? [];
  const allSuppliers = db.suppliers ?? [];
  const publicSupplierIds = new Set(
    allSuppliers.filter((s) => s.status === "published" && (!s.is_demo || process.env.VEXIM_SHOW_DEMO === "true")).map((s) => s.id),
  );
  const demoIds = new Set(allSuppliers.filter((s) => s.is_demo && process.env.VEXIM_SHOW_DEMO === "true").map((s) => s.id));
  const eligible = allProducts.filter((p) => publicSupplierIds.has(p.supplier_id) && productReviewApproved(p) && !isTestOnlyProduct(p.name) &&
    (p.ready_for_buyer || demoIds.has(p.supplier_id)));
  const ready = new Set((db.categories ?? []).filter((c) => eligible.some((p) =>
    productBelongsToCategory(p, c, db.categories ?? []))).map((c) => c.slug.toLowerCase()));
  (db as unknown as { __catReady?: Set<string> }).__catReady = ready;
}

/** Di chuyển trạng thái cũ → mới; backfill lost_reason; ép buộc lost có lý do chỉ ở tầng server action. */
function migrateRfqDefaults(db: LocalShape) {
  if (!Array.isArray(db.rfqs)) return;
  for (const r of db.rfqs) {
    if (r.lost_reason === undefined) r.lost_reason = null;
    // Map status cũ → mới.
    const s = r.status as string | undefined;
    if (s === "qualified") r.status = "in_progress";
    else if (s === "quoting") r.status = "quoted";
    else if (s === "closed") r.status = "lost";
  }
}

function migrateMediaDefaults(db: LocalShape) {
  if (!Array.isArray(db.media)) return;
  for (const m of db.media) {
    if ((m as unknown as { verification_id?: string | null }).verification_id === undefined) {
      (m as unknown as { verification_id: string | null }).verification_id = null;
    }
    if (m.checklist_key === undefined) m.checklist_key = null;
  }
}

function migrateSupplierDefaults(db: LocalShape) {
  if (!Array.isArray(db.suppliers)) return;
  for (const s of db.suppliers) {
    if (s.profile_image === undefined) s.profile_image = null;
    if (s.cover_image === undefined) s.cover_image = null;
    if (s.verification_level === undefined) s.verification_level = 0;
  }
}

function migrateMessageDefaults(db: LocalShape) {
  if (!Array.isArray(db.messages)) return;
  for (const m of db.messages) {
    if ((m as unknown as { rfq_id?: string | null }).rfq_id === undefined) {
      (m as unknown as { rfq_id: string | null }).rfq_id = null;
    }
    if ((m as unknown as { rfq_match_id?: string | null }).rfq_match_id === undefined) {
      (m as unknown as { rfq_match_id: string | null }).rfq_match_id = null;
    }
  }
}


/**
 * Backfill các field mới cho Verification (L1/L2 checklist, GPS, visit_address,
 * checklist_notes, return_reason) cho dữ liệu cũ, đồng thời tính lại
 * verification_level cho từng Supplier dựa trên Verification đã approved.
 */
function migrateVerifications(db: LocalShape) {
  if (!Array.isArray(db.verifications)) db.verifications = [];
  for (const v of db.verifications) {
    if (v.visit_lat === undefined) v.visit_lat = null;
    if (v.visit_lng === undefined) v.visit_lng = null;
    if (v.visit_address === undefined) v.visit_address = null;
    if (v.shipment_ref === undefined) v.shipment_ref = null;
    if (v.shipped_on === undefined) v.shipped_on = null;
    if (v.shipment_destination === undefined) v.shipment_destination = null;
    // checklist cũ là mảng -> chuyển sang object rỗng
    if (Array.isArray(v.checklist)) v.checklist = {};
    if (typeof v.checklist !== "object" || v.checklist === null) v.checklist = {};
    if (typeof v.checklist_notes !== "object" || v.checklist_notes === null) v.checklist_notes = {};
    if (v.tax_number === undefined) v.tax_number = null;
    if (v.bank_account_number === undefined) v.bank_account_number = null;
    if (v.return_reason === undefined) v.return_reason = null;
    if (!v.public_summary_i18n || typeof v.public_summary_i18n !== "object") v.public_summary_i18n = {};
    if (v.public_summary_published_at === undefined) v.public_summary_published_at = null;
    if (v.public_summary_published_by === undefined) v.public_summary_published_by = null;
  }

  // Tính verification_level cho NCC từ danh sách verification đã approved (chỉ áp dụng
  // cho NCC có hồ sơ verification trong bảng — không reset các level hard-coded từ seed demo
  // hay cấu hình thủ công).
  const hasVerification = new Set((db.verifications ?? []).map((v) => v.supplier_id));
  const levelBySupplier = new Map<string, number>();
  for (const v of db.verifications) {
    if (v.status !== "approved") continue;
    const cur = levelBySupplier.get(v.supplier_id) ?? 0;
    if ((v.target_level as number) > cur) levelBySupplier.set(v.supplier_id, v.target_level as number);
  }
  if (Array.isArray(db.suppliers)) {
    for (const s of db.suppliers) {
      if (!hasVerification.has(s.id)) {
        if (s.verification_level === undefined) s.verification_level = 0;
        continue;
      }
      const lvl = levelBySupplier.get(s.id) ?? 0;
      s.verification_level = lvl;
      if (lvl > 0 && !s.verified_at) s.verified_at = new Date().toISOString();
    }
  }
}

/** Hồ sơ NCC tự gửi L2/L3: đảm bảo shape cũ/thiếu cột vẫn đọc được. */
function migrateSubmissions(db: LocalShape) {
  if (!Array.isArray(db.supplier_submissions)) db.supplier_submissions = [];
  if (!Array.isArray(db.supplier_submission_items)) db.supplier_submission_items = [];
  if (!Array.isArray(db.supplier_submission_links)) db.supplier_submission_links = [];
  for (const s of db.supplier_submissions) {
    if (!Array.isArray(s.flags)) s.flags = [];
    if (s.ai_review === undefined) s.ai_review = null;
    if (s.verification_id === undefined) s.verification_id = null;
    if (s.device_lat === undefined) s.device_lat = null;
    if (s.device_lng === undefined) s.device_lng = null;
    if (s.device_accuracy_m === undefined) s.device_accuracy_m = null;
    if (s.device_captured_at === undefined) s.device_captured_at = null;
    if (s.review_note === undefined) s.review_note = null;
    if (s.shipment_ref === undefined) s.shipment_ref = null;
    if (s.shipped_on === undefined) s.shipped_on = null;
    if (s.shipment_destination === undefined) s.shipment_destination = null;
    if (s.supplier_note === undefined) s.supplier_note = null;
  }
  for (const i of db.supplier_submission_items) {
    if (!Array.isArray(i.flags)) i.flags = [];
    if (i.has_exif === undefined) i.has_exif = false;
    if (i.ai_verdict === undefined) i.ai_verdict = null;
  }
}

function removeProspectsWithoutEmail(db: LocalShape) {
  const removedIds = new Set(db.prospects.filter((prospect) => !prospect.email?.trim()).map((prospect) => prospect.id));
  if (!removedIds.size) return;
  db.prospects = db.prospects.filter((prospect) => !removedIds.has(prospect.id));
  db.prospect_activities = db.prospect_activities.filter((activity) => !removedIds.has(activity.prospect_id));
  db.messages = db.messages.map((message) =>
    message.prospect_id && removedIds.has(message.prospect_id)
      ? { ...message, prospect_id: null }
      : message,
  );
}

/**
 * Upsert demo suppliers (is_demo=true) vào local DB khi VEXIM_SHOW_DEMO=true.
 * Tạo id dạng sup-demo-01…, sản phẩm dạng prod-demo-xx. Không đụng tới dữ liệu thật.
 */
function ensureDemoSuppliers(db: LocalShape) {
  if (process.env.VEXIM_SHOW_DEMO !== "true") {
    // Xoá các demo cũ còn sót nếu env bị tắt, để không bao giờ lọt ra public.
    const demoIds = new Set(db.suppliers.filter((s) => s.is_demo).map((s) => s.id));
    if (!demoIds.size) return;
    db.suppliers = db.suppliers.filter((s) => !s.is_demo);
    db.products = db.products.filter((p) => !demoIds.has(p.supplier_id));
    return;
  }
  if (!Array.isArray(db.products)) db.products = [];

  const haveBySlug = new Map(
    db.suppliers.filter((s) => s.is_demo).map((s) => [s.slug, s] as const),
  );
  const now = new Date().toISOString();
  let prodCounter = db.products.length + 1;

  function normalizeDemoSupplier(raw: (typeof DEMO_SUPPLIERS)[number]["supplier"], idx: number): Supplier {
    const slugBase = (raw.trade_name || raw.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `demo-supplier-${idx + 1}`;
    const slug = `${slugBase}-demo-${idx + 1}`;
    const supplier_type =
      raw.role === "manufacturer"
        ? "manufacturer"
        : raw.role === "trader" || raw.role === "agent" || raw.role === "exporter"
          ? "trading"
          : null;
    return {
      ...raw,
      id: `sup-demo-${idx + 1}`,
      slug,
      display_name: raw.trade_name || raw.name,
      supplier_type,
      summary_i18n: raw.summary_i18n ?? { en: raw.products ?? "" },
      created_at: now,
      updated_at: now,
    } as Supplier;
  }

  function normalizeDemoProduct(raw: DemoProductSeedLike, supId: string, idx: number) {
    const name = raw.name ?? `Product ${idx + 1}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `product-${idx + 1}`;
    return {
      id: `prod-demo-${prodCounter++}`,
      supplier_id: supId,
      name,
      slug,
      name_i18n: { en: name },
      category: raw.category ?? null,
      description: null,
      spec: null,
      specs: {},
      unit: null,
      moq: raw.moq ?? null,
      moq_qty: null,
      moq_unit: null,
      monthly_capacity: null,
      lead_time_days: raw.lead_time_days ?? null,
      packaging: null,
      oem: false,
      certifications: raw.certifications ?? null,
      export_port: "Cat Lai (HCMC)",
      ref_price: raw.ref_price ?? null,
      ref_price_max: null,
      currency: raw.currency ?? null,
      price_valid_until: null,
      incoterm: null,
      incoterm_place: null,
      payment_terms: null,
      samples: true,
      ready_for_buyer: false,
      images: [],
      is_published: true,
      created_at: now,
      updated_at: now,
    };
  }

  type DemoProductSeedLike = {
    name: string;
    category: string;
    moq?: string | null;
    certifications?: string | null;
    ref_price?: number | null;
    currency?: string | null;
    lead_time_days?: number | null;
  };

  DEMO_SUPPLIERS.forEach((demo, idx) => {
    const normalized = normalizeDemoSupplier(demo.supplier, idx);
    const existing = haveBySlug.get(normalized.slug);
    if (existing) {
      // Giữ id cũ, cập nhật fields.
      Object.assign(existing, normalized, { id: existing.id });
    } else {
      db.suppliers.push(normalized);
    }
    const supId = existing?.id ?? normalized.id;
    // Xoá các sản phẩm demo cũ của supplier này rồi thêm lại (đơn giản hoá).
    db.products = db.products.filter((p) => !(p.supplier_id === supId && p.id.startsWith("prod-demo-")));
    demo.products.forEach((p, pi) => {
      db.products.push(normalizeDemoProduct(p, supId, pi));
    });
  });
}

function load(): LocalShape {
  if (g.__veximLocal) {
    const c = g.__veximLocal;
    if (!Array.isArray(c.messages)) c.messages = [];
    if (!Array.isArray(c.prospects)) c.prospects = [];
    normalizeProspects(c.prospects);
    if (!Array.isArray(c.prospect_activities)) c.prospect_activities = [];
    if (!Array.isArray(c.prospect_outreach_template_overrides)) c.prospect_outreach_template_overrides = [];
    if (!Array.isArray(c.posts)) c.posts = [];
    if (!Array.isArray(c.activities)) c.activities = [];
    if (!Array.isArray(c.products)) c.products = [];
    if (!Array.isArray(c.media)) c.media = [];
    if (!Array.isArray(c.users)) c.users = [];
    c.users.forEach((u) => {
      if (u.signature_html === undefined) u.signature_html = null;
      if (u.phone === undefined) u.phone = null;
      if (u.sender_email === undefined) u.sender_email = null;
      if (u.supplier_id === undefined) u.supplier_id = null;
    });
    if (!Array.isArray(c.attachments)) c.attachments = [];
    // RFQ foundation – tương thích với file dữ liệu cũ
    if (!Array.isArray(c.categories)) c.categories = [];
    if (!Array.isArray(c.supplier_categories)) c.supplier_categories = [];
    if (!Array.isArray(c.supplier_verification_requests)) c.supplier_verification_requests = [];
    if (!Array.isArray(c.certificates)) c.certificates = [];
    if (!Array.isArray(c.verifications)) c.verifications = [];
    if (!Array.isArray(c.supplier_submissions)) c.supplier_submissions = [];
    if (!Array.isArray(c.supplier_submission_items)) c.supplier_submission_items = [];
    if (!Array.isArray(c.supplier_submission_links)) c.supplier_submission_links = [];
    if (!Array.isArray(c.rfqs)) c.rfqs = [];
    if (!Array.isArray(c.rfq_attachments)) c.rfq_attachments = [];
    if (!Array.isArray(c.rfq_matches)) c.rfq_matches = [];
    if (!Array.isArray(c.introductions)) c.introductions = [];
    if (!Array.isArray(c.audit_log)) c.audit_log = [];
    ensureSeedCategories(c);
    migrateCategoryDefaults(c);
    migrateRfqDefaults(c);
    migrateMediaDefaults(c);
    migrateSupplierDefaults(c);
    migrateMessageDefaults(c);
    ensureDemoSuppliers(c);
    migrateVerifications(c);
    migrateSubmissions(c);
    removeProspectsWithoutEmail(c);
    return c;
  }
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as LocalShape;
      if (Array.isArray(parsed.buyers) && Array.isArray(parsed.suppliers)) {
        // tương thích ngược với file dữ liệu cũ
        if (!Array.isArray(parsed.messages)) {
          const legacy = parsed as unknown as { emails?: unknown[] };
          parsed.messages = Array.isArray(legacy.emails) ? [] : [];
          delete legacy.emails;
        }
        if (!Array.isArray(parsed.prospects)) parsed.prospects = [];
        normalizeProspects(parsed.prospects);
        if (!Array.isArray(parsed.prospect_activities)) parsed.prospect_activities = [];
        if (!Array.isArray(parsed.prospect_outreach_template_overrides)) parsed.prospect_outreach_template_overrides = [];
        if (!Array.isArray(parsed.posts)) parsed.posts = [];
        if (!Array.isArray(parsed.activities)) parsed.activities = [];
        if (!Array.isArray(parsed.products)) parsed.products = [];
        if (!Array.isArray(parsed.media)) parsed.media = [];
        if (!Array.isArray(parsed.users)) parsed.users = [];
        parsed.users.forEach((u) => { if (u.supplier_id === undefined) u.supplier_id = null; });
        if (!Array.isArray(parsed.attachments)) parsed.attachments = [];
        if (!Array.isArray(parsed.categories)) parsed.categories = [];
        if (!Array.isArray(parsed.supplier_categories)) parsed.supplier_categories = [];
        if (!Array.isArray(parsed.supplier_verification_requests)) parsed.supplier_verification_requests = [];
        if (!Array.isArray(parsed.certificates)) parsed.certificates = [];
        if (!Array.isArray(parsed.verifications)) parsed.verifications = [];
        if (!Array.isArray(parsed.supplier_submissions)) parsed.supplier_submissions = [];
        if (!Array.isArray(parsed.supplier_submission_items)) parsed.supplier_submission_items = [];
        if (!Array.isArray(parsed.supplier_submission_links)) parsed.supplier_submission_links = [];
        if (!Array.isArray(parsed.rfqs)) parsed.rfqs = [];
        if (!Array.isArray(parsed.rfq_attachments)) parsed.rfq_attachments = [];
        if (!Array.isArray(parsed.rfq_matches)) parsed.rfq_matches = [];
        if (!Array.isArray(parsed.introductions)) parsed.introductions = [];
        if (!Array.isArray(parsed.audit_log)) parsed.audit_log = [];
        ensureSeedCategories(parsed);
        migrateCategoryDefaults(parsed);
        migrateRfqDefaults(parsed);
        migrateMediaDefaults(parsed);
        migrateSupplierDefaults(parsed);
        migrateMessageDefaults(parsed);
        ensureDemoSuppliers(parsed);
        migrateVerifications(parsed);
        migrateSubmissions(parsed);
        removeProspectsWithoutEmail(parsed);
        g.__veximLocal = parsed;
        return parsed;
      }
    }
  } catch {
    // file hỏng thì seed lại
  }
  const fresh = seed();
  migrateCategoryDefaults(fresh);
  migrateRfqDefaults(fresh);
  migrateMediaDefaults(fresh);
  migrateSupplierDefaults(fresh);
  migrateMessageDefaults(fresh);
  ensureDemoSuppliers(fresh);
  migrateVerifications(fresh);
  migrateSubmissions(fresh);
  g.__veximLocal = fresh;
  persist(fresh);
  return fresh;
}

function persist(db: LocalShape) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (err) {
    console.warn("[local-db] không ghi được file, dữ liệu chỉ tồn tại trong RAM:", err);
  }
}

/** Ẩn hash mật khẩu trước khi trả ra ngoài */
/** Bỏ các khoá undefined khỏi patch để không vô tình ghi đè mất dữ liệu cũ. */
function cleanPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function toPublicUser(row: AppUserRecord): AppUser {
  const has_local_password = Boolean(row.password_hash);
  const { password_hash: _omit, ...rest } = row;
  void _omit;
  return {
    ...rest,
    signature_html: row.signature_html ?? null,
    phone: row.phone ?? null,
    // null = chưa đặt tay -> địa chỉ gửi tự sinh từ họ tên (lib/email/sender.ts)
    sender_email: row.sender_email ?? null,
    has_local_password,
  };
}

function mutate<T>(fn: (db: LocalShape) => T): T {
  const db = load();
  const out = fn(db);
  persist(db);
  return out;
}

export const localStore: DataStore = {
  mode: "local",

  async listSuppliers() {
    return [...load().suppliers].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  },
  async getSupplier(id) {
    return load().suppliers.find((s) => s.id === id) ?? null;
  },
  async createSupplier(input) {
    return mutate((db) => {
      const row: Supplier = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.suppliers.push(row);
      return row;
    });
  },
  async updateSupplier(id, patch) {
    return mutate((db) => {
      const row = db.suppliers.find((s) => s.id === id);
      if (!row) throw new Error("Không tìm thấy nhà cung cấp");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteSupplier(id) {
    mutate((db) => {
      db.suppliers = db.suppliers.filter((s) => s.id !== id);
      db.supplier_verification_requests = (db.supplier_verification_requests ?? []).filter((r) => r.supplier_id !== id);
      for (const user of db.users) if (user.supplier_id === id) { user.supplier_id = null; user.is_active = false; }
      for (const b of db.buyers) if (b.supplier_id === id) b.supplier_id = null;
      const removedProducts = db.products.filter((pr) => pr.supplier_id === id).map((pr) => pr.id);
      const removedVerifications = (db.verifications ?? []).filter((v) => v.supplier_id === id).map((v) => v.id);
      db.verifications = (db.verifications ?? []).filter((v) => v.supplier_id !== id);
      db.products = db.products.filter((pr) => pr.supplier_id !== id);
      db.media = db.media.filter((m) => {
        if (m.supplier_id === id) return false;
        if (m.product_id && removedProducts.includes(m.product_id)) return false;
        const vid = (m as unknown as { verification_id?: string | null }).verification_id;
        if (vid && removedVerifications.includes(vid)) return false;
        return true;
      });
    });
  },

  async listSupplierVerificationRequests(supplierId) {
    return load().supplier_verification_requests.filter((r) => !supplierId || r.supplier_id === supplierId)
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  },
  async createSupplierVerificationRequest(supplierId, level) {
    return mutate((db) => {
      if (!db.suppliers.some((s) => s.id === supplierId)) throw new Error("Không tìm thấy NCC.");
      if (level !== 2 && level !== 3) throw new Error("Chỉ nhận yêu cầu thăm nhà máy hoặc lịch sử giao hàng.");
      if (db.supplier_verification_requests.some((r) => r.supplier_id === supplierId && r.target_level === level)) throw new Error("Đã gửi yêu cầu này.");
      const row: SupplierVerificationRequest = {
        supplier_id: supplierId, target_level: level, status: "requested", requested_at: new Date().toISOString(),
        contacted_at: null, contacted_by: null,
      };
      db.supplier_verification_requests.push(row);
      return row;
    });
  },
  async markSupplierVerificationContacted(supplierId, level, actorId) {
    return mutate((db) => {
      const row = db.supplier_verification_requests.find((r) => r.supplier_id === supplierId && r.target_level === level);
      if (!row) throw new Error("Không có yêu cầu này.");
      if (row.status === "requested") Object.assign(row, { status: "contacted", contacted_at: new Date().toISOString(), contacted_by: actorId });
      return row;
    });
  },

  async listProducts() {
    return [...load().products].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  },
  async getProduct(id) {
    return load().products.find((pr) => pr.id === id) ?? null;
  },
  async listProductsBySupplier(supplierId) {
    return load()
      .products.filter((pr) => pr.supplier_id === supplierId)
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  },
  async createProduct(input) {
    return mutate((db) => {
      const row: SupplierProduct = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.products.push(row);
      return row;
    });
  },
  async updateProduct(id, patch) {
    return mutate((db) => {
      const row = db.products.find((pr) => pr.id === id);
      if (!row) throw new Error("Không tìm thấy sản phẩm");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteProduct(id) {
    mutate((db) => {
      db.products = db.products.filter((pr) => pr.id !== id);
      db.media = db.media.filter((m) => m.product_id !== id);
    });
  },

  async listBuyers() {
    return [...load().buyers].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  },
  async getBuyer(id) {
    return load().buyers.find((b) => b.id === id) ?? null;
  },
  async createBuyer(input) {
    return mutate((db) => {
      const row: Buyer = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.buyers.push(row);
      return row;
    });
  },
  async updateBuyer(id, patch) {
    return mutate((db) => {
      const row = db.buyers.find((b) => b.id === id);
      if (!row) throw new Error("Không tìm thấy khách hàng");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteBuyer(id) {
    mutate((db) => {
      db.buyers = db.buyers.filter((b) => b.id !== id);
      db.activities = db.activities.filter((a) => a.buyer_id !== id);
      db.messages = db.messages.filter((e) => e.buyer_id !== id);
    });
  },

  async listProspects() {
    return [...load().prospects].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  },
  async getProspect(id) {
    return load().prospects.find((p) => p.id === id) ?? null;
  },
  async createProspect(input: ProspectInput) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const row: Prospect = {
        ...input,
        ai_company_summary: null,
        ai_company_sources: [],
        ai_company_analyzed_at: null,
        ai_products: null,
        id: randomUUID(),
        created_at: now,
        updated_at: now,
      };
      db.prospects.push(row);
      return row;
    });
  },
  async createProspects(inputs: ProspectInput[]) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const rows: Prospect[] = inputs.map((input) => ({
        ...input,
        ai_company_summary: null,
        ai_company_sources: [],
        ai_company_analyzed_at: null,
        ai_products: null,
        id: randomUUID(),
        created_at: now,
        updated_at: now,
      }));
      db.prospects.push(...rows);
      return rows;
    });
  },
  async updateProspect(id, patch) {
    return mutate((db) => {
      const row = db.prospects.find((p) => p.id === id);
      if (!row) throw new Error("Không tìm thấy prospect");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteProspect(id) {
    mutate((db) => {
      db.prospects = db.prospects.filter((p) => p.id !== id);
      db.prospect_activities = db.prospect_activities.filter((a) => a.prospect_id !== id);
      db.messages = db.messages.map((message) =>
        message.prospect_id === id ? { ...message, prospect_id: null } : message,
      );
    });
  },
  async listProspectActivities(prospectId) {
    return load()
      .prospect_activities.filter((a) => a.prospect_id === prospectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async addProspectActivity(input: {
    prospect_id: string;
    channel: ProspectActivityChannel;
    summary: string;
    created_by?: string | null;
  }) {
    return mutate((db) => {
      const row: ProspectActivity = {
        id: randomUUID(),
        prospect_id: input.prospect_id,
        channel: input.channel,
        summary: input.summary,
        created_by: input.created_by ?? null,
        created_at: new Date().toISOString(),
      };
      db.prospect_activities.push(row);
      return row;
    });
  },
  async addProspectActivities(inputs) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const rows: ProspectActivity[] = inputs.map((input) => ({
        id: randomUUID(),
        prospect_id: input.prospect_id,
        channel: input.channel,
        summary: input.summary,
        created_by: input.created_by ?? null,
        created_at: now,
      }));
      db.prospect_activities.push(...rows);
      return rows;
    });
  },

  async listActivities(buyerId) {
    const rows = buyerId
      ? load().activities.filter((a) => a.buyer_id === buyerId)
      : load().activities;
    return [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  },
  async addActivity(input) {
    return mutate((db) => {
      const row: Activity = {
        id: randomUUID(),
        buyer_id: input.buyer_id,
        type: input.type,
        from_stage: input.from_stage ?? null,
        to_stage: input.to_stage ?? null,
        message: input.message,
        created_by: input.created_by ?? null,
        created_at: new Date().toISOString(),
      };
      db.activities.push(row);
      return row;
    });
  },

  async listUsers() {
    return load()
      .users.map(toPublicUser)
      .sort((a, b) => a.email.localeCompare(b.email));
  },
  async countUsers() {
    return load().users.length;
  },
  async getUser(id) {
    return load().users.find((u) => u.id === id) ?? null;
  },
  async getUserByEmail(email) {
    const needle = email.trim().toLowerCase();
    return load().users.find((u) => u.email.trim().toLowerCase() === needle) ?? null;
  },
  async getUserBySupplierId(supplierId) {
    return load().users.find((u) => u.supplier_id === supplierId) ?? null;
  },
  async createUser(input) {
    return mutate((db) => {
      const exists = db.users.some(
        (u) => u.email.trim().toLowerCase() === input.email.trim().toLowerCase(),
      );
      if (exists) throw new Error("Email này đã có tài khoản.");
      if (input.supplier_id && db.users.some((u) => u.supplier_id === input.supplier_id)) throw new Error("NCC này đã có tài khoản.");
      const row: AppUserRecord = {
        ...input,
        id: randomUUID(),
        signature_html: null,
        phone: null,
        sender_email: null,
        last_login_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.users.push(row);
      return row;
    });
  },
  async updateUser(id, patch) {
    return mutate((db) => {
      const row = db.users.find((u) => u.id === id);
      if (!row) throw new Error("Không tìm thấy tài khoản");
      if (patch.email) {
        const clash = db.users.some(
          (u) => u.id !== id && u.email.trim().toLowerCase() === patch.email!.trim().toLowerCase(),
        );
        if (clash) throw new Error("Email này đã có tài khoản.");
      }
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async claimSupplierForUser(userId, supplierId) {
    return mutate((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user || user.role !== "supplier" || !user.is_active || user.supplier_id ||
          db.users.some((u) => u.supplier_id === supplierId)) return false;
      user.supplier_id = supplierId;
      user.updated_at = new Date().toISOString();
      return true;
    });
  },
  async deleteUser(id) {
    mutate((db) => {
      db.users = db.users.filter((u) => u.id !== id);
    });
  },
  async touchUserLogin(id) {
    mutate((db) => {
      const row = db.users.find((u) => u.id === id);
      if (row) row.last_login_at = new Date().toISOString();
    });
  },

  /* ------------------------- tệp đính kèm email ------------------------- */
  async createAttachment(input) {
    return mutate((db) => {
      const row: EmailAttachment = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.attachments.push(row);
      return row;
    });
  },
  async getAttachment(id) {
    return load().attachments.find((a) => a.id === id) ?? null;
  },
  async listAttachments(ids) {
    if (ids.length === 0) return [];
    const want = new Set(ids);
    return load().attachments.filter((a) => want.has(a.id));
  },
  async listAttachmentsForMessage(messageId) {
    return load()
      .attachments.filter((a) => a.message_id === messageId && a.status !== "deleted")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  async listOrphanAttachments(olderThanISO) {
    return load().attachments.filter(
      (a) => !a.message_id && a.created_at < olderThanISO && a.status !== "deleted",
    );
  },
  async updateAttachment(id, patch) {
    return mutate((db) => {
      const row = db.attachments.find((a) => a.id === id);
      if (!row) throw new Error("Không tìm thấy tệp đính kèm");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteAttachment(id) {
    mutate((db) => {
      db.attachments = db.attachments.filter((a) => a.id !== id);
    });
  },

  async listMedia(ownerType: MediaOwnerType, ownerId: string) {
    return load()
      .media.filter((m) => {
        if (m.owner_type !== ownerType) return false;
        if (ownerType === "product") return m.product_id === ownerId;
        if (ownerType === "verification") return (m as unknown as { verification_id?: string | null }).verification_id === ownerId;
        return m.supplier_id === ownerId;
      })
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  },
  async listMediaForProducts(productIds) {
    const set = new Set(productIds);
    return load().media.filter((m) => m.product_id && set.has(m.product_id));
  },
  async listMediaForSuppliers(supplierIds) {
    const set = new Set(supplierIds);
    return load().media.filter((m) => m.supplier_id && set.has(m.supplier_id));
  },
  async getMedia(id) {
    return load().media.find((m) => m.id === id) ?? null;
  },
  async getMediaByPath(storagePath) {
    return (
      load().media.find((m) => m.storage_path === storagePath || m.thumb_path === storagePath) ?? null
    );
  },
  async createMedia(input: MediaInput) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const row: MediaAsset = {
        verification_id: null,
        checklist_key: null,
        id: randomUUID(),
        created_at: now,
        updated_at: now,
        ...input,
      } as MediaAsset;
      db.media.push(row);
      return row;
    });
  },
  async updateMedia(id, patch) {
    return mutate((db) => {
      const row = db.media.find((m) => m.id === id);
      if (!row) throw new Error("Không tìm thấy tệp");
      Object.assign(row, cleanPatch(patch), { updated_at: new Date().toISOString() });
      return row;
    });
  },
  async deleteMedia(id) {
    mutate((db) => {
      db.media = db.media.filter((m) => m.id !== id);
    });
  },

  async listMessages(limit = 200) {
    const rows = [...load().messages].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return rows.slice(0, limit);
  },
  async listMessagesForRfq(rfqId) {
    return [...load().messages]
      .filter((m) => (m as unknown as { rfq_id?: string | null }).rfq_id === rfqId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  async getMessage(id) {
    return load().messages.find((m) => m.id === id) ?? null;
  },
  async addMessage(input) {
    return mutate((db) => {
      const row: EmailMessage = {
        ...input,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        sent_at: input.sent_at ?? null,
      };
      db.messages.push(row);
      return row;
    });
  },
  async updateMessage(id, patch) {
    return mutate((db) => {
      const row = db.messages.find((m) => m.id === id);
      if (!row) throw new Error("Không tìm thấy email");
      Object.assign(row, cleanPatch(patch));
      return row;
    });
  },
  async deleteMessage(id) {
    mutate((db) => {
      db.messages = db.messages.filter((m) => m.id !== id);
    });
  },

  /* ----------------------- ghi đè nội dung template ----------------------- */
  async listTemplateOverrides() {
    return load().template_overrides ?? [];
  },
  async saveTemplateOverride(o) {
    mutate((db) => {
      const list = db.template_overrides ?? (db.template_overrides = []);
      db.template_overrides = [
        ...list.filter((x) => !(x.stage === o.stage && x.dir === o.dir)),
        { ...o, updated_at: new Date().toISOString() },
      ];
    });
  },
  async clearTemplateOverride(stage, dir) {
    mutate((db) => {
      db.template_overrides = (db.template_overrides ?? []).filter(
        (x) => !(x.stage === stage && x.dir === dir),
      );
    });
  },
  async listProspectOutreachTemplateOverrides() {
    return load().prospect_outreach_template_overrides ?? [];
  },
  async saveProspectOutreachTemplateOverride(input) {
    mutate((db) => {
      const list = db.prospect_outreach_template_overrides ?? (db.prospect_outreach_template_overrides = []);
      db.prospect_outreach_template_overrides = [
        ...list.filter((item) => item.id !== input.id),
        { ...input, updated_at: new Date().toISOString() },
      ];
    });
  },
  async clearProspectOutreachTemplateOverride(id) {
    mutate((db) => {
      db.prospect_outreach_template_overrides = (db.prospect_outreach_template_overrides ?? [])
        .filter((item) => item.id !== id);
    });
  },

  /* ----------------------------- bài viết blog ----------------------------- */
  async listPosts(options) {
    const all = load().posts ?? [];
    const filtered = options?.status ? all.filter((p) => p.status === options.status) : all;
    return [...filtered].sort((a, b) => (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at));
  },
  async getPost(id) {
    return (load().posts ?? []).find((p) => p.id === id) ?? null;
  },
  async getPostBySlug(slug, options) {
    const post = (load().posts ?? []).find((p) => p.slug === slug) ?? null;
    if (!post) return null;
    if (options?.publishedOnly && post.status !== "published") return null;
    return post;
  },
  async createPost(input) {
    const now = new Date().toISOString();
    const post: Post = { ...input, id: randomUUID(), created_at: now, updated_at: now };
    mutate((db) => {
      db.posts = [...(db.posts ?? []), post];
    });
    return post;
  },
  async updatePost(id, patch) {
    const current = (load().posts ?? []).find((p) => p.id === id);
    if (!current) throw new Error("Không tìm thấy bài viết để cập nhật.");
    const updated: Post = { ...current, ...patch, updated_at: new Date().toISOString() };
    mutate((db) => {
      db.posts = (db.posts ?? []).map((p) => (p.id === id ? updated : p));
    });
    return updated;
  },
  async deletePost(id) {
    mutate((db) => {
      db.posts = (db.posts ?? []).filter((p) => p.id !== id);
    });
  },

  /* ----------------------- RFQ FOUNDATION --------------------------------- */
  async listCategories(options?: { publishedOnly?: boolean }): Promise<Category[]> {
    const db = load();
    const ready = (db as unknown as { __catReady?: Set<string> }).__catReady ?? new Set<string>();
    const decorate = (c: Category): Category => ({ ...c, public_page_ready: ready.has(c.slug.toLowerCase()) });
    let all = (db.categories ?? []).map(decorate);
    if (options?.publishedOnly) all = all.filter((c) => c.is_published);
    return all;
  },
  async getCategory(id) {
    const db = load();
    const ready = (db as unknown as { __catReady?: Set<string> }).__catReady ?? new Set<string>();
    const row = (db.categories ?? []).find((c) => c.id === id) ?? null;
    return row ? { ...row, public_page_ready: ready.has(row.slug.toLowerCase()) } : null;
  },
  async getCategoryBySlug(slug) {
    const db = load();
    const ready = (db as unknown as { __catReady?: Set<string> }).__catReady ?? new Set<string>();
    const row = (db.categories ?? []).find((c) => c.slug === slug) ?? null;
    return row ? { ...row, public_page_ready: ready.has(row.slug.toLowerCase()) } : null;
  },
  async createCategory(input) {
    const now = new Date().toISOString();
    const patch = cleanPatch(input);
    const cat: Category = {
      id: randomUUID(),
      slug: "",
      parent_id: null,
      name_i18n: {},
      intro_i18n: {},
      h1_i18n: null,
      body_i18n: null,
      faq_i18n: [],
      spec_columns: [],
      spec_rows: [],
      buying_facts: [],
      filters: [],
      seo_title_i18n: {},
      seo_desc_i18n: {},
      hero_image: null,
      hero_alt_i18n: null,
      homepage_kicker_i18n: null,
      active_on_homepage: false,
      public_page_ready: false,
      seo_indexable: false,
      status: "draft",
      previous_slugs: [],
      created_by: null,
      updated_by: null,
      is_published: false,
      sort_order: 0,
      created_at: now,
      updated_at: now,
      ...patch,
    };
    mutate((db) => {
      db.categories = [...(db.categories ?? []), cat];
    });
    return cat;
  },
  async updateCategory(id, patch) {
    return mutate((db) => {
      const row = (db.categories ?? []).find((c) => c.id === id);
      if (!row) throw new Error("Category not found");
      const cleaned = cleanPatch({ ...patch, updated_at: new Date().toISOString() });
      // Slug thay đổi → gom vào previous_slugs để middleware tự 301.
      if (typeof cleaned.slug === "string" && cleaned.slug && cleaned.slug !== row.slug) {
        if (row.slug && !row.previous_slugs?.includes(row.slug)) {
          row.previous_slugs = [...(row.previous_slugs ?? []), row.slug];
        }
      }
      // status -> is_published sync
      if (cleaned.status) cleaned.is_published = cleaned.status === "published";
      Object.assign(row, cleaned);
      return row;
    });
  },
  async deleteCategory(id) {
    return mutate((db) => {
      db.categories = (db.categories ?? []).filter((c) => c.id !== id);
    });
  },

  async setSupplierCategories(supplierId, categoryIds, primaryId) {
    mutate((db) => {
      db.supplier_categories = (db.supplier_categories ?? []).filter((sc) => sc.supplier_id !== supplierId);
      for (const cid of categoryIds) {
        db.supplier_categories.push({
          supplier_id: supplierId,
          category_id: cid,
          is_primary: primaryId ? cid === primaryId : cid === categoryIds[0],
          created_at: new Date().toISOString(),
        });
      }
    });
  },
  async listSupplierCategories(supplierId) {
    return (load().supplier_categories ?? []).filter((sc) => sc.supplier_id === supplierId);
  },

  async listCertificates(supplierId) {
    return (load().certificates ?? []).filter((c) => c.supplier_id === supplierId);
  },
  async getCertificate(id) {
    return (load().certificates ?? []).find((c) => c.id === id) ?? null;
  },
  async createCertificate(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      supplier_id: "",
      name: "",
      issuer: null,
      number: null,
      valid_until: null,
      file_media_id: null,
      check_status: "on_file" as const,
      holder_name: null, scope_text: null, requested_product_ids: [], approved_product_ids: [],
      review_status: "unreviewed" as const, review_note: null, publicly_visible: false,
      checked_at: null,
      checked_by: null,
      notes: null,
      created_at: now,
      updated_at: now,
      ...cleanPatch(input),
    } as Certificate;
    mutate((db) => {
      db.certificates = [...(db.certificates ?? []), row];
    });
    return row;
  },
  async updateCertificate(id, patch) {
    return mutate((db) => {
      const row = (db.certificates ?? []).find((c) => c.id === id);
      if (!row) throw new Error("Certificate not found");
      Object.assign(row, cleanPatch({ ...patch, updated_at: new Date().toISOString() }));
      return row;
    });
  },
  async deleteCertificate(id) {
    mutate((db) => {
      db.certificates = (db.certificates ?? []).filter((c) => c.id !== id);
    });
  },

  async listVerifications(supplierId) {
    const all = load().verifications ?? [];
    return supplierId ? all.filter((v) => v.supplier_id === supplierId) : [...all];
  },
  async createVerification(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      supplier_id: "",
      target_level: 1,
      status: "scheduled" as const,
      inspector_id: null,
      visit_date: null,
      visit_lat: null,
      visit_lng: null,
      visit_address: null,
      shipment_ref: null,
      shipped_on: null,
      shipment_destination: null,
      checklist: {},
      checklist_notes: {},
      tax_number: null,
      bank_account_number: null,
      return_reason: null,
      public_summary_i18n: {},
      public_summary_published_at: null,
      public_summary_published_by: null,
      internal_notes: null,
      approved_by: null,
      approved_at: null,
      created_at: now,
      updated_at: now,
      ...cleanPatch(input),
    } as Verification;
    mutate((db) => {
      db.verifications = [...(db.verifications ?? []), row];
    });
    return row;
  },
  async updateVerification(id, patch) {
    return mutate((db) => {
      const row = (db.verifications ?? []).find((v) => v.id === id);
      if (!row) throw new Error("Verification not found");
      Object.assign(row, cleanPatch({ ...patch, updated_at: new Date().toISOString() }));
      // Tính lại verification_level cho NCC liên quan
      const related = db.verifications.filter((v) => v.supplier_id === row.supplier_id && v.status === "approved");
      const lvl = related.reduce((m, v) => Math.max(m, v.target_level as number), 0);
      const sup = db.suppliers.find((s) => s.id === row.supplier_id);
      if (sup) {
        sup.verification_level = lvl;
        if (lvl > 0 && !sup.verified_at) sup.verified_at = new Date().toISOString();
      }
      return row;
    });
  },
  async getVerification(id) {
    return (load().verifications ?? []).find((v) => v.id === id) ?? null;
  },

  async listRfqs(options) {
    let rows = [...(load().rfqs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (options?.status) rows = rows.filter((r) => r.status === options.status);
    if (options?.assignedTo !== undefined) {
      rows = rows.filter((r) => r.assigned_to === options.assignedTo);
    }
    return rows;
  },
  async getRfq(id) {
    return (load().rfqs ?? []).find((r) => r.id === id) ?? null;
  },
  async getRfqByToken(token) {
    return (load().rfqs ?? []).find((r) => r.access_token === token) ?? null;
  },
  async getRfqByCode(code) {
    return (load().rfqs ?? []).find((r) => r.code === code) ?? null;
  },
  async createRfq(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      code: "",
      buyer_id: "",
      category_id: null,
      product_text: "",
      specs: {},
      quantity: null,
      unit: null,
      frequency: null,
      destination_country: null,
      incoterm: null,
      needed_by: null,
      target_price: null,
      target_price_currency: "USD",
      wants_samples: false,
      wants_inspection: false,
      wants_video_call: false,
      preferred_supplier_ids: [],
      source_page: null,
      utm: {},
      referrer: null,
      spam_score: 0,
      spam_flags: [],
      status: "new" as const,
      assigned_to: null,
      first_response_at: null,
      lost_reason: null,
      closed_reason: null,
      access_token: randomUUID(),
      created_at: now,
      updated_at: now,
      ...cleanPatch(input),
    } as unknown as Rfq;
    mutate((db) => {
      db.rfqs = [...(db.rfqs ?? []), row];
    });
    return row;
  },
  async updateRfq(id, patch) {
    return mutate((db) => {
      const row = (db.rfqs ?? []).find((r) => r.id === id);
      if (!row) throw new Error("RFQ not found");
      // Ép buộc lost_reason khi chuyển sang lost.
      const next = { ...row, ...cleanPatch({ ...patch, updated_at: new Date().toISOString() }) } as typeof row;
      if (next.status === "lost" && !(next.lost_reason && String(next.lost_reason).trim())) {
        throw new Error("Bắt buộc chọn lý do thất bại (lost_reason) khi đóng RFQ là lost.");
      }
      Object.assign(row, next);
      return row;
    });
  },

  async listRfqAttachments(rfqId) {
    return (load().rfq_attachments ?? []).filter((a) => a.rfq_id === rfqId);
  },
  async createRfqAttachment(input) {
    const row = {
      id: randomUUID(),
      rfq_id: "",
      bucket: "rfq-attachments",
      storage_path: "",
      file_name: "",
      mime_type: "application/octet-stream",
      size_bytes: 0,
      uploaded_by: null,
      created_at: new Date().toISOString(),
      ...cleanPatch(input),
    } as RfqAttachment;
    mutate((db) => {
      db.rfq_attachments = [...(db.rfq_attachments ?? []), row];
    });
    return row;
  },
  async deleteRfqAttachment(id) {
    mutate((db) => {
      db.rfq_attachments = (db.rfq_attachments ?? []).filter((a) => a.id !== id);
    });
  },

  async listRfqMatches(rfqId) {
    return (load().rfq_matches ?? []).filter((m) => m.rfq_id === rfqId);
  },
  async listRfqMatchesBySupplier(supplierId) {
    return (load().rfq_matches ?? [])
      .filter((m) => m.supplier_id === supplierId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async listSupplierRfqInvitations(supplierId) {
    const db = load();
    const rfqs = new Map(db.rfqs.map((r) => [r.id, r]));
    return db.rfq_matches.filter((m) => m.supplier_id === supplierId && m.sent_to_supplier_at && m.status !== "proposed")
      .map((m) => ({ ...m, rfq: rfqs.get(m.rfq_id)! })).filter((m) => !!m.rfq)
      .sort((a, b) => b.sent_to_supplier_at!.localeCompare(a.sent_to_supplier_at!));
  },
  async listSupplierNoticeReads(supplierId) {
    return (load().supplier_portal_notice_reads ?? []).filter((r) => r.supplier_id === supplierId);
  },
  async markSupplierNoticeRead(supplierId, noticeKey) {
    mutate((db) => {
      db.supplier_portal_notice_reads ??= [];
      if (!db.supplier_portal_notice_reads.some((r) => r.supplier_id === supplierId && r.notice_key === noticeKey))
        db.supplier_portal_notice_reads.push({ supplier_id: supplierId, notice_key: noticeKey, read_at: new Date().toISOString() });
    });
  },
  async getRfqMatch(id) {
    return (load().rfq_matches ?? []).find((m) => m.id === id) ?? null;
  },
  async createRfqMatch(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      rfq_id: "",
      supplier_id: "",
      status: "proposed" as const,
      sent_to_supplier_at: null,
      response_due_at: null,
      supplier_replied_at: null,
      quote_price: null,
      quote_currency: "USD",
      quote_unit: null,
      quote_incoterm: null,
      quote_lead_time_days: null,
      quote_valid_until: null,
      quote_file_id: null,
      sent_to_buyer_at: null,
      internal_note: null,
      created_at: now,
      updated_at: now,
      ...cleanPatch(input),
    } as unknown as RfqMatch;
    mutate((db) => {
      db.rfq_matches = [...(db.rfq_matches ?? []), row];
    });
    return row;
  },
  async updateRfqMatch(id, patch) {
    return mutate((db) => {
      const row = (db.rfq_matches ?? []).find((m) => m.id === id);
      if (!row) throw new Error("RFQ match not found");
      Object.assign(row, cleanPatch({ ...patch, updated_at: new Date().toISOString() }));
      return row;
    });
  },
  async deleteRfqMatch(id) {
    mutate((db) => {
      db.rfq_matches = (db.rfq_matches ?? []).filter((m) => m.id !== id);
    });
  },

  async findIntroduction(buyerId, supplierId) {
    return (
      (load().introductions ?? []).find(
        (i) => i.buyer_id === buyerId && i.supplier_id === supplierId,
      ) ?? null
    );
  },
  async createIntroduction(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      buyer_id: "",
      supplier_id: "",
      first_rfq_id: "",
      introduced_at: now,
      protected_until: "",
      created_at: now,
      ...cleanPatch(input),
    } as Introduction;
    mutate((db) => {
      db.introductions = [...(db.introductions ?? []), row];
    });
    return row;
  },

  /* ---- Cổng NCC tự gửi bằng chứng L2/L3 (kho local/demo) ---- */
  async listSubmissions(supplierId, level) {
    let rows = [...(load().supplier_submissions ?? [])];
    if (supplierId) rows = rows.filter((s) => s.supplier_id === supplierId);
    if (level) rows = rows.filter((s) => s.target_level === level);
    return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  async getSubmission(id) {
    return (load().supplier_submissions ?? []).find((s) => s.id === id) ?? null;
  },
  async createSubmission(input) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      supplier_id: "",
      target_level: 2,
      status: "draft",
      created_by: null,
      verification_code: null,
      code_issued_at: null,
      device_lat: null,
      device_lng: null,
      device_accuracy_m: null,
      device_captured_at: null,
      shipment_ref: null,
      shipped_on: null,
      shipment_destination: null,
      supplier_note: null,
      flags: [],
      ai_review: null,
      ai_scanned_at: null,
      submitted_at: null,
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      verification_id: null,
      created_at: now,
      updated_at: now,
      ...cleanPatch(input),
    } as SupplierSubmission;
    mutate((db) => {
      db.supplier_submissions = [...(db.supplier_submissions ?? []), row];
    });
    return row;
  },
  async updateSubmission(id, patch) {
    return mutate((db) => {
      const row = (db.supplier_submissions ?? []).find((s) => s.id === id);
      if (!row) throw new Error("Submission not found");
      Object.assign(row, cleanPatch({ ...patch, updated_at: new Date().toISOString() }));
      return row;
    });
  },
  async listSubmissionItems(submissionId) {
    return (load().supplier_submission_items ?? [])
      .filter((i) => i.submission_id === submissionId)
      .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
  },
  async getSubmissionItem(id) {
    return (load().supplier_submission_items ?? []).find((i) => i.id === id) ?? null;
  },
  async createSubmissionItem(input) {
    const row = {
      id: randomUUID(),
      submission_id: "",
      supplier_id: "",
      checklist_key: "",
      media_id: null,
      storage_path: null,
      thumb_path: null,
      exif_lat: null,
      exif_lng: null,
      exif_captured_at: null,
      exif_camera_make: null,
      exif_camera_model: null,
      exif_software: null,
      has_exif: false,
      mime: null,
      bytes: null,
      width: null,
      height: null,
      capture_lat: null,
      capture_lng: null,
      capture_accuracy_m: null,
      captured_at: null,
      flags: [],
      ai_verdict: null,
      ai_reason: null,
      ai_detected_text: null,
      ai_code_visible: null,
      ai_code_read: null,
      uploaded_at: new Date().toISOString(),
      ...cleanPatch(input),
    } as SupplierSubmissionItem;
    mutate((db) => {
      db.supplier_submission_items = [...(db.supplier_submission_items ?? []), row];
    });
    return row;
  },
  async updateSubmissionItem(id, patch) {
    return mutate((db) => {
      const row = (db.supplier_submission_items ?? []).find((i) => i.id === id);
      if (!row) throw new Error("Submission item not found");
      Object.assign(row, cleanPatch(patch));
      return row;
    });
  },
  async deleteSubmissionItem(id) {
    mutate((db) => {
      db.supplier_submission_items = (db.supplier_submission_items ?? []).filter((i) => i.id !== id);
    });
  },
  async listSubmissionLinks(submissionId) {
    return (load().supplier_submission_links ?? [])
      .filter((l) => l.submission_id === submissionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  async createSubmissionLink(input) {
    const row = {
      id: randomUUID(),
      submission_id: "",
      url: "",
      label: null,
      allowed_source: false,
      fetched_at: null,
      fetch_status: "pending",
      fetch_note: null,
      created_by: null,
      created_at: new Date().toISOString(),
      ...cleanPatch(input),
    } as SupplierSubmissionLink;
    mutate((db) => {
      db.supplier_submission_links = [...(db.supplier_submission_links ?? []), row];
    });
    return row;
  },
  async updateSubmissionLink(id, patch) {
    return mutate((db) => {
      const row = (db.supplier_submission_links ?? []).find((l) => l.id === id);
      if (!row) throw new Error("Submission link not found");
      Object.assign(row, cleanPatch(patch));
      return row;
    });
  },
  async deleteSubmissionLink(id) {
    mutate((db) => {
      db.supplier_submission_links = (db.supplier_submission_links ?? []).filter((l) => l.id !== id);
    });
  },

  async addAuditLog(entry) {
    const row: AuditLogEntry = {
      id: (load().audit_log ?? []).length + 1,
      actor_id: entry.actor_id ?? null,
      actor_email: entry.actor_email ?? null,
      entity: entry.entity,
      entity_id: entry.entity_id,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
      created_at: new Date().toISOString(),
    };
    mutate((db) => {
      db.audit_log = [...(db.audit_log ?? []), row];
    });
    return row;
  },
};
