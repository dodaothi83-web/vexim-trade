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
  { q: "Do you charge buyers?", a: "No. Requesting quotes is free. We only charge for optional services such as pre-shipment inspection when you ask us to arrange them." },
  { q: "Can I get samples before ordering?", a: "Yes. We can arrange samples from the suppliers you're interested in. Sample cost and courier charges are paid by the buyer; we'll confirm the amount before anything is sent." },
  { q: "Can I order less than a full container?", a: "Some suppliers accept smaller trial orders. Tell us your volume and we'll find out who can do it." },
  { q: "Will suppliers contact me directly?", a: "Not until you choose to. Suppliers see your requirements, not your contact details." },
];

const CASHEW_FILTERS: CategoryFilter[] = [
  { key: "grade", label: "Grades", options: [
    { value: "W180", label: "W180" }, { value: "W240", label: "W240" },
    { value: "W320", label: "W320" }, { value: "W450", label: "W450" },
    { value: "SW",   label: "SW" },   { value: "WS",   label: "WS" },
    { value: "LP",   label: "LP" },   { value: "SP",   label: "SP" },
  ]},
];

export const CASHEW_CATEGORY_CONFIG: CategoryContentSeed = {
  h1: "Cashew suppliers in Vietnam",
  intro:
    "Whole kernels, splits and pieces from Vietnamese processors. Before a supplier appears here, someone from our team visits the factory and checks their business papers and certificates. Tell us the grade and volume you need, and we'll send you a short list with MOQ, lead time and certificates for each supplier.",
  body:
    "Most Vietnamese processors grade cashew kernels to the AFI standard. Counts are per pound and the final spec is agreed in your contract. Counts and uses below are to be confirmed by our trading team before we put them in front of a buyer.",
  seo_title: "Cashew Suppliers in Vietnam | W180 to W450 Kernels | Vexim Trade",
  seo_desc:
    "Compare verified Vietnamese cashew kernel suppliers. W180 to W450, splits and pieces. Request a quote and hear back within one business day.",
  hero_image: "/images/categories/cashew-hero.jpg",
  hero_alt: "Vietnamese cashew kernels, graded",
  kicker: "W180 – SP, AFI grades",
  spec_columns: CASHEW_COLUMNS,
  spec_rows: CASHEW_ROWS,
  buying_facts: CASHEW_FACTS,
  faqs: CASHEW_FAQS,
  filters: CASHEW_FILTERS,
  active_on_homepage: true,
  public_page_ready: true,
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
