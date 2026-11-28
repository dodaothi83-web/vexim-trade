/**
 * Bảng thuật ngữ thương mại nông sản dùng chung cho mọi lượt AI dịch (sản phẩm, hồ sơ, A+, tin nhắn).
 * Chủ dự án duyệt 27/11/2026: mã grade, Incoterm, chứng nhận và tên hàng phải dịch thống nhất,
 * không bị "dịch nghĩa" sai (W320, 500 g/l, HACCP...). Thêm thuật ngữ mới ở đây, không rải trong prompt.
 */

/** Cặp thuật ngữ Việt ↔ Anh dịch cố định. */
export const TRADE_TERMS: ReadonlyArray<readonly [vi: string, en: string]> = [
  ["hạt điều nhân", "cashew kernels"],
  ["hạt điều thô", "raw cashew nuts"],
  ["điều rang muối", "roasted salted cashews"],
  ["hồ tiêu đen", "black pepper"],
  ["hồ tiêu trắng", "white pepper"],
  ["tiêu sọ", "white pepper"],
  ["cà phê nhân", "green coffee beans"],
  ["cà phê rang", "roasted coffee"],
  ["quế", "cassia"],
  ["quế ống", "cassia sticks"],
  ["hoa hồi", "star anise"],
  ["gạo", "rice"],
  ["dung trọng", "density (g/l)"],
  ["độ ẩm", "moisture"],
  ["tạp chất", "admixture"],
  ["hạt vỡ", "broken kernels"],
  ["đơn hàng tối thiểu", "minimum order quantity (MOQ)"],
  ["hàng mẫu", "samples"],
  ["thời gian giao hàng", "lead time"],
  ["cảng xuất", "port of loading"],
  ["điều kiện giao hàng", "Incoterm"],
  ["đặt cọc", "deposit"],
  ["thanh toán trước", "advance payment"],
  ["container 20 feet", "20ft container"],
  ["container 40 feet", "40ft container"],
  ["túi hút chân không", "vacuum bag"],
  ["bao PP", "PP bag"],
  ["bao đay", "jute bag"],
  ["thùng carton", "carton"],
  ["giấy chứng nhận xuất xứ", "certificate of origin (C/O)"],
  ["kiểm dịch thực vật", "phytosanitary certificate"],
  ["an toàn thực phẩm", "food safety"],
  ["nhãn riêng", "private label (OEM)"],
];

/**
 * Chữ giữ nguyên, không dịch, không viết lại: mã grade, Incoterm, tên chứng nhận, đơn vị.
 * Mẫu biểu thức để kiểm tra bản dịch còn giữ đủ các mã này.
 */
export const KEEP_AS_IS: readonly string[] = [
  "W180", "W210", "W240", "W320", "W450", "WS", "LP", "SP", "SW",
  "FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP",
  "HACCP", "ISO 22000", "FSSC 22000", "BRC", "BRCGS", "IFS", "Halal", "Kosher", "GlobalG.A.P.", "VietGAP", "USDA Organic", "EU Organic",
  "FDA", "GACC", "C/O", "B/L", "L/C", "T/T", "D/P", "MOQ", "OEM", "ODM", "ASTA", "FAQ",
  "MT", "kg", "g/l", "%",
];

/** Đoạn hướng dẫn chèn vào prompt dịch theo chiều cần dùng. */
export function glossaryInstructions(direction: "vi-en" | "en-vi"): string {
  const pairs = TRADE_TERMS.map(([vi, en]) => (direction === "vi-en" ? `${vi} = ${en}` : `${en} = ${vi}`)).join("; ");
  return [
    "Trade glossary (always use these renderings): " + pairs + ".",
    "Keep these exactly as written, never translate or expand them: " + KEEP_AS_IS.join(", ") + ".",
    "Keep every number, unit, price, currency, date and quantity exactly as in the source.",
  ].join("\n");
}

/** Các số trong một đoạn chữ (bỏ dấu phân cách nghìn), để so bản dịch với bản gốc. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")).sort();
}

/** Bản dịch giữ đủ mọi con số của bản gốc (thứ tự không quan trọng). */
export function sameNumbers(source: string, translation: string): boolean {
  const a = numbersIn(source); const b = numbersIn(translation);
  return a.length === b.length && a.every((n, i) => n === b[i]);
}
