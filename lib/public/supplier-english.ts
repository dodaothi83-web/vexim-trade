import type { Supplier } from "@/lib/types";

/** MOQ hiển thị cho buyer: ưu tiên bản tiếng Anh đã dịch, lùi về nội dung gốc khi chưa có bản dịch. */
export function supplierMoqDisplay(supplier: Pick<Supplier, "moq_text" | "moq_text_i18n">): string {
  return supplier.moq_text_i18n?.en?.trim() || supplier.moq_text || "";
}

/** Thị trường xuất khẩu hiển thị cho buyer: ưu tiên danh sách tiếng Anh đã dịch. */
export function supplierExportMarketsDisplay(supplier: Pick<Supplier, "export_markets" | "export_markets_i18n">): string[] {
  const translated = (supplier.export_markets_i18n?.en ?? []).map((m) => m?.trim()).filter(Boolean) as string[];
  return translated.length ? translated : supplier.export_markets ?? [];
}
