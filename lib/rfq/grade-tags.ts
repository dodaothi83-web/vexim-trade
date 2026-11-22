/**
 * Gợi ý grade trên form RFQ chỉ được thuộc đúng ngành hàng người mua đang hỏi.
 *
 * Vì sao cần: grade gợi ý lấy theo DANH MỤC (lib/products/grade-pricing.ts →
 * standardGradesForCategory), nhưng có danh mục gộp nhiều ngành, ví dụ
 * "coffee-tea-specialty-beverages": slug khớp quy tắc "coffee" nên sản phẩm TRÀ trong đó cũng
 * nhận chip "Robusta G1 S18", "Arabica S16"… Hàm này lọc lại theo ngữ cảnh (tên sản phẩm đang
 * hỏi, hoặc mô tả người mua đã gõ) mà KHÔNG đổi danh sách grade dùng ở nơi khác (cổng NCC,
 * bảng giá).
 *
 * Quy tắc:
 *  - Grade mang dấu hiệu của một ngành (ví dụ "Robusta…" → cà phê) là grade "theo ngành";
 *    grade không mang dấu hiệu nào (W320, ST25, 550 g/L…) là trung tính và luôn giữ.
 *  - Ngữ cảnh nhắc tới ngành nào → chỉ giữ grade của (các) ngành đó.
 *  - Đang hỏi một sản phẩm cụ thể (`strict`) mà tên không nhắc ngành nào, trong khi danh mục
 *    (slug + grade) trải trên từ hai ngành → bỏ grade theo ngành: thà không gợi ý còn hơn gợi ý
 *    sai ngành. Danh mục một ngành thì giữ nguyên.
 *  - RFQ chung chưa gõ gì → giữ cả danh mục (người mua đã tự chọn danh mục đó).
 */
const FAMILIES: ReadonlyArray<{ key: string; words: RegExp }> = [
  { key: "coffee", words: /coffee|robusta|arabica|liberica|excelsa|peaberry|espresso/i },
  { key: "tea", words: /\bteas?\b|matcha|oolong|sencha|pekoe|\bF?BOP\b|\bCTC\b/i },
  { key: "cocoa", words: /cocoa|cacao/i },
  { key: "cinnamon", words: /cinnamon|cassia/i },
  { key: "anise", words: /anise|aniseed|illicium/i },
];

function familiesIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const family of FAMILIES) if (family.words.test(text)) found.add(family.key);
  return found;
}

function gradeFamily(grade: string): string | null {
  return FAMILIES.find((family) => family.words.test(grade))?.key ?? null;
}

export function relevantGradeTags(
  grades: readonly string[],
  {
    categorySlug,
    context,
    strict = false,
  }: { categorySlug?: string | null; context: string | null | undefined; strict?: boolean },
): string[] {
  const mentioned = familiesIn(context ?? "");
  const scope = familiesIn(categorySlug ?? "");
  // Nhóm nhỏ một ngành (ví dụ "tea" tách từ "Cà phê, Trà & Đồ uống") có thể còn grade
  // ngành kia chép từ danh mục cha: chỉ giữ grade đúng ngành của nhóm nhỏ.
  const own = mentioned.size === 0 && scope.size === 1 ? [...scope][0] : null;
  for (const grade of grades) {
    const family = gradeFamily(grade);
    if (family) scope.add(family);
  }
  return grades.filter((grade) => {
    const family = gradeFamily(grade);
    if (!family) return true;
    if (own) return family === own;
    if (mentioned.size > 0) return mentioned.has(family);
    return !(strict && scope.size >= 2);
  });
}
