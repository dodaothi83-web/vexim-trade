/**
 * Quy tắc đặt tên hiển thị cho sản phẩm trên trang người mua.
 *
 * Vì sao cần một nơi duy nhất: tên sản phẩm là thứ xuất hiện trong tiêu đề trang,
 * trong `Product.name` của dữ liệu có cấu trúc, trong thẻ so sánh và trong câu trả
 * lời của các hệ thống AI. Tên do nhà cung cấp tự nhập theo thói quen sàn thương
 * mại điện tử (nhồi nhiều grade, nối bằng dấu "/", thêm tên công ty, thêm từ tự
 * khen) vừa khó đọc vừa làm loãng tín hiệu tìm kiếm.
 *
 * Nguyên tắc ở đây:
 *  1. **Không tự cắt cụt tên.** Nhà cung cấp được tự đặt tên, nhưng tên phải tự
 *     nhiên. Vì vậy các hàm dưới đây *cảnh báo* chứ không âm thầm cắt bớt hay
 *     viết lại nội dung người dùng gõ.
 *  2. **Cảnh báo mềm, không chặn đăng.** Cùng chủ trương với
 *     `docs/product-name-grades.md`: không từ chối sản phẩm chỉ vì tên chứa
 *     grade hay dài quá. Nhân viên duyệt là chốt chặn cuối, không phải biểu mẫu.
 *  3. **Tên gốc của nhà cung cấp là chứng từ**, không bao giờ bị ghi đè; tên hiển
 *     thị là trường riêng (xem `composeDisplayName` trong cùng thư mục).
 */

/** Trần khuyến nghị cho tên hiển thị. Không phải cổng chặn. */
export const DISPLAY_NAME_RECOMMENDED_MAX = 90;

/** Trần cứng của cột dữ liệu (migration 20261030_product_display_name.sql). */
export const DISPLAY_NAME_HARD_MAX = 120;

/**
 * Ký tự "kiểu AI" không dùng trong tên hàng: gạch dài, các loại dấu trích dẫn
 * cong, dấu ba chấm một ký tự, gạch chân dưới, ký tự trang trí và emoji.
 *
 * Gạch nối thường (-) và dấu "&" vẫn được phép: "W320 - Grade A" và
 * "Salt & Pepper" là cách viết tự nhiên.
 */
const TYPOGRAPHIC_NOISE: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /[\u2018\u2019\u201A\u201B]/, why: "dấu nháy đơn cong" },
  { pattern: /[\u201C\u201D\u201E\u201F]/, why: "dấu nháy kép cong" },
  { pattern: /[\u2013\u2014\u2015]/, why: "gạch dài (–, —)" },
  { pattern: /\u2026/, why: "dấu ba chấm một ký tự (…)" },
  { pattern: /[\u00A0\u2007\u202F]/, why: "khoảng trắng đặc biệt" },
  { pattern: /[\u200B-\u200D\uFEFF]/, why: "ký tự vô hình" },
  { pattern: /[\u2022\u00B7\u25CF\u25AA\u25AB\u2B50\u2605\u2606]/, why: "ký tự trang trí (●, ★…)" },
  { pattern: /[\u2190-\u21FF\u2794\u27A1]/, why: "mũi tên trang trí" },
  { pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, why: "emoji" },
  { pattern: /_/, why: "gạch chân dưới" },
  { pattern: /\|/, why: "dấu gạch đứng" },
  { pattern: /[{}<>]/, why: "ngoặc nhọn hoặc ngoặc nhọn" },
];

/**
 * Câu chữ kiểu quảng cáo máy viết: tự khen, sáo rỗng, hoặc giọng văn trợ lý AI.
 * Chỉ áp cho TÊN HIỂN THỊ — mô tả sản phẩm vẫn được dùng từ ngữ bán hàng bình
 * thường, đây không phải bộ lọc nội dung.
 */
const AI_PHRASING: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bpremium\b/i, why: "từ tự khen “Premium”" },
  { pattern: /\bhigh[\s-]*quality\b/i, why: "từ tự khen “High Quality”" },
  { pattern: /\btop[\s-]*(?:quality|grade|notch)\b/i, why: "từ tự khen “Top quality/grade”" },
  { pattern: /\bbest[\s-]*(?:quality|price|seller)?\b/i, why: "từ tự khen “Best”" },
  { pattern: /\bno\.?\s*1\b/i, why: "từ tự khen “No.1”" },
  { pattern: /\bnumber\s*one\b/i, why: "từ tự khen “number one”" },
  { pattern: /\bworld[\s-]*class\b/i, why: "từ tự khen “world-class”" },
  { pattern: /\b(?:hot|new)\s+selling\b/i, why: "câu quảng cáo “hot/new selling”" },
  { pattern: /\b100\s*%\s*(?:natural|pure|organic)?\b/i, why: "câu quảng cáo “100% …”" },
  { pattern: /\bexport\s+(?:quality|standard)\b/i, why: "cụm sáo rỗng “export quality/standard”" },
  { pattern: /\bbulk\s+(?:wholesale|export)\b/i, why: "cụm sáo rỗng “bulk wholesale/export”" },
  { pattern: /\bwholesale\s+export\b/i, why: "cụm sáo rỗng “wholesale export”" },
  { pattern: /\b(?:direct|factory)\s+(?:from\s+)?(?:supplier|manufacturer|factory)\b/i, why: "cụm sáo rỗng “factory direct”" },
  { pattern: /\bbest[\s-]*selling\b/i, why: "câu quảng cáo “best-selling”" },
  { pattern: /\b(?:free|fast)\s+shipping\b/i, why: "câu quảng cáo vận chuyển" },
  // Giọng văn trợ lý AI: những cụm gần như không bao giờ xuất hiện khi một người
  // bán hàng Việt Nam tự gõ tên mặt hàng, nhưng lại rất hay lọt ra từ công cụ sinh chữ.
  { pattern: /\b(?:discover|introducing|experience|unleash|elevate|effortless)\b/i, why: "giọng văn quảng cáo kiểu AI" },
  { pattern: /\b(?:perfect|ideal)\s+(?:for|choice)\b/i, why: "câu quảng cáo “perfect for/ideal choice”" },
  { pattern: /\byour\s+(?:perfect|ideal|trusted|premier)\b/i, why: "câu quảng cáo “your perfect/trusted…”" },
  { pattern: /\b(?:indulge|delight|savor|savour)\b/i, why: "giọng văn quảng cáo kiểu AI" },
  { pattern: /\bcrafted\s+(?:with|by|to)\b/i, why: "câu quảng cáo “crafted…”" },
  { pattern: /\bgame[\s-]*chang/i, why: "câu quảng cáo “game-changing”" },
  { pattern: /\b(?:must[\s-]*have|look\s+no\s+further)\b/i, why: "câu quảng cáo sáo rỗng" },
  // Tiếng Việt: nhà cung cấp Việt gõ tên bằng tiếng Việt nhiều hơn tiếng Anh, nên
  // phần lớn từ tự khen thực tế rơi vào nhóm dưới đây. Chỉ áp cho tên hàng, không
  // áp cho mô tả. Dùng `\p{L}` thay cho `\b`: ranh giới từ của JS chỉ hiểu chữ
  // ASCII, nên `\b` đứng cạnh "đ", "ỉ", "ấ" sẽ không bao giờ khớp.
  { pattern: /(?<!\p{L})cao\s*cấp(?!\p{L})/iu, why: "từ tự khen “cao cấp”" },
  { pattern: /(?<!\p{L})chất\s*lượng\s*(?:cao|tốt|hàng\s*đầu|số\s*1)(?!\p{L})/iu, why: "từ tự khen “chất lượng cao”" },
  { pattern: /(?<!\p{L})(?:tốt|rẻ|đẹp)\s*nhất(?!\p{L})/iu, why: "từ tự khen “tốt nhất/rẻ nhất”" },
  { pattern: /(?<!\p{L})(?:uy\s*tín|hàng\s*đầu|đẳng\s*cấp|số\s*1)(?!\p{L})/iu, why: "từ tự khen “uy tín/hàng đầu/số 1”" },
  { pattern: /(?<!\p{L})siêu\s*(?:phẩm|hot|rẻ|khuyến\s*mãi)(?!\p{L})/iu, why: "câu quảng cáo “siêu phẩm/siêu hot”" },
  { pattern: /(?<!\p{L})giá\s*(?:sỉ|gốc|tận\s*gốc|rẻ)(?!\p{L})/iu, why: "câu quảng cáo về giá" },
  { pattern: /(?<!\p{L})(?:hot|bán\s*chạy)(?:\s*nhất)?(?!\p{L})/iu, why: "câu quảng cáo “hot/bán chạy”" },
  { pattern: /(?<!\p{L})miễn\s*phí\s*(?:vận\s*chuyển|giao\s*hàng)(?!\p{L})/iu, why: "câu quảng cáo vận chuyển" },
];

export interface DisplayNameWarning {
  code: "too-long" | "punctuation" | "ai-phrasing" | "many-grades" | "company-name" | "shouting" | "slashes";
  /** Câu giải thích hiển thị dưới ô nhập. */
  message: string;
}

const WARNING_TEXT: Record<DisplayNameWarning["code"], string> = {
  "too-long": `Tên dài hơn ${DISPLAY_NAME_RECOMMENDED_MAX} ký tự. Người mua chỉ đọc được phần đầu trên kết quả tìm kiếm; hãy chuyển các chi tiết còn lại xuống phần Quy cách.`,
  punctuation: "Tên đang có ký tự trình bày (gạch dài, dấu nháy cong, emoji, ký tự trang trí). Dùng chữ thường và dấu phẩy cho tự nhiên.",
  "ai-phrasing": "Tên có cụm từ quảng cáo kiểu máy viết. Nêu đúng mặt hàng và quy cách, bỏ phần tự khen.",
  "many-grades": "Tên đang ghi nhiều grade. Mỗi grade là một dòng trong bảng Grade & giá; tên chỉ nên nêu grade chính.",
  "company-name": "Tên đang chứa tên công ty. Tên công ty đã hiện ở hồ sơ nhà cung cấp, không cần lặp trong tên hàng.",
  shouting: "Tên đang viết hoa toàn bộ. Viết hoa chữ đầu như một tên hàng bình thường sẽ dễ đọc hơn.",
  slashes: "Tên đang liệt kê bằng dấu “/”. Dùng dấu phẩy để người đọc tách được từng ý.",
};

/** Grade dạng mã: W320, WW180, 550 g/l, AA, FAQ… */
const CODE_GRADE = /\b(?:[A-Z]{1,3}\d{2,3}|W{1,2}\d{2,3}|\d{2,3}\s*g\/[lL]|AA|FAQ)\b/g;
/** Grade dạng chữ sau từ khoá nhận biết. */
const WORD_GRADE = /\bgrade\s+[A-Z0-9]{1,3}\b/gi;

/**
 * Soát tên hiển thị và trả về danh sách cảnh báo (không viết lại tên).
 *
 * `supplierNames` là tên/tên giao dịch của chính nhà cung cấp, để phát hiện việc
 * lặp tên công ty trong tên hàng.
 */
export function displayNameWarnings(
  value: string | null | undefined,
  options: { supplierNames?: Array<string | null | undefined>; categoryLabel?: string | null } = {},
): DisplayNameWarning[] {
  const raw = (value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return [];

  const warnings: DisplayNameWarning[] = [];
  const push = (code: DisplayNameWarning["code"]) => {
    if (!warnings.some((item) => item.code === code)) warnings.push({ code, message: WARNING_TEXT[code] });
  };

  if (raw.length > DISPLAY_NAME_RECOMMENDED_MAX) push("too-long");

  const noise = TYPOGRAPHIC_NOISE.find((rule) => rule.pattern.test(raw));
  if (noise) {
    warnings.push({ code: "punctuation", message: `Tên đang có ${noise.why}. Dùng chữ thường và dấu phẩy cho tự nhiên.` });
  }

  const ai = AI_PHRASING.find((rule) => rule.pattern.test(raw));
  if (ai) {
    warnings.push({ code: "ai-phrasing", message: `Tên có ${ai.why}. Nêu đúng mặt hàng và quy cách, bỏ phần tự khen.` });
  }

  // Nhiều grade: chỉ tính khi đếm được từ hai mã trở lên, và bỏ các mã trùng nhau
  // (một tên lặp lại "W320, W320" là lỗi gõ, không phải nhiều grade).
  const grades = new Set<string>();
  for (const match of raw.matchAll(CODE_GRADE)) grades.add(match[0].replace(/\s+/g, "").toUpperCase());
  for (const match of raw.matchAll(WORD_GRADE)) grades.add(match[0].replace(/\s+/g, " ").toUpperCase());
  if (grades.size >= 3) push("many-grades");

  // Dấu "/" chỉ đáng cảnh báo khi nó nối một danh sách grade (W320/W240/W180).
  // Đơn vị đo tự nhiên như "550 g/l", "1.2 kg/m3" hay "MT/month" thì bỏ qua.
  const withoutUnitSlashes = raw.replace(
    /\b(g|kg|mg|mt|t|l|ml|m3|cm|mm|ha|day|days|month|months|week|weeks|ton|tons)\s*\/\s*(g|kg|mg|mt|t|l|ml|m3|cm|mm|ha|day|days|month|months|week|weeks|ton|tons)\b/gi,
    "",
  );
  if ((withoutUnitSlashes.match(/\//g) ?? []).length >= 1) push("slashes");

  const companyNames = (options.supplierNames ?? [])
    .map((name) => (name ?? "").replace(/\s+/g, " ").trim())
    .filter((name) => name.length >= 6);
  const lower = raw.toLowerCase();
  if (companyNames.some((name) => lower.includes(name.toLowerCase()))) push("company-name");

  // Viết hoa toàn bộ: chỉ tính khi tên đủ dài để không bắt nhầm một mã grade.
  const letters = raw.replace(/[^A-Za-zÀ-ỹ]/g, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) push("shouting");

  return warnings;
}

/** true khi tên hiển thị đã đạt, dùng cho huy hiệu "Tên đã ổn" trong form. */
export function displayNameLooksClean(value: string | null | undefined,
  options?: Parameters<typeof displayNameWarnings>[1]): boolean {
  return displayNameWarnings(value, options).length === 0;
}

/**
 * Tên hiển thị có cần nhân viên duyệt xem lại không. Dùng ở hàng đợi duyệt CRM:
 * chỉ cần một cảnh báo là đủ để đưa vào danh sách "nên sửa", nhưng KHÔNG chặn duyệt.
 */
export function displayNameNeedsReview(value: string | null | undefined,
  options?: Parameters<typeof displayNameWarnings>[1]): boolean {
  return !displayNameLooksClean(value, options);
}
