/**
 * Loại chứng nhận (scheme) — một trường riêng, không suy ra từ ô checklist L1.
 *
 * Ô L1 gộp nhiều chuẩn vào một mục ("HACCP / ISO 22000 / FSSC / BRC / Halal"), nên
 * không thể dùng `checklist_key` để lọc cho người mua: chọn HACCP sẽ trả cả ISO lẫn
 * BRC. Ở đây loại chứng nhận được đọc từ chính tên/tổ chức cấp trên giấy; nhân viên
 * sửa lại được nếu bộ đọc hiểu sai.
 *
 * Tệp không import gì để script kiểm tra nạp thẳng bằng Node.
 */

export const CERTIFICATE_SCHEMES = [
  { code: "haccp", label: "HACCP", vi: "HACCP" },
  { code: "iso_22000", label: "ISO 22000", vi: "ISO 22000" },
  { code: "fssc_22000", label: "FSSC 22000", vi: "FSSC 22000" },
  { code: "brc", label: "BRC", vi: "BRC" },
  { code: "ifs", label: "IFS", vi: "IFS" },
  { code: "iso_9001", label: "ISO 9001", vi: "ISO 9001" },
  { code: "gmp", label: "GMP", vi: "GMP" },
  { code: "halal", label: "Halal", vi: "Halal" },
  { code: "kosher", label: "Kosher", vi: "Kosher" },
  { code: "organic", label: "Organic", vi: "Hữu cơ" },
  { code: "fda", label: "FDA", vi: "FDA" },
  { code: "globalgap", label: "GlobalG.A.P.", vi: "GlobalG.A.P." },
  { code: "rainforest", label: "Rainforest Alliance", vi: "Rainforest Alliance" },
  { code: "food_safety", label: "Food safety", vi: "ATTP" },
  { code: "export_license", label: "Export licence", vi: "Giấy phép xuất khẩu" },
  { code: "origin", label: "Certificate of origin", vi: "C/O" },
  { code: "phytosanitary", label: "Phytosanitary", vi: "Kiểm dịch thực vật" },
  { code: "other", label: "Other", vi: "Khác" },
] as const;

export type CertificateScheme = (typeof CERTIFICATE_SCHEMES)[number]["code"];

/** Giá trị gửi từ form/CSDL có thể là chuỗi lạ; chỉ nhận mã đã khai. */
export function isCertificateScheme(value: unknown): value is CertificateScheme {
  return typeof value === "string" && CERTIFICATE_SCHEMES.some((item) => item.code === value);
}

export function certificateSchemeLabel(code: string | null | undefined, language: "en" | "vi" = "en"): string | null {
  if (!code) return null;
  const found = CERTIFICATE_SCHEMES.find((item) => item.code === code);
  if (!found) return null;
  return language === "vi" ? found.vi : found.label;
}

/** Bỏ dấu tiếng Việt, hạ chữ thường và gộp mọi dấu câu thành một khoảng trắng. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Từ khoá đọc từ chính giấy. Xếp theo thứ tự cụ thể trước chung sau để "ISO 22000"
 * không bị "ISO" chung làm nhiễu, và "BRCGS" vẫn vào BRC.
 */
const PATTERNS: Array<{ code: CertificateScheme; tests: RegExp[] }> = [
  { code: "fssc_22000", tests: [/\bfssc\b/] },
  { code: "iso_22000", tests: [/\biso\s*22000\b/] },
  { code: "iso_9001", tests: [/\biso\s*9001\b/] },
  { code: "haccp", tests: [/\bhaccp\b/] },
  { code: "brc", tests: [/\bbrcgs?\b/, /\bbrc\b/] },
  { code: "ifs", tests: [/\bifs\b/] },
  { code: "gmp", tests: [/\bgmp\b/] },
  { code: "halal", tests: [/\bhalal\b/] },
  { code: "kosher", tests: [/\bkosher\b/] },
  { code: "globalgap", tests: [/\bglobal\s*gap\b/, /\bglobalg\b/, /\bggap\b/] },
  { code: "rainforest", tests: [/\brainforest\b/] },
  { code: "organic", tests: [/\borganic\b/, /\bhuu co\b/] },
  { code: "fda", tests: [/\bfda\b/] },
  { code: "phytosanitary", tests: [/\bphytosanitary\b/, /\bkiem dich thuc vat\b/] },
  { code: "origin", tests: [/\bcertificate of origin\b/, /\bgiay chung nhan xuat xu\b/, /\bc o\b/] },
  { code: "export_license", tests: [/\bexport licen[cs]e\b/, /\bgiay phep xuat khau\b/] },
  { code: "food_safety", tests: [/\battp\b/, /\ban toan thuc pham\b/, /\bfood safety\b/] },
];

/**
 * Đọc loại chứng nhận từ tên giấy, tổ chức cấp và số giấy.
 *
 * Chỉ trả về khi chính văn bản trên giấy có tên chuẩn đó — không đoán theo ô checklist
 * và không đoán theo ngành hàng. Không nhận ra thì để trống; giấy vẫn hiển thị bình
 * thường, chỉ không tham gia bộ lọc theo chuẩn.
 */
export function detectCertificateScheme(input: {
  name?: string | null;
  issuer?: string | null;
  number?: string | null;
}): CertificateScheme | null {
  const text = normalize([input.name, input.issuer, input.number].filter(Boolean).join(" "));
  if (!text) return null;
  for (const pattern of PATTERNS) {
    if (pattern.tests.some((test) => test.test(text))) return pattern.code;
  }
  return null;
}
