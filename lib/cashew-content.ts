/**
 * Nội dung trang đích /cashew (thị trường Mỹ).
 *
 * Để riêng ở lib/ vì server component (app/cashew/page.tsx) cần đọc cùng dữ liệu
 * để dựng JSON-LD và kiểm tra file ảnh — tránh hai bản nội dung lệch nhau.
 *
 * QUY TẮC: mọi mục là [dữ liệu lấy từ nhà sản xuất] thì KHÔNG tự đoán. Khi chưa có,
 * để nguyên câu "Confirmed per producer..." — isPending() nhận ra và trang gắn nhãn
 * "Open", đúng chuẩn Stated/Verified/Open của trang chủ.
 */

/** TODO(producer): thay từng giá trị dưới đây bằng xác nhận bằng văn bản của nhà sản xuất. */
export const PRODUCER_DATA = {
  /** Grades nhà sản xuất thực sự có (Whole kernels) */
  wholeGrades: "W180, W210, W240, W320, W450",
  /** Các loại nhân mảnh họ có */
  pieceTypes: "White splits, large pieces, small pieces, baby bits",
  /** MOQ theo grade */
  moq: "Confirmed per producer and grade",
  /** Mùa vụ thu hoạch / chế biến */
  season: "Confirmed per producer",
  /** Incoterm + cảng xuất */
  quoteBasis: "FOB or CIF, confirmed per producer",
  /** Cảng đến Mỹ hay dùng */
  usPorts: "Los Angeles / Long Beach",
  /** Giấy tờ & chứng nhận THỰC SỰ có bản gốc */
  documents: "Confirmed per producer — only documents the producer holds",
  /** Nguồn hạt thô và cách xác nhận */
  rawNutOrigin: "Stated by the producer; we ask for the source documents",
} as const;

/** true khi giá trị còn là chỗ trống chờ nhà sản xuất */
export function isPending(value: string): boolean {
  return /^(Confirmed|To be|Stated by)/i.test(value.trim());
}

export const CASHEW_NAV = [
  { href: "#why", label: "Why Vietnam" },
  { href: "#specs", label: "Specs" },
  { href: "#work", label: "How it works" },
  { href: "#faq", label: "Questions" },
];

export const CASHEW_TRUST_LINE = [
  "A written reply by the start of your next business day",
  "No mark-up on the producer’s price",
  "You sign the contract directly with the producer",
];

export const VIETNAM_STATS = [
  { figure: "~80%", label: "of the world’s cashew kernel exports come from Vietnam" },
  {
    figure: "186,600 t",
    label: "of kernels shipped in the first four months of 2026",
  },
];

/** Nguồn số liệu — kiểm tra lại bản gốc trước khi đăng (doc đọc qua snippet). */
export const VIETNAM_STATS_SOURCE =
  "Source: Vietnam Ministry of Agriculture and Environment and Vietnam Cashew Association, as reported in 2026. Figures are re-checked each quarter before this page is edited.";

export const SCREENING_QUESTIONS = [
  "Is the grade on the sheet the one that will actually ship?",
  "Which crop and which lot does this price come from?",
  "Where was the raw nut grown, and who can confirm it?",
  "What documents can the producer provide, and when?",
  "What are the minimum order and the packing?",
];

export const SPEC_ROWS: { item: string; value: string }[] = [
  { item: "Whole kernels", value: `${PRODUCER_DATA.wholeGrades} (WW = white whole)` },
  { item: "Pieces", value: PRODUCER_DATA.pieceTypes },
  { item: "Carton", value: "About 22.68 kg (50 lb) net" },
  { item: "20’ container", value: "Around 700 cartons, roughly 15.9 MT" },
  { item: "Example route", value: "Vung Tau, Vietnam to the Port of Los Angeles" },
  { item: "Minimum order", value: PRODUCER_DATA.moq },
  { item: "Crop and processing season", value: PRODUCER_DATA.season },
  { item: "Quote basis (Incoterm)", value: PRODUCER_DATA.quoteBasis },
  { item: "Units", value: "USD per lb or per MT; 20’ and 40’ containers" },
];

export type CashewStepIcon = "brief" | "screen" | "sample" | "talk" | "ship";

export const CASHEW_STEPS: {
  icon: CashewStepIcon;
  title: string;
  desc: string;
  output: string;
}[] = [
  {
    icon: "brief",
    title: "You send the brief",
    desc: "Grade, volume, destination, the date you need the goods by, Incoterm and payment terms.",
    output: "A brief we both confirm in writing.",
  },
  {
    icon: "screen",
    title: "We screen producers",
    desc: "We shortlist producers that fit and show what is stated by the producer, what we verified, and what is still open.",
    output: "A shortlist with each point marked Stated, Verified or Open.",
  },
  {
    icon: "sample",
    title: "We agree spec and samples",
    desc: "Grade, standard, packing and how samples are sent are agreed before you evaluate. Sample costs are paid by you.",
    output: "A signed spec sheet and a sample schedule.",
  },
  {
    icon: "talk",
    title: "We coordinate the talks",
    desc: "Final commercial terms are agreed in writing between you and the producer.",
    output: "A written summary after every meeting.",
  },
  {
    icon: "ship",
    title: "Before and after shipment",
    desc: "Optional factory visit (in person or by video) and optional independent pre-shipment inspection. Travel and inspection fees are paid by you.",
    output: "Inspection results before the goods leave, then confirmed dates and documents as they are issued.",
  },
];

export const EVIDENCE_TONE = [
  {
    key: "stated",
    title: "Stated",
    desc: "What the producer tells us: specs, capacity, certificates.",
    box: "border-slate-300 bg-slate-50 text-slate-800",
    chip: "bg-slate-200 text-slate-800",
  },
  {
    key: "verified",
    title: "Verified",
    desc: "What we checked against documents or records. Each point shows its source.",
    box: "border-emerald-300 bg-emerald-50 text-emerald-900",
    chip: "bg-emerald-100 text-emerald-800",
  },
  {
    key: "open",
    title: "Still open",
    desc: "What is not confirmed yet. We list it so you can ask before you rely on it.",
    box: "border-amber-300 bg-amber-50 text-amber-900",
    chip: "bg-amber-100 text-amber-800",
  },
] as const;

export const CASHEW_FAQS = [
  {
    q: "What is the minimum order?",
    a: `${PRODUCER_DATA.moq}. Tell us the volume you have in mind and we will ask each producer to confirm against it.`,
  },
  {
    q: "Can I visit the factory?",
    a: "Yes, in person, or by video call with a screen recording if travel is not possible. Travel costs are paid by you.",
  },
  {
    q: "Who pays for samples, inspection and shipping?",
    a: "You do. We arrange them and put the quotes in front of you before anything is booked.",
  },
  {
    q: "How do you make money?",
    a: "The producers we represent pay Veximtrade for that representation, and we tell you so. We are not a neutral adviser. Your price is the producer’s price, with no mark-up added by us, and you may contact any producer we introduce directly.",
  },
  {
    q: "What if you do not have what I need?",
    a: "We say so plainly in our reply. We do not hold every product, and we will not pretend to.",
  },
  {
    q: "Is the cashew grown in Vietnam?",
    a: "Not always. Vietnamese processors import large volumes of raw nuts, with Cambodia the largest source, followed by Tanzania and Ivory Coast. If the origin of the raw nut matters for your labelling or for your customers, put it in your brief. We ask each producer to state it and we mark it Stated, Verified or Open.",
  },
];

export const CASHEW_GRADE_OPTIONS = [
  "W180",
  "W210",
  "W240",
  "W320",
  "W450",
  "White splits",
  "Large pieces",
  "Baby bits",
  "Not sure yet",
];

export const CASHEW_INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "DAP", "DDP", "Not sure yet"];
export const CASHEW_PAYMENT_METHODS = ["T/T", "L/C", "D/P", "D/A", "Open account", "Not sure yet"];

/* -------------------------------- ảnh ---------------------------------- */

export type CashewPhotoKey = "hero" | "grades" | "pieces" | "cartons" | "container" | "sorting";

export type CashewPhoto = {
  key: CashewPhotoKey;
  /** File WebP đặt trong public/cashew/ — dưới 200 KB, đã khai báo kích thước */
  file: string;
  alt: string;
  width: number;
  height: number;
  /** Cảnh cần chụp — hiện trên placeholder khi chưa có file */
  shot: string;
  /** true cho ảnh hero (LCP), false cho ảnh dưới fold -> loading="lazy" */
  eager?: boolean;
};

export const CASHEW_PHOTOS: Record<CashewPhotoKey, CashewPhoto> = {
  hero: {
    key: "hero",
    file: "cashew-kernels-w320.webp",
    alt: "Whole white cashew kernels, grade W320, on a neutral background",
    width: 1600,
    height: 1000,
    shot: "Close-up of one whole-kernel grade (e.g. W320), neutral background, even light",
    eager: true,
  },
  grades: {
    key: "grades",
    file: "cashew-grades-w180-w450.webp",
    alt: "Cashew kernel grades W180, W240, W320 and W450 side by side",
    width: 1200,
    height: 800,
    shot: "W180 / W240 / W320 / W450 in separate trays, with a ruler for scale",
  },
  pieces: {
    key: "pieces",
    file: "cashew-splits-and-pieces.webp",
    alt: "Cashew splits, large pieces and baby bits in separate trays",
    width: 1200,
    height: 800,
    shot: "Splits, large pieces and baby bits — only the types the producer actually has",
  },
  cartons: {
    key: "cartons",
    file: "cashew-50lb-cartons.webp",
    alt: "Cashew kernels packed in 50 lb cartons ready for export",
    width: 1200,
    height: 800,
    shot: "A 22.68 kg (50 lb) carton being closed, vacuum packs or tins visible",
  },
  container: {
    key: "container",
    file: "cashew-container-loading.webp",
    alt: "Cartons of cashew kernels loaded into a 20-foot container",
    width: 1200,
    height: 800,
    shot: "Cartons stacked into a 20’ container at the plant",
  },
  sorting: {
    key: "sorting",
    file: "cashew-sorting-line.webp",
    alt: "Workers sorting cashew kernels at a processing plant in Vietnam",
    width: 1200,
    height: 800,
    shot: "Grading or inspection line, staff in protective clothing (ask the producer for consent)",
  },
};
