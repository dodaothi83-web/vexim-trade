/**
 * Nội dung seed cho các category có trang public riêng.
 * Cashew giữ nguyên bản viết lại; các category khác dùng DEFAULT_CATEGORY_CONFIG (trống,
 * admin sẽ bổ sung dần qua CRM).
 *
 * Các field không DB-required được đặt vào đây để khởi tạo giá trị cho DB trống;
 * admin có thể sửa trong /crm/categories mà không cần deploy lại.
 */
import type {
  CategoryFact,
  CategoryColumn,
  CategoryFilter,
  CategoryRow,
  ProductAttributeField,
  HarvestCalendar,
} from "@/lib/types";

export interface CategoryContentSeed {
  h1?: string | null;
  intro?: string | null;
  body?: string | null;
  seo_title?: string | null;
  seo_desc?: string | null;
  hero_image?: string | null;
  hero_alt?: string | null;
  kicker?: string | null;
  spec_columns?: CategoryColumn[];
  spec_rows?: CategoryRow[];
  buying_facts?: CategoryFact[];
  filters?: CategoryFilter[];
  /** Trường thông số buyer lọc được trên trang nhóm nhỏ (CRM sửa được). */
  product_fields?: ProductAttributeField[];
  /** Đơn vị hiển thị giá theo quy ước ngành. Để trống thì dùng mặc định trong MARKET_PRICE_UNITS. */
  price_unit?: string | null;
  /** Lịch mùa vụ. Chỉ khai báo khi đã đối chiếu nguồn; để trống thì trang ẩn khối này. */
  harvest?: HarvestCalendar | null;
  faqs?: Array<{ q: string; a: string }>;
  active_on_homepage?: boolean;
  public_page_ready?: boolean;
  seo_indexable?: boolean;
}

const CASHEW_COLUMNS: CategoryColumn[] = [
  { key: "code", label: "Grade", width: "w-20", emphasis: true },
  { key: "name", label: "Name", width: "w-44" },
  { key: "count", label: "Kernels per lb", width: "w-40" },
  { key: "uses", label: "Common uses" },
];

const CASHEW_ROWS: CategoryRow[] = [
  { key: "w180", values: { code: "W180", name: "Whole 180",       count: "[170–180]", uses: "Premium retail and gift packs" } },
  { key: "w240", values: { code: "W240", name: "Whole 240",       count: "220–240",   uses: "Premium retail" } },
  { key: "w320", values: { code: "W320", name: "Whole 320",       count: "300–320",   uses: "The most traded grade, good balance of size and price" } },
  { key: "w450", values: { code: "W450", name: "Whole 450",       count: "400–450",   uses: "Snacks, bakery and confectionery" } },
  { key: "sw",   values: { code: "SW",   name: "Scorched wholes", count: "Varies",    uses: "Roasted and salted snacks, food processing" } },
  { key: "ws",   values: { code: "WS",   name: "White splits",    count: "Varies",    uses: "Snacks, chocolate, cereals" } },
  { key: "lp",   values: { code: "LP",   name: "Large pieces",    count: "Varies",    uses: "Bakery, ice cream" } },
  { key: "sp",   values: { code: "SP",   name: "Small pieces",    count: "Varies",    uses: "Cashew butter, pastes, food processing" } },
];

const CASHEW_FACTS: CategoryFact[] = [
  { key: "moq",   icon: "scale",    label: "Minimum order",  value: "Usually one 20ft container, about [X] tonnes. Some suppliers accept smaller trial orders of [X]." },
  { key: "pack",  icon: "package",  label: "Packing",        value: "[e.g. 2 × 11.34 kg vacuum bags/tins per carton, 22.68 kg/carton]. Other packing on request." },
  { key: "inco",  icon: "ship",     label: "Incoterms",      value: "FOB Ho Chi Minh City is most common. CIF to your port on request." },
  { key: "port",  icon: "anchor",   label: "Port and lead time", value: "Most shipments leave from Cat Lai, Ho Chi Minh City, about [X–Y] days after contract." },
  { key: "season",icon: "calendar", label: "Supply and season", value: "Local harvest runs roughly [February to May] in Binh Phuoc, Dong Nai and the Central Highlands. Many processors also import raw nuts, so kernels are available all year." },
  { key: "pay",   icon: "users",    label: "Payment",        value: "Often [30% deposit, 70% against B/L copy]. L/C is possible with some suppliers." },
];

const CASHEW_FAQS = [
  { q: "Do you charge buyers?", a: "No. Requesting a quote is free for buyers. Optional services, such as pre-shipment inspection, are quoted separately before you agree to them." },
  { q: "How are supplier certificates verified on Vexim Trade?", a: "Uploaded certificates (HACCP, ISO 22000, BRC, Halal, FDA, Organic) are scanned to check the certified entity name and expiration date, and are labeled as Owner or Partner Entity on the supplier profile." },
  { q: "Can I get samples before ordering?", a: "Yes. We can arrange samples from the suppliers you're interested in. Sample cost and courier charges are paid by the buyer; we'll confirm the amount before anything is sent." },
  { q: "Can I order less than a full container?", a: "Some suppliers accept smaller trial orders. Tell us your volume and we'll find out who can do it." },
  { q: "Will suppliers contact me directly?", a: "Not until you agree to an introduction. Suppliers see your requirements, not your contact details." },
  { q: "Can I request a quote from a specific supplier?", a: "Yes. Your request goes to that supplier first. If they cannot meet it, Vexim will ask you before suggesting anyone else." },
  { q: "How does Vexim match suppliers for an open request?", a: "Suppliers are matched on your requirements only, including your specs, quantity and market. Paid listings never affect who Vexim recommends." },
];

const CASHEW_FILTERS: CategoryFilter[] = [
  { key: "grade", label: "Grades", options: [
    { value: "W180", label: "W180" }, { value: "W240", label: "W240" },
    { value: "W320", label: "W320" }, { value: "W450", label: "W450" },
    { value: "SW",   label: "SW" },   { value: "WS",   label: "WS" },
    { value: "LP",   label: "LP" },   { value: "SP",   label: "SP" },
  ]},
];

const CASHEW_PRODUCT_FIELDS: ProductAttributeField[] = [
  {
    key: "grade",
    label: "Grade",
    type: "select",
    options: ["W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"],
    filterable: true,
  },
];

/**
 * Quy cách hồ tiêu: khối lượng riêng, tính bằng g/l.
 *
 * Đây là chỉ tiêu đứng đầu bảng quy cách của ngành (IPC BP-1 từ 550 g/l, BP-2 từ
 * 500 g/l), và 500 với 550 là hai mức giá khác nhau chứ không phải một. Trước đây
 * danh mục này không có trường nào, nên trang hồ tiêu lọc không được theo quy cách
 * và quy cách chỉ còn đọc được bằng cách bắt chữ trong tên sản phẩm.
 *
 * Tiêu trắng dùng thang riêng, cao hơn tiêu đen ở cùng hạng, nên 600 và 630 g/l
 * cũng nằm trong danh sách. Để trống được: sản phẩm chưa có phiếu phân tích thì
 * không phải chọn đại một giá trị.
 */
const PEPPER_PRODUCT_FIELDS: ProductAttributeField[] = [
  {
    key: "grade",
    label: "Density (g/l)",
    type: "select",
    options: ["500 g/l", "550 g/l", "570 g/l", "580 g/l", "600 g/l", "630 g/l"],
    filterable: true,
  },
];

export const CASHEW_CATEGORY_CONFIG: CategoryContentSeed = {
  h1: "Cashew suppliers in Vietnam",
  intro:
    "Whole kernels, splits, roasted salted cashew and value-added cashew products from verified Vietnamese processors and exporters. Compare product specs, MOQ, reference FOB pricing and independent verification badges (business documents & automated certificate holder recognition, factory evidence, and export delivery history), then request a quote from the supplier you choose or send your requirements and we look for suppliers that match.",
  body:
    "Most Vietnamese processors grade cashew kernels to the AFI standard. Counts are per pound and the final spec is agreed in your contract. Counts and uses below are to be confirmed by our trading team before we put them in front of a buyer.",
  seo_title: "Cashew Suppliers in Vietnam | W180 to W450 Kernels | Vexim Trade",
  seo_desc:
    "Explore Vietnamese cashew kernel products (WW180–WW450, splits, roasted OEM) and verified suppliers. Request a quote from a supplier you choose, or send your requirements and we look for suppliers that match.",
  hero_image: "/images/categories/cashew-hero.jpg",
  hero_alt: "Vietnamese cashew kernels, graded",
  kicker: "W180 – SP, AFI grades",
  spec_columns: CASHEW_COLUMNS,
  spec_rows: CASHEW_ROWS,
  buying_facts: CASHEW_FACTS,
  faqs: CASHEW_FAQS,
  filters: CASHEW_FILTERS,
  product_fields: CASHEW_PRODUCT_FIELDS,
  price_unit: "kg",
  harvest: {
    windows: [
      {
        id: "main",
        label: "Main crop",
        start_month: 2,
        end_month: 5,
        regions: ["Binh Phuoc", "Dong Nai", "Central Highlands"],
        peak: true,
        note: "Picking runs province by province, so the peak moves by a few weeks from year to year.",
      },
    ],
    note_i18n: {
      en: "Plants process kernels all year because they also buy raw nuts from West Africa and Cambodia. These months are the domestic harvest, not the only window when you can order.",
    },
    reviewed_on: null,
  },
  active_on_homepage: true,
  public_page_ready: false, // computed từ NCC published, không hardcode
  seo_indexable: false, // bật sau khi hết [ngoặc vuông] + có hồ sơ thật
};

export const DEFAULT_CATEGORY_CONFIG: CategoryContentSeed = {
  h1: null,
  intro: null,
  body: null,
  seo_title: null,
  seo_desc: null,
  hero_image: null,
  hero_alt: null,
  kicker: null,
  spec_columns: [],
  spec_rows: [],
  buying_facts: [],
  faqs: [],
  filters: [],
  active_on_homepage: false,
  public_page_ready: false,
  seo_indexable: false,
};

/**
 * Hồ tiêu: chỉ khai trường quy cách, phần nội dung trang do CRM điền dần như các
 * danh mục khác. Tách khỏi DEFAULT để danh mục khác không tự có trường của tiêu.
 */
export const PEPPER_CATEGORY_CONFIG: CategoryContentSeed = {
  ...DEFAULT_CATEGORY_CONFIG,
  hero_image: "/images/categories/pepper.jpg",
  kicker: "FAQ / cleaned / ASTA",
  active_on_homepage: true,
  product_fields: PEPPER_PRODUCT_FIELDS,
};
