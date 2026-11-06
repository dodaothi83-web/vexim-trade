/**
 * Mẫu gợi ý cho ô "Quy cách / tiêu chuẩn" theo ngành hàng: danh sách mục người mua cần so sánh,
 * để nhà cung cấp ghi đủ và đúng thông số thay vì một câu mô tả chung chung.
 *
 * - `fields`: nút "Dùng mẫu gợi ý" chèn các dòng "Mục: " để nhà cung cấp điền số liệu thật.
 * - `example`: chữ mờ trong ô, một ví dụ đã điền đủ cho ngành hàng đó.
 * Khớp theo slug danh mục (vd. cashew-kernels khớp "cashew"); ngành khác dùng mẫu chung.
 */
export type SpecTemplateLang = "vi" | "en";
export interface SpecTemplate { fields: string[]; example: string }

type Pair = Record<SpecTemplateLang, SpecTemplate>;

const GENERIC: Pair = {
  vi: {
    fields: ["Grade / kích cỡ", "Độ ẩm tối đa", "Tạp chất, hàng lỗi tối đa", "Màu sắc, mùi vị", "Tiêu chuẩn áp dụng", "Quy cách đóng gói"],
    example: "Grade / kích cỡ: Loại 1, 8-10 mm\nĐộ ẩm tối đa: 12%\nTạp chất, hàng lỗi tối đa: 1%\nMàu sắc, mùi vị: đặc trưng, không mốc\nTiêu chuẩn áp dụng: TCVN, ISO 22000\nQuy cách đóng gói: bao PP 25 kg",
  },
  en: {
    fields: ["Grade / size", "Max moisture", "Max foreign matter / defects", "Colour, taste and smell", "Applied standard", "Packing"],
    example: "Grade / size: Grade 1, 8-10 mm\nMax moisture: 12%\nMax foreign matter / defects: 1%\nColour, taste and smell: natural, no mould\nApplied standard: ISO 22000\nPacking: 25 kg PP bag",
  },
};

const BY_CATEGORY: { match: RegExp; template: Pair }[] = [
  { match: /cashew/, template: {
    vi: { fields: ["Grade (W180, W240, W320...)", "Độ ẩm tối đa", "Hạt vỡ, hạt lỗi tối đa", "Màu sắc", "Tiêu chuẩn (AFI, Vinacas)", "Quy cách đóng gói"],
      example: "Grade: W320\nĐộ ẩm tối đa: 5%\nHạt vỡ, hạt lỗi tối đa: 5%\nMàu sắc: trắng ngà\nTiêu chuẩn: AFI\nQuy cách đóng gói: thùng carton hút chân không 22,68 kg" },
    en: { fields: ["Grade (W180, W240, W320...)", "Max moisture", "Max broken / defects", "Colour", "Standard (AFI, Vinacas)", "Packing"],
      example: "Grade: W320\nMax moisture: 5%\nMax broken / defects: 5%\nColour: white to ivory\nStandard: AFI\nPacking: 22.68 kg vacuum carton" } } },
  { match: /pepper/, template: {
    vi: { fields: ["Loại (đen, trắng), dung trọng (g/l)", "Độ ẩm tối đa", "Tạp chất tối đa", "Hạt lép, hạt nhẹ tối đa", "Tiêu chuẩn (ASTA, ESA)", "Quy cách đóng gói"],
      example: "Loại: tiêu đen 550 g/l\nĐộ ẩm tối đa: 13%\nTạp chất tối đa: 0,5%\nHạt lép, hạt nhẹ tối đa: 2%\nTiêu chuẩn: ASTA\nQuy cách đóng gói: bao PP 50 kg" },
    en: { fields: ["Type (black, white), density (g/l)", "Max moisture", "Max foreign matter", "Max light berries", "Standard (ASTA, ESA)", "Packing"],
      example: "Type: black pepper 550 g/l\nMax moisture: 13%\nMax foreign matter: 0.5%\nMax light berries: 2%\nStandard: ASTA\nPacking: 50 kg PP bag" } } },
  { match: /coffee/, template: {
    vi: { fields: ["Loại (Robusta, Arabica), sàng (S16, S18)", "Độ ẩm tối đa", "Hạt đen, hạt vỡ tối đa", "Tạp chất tối đa", "Tiêu chuẩn (TCVN 4193)", "Quy cách đóng gói"],
      example: "Loại: Robusta, sàng S18\nĐộ ẩm tối đa: 12,5%\nHạt đen, hạt vỡ tối đa: 2%\nTạp chất tối đa: 0,5%\nTiêu chuẩn: TCVN 4193\nQuy cách đóng gói: bao đay 60 kg" },
    en: { fields: ["Type (Robusta, Arabica), screen (S16, S18)", "Max moisture", "Max black / broken beans", "Max foreign matter", "Standard (TCVN 4193)", "Packing"],
      example: "Type: Robusta, screen 18\nMax moisture: 12.5%\nMax black / broken beans: 2%\nMax foreign matter: 0.5%\nStandard: TCVN 4193\nPacking: 60 kg jute bag" } } },
  { match: /rice/, template: {
    vi: { fields: ["Loại gạo, tỷ lệ tấm", "Độ ẩm tối đa", "Hạt bạc bụng tối đa", "Hạt vàng, hạt đỏ tối đa", "Chiều dài hạt trung bình", "Quy cách đóng gói"],
      example: "Loại gạo: ST25, tấm 5%\nĐộ ẩm tối đa: 14%\nHạt bạc bụng tối đa: 3%\nHạt vàng, hạt đỏ tối đa: 0,5%\nChiều dài hạt trung bình: 7 mm\nQuy cách đóng gói: bao PP 25 kg" },
    en: { fields: ["Rice type, broken ratio", "Max moisture", "Max chalky kernels", "Max yellow / red kernels", "Average grain length", "Packing"],
      example: "Rice type: ST25, 5% broken\nMax moisture: 14%\nMax chalky kernels: 3%\nMax yellow / red kernels: 0.5%\nAverage grain length: 7 mm\nPacking: 25 kg PP bag" } } },
  { match: /cinnamon|cassia/, template: {
    vi: { fields: ["Dạng (ống, bẻ, bột), độ dài", "Hàm lượng dầu", "Độ ẩm tối đa", "Tạp chất tối đa", "Quy cách đóng gói"],
      example: "Dạng: quế ống, dài 30-35 cm\nHàm lượng dầu: 3%\nĐộ ẩm tối đa: 13,5%\nTạp chất tối đa: 1%\nQuy cách đóng gói: thùng carton 10 kg" },
    en: { fields: ["Form (stick, broken, powder), length", "Oil content", "Max moisture", "Max foreign matter", "Packing"],
      example: "Form: cassia stick, 30-35 cm\nOil content: 3%\nMax moisture: 13.5%\nMax foreign matter: 1%\nPacking: 10 kg carton" } } },
  { match: /anise/, template: {
    vi: { fields: ["Dạng (nguyên bông, gãy), mùa vụ", "Độ ẩm tối đa", "Bông gãy tối đa", "Tạp chất tối đa", "Quy cách đóng gói"],
      example: "Dạng: hồi nguyên bông, vụ thu\nĐộ ẩm tối đa: 13%\nBông gãy tối đa: 5%\nTạp chất tối đa: 1%\nQuy cách đóng gói: thùng carton 10 kg" },
    en: { fields: ["Form (whole, broken), crop season", "Max moisture", "Max broken stars", "Max foreign matter", "Packing"],
      example: "Form: whole star anise, autumn crop\nMax moisture: 13%\nMax broken stars: 5%\nMax foreign matter: 1%\nPacking: 10 kg carton" } } },
];

export function specTemplateFor(categorySlug: string | null | undefined, lang: SpecTemplateLang): SpecTemplate {
  const slug = (categorySlug ?? "").toLowerCase();
  return (BY_CATEGORY.find((entry) => entry.match.test(slug))?.template ?? GENERIC)[lang];
}

/** Nội dung chèn vào ô khi bấm "Dùng mẫu gợi ý": mỗi mục một dòng, chờ điền số liệu. */
export function specTemplateText(template: SpecTemplate): string {
  return template.fields.map((field) => `${field}: `).join("\n");
}

/**
 * Bỏ các dòng mẫu chưa điền ("Màu sắc: " không có giá trị) trước khi lưu, để người mua
 * không thấy các mục trống. Dòng nhà cung cấp tự viết, có giá trị, giữ nguyên.
 */
export function stripEmptySpecLines(value: string): string {
  return value.split(/\r?\n/).filter((line) => !/^[^:\n]{1,80}:\s*$/.test(line)).join("\n").trim();
}
