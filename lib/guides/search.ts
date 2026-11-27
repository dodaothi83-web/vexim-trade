import type { SupplierGuide } from "@/lib/types";

/** Bỏ dấu để tìm "dang san pham" vẫn ra "đăng sản phẩm". */
export function foldVietnamese(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

/** Lọc theo từ khoá trên tiêu đề và tóm tắt; mọi từ phải có mặt. */
export function matchesGuideQuery(guide: Pick<SupplierGuide, "title" | "summary">, query: string): boolean {
  const words = foldVietnamese(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = foldVietnamese(`${guide.title} ${guide.summary ?? ""}`);
  return words.every((word) => haystack.includes(word));
}
