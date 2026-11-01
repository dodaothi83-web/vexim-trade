/**
 * Loại chứng nhận (scheme) — trường riêng, không suy ra từ checklist xác thực GCN ĐKKD.
 *
 * Các `checklist_key` cũ được giữ để đọc lịch sử và nhóm bản ghi trong bảng chứng nhận;
 * chúng không quyết định hoặc thay thế kết quả xác thực doanh nghiệp. Ở đây loại giấy
 * được đọc từ tên/tổ chức cấp trên giấy; nhân viên sửa lại được nếu bộ đọc hiểu sai.
 *
 * Mỗi loại có `kind` quyết định đường ra của giấy:
 *  - `legal`    — giấy pháp lý (GPKD, ATTP cơ sở, phép xuất khẩu): lưu/xét trong kho
 *                 chứng nhận riêng, không bao giờ gắn sản phẩm hoặc lên chip chất lượng.
 *  - `quality`  — chứng nhận chất lượng: gán phạm vi → badge + chip sau khi duyệt riêng.
 *  - `shipment` — giấy theo lô (C/O, kiểm dịch, phiếu kiểm nghiệm): để dành cho đơn
 *                 hàng/RFQ, không gắn sản phẩm, không lên chip.
 *  - `other`    — chưa xếp được: hiện trên hồ sơ, không lên chip.
 *
 * Tệp không import gì để script kiểm tra nạp thẳng bằng Node.
 */

export type CertificateSchemeKind = "legal" | "quality" | "shipment" | "other";

export interface CertificateSchemeDef {
  code: string;
  label: string;
  vi: string;
  kind: CertificateSchemeKind;
  /** Có được lên chip lọc cho người mua không. */
  chip: boolean;
}

export const CERTIFICATE_SCHEMES = [
  /* --- Pháp lý: tính vào L1, không gắn sản phẩm, không lên chip. --- */
  { code: "business_license", label: "Business registration", vi: "Đăng ký doanh nghiệp", kind: "legal", chip: false },
  { code: "food_safety", label: "Food safety certificate", vi: "ATTP", kind: "legal", chip: false },
  { code: "export_license", label: "Export licence", vi: "Giấy phép xuất khẩu", kind: "legal", chip: false },

  /* --- Giấy theo lô: để dành cho đơn hàng/RFQ, không lên chip. --- */
  { code: "origin", label: "Certificate of origin", vi: "C/O", kind: "shipment", chip: false },
  { code: "phytosanitary", label: "Phytosanitary", vi: "Kiểm dịch thực vật", kind: "shipment", chip: false },
  { code: "inspection_report", label: "Inspection report", vi: "Phiếu kiểm nghiệm", kind: "shipment", chip: false },

  /* --- Chứng nhận chất lượng: gán phạm vi → badge + chip. --- */
  { code: "haccp", label: "HACCP", vi: "HACCP", kind: "quality", chip: true },
  { code: "iso_22000", label: "ISO 22000", vi: "ISO 22000", kind: "quality", chip: true },
  { code: "fssc_22000", label: "FSSC 22000", vi: "FSSC 22000", kind: "quality", chip: true },
  { code: "brc", label: "BRC", vi: "BRC", kind: "quality", chip: true },
  { code: "ifs", label: "IFS", vi: "IFS", kind: "quality", chip: true },
  { code: "iso_9001", label: "ISO 9001", vi: "ISO 9001", kind: "quality", chip: true },
  { code: "gmp", label: "GMP", vi: "GMP", kind: "quality", chip: true },
  { code: "globalgap", label: "GlobalG.A.P.", vi: "GlobalG.A.P.", kind: "quality", chip: true },
  { code: "halal", label: "Halal", vi: "Halal", kind: "quality", chip: true },
  { code: "kosher", label: "Kosher", vi: "Kosher", kind: "quality", chip: true },
  // Người mua EU và Mỹ cần loại hữu cơ khác nhau nên tách ngay từ đầu.
  { code: "organic_usda", label: "USDA Organic", vi: "Hữu cơ USDA", kind: "quality", chip: true },
  { code: "organic_eu", label: "EU Organic", vi: "Hữu cơ EU", kind: "quality", chip: true },
  { code: "organic_other", label: "Organic (other)", vi: "Hữu cơ (khác)", kind: "quality", chip: true },
  { code: "rainforest", label: "Rainforest Alliance", vi: "Rainforest Alliance", kind: "quality", chip: true },
  // FDA là đăng ký cơ sở, không phải chứng nhận: hiện nhãn cho đúng, không thành chip.
  { code: "fda", label: "FDA registered", vi: "FDA registered", kind: "quality", chip: false },

  { code: "other", label: "Other", vi: "Khác", kind: "other", chip: false },
] as const satisfies readonly CertificateSchemeDef[];

export type CertificateScheme = (typeof CERTIFICATE_SCHEMES)[number]["code"];

/**
 * Giá trị cũ `organic` (trước khi tách USDA/EU/khác) vẫn nằm trong dữ liệu đã phân
 * loại. Không tự đoán nó thuộc loại nào: coi như chưa phân loại để nhân viên tách,
 * nhờ vậy không gán sai loại hữu cơ cho người mua.
 */
export const LEGACY_CERTIFICATE_SCHEMES = ["organic"] as const;

/** Giá trị gửi từ form/CSDL có thể là chuỗi lạ; chỉ nhận mã đã khai. */
export function isCertificateScheme(value: unknown): value is CertificateScheme {
  return typeof value === "string" && CERTIFICATE_SCHEMES.some((item) => item.code === value);
}

export function certificateSchemeDef(code: string | null | undefined): CertificateSchemeDef | null {
  if (!code) return null;
  return CERTIFICATE_SCHEMES.find((item) => item.code === code) ?? null;
}

export function certificateSchemeLabel(code: string | null | undefined, language: "en" | "vi" = "en"): string | null {
  const found = certificateSchemeDef(code);
  if (!found) return null;
  return language === "vi" ? found.vi : found.label;
}

/** Nhóm đường ra của giấy; NULL/`other`/giá trị cũ đều là "chưa xếp được". */
export function certificateSchemeKind(code: string | null | undefined): CertificateSchemeKind {
  return certificateSchemeDef(code)?.kind ?? "other";
}

/** Giấy chất lượng đã xếp loại — chỉ nhóm này mới được gắn phạm vi sản phẩm. */
export function isScopeableCertificateScheme(code: string | null | undefined): boolean {
  return certificateSchemeKind(code) === "quality";
}

/** Loại được lên chip lọc cho người mua. */
export function isCertificateChipScheme(code: string | null | undefined): boolean {
  return Boolean(certificateSchemeDef(code)?.chip);
}

/** Danh sách mã lên chip, giữ đúng thứ tự hiển thị. */
export function chipCertificateSchemes(): CertificateScheme[] {
  return CERTIFICATE_SCHEMES.filter((item) => item.chip).map((item) => item.code);
}

/** Giấy chưa xếp được loại: NULL, "other" hoặc giá trị cũ `organic`. */
export function isUnclassifiedCertificateScheme(code: string | null | undefined): boolean {
  if (!code) return true;
  if (code === "other") return true;
  return (LEGACY_CERTIFICATE_SCHEMES as readonly string[]).includes(code);
}

/**
 * Khóa nhóm lịch sử mà một loại giấy chứng nhận đóng góp.
 *
 * Chỉ dùng để nhóm/đối chiếu bản ghi trong bảng chứng nhận; không ghi kết quả vào
 * checklist xác thực GCN ĐKKD và không làm giấy chứng nhận thành điều kiện duyệt L1.
 */
export function checklistKeyForScheme(code: string | null | undefined): string | null {
  switch (code) {
    case "business_license": return "business_license";
    case "food_safety": return "food_safety";
    case "export_license": return "export_license";
    case "haccp":
    case "iso_22000":
    case "fssc_22000":
    case "brc":
    case "ifs":
    case "iso_9001":
    case "gmp":
      return "haccp_or_brc";
    case "halal":
    case "kosher":
    case "organic_usda":
    case "organic_eu":
    case "organic_other":
    case "fda":
    case "globalgap":
    case "rainforest":
      return "product_certs";
    default:
      return null;
  }
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
 * không bị "ISO" chung làm nhiễu, và "BRCGS" vẫn vào BRC. Hữu cơ tách theo nguồn
 * chứng nhận ghi trên giấy; không nêu rõ thì để "hữu cơ (khác)".
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
  { code: "fda", tests: [/\bfda\b/] },
  { code: "inspection_report", tests: [/\binspection report\b/, /\bphieu kiem nghiem\b/, /\bcoa\b/] },
  { code: "phytosanitary", tests: [/\bphytosanitary\b/, /\bkiem dich thuc vat\b/] },
  { code: "origin", tests: [/\bcertificate of origin\b/, /\bgiay chung nhan xuat xu\b/, /\bc o\b/] },
  { code: "export_license", tests: [/\bexport licen[cs]e\b/, /\bgiay phep xuat khau\b/] },
  { code: "business_license", tests: [/\bgiay chung nhan dang ky doanh nghiep\b/, /\bma so doanh nghiep\b/] },
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
  // Hữu cơ: chỉ nhận khi giấy thật sự nói "organic"/"hữu cơ"; nguồn chứng nhận quyết
  // định loại, không nêu rõ thì để loại chung chứ không đoán EU/Mỹ.
  if (/\borganic\b/.test(text) || /\bhuu co\b/.test(text)) {
    if (/\busda\b/.test(text)) return "organic_usda";
    if (/\beu organic\b/.test(text) || /\bec\s*834\s*2007\b/.test(text)) return "organic_eu";
    return "organic_other";
  }
  return null;
}
