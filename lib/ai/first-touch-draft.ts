import "server-only";

/**
 * Email tiếp cận ĐẦU TIÊN cho buyer — NỘI DUNG CỐ ĐỊNH, AI không được viết văn.
 *
 * Vì sao bỏ hẳn phần "AI viết thư": lần chạy thật cho thấy model biến giả định của bên mình
 * (target_product "Mì ăn liền" gán theo tên file import) thành sự thật về khách hàng
 * ("Your company sells instant noodles"), rồi ghép lẫn MOQ/năng lực của các dòng hàng khác
 * nhau và dịch ô "chứng từ: Không" thành "we have no certifications". Thư chào lạnh mà sai
 * chi tiết thì mất khách, nên ở đây máy chủ SINH THƯ theo khung cố định; mô hình chỉ được
 * giao đúng một việc: đọc xem công ty buyer đang cung cấp sản phẩm nào (lib/ai/company-products.ts).
 *
 * Không tìm thấy sản phẩm -> giữ nguyên placeholder [SẢN_PHẨM_TỪ_WEBSITE] để nhân viên tự điền,
 * tuyệt đối không bịa.
 */

/** "target" = khách hàng mục tiêu chưa nêu nhu cầu; "demand" = buyer đã để lại nhu cầu. */
export type FirstTouchMode = "target" | "demand";

/** Các ô mô hình được phép điền. null = không có dữ liệu -> để placeholder. */
export type FirstTouchSlots = {
  /** Dear <tên người nhận>, */
  recipientName: string | null;
  /** "I am <tên>, at Vexim Trade…" — lấy từ tài khoản đang đăng nhập */
  senderName: string | null;
  /** Tên công ty buyer */
  company: string | null;
  /** Sản phẩm tìm thấy trên website của họ, nối dạng "A, B and C" */
  products: string | null;
  /** Nhóm hàng để hỏi: "…sourcing in Vietnam for <group>?" */
  group: string | null;
  /**
   * Buyer ĐÃ để lại nhu cầu (hồ sơ có product/spec/quantity) thì câu mở đầu phần 2 nhắc lại
   * đúng yêu cầu đó thay vì "tôi được biết công ty ông đang cung cấp…".
   */
  statedNeed?: string | null;
  /**
   * Kết quả nhìn website + ẢNH sản phẩm của buyer: hàng thành phẩm có nhãn hay nông sản
   * thô/chưa chín — câu "offer" đổi theo, các câu còn lại giữ nguyên từng chữ.
   */
  form?: OfferForm | null;
};

/** Bốn kết luận form, khớp với lib/ai/company-products.ts */
export type OfferForm = "finished" | "raw" | "mixed" | "unknown";

/** Placeholder giữ nguyên bằng tiếng Việt để nhân viên nhìn thấy ngay chỗ cần sửa. */
export const FIRST_TOUCH_PLACEHOLDERS = {
  recipient: "[TÊN_NGƯỜI_NHẬN]",
  products: "[SẢN_PHẨM_TỪ_WEBSITE]",
  group: "[NHÓM_HÀNG]",
  company: "[TÊN_CÔNG_TY_BUYER]",
} as const;

/**
 * Khung thư — bản dịch 1:1 từ mẫu bên mình chốt (13/10/2026). Sửa ở đây là sửa mọi lá thư;
 * không cho model tự thêm/bớt câu nào.
 *
 * Quy ước định dạng (được render ở components/compose-mail.tsx → renderInlineMarks):
 *   **chữ** → in đậm
 *   *chữ*  → in nghiêng
 *   ***chữ*** → in đậm + nghiêng (dùng cho câu hỏi kêu hành động)
 * Các dấu * nằm trong dữ liệu do model điền sẽ bị clean() xoá trước khi ghép vào khung,
 * nên không bao giờ xuất hiện ngoài những chỗ thiết kế sẵn dưới đây.
 */
export const FIRST_TOUCH_TEMPLATE = {
  greeting: (name: string) => `Hi ${name},`,
  intro: (sender: string) =>
    `I am ${sender} from **Vexim Trade**, the service arm of **VEXIM GLOBAL**. ` +
    `We are a Vietnam-based company that finds and screens reliable, qualified suppliers for international buyers.`,
  demandLead: (need: string) => `You asked us about ${need}.`,
  coldLead: (company: string, products: string) => `We understand that ${company} supplies ${products}.`,
  /**
   * Câu "offer" duy nhất thay đổi theo những gì đọc được từ website/ảnh của buyer.
   * Các câu còn lại (giới thiệu, phần việc của buyer, câu hỏi, opt-out, cảm ơn) luôn
   * luôn giữ nguyên từng chữ theo mẫu.
   */
  angle: (form: OfferForm | null | undefined): string => {
    if (form === "finished")
      return (
        "You already sell finished, retail-ready goods, so the useful thing we can do is the input " +
        "behind them: raw material, packaging and private-label production in Vietnam."
      );
    if (form === "raw")
      return (
        "You buy raw produce, so the two things that decide a shipment are harvest timing and ripeness " +
        "on arrival. We check both with the mills and farms we work with before anything is booked."
      );
    if (form === "mixed")
      return (
        "Part of your range is finished goods and part looks like raw input, so we can work on both " +
        "sides: sourcing finished products or the material that goes into them."
      );
    return "If you need finished goods or raw materials from Vietnam, we can introduce suitable suppliers.";
  },
  /** Giữ nguyên từng chữ theo mẫu — không đổi theo form */
  yourPart:
    `Your part is only to receive samples and decide which supplier fits; we handle communication with ` +
    `suppliers, quotations, document and certification checks, and quality checks before shipment.`,
  question: (group: string) => `***Would you like us to look into Vietnam sourcing for ${group}?***`,
  /** Hai dòng opt-out — in nghiêng, giữ nguyên chữ theo mẫu */
  optOutYes: `*If you are interested, please reply to this email for more information.*`,
  optOutNo: `*If you are not interested, please just ignore it.*`,
  closing: `Thank you for your time. I am looking forward to hearing from you soon.`,
} as const;

function clean(value: string | null | undefined, max = 220): string {
  const raw = (value ?? "")
    .replace(/\s+/g, " ")
    // dấu vết markdown/URL nếu model trả về lẫn
    .replace(/\*\*?/g, "")
    .replace(/`/g, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/(?:https?:\/\/|www\.)\S{3,}/gi, "")
    .replace(/\[[^\]]{1,120}\]\((?:https?:)?\/\/[^)\s]+\)/gi, "")
    .trim();
  if (!raw) return "";
  return raw.length > max ? `${raw.slice(0, max).trimEnd()}…` : raw;
}

/** "A, B and C" — tối đa 3 món, đủ để buyer thấy mình đã nghiên cứu họ */
export function joinProducts(items: string[]): string {
  const list = items.map((item) => clean(item, 90)).filter(Boolean).slice(0, 3);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export type FirstTouchLetter = { subject: string; body: string; missing: string[]; words: number };

/**
 * Sinh thân thư + tiêu đề. Mọi ô thiếu được thay bằng placeholder tương ứng và báo lại trong
 * `missing` để trình soạn nhắc nhân viên điền tay.
 */
export function buildFirstTouchLetter(slots: FirstTouchSlots, subjectInput: SubjectInput): FirstTouchLetter {
  const recipient = clean(slots.recipientName, 80) || FIRST_TOUCH_PLACEHOLDERS.recipient;
  const sender = clean(slots.senderName, 80).split(/\s+/)[0] || "[TÊN]";
  const company = clean(slots.company, 90) || FIRST_TOUCH_PLACEHOLDERS.company;
  const products = clean(slots.products, 220) || FIRST_TOUCH_PLACEHOLDERS.products;
  const group = clean(slots.group, 90) || FIRST_TOUCH_PLACEHOLDERS.group;
  const need = clean(slots.statedNeed, 160);

  const lead = need ? FIRST_TOUCH_TEMPLATE.demandLead(need) : FIRST_TOUCH_TEMPLATE.coldLead(company, products);

  const paragraphs = [
    FIRST_TOUCH_TEMPLATE.greeting(recipient),
    FIRST_TOUCH_TEMPLATE.intro(sender),
    `${lead} ${FIRST_TOUCH_TEMPLATE.angle(slots.form)} ${FIRST_TOUCH_TEMPLATE.yourPart}`,
    FIRST_TOUCH_TEMPLATE.question(group),
    FIRST_TOUCH_TEMPLATE.optOutYes,
    FIRST_TOUCH_TEMPLATE.optOutNo,
    FIRST_TOUCH_TEMPLATE.closing,
  ];

  const missing: string[] = [];
  if (!clean(slots.recipientName, 80)) missing.push(FIRST_TOUCH_PLACEHOLDERS.recipient);
  if (!need && !clean(slots.products, 220)) missing.push(FIRST_TOUCH_PLACEHOLDERS.products);
  if (!clean(slots.group, 90)) missing.push(FIRST_TOUCH_PLACEHOLDERS.group);

  const body = paragraphs.join("\n\n");
  return { subject: buildFirstTouchSubject(subjectInput), body, missing, words: countWords(body) };
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/* ------------------------------- TIÊU ĐỀ ------------------------------- */

/** Ba dạng tiêu đề được luân phiên dùng. */
export type SubjectForm = "for" | "from" | "moq";

const SUBJECT_FORMS: SubjectForm[] = ["for", "from", "moq"];

/** Từ cấm trong tiêu đề. */
const BANNED_SUBJECT_WORDS = ["free", "offer", "deal", "best price", "urgent", "limited", "opportunity", "partnership"];

export function subjectFormOf(subject: string): SubjectForm | null {
  if (/\bmoq\b|\b\d+\s?(?:mt|tons?|cont|containers?|pallets?|cartons?)\b/i.test(subject)) return "moq";
  const lower = subject.toLowerCase();
  if (/\bfor\b/.test(lower)) return "for";
  if (/\bfrom\b/.test(lower)) return "from";
  return null;
}

function nextSubjectForm(avoid: SubjectForm | null | undefined): SubjectForm {
  if (!avoid) return "for";
  const index = SUBJECT_FORMS.indexOf(avoid);
  return SUBJECT_FORMS[(index + 1) % SUBJECT_FORMS.length];
}

/** Tên tiếng Anh cho các mặt hàng chính — dùng khi đặt tiêu đề từ dữ liệu tiếng Việt. */
const PRODUCT_TERMS_EN: Record<string, string> = {
  "hạt điều": "cashew",
  điều: "cashew",
  "cà phê": "coffee",
  gạo: "rice",
  tiêu: "pepper",
  "hồ tiêu": "pepper",
  quế: "cinnamon",
  chè: "tea",
  sắn: "cassava",
  "củ mì": "cassava",
  ngô: "corn",
  bắp: "corn",
  mía: "sugar",
  đậu: "beans",
  dừa: "coconut",
  "thủy sản": "seafood",
  tôm: "shrimp",
  mực: "squid",
  gỗ: "wood",
  "nội thất": "furniture",
  "dệt may": "textiles",
  may: "garments",
  giày: "footwear",
  "điện tử": "electronics",
  "cao su": "rubber",
  "thủ công mỹ nghệ": "handicraft",
  "tinh bột": "starch",
  "mì ăn liền": "instant noodles",
  "mì": "noodles",
  "xoài": "mango",
  "chuối": "banana",
  "thơm": "pineapple",
  "dứa": "pineapple",
  "vải": "lychee",
  "nhãn": "longan",
  "sầu riêng": "durian",
  "thanh long": "dragon fruit",
  "ớt": "chili",
  "bơ": "avocado",
  "dứa cô đặc": "coconut",
};

/** "Gạo Jasmine 5% tấm" → "Jasmine rice 5%" — đủ để tiêu đề ra tiếng Anh tự nhiên. */
export function toEnglishProduct(value: string | null | undefined): string {
  let text = clean(value, 160);
  if (!text) return "";
  for (const [vi, en] of Object.entries(PRODUCT_TERMS_EN)) {
    text = text.replace(new RegExp(`\\b${vi}\\b`, "gi"), ` ${en} `);
  }
  return text
    .replace(/\b(?:nhân|trắng|xay|sấy|khô|tươi|loại|tiêu chuẩn|tấm|nguyên cám|rang)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function titleCase(text: string): string {
  const small = new Set(["for", "from", "and", "the", "of", "to", "in", "with"]);
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function companyForSubject(company: string | null): string {
  const short = clean(company, 70)
    .replace(/\b(co\.?,?\s*ltd\.?|inc\.?|llc|gmbh|sas|s\.?a\.?r\.?l\.?|s\.?a\.?|pte\.?\s*ltd\.?|ltd\.?|corp\.?|company|jsc|joint\s+stock\s+company)\b/gi, "")
    .replace(/[^\p{L}\p{N}. ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return short;
}

export type SubjectInput = {
  /** Nhóm hàng/sản phẩm chính nêu trong thư */
  product: string | null;
  company: string | null;
  /** Chỉ dùng cho dạng "[Sản phẩm], [MOQ]" — thư chào lạnh thường không có */
  moq?: string | null;
  /** Dạng đã dùng ở lá thư buyer gần nhất */
  avoidForm?: SubjectForm | null;
};

/**
 * Tiêu đề do máy chủ dựng — nên đúng cấu trúc cứng ngay từ đầu:
 * tiếng Anh, Title Case, không "!", không emoji, không Re:/Fwd:, dưới 8 từ,
 * có tên sản phẩm, không từ cấm, luân phiên dạng, không lặp dạng thư trước.
 */
export function buildFirstTouchSubject(input: SubjectInput): string {
  const product = toEnglishProduct(input.product);
  const company = companyForSubject(input.company);
  const moq = clean(input.moq ?? "", 24).replace(/\bmoq\b\.?/gi, "").trim();
  const wanted = nextSubjectForm(input.avoidForm ?? null);

  // Ba dạng theo mẫu bên mình chốt; dạng nào thiếu dữ liệu thì tự rơi về dạng kế tiếp
  const forForm =
    product && company ? `${titleCase(product)} for ${titleCase(company)}` : product ? `${titleCase(product)} from Vietnam` : company ? `Vietnam sourcing for ${titleCase(company)}` : "Vietnam sourcing";
  const forms: Record<SubjectForm, string> = {
    for: forForm,
    from: product ? `${titleCase(product)} from Vietnam` : company ? `${titleCase(company)} — Vietnam sourcing` : "Vietnam sourcing from Vexim Trade",
    moq: product && moq ? `${titleCase(product)}, MOQ ${moq}` : forForm,
  };
  let subject = forms[wanted] || forms.for;

  subject = clean(subject, 90)
    .replace(/^(?:re|fwd|fw)\s*:\s*/i, "")
    .replace(/[!！.]+$/, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const banned = new RegExp(`\\b(?:${BANNED_SUBJECT_WORDS.join("|")})\\b`, "i");
  if (banned.test(subject)) subject = subject.replace(new RegExp(banned.source, "gi"), "").replace(/\s{2,}/g, " ").trim();
  const words = subject.split(" ").filter(Boolean);
  if (words.length > 8) subject = words.slice(0, 8).join(" ");
  subject = subject.slice(0, 78).replace(/\s*[,(\[][^)\]]*$/, "").replace(/[\s,.:;()\[\]—-]+$/, "").trim();
  return subject;
}

/** Thông tin cho trình soạn + README: mẫu thư là nguồn duy nhất, xem FIRST_TOUCH_TEMPLATE. */
export function firstTouchTemplatePreview(): string {
  return [
    FIRST_TOUCH_TEMPLATE.greeting(FIRST_TOUCH_PLACEHOLDERS.recipient),
    "",
    FIRST_TOUCH_TEMPLATE.intro("[TÊN]"),
    "",
    `${FIRST_TOUCH_TEMPLATE.coldLead(FIRST_TOUCH_PLACEHOLDERS.company, FIRST_TOUCH_PLACEHOLDERS.products)} ${FIRST_TOUCH_TEMPLATE.angle("unknown")} ${FIRST_TOUCH_TEMPLATE.yourPart}`,
    "",
    FIRST_TOUCH_TEMPLATE.question(FIRST_TOUCH_PLACEHOLDERS.group),
    "",
    FIRST_TOUCH_TEMPLATE.optOutYes,
    "",
    FIRST_TOUCH_TEMPLATE.optOutNo,
    "",
    FIRST_TOUCH_TEMPLATE.closing,
  ].join("\n");
}
