/**
 * Thư phản hồi yêu cầu tìm nguồn (nút "AI viết tiếp cận" khi người mua đã gửi yêu cầu cho Vexim).
 *
 * Khung chữ cố định theo mẫu đã duyệt ngày 24/11/2026; không gọi model. Mọi ô lấy thẳng từ RFQ và
 * hồ sơ người mua: tên hàng ngắn, số lượng, nước nhận, câu khách hỏi, ô còn thiếu. Không có tên
 * hay giá nhà cung cấp. Chữ ký ("Best regards," + tên) do trình soạn tự thêm sau thân thư.
 */

export type SourcingReplyInput = {
  recipientName: string | null;
  rfqCode: string;
  /** Tên hàng ngắn (buyerProductTitle). */
  product: string;
  /** "200 kg" */
  quantity: string | null;
  destinationCountry: string | null;
  /** Nguyên văn người mua viết (để rút câu hỏi). */
  buyerText: string | null;
  has: { targetPrice: boolean; packaging: boolean; deliveryTerms: boolean; neededBy: boolean };
};

export type SourcingReplyLetter = { subject: string; body: string; questions: string[]; asks: string[]; words: number };

/** Cảng thường dùng, chỉ để làm ví dụ trong câu hỏi điều kiện giao. */
const EXAMPLE_PORT: Record<string, string> = {
  bangladesh: "Chittagong",
  india: "Nhava Sheva",
  pakistan: "Karachi",
  "united arab emirates": "Jebel Ali",
  uae: "Jebel Ali",
  "saudi arabia": "Jeddah",
  "united states": "Los Angeles",
  usa: "Los Angeles",
  "united kingdom": "Felixstowe",
  uk: "Felixstowe",
  germany: "Hamburg",
  netherlands: "Rotterdam",
  australia: "Sydney",
  japan: "Tokyo",
  "south korea": "Busan",
  korea: "Busan",
  china: "Shanghai",
  philippines: "Manila",
  malaysia: "Port Klang",
  indonesia: "Jakarta",
  egypt: "Alexandria",
  turkey: "Mersin",
};

function oneLine(value: string | null | undefined, max = 120): string {
  const text = (value ?? "").replace(/\s+/g, " ").replace(/\*+/g, "").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** "Do you have mixed fruit chips?" → "Availability of mixed fruit chips". */
export function questionTopic(question: string): string {
  let text = question.replace(/\s+/g, " ").trim().replace(/[?.!:;,\s]+$/, "");
  const rules: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^(?:do|does|can|could)\s+(?:you|your\s+\w+)\s+(?:have|sell|supply|stock|carry|offer|produce)\s+(.+)$/i, (m) => `Availability of ${m[1]}`],
    [/^(?:is|are)\s+(.+?)\s+available$/i, (m) => `Availability of ${m[1]}`],
    [/^(?:can|could)\s+you\s+(?:please\s+)?(?:provide|send|share|give|offer|quote)\s+(?:us\s+|me\s+)?(?:with\s+)?(?:your\s+|the\s+)?(.+)$/i, (m) => m[1]],
    [/^(?:please\s+)?(?:send|share|provide|give)\s+(?:us\s+|me\s+)?(?:your\s+|the\s+)?(.+)$/i, (m) => m[1]],
    [/^(?:what|which)\s+(?:is|are)\s+(?:your\s+|the\s+)?(.+)$/i, (m) => m[1]],
    [/^(?:how\s+much\s+is\s+)(?:your\s+|the\s+)?(.+)$/i, (m) => m[1]],
  ];
  for (const [pattern, fn] of rules) {
    const match = text.match(pattern);
    if (match) {
      text = fn(match);
      break;
    }
  }
  if (/^(?:product\s+)?(?:pictures?|photos?|images?)(?:\s+of\s+(?:the\s+|your\s+)?(?:products?|goods|items?))?$/i.test(text)) text = "Product pictures";
  return capitalize(text.replace(/^(?:your|the)\s+/i, ""));
}

/**
 * Câu hỏi người mua liệt kê: danh sách đánh số "1. … 2. …" (xuống dòng hay viết liền), không có
 * thì các câu kết thúc bằng "?". Tối đa 6 câu, bỏ trùng.
 */
export function extractBuyerQuestions(text: string | null | undefined): string[] {
  const value = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!value) return [];
  const items: string[] = [];
  const numbered = [...value.matchAll(/(?:^|[\s:;])(\d{1,2})\s*[.)]\s*(?=\S)/g)];
  // Một danh sách thật bắt đầu từ 1 và tăng dần.
  const run: RegExpMatchArray[] = [];
  for (const match of numbered) {
    const n = Number(match[1]);
    if (n === run.length + 1) run.push(match);
  }
  if (run.length >= 2) {
    run.forEach((match, i) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = i + 1 < run.length ? (run[i + 1].index ?? value.length) : value.length;
      // Mỗi mục chỉ lấy câu đầu: thư viết liền hay dính câu kết ("… pricing? I am interested in …").
      const line = value.slice(start, end).split("\n")[0].trim();
      const item = (line.match(/^.*?(?:\?|\.(?=\s|$))/)?.[0] ?? line).trim();
      if (item) items.push(item);
    });
  } else {
    for (const match of value.matchAll(/[^.?!\n]{6,}\?/g)) items.push(match[0].trim());
  }
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const item of items) {
    const topic = oneLine(questionTopic(item), 90);
    const key = topic.toLowerCase();
    if (topic.length < 3 || seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
    if (topics.length >= 6) break;
  }
  return topics;
}

export function buildSourcingReplyLetter(input: SourcingReplyInput): SourcingReplyLetter {
  const name = oneLine(input.recipientName, 60);
  const greetingName = name ? capitalize(name.split(/\s+/)[0]) : "";
  const product = oneLine(input.product, 90) || "your product";
  const quantity = oneLine(input.quantity, 40);
  const country = oneLine(input.destinationCountry, 60);
  const questions = extractBuyerQuestions(input.buyerText);

  const port = EXAMPLE_PORT[country.toLowerCase()];
  const asks: string[] = [];
  const priceUnit = /\b(?:mt|tons?|tonnes?)\b/i.test(quantity) ? "MT" : "kg";
  if (!input.has.targetPrice) asks.push(`Your target price per ${priceUnit}`);
  if (!input.has.packaging) asks.push("Packaging you need (bag size, retail pack or bulk carton)");
  if (!input.has.deliveryTerms) asks.push(`Delivery terms and port (for example CIF ${port ?? "and your nearest port"})`);
  if (!input.has.neededBy) asks.push("When you need the goods");

  const request = [product, quantity, country ? `delivered to ${country}` : ""].filter(Boolean).join(", ");
  const paragraphs = [
    greetingName ? `Dear ${greetingName},` : "Dear Sir or Madam,",
    `Thank you for your request for ${request}. Our sourcing team is now contacting suitable Vietnamese suppliers for you.`,
  ];
  if (questions.length) {
    paragraphs.push(["You asked about:", ...questions.map((q, i) => `${i + 1}. ${q}`)].join("\n"));
  }
  const answer = questions.length ? "We will answer these with each supplier quote." : "";
  if (asks.length) {
    paragraphs.push(`${answer ? `${answer} ` : ""}To get accurate prices, could you tell us:`);
    paragraphs.push(asks.map((a) => `- ${a}`).join("\n"));
  } else if (answer) {
    paragraphs.push(answer);
  }
  paragraphs.push("You will see each quote in your Vexim Trade account. Just reply to this email with any details.");

  const body = paragraphs.join("\n\n");
  return {
    subject: `Your request ${input.rfqCode}: ${oneLine(product, 70)}`,
    body,
    questions,
    asks,
    words: body.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length,
  };
}
