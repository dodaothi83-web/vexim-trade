/**
 * Quy tắc phong cách cho nội dung AI soạn hộ và bộ lọc làm sạch đầu ra.
 *
 * Mục tiêu: văn bản đọc như người trong ngành tự viết, không lộ dấu vết AI.
 * Hai lớp bảo vệ: prompt yêu cầu phong cách này, và sanitizeDraftText lọc
 * lại đầu ra trước khi điền vào form, phòng trường hợp mô hình vẫn vi phạm.
 */

export const HUMAN_STYLE_RULES = [
  "Write the way an experienced trade editor would: plain, direct, concrete.",
  "Never use em dashes or en dashes. Use commas, periods or shorter sentences instead.",
  "No markdown, no HTML, no bullet points, no headings, no emojis, no bold or italic markers.",
  "Avoid stock AI phrasing such as \"in today's market\", \"when it comes to\", \"look no further\", \"delve\", \"furthermore\", \"moreover\", \"in conclusion\", \"boasts\", \"nestled\", \"vibrant\", \"robust\", \"seamless\", \"cutting-edge\" or \"game-changer\".",
  "Vary sentence length naturally. Prefer specific facts over adjectives. Do not oversell.",
].join(" ");

/** Làm sạch bản nháp AI trước khi điền vào bất kỳ ô nội dung nào. */
export function sanitizeDraftText(raw: string, maxChars = 4000): string {
  let text = raw.replace(/\r\n?/g, "\n");
  // Bỏ ký hiệu markdown thường gặp.
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/^\s*[-+•]\s+/gm, "");
  text = text.replace(/^\s*\d+[.)]\s+/gm, "");
  // Bỏ emoji và ký hiệu trang trí.
  text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "");
  // Tuyệt đối không dùng dấu gạch ngang dài trong nội dung cho buyer.
  text = text.replace(/\s*[—–]\s*/g, ", ");
  text = text.replace(/,{2,}/g, ",");
  // Bỏ dấu ngoặc kép bọc ngoài và gom khoảng trắng thừa.
  text = text.trim().replace(/^["“”']+|["“”']+$/g, "");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.split("\n").map((line) => line.trim()).join("\n");
  return text.slice(0, maxChars).trim();
}
