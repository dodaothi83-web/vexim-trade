// Kiểu chữ của tên nhà cung cấp khi hiện cho người mua. Không phụ thuộc module nào
// để guard chạy thẳng hàm này bằng node.
/**
 * Tên doanh nghiệp thường được nhập theo giấy đăng ký kinh doanh, tức viết hoa toàn bộ.
 * Đọc trên thẻ nhà cung cấp thì thành một khối chữ hoa nặng mắt và cao hơn hẳn tên đã
 * nhập đúng kiểu, làm các thẻ lệch chiều cao. Hàm này chỉ hạ kiểu chữ, không đổi nội dung:
 * tên đã có chữ thường thì giữ nguyên từng chữ người bán đã gõ.
 */
const KEEP_UPPER_WORDS = new Set([
  "TNHH", "MTV", "CP", "ISO", "HACCP", "GMP", "HALAL", "FDA", "BRC", "FSSC", "USDA", "EU", "UK", "USA", "UAE",
]);

export function supplierNameCase(name: string): string {
  const text = name.replace(/\s+/g, " ").trim();
  if (!text || text !== text.toUpperCase()) return text;
  return text.split(" ").map((word) => {
    if (KEEP_UPPER_WORDS.has(word.replace(/[.,()]/g, ""))) return word;
    if (/\d/.test(word)) return word;
    const lower = word.toLocaleLowerCase("vi");
    return lower.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("vi"));
  }).join(" ");
}
