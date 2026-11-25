/**
 * Tách "mặt hàng" ngắn gọn khỏi lời nhắn người mua tự viết.
 *
 * Form RFQ chung chỉ có một ô mô tả, nên người mua thường gõ cả một lá thư ("Hello, I am looking
 * for wholesale suppliers of ... Please let me know: 1. ..."). Ô "Mặt hàng" trong CRM và tiêu đề
 * email cần tên hàng, còn nguyên văn lá thư là yêu cầu của người mua. Hàm chỉ cắt câu chào và câu
 * dẫn tiếng Anh phổ biến, không đoán thêm thông tin; không nhận ra mẫu nào thì giữ dòng đầu.
 */

const TITLE_MAX = 90;
/** Ngắn hơn mức này, một dòng, không có câu chào: coi là tên hàng sẵn rồi. */
const PLAIN_TITLE_MAX = 100;

const GREETING = /^(?:hello|hi|hey|dear(?:\s+(?:sir|sirs|madam|team|supplier|suppliers|all))?(?:\s*\/\s*madam)?|good\s+(?:morning|afternoon|evening|day)|greetings)\b[\s,!.:;-]*/i;
const LEAD_IN = /^(?:(?:(?:i|we)\s*(?:am|are|'m|'re)?\s*)?(?:currently\s+)?(?:looking|searching|seeking)\s+(?:for\s+)?|(?:i|we)\s+(?:would\s+like|want|wish|need|are\s+interested|am\s+interested)\s+(?:to\s+(?:buy|purchase|import|source|order)\s+|in\s+(?:buying|purchasing|importing|sourcing)\s+|in\s+)?|(?:please\s+)?(?:quote|send\s+(?:me\s+|us\s+)?(?:a\s+)?quotation)\s+(?:for\s+)?|(?:request(?:ing)?\s+(?:a\s+)?(?:quote|quotation)\s+for\s+))/i;
const SUPPLIER_OF = /^(?:a\s+|an\s+)?(?:reliable\s+|wholesale\s+|bulk\s+|trusted\s+|good\s+|direct\s+|vietnamese\s+)*(?:suppliers?|manufacturers?|exporters?|factories|factory|producers?|vendors?|sources?)\s+(?:of|for)\s+/i;
/** Câu dẫn tiếng Việt: "Tôi cần mua ...", "Bên mình đang tìm nguồn ...". */
const VI_LEAD_IN = /^(?:tôi|chúng tôi|bên (?:tôi|mình|em)|mình|em|công ty (?:tôi|chúng tôi|mình))\s+(?:đang\s+|muốn\s+)?(?:cần|muốn|tìm|có nhu cầu)\s+(?:mua|nhập|nhập khẩu|tìm|tìm nguồn|tìm nhà cung cấp)?\s*/i;
const QUANTITY_LEAD = /^(?:to\s+(?:buy|purchase|import)\s+)?(?:wholesale\s+|bulk\s+)/i;

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

/** Câu đầu tiên của dòng đầu (cắt ở ". ", "? ", "! "). */
function firstSentence(line: string): string {
  const match = line.match(/^(.+?[.?!])(?:\s|$)/);
  return (match ? match[1] : line).trim();
}

/** Mô tả người mua viết có phải một lá thư dài (cần tách) hay chỉ là tên hàng. */
export function isBuyerLetter(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  return value.length > PLAIN_TITLE_MAX || /\r?\n/.test(value) || GREETING.test(value);
}

/** Tên mặt hàng ngắn gọn để hiển thị trong CRM và tiêu đề email. */
export function buyerProductTitle(text: string | null | undefined): string {
  const value = (text ?? "").trim();
  if (!value) return "";
  if (!isBuyerLetter(value)) return value;
  // Câu chào đứng riêng một dòng ("Hello,") thì bỏ qua để lấy dòng có nội dung.
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const contentLine = lines.find((line) => line.replace(GREETING, "").trim().length > 0) ?? lines[0] ?? "";
  let sentence = firstSentence(contentLine.replace(GREETING, "").trim());
  const before = sentence;
  sentence = sentence.replace(VI_LEAD_IN, "").replace(LEAD_IN, "").replace(SUPPLIER_OF, "").replace(QUANTITY_LEAD, "").replace(SUPPLIER_OF, "");
  sentence = sentence.replace(/[\s.?!,;:]+$/, "").trim();
  if (!sentence) sentence = firstSentence(firstLine(value)).replace(/[\s.?!,;:]+$/, "");
  // Câu dài liệt kê nhiều ý ("frozen pangasius fillets, 20 tons per month, BRC ..."): giữ ý đầu.
  if (sentence.length > 60) {
    const head = sentence.split(/,\s+/)[0]?.trim() ?? "";
    if (head.length >= 3) sentence = head;
  }
  return clip(capitalize(sentence || before), TITLE_MAX);
}

/**
 * Nguyên văn yêu cầu của người mua, chỉ khi nó dài hơn tên hàng (là một lá thư). Tên hàng ngắn
 * thì không có lời nhắn riêng.
 */
export function buyerRequestMessage(text: string | null | undefined): string | null {
  const value = (text ?? "").trim();
  return isBuyerLetter(value) ? value.replace(/\r\n/g, "\n") : null;
}

/**
 * Tên hàng và yêu cầu của một hồ sơ người mua. Hồ sơ cũ có thể còn cả lá thư trong "Mặt hàng":
 * tên hàng rút gọn, lá thư nối sau quy cách để không mất thông tin. Không sửa dữ liệu đã lưu.
 */
export function buyerOrderSummary(buyer: { product?: string | null; spec?: string | null }): {
  title: string;
  request: string | null;
} {
  const request = [buyer.spec?.trim(), buyerRequestMessage(buyer.product)].filter(Boolean).join("\n\n");
  return { title: buyerProductTitle(buyer.product), request: request || null };
}

/** Nguồn người mua: đường dẫn kỹ thuật ("/rfq") đổi thành tên dễ hiểu, giữ nguyên giá trị lạ. */
export function buyerSourceLabel(source: string | null | undefined): string | null {
  const value = (source ?? "").trim();
  if (!value) return null;
  if (value === "/rfq" || value === "rfq_form") return "Form yêu cầu báo giá";
  if (value === "/sourcing" || value === "sourcing_request") return "Form tìm nguồn hàng";
  if (value.startsWith("/products/")) return "Trang sản phẩm";
  if (value.startsWith("/suppliers/")) return "Trang nhà cung cấp";
  return value;
}
