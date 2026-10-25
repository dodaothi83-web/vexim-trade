import type { Supplier } from "@/lib/types";
import {
  publicExportPortDisplay,
  publicProductCapacityDisplay,
  publicProductMoqDisplay,
  publicProductPaymentTermsDisplay,
  publicProductPlaceDisplay,
} from "@/lib/public/product-detail-display";

/** Giới thiệu cho buyer: ưu tiên bản dịch, nhưng không bỏ trống khi NCC đã có nội dung gốc. */
export function supplierSummaryDisplay(supplier: Pick<Supplier, "summary_i18n" | "intro_source">): string {
  const english = supplier.summary_i18n?.en?.trim();
  if (english) return english;
  const existing = Object.values(supplier.summary_i18n ?? {}).map((value) => value?.trim()).find(Boolean);
  return existing || supplier.intro_source?.trim() || "";
}

/** Tên pháp lý gốc vẫn nằm trong supplier.name; chỉ ưu tiên bản hiển thị tiếng Anh đã lưu. */
export function supplierLegalNameDisplay(supplier: Pick<Supplier, "name" | "profile_translation_meta">): string {
  return supplier.profile_translation_meta?.fields?.legal_name?.trim() || supplier.name || "";
}

/** MOQ hiển thị cho buyer: ưu tiên bản tiếng Anh đã dịch, lùi về nội dung gốc khi chưa có bản dịch. */
export function supplierMoqDisplay(supplier: Pick<Supplier, "moq_text" | "moq_text_i18n">): string {
  return publicProductMoqDisplay(supplier.moq_text_i18n?.en?.trim() || supplier.moq_text);
}

/** Thị trường xuất khẩu hiển thị cho buyer: ưu tiên danh sách tiếng Anh đã dịch. */
export function supplierExportMarketsDisplay(supplier: Pick<Supplier, "export_markets" | "export_markets_i18n">): string[] {
  const translated = (supplier.export_markets_i18n?.en ?? []).map((m) => m?.trim()).filter(Boolean) as string[];
  return translated.length ? translated : supplier.export_markets ?? [];
}

export function supplierProvinceDisplay(supplier: Pick<Supplier, "province" | "profile_translation_meta">): string {
  return publicProductPlaceDisplay(supplier.profile_translation_meta?.fields?.province?.trim() || supplier.province);
}

export function supplierAddressDisplay(supplier: Pick<Supplier, "address" | "profile_translation_meta">): string {
  return supplier.profile_translation_meta?.fields?.address?.trim() || supplier.address || "";
}

export function supplierProductsDisplay(supplier: Pick<Supplier, "products" | "profile_translation_meta">): string {
  return supplier.profile_translation_meta?.fields?.products?.trim() || supplier.products || "";
}

export function supplierMarketsDisplay(supplier: Pick<Supplier, "markets" | "profile_translation_meta">): string {
  return supplier.profile_translation_meta?.fields?.markets?.trim() || supplier.markets || "";
}

export function supplierCapacityDisplay(supplier: Pick<Supplier, "capacity_per_month" | "profile_translation_meta">): string {
  return publicProductCapacityDisplay(supplier.profile_translation_meta?.fields?.capacity_per_month?.trim() || supplier.capacity_per_month);
}

export function supplierPaymentTermsDisplay(supplier: Pick<Supplier, "payment_terms" | "profile_translation_meta">): string {
  return publicProductPaymentTermsDisplay(supplier.profile_translation_meta?.fields?.payment_terms?.trim() || supplier.payment_terms);
}

/** Storefronts may show the supplier's source text while a translation is pending. */
export function supplierRawMaterialRegionDisplay(supplier: Pick<Supplier, "raw_material_region" | "profile_translation_meta">): string {
  return publicProductPlaceDisplay(supplier.profile_translation_meta?.fields?.raw_material_region?.trim() || supplier.raw_material_region);
}

export function supplierInputMaterialOriginDisplay(supplier: Pick<Supplier, "input_material_origin" | "profile_translation_meta">): string {
  return supplier.profile_translation_meta?.fields?.input_material_origin?.trim() || supplier.input_material_origin || "";
}

/** Comparisons and product details fail closed: never fall back to Vietnamese source text. */
export function supplierRawMaterialRegionEnglishDisplay(supplier: Pick<Supplier, "profile_translation_meta">): string {
  return publicProductPlaceDisplay(supplier.profile_translation_meta?.fields?.raw_material_region);
}

export function supplierInputMaterialOriginEnglishDisplay(supplier: Pick<Supplier, "profile_translation_meta">): string {
  return supplier.profile_translation_meta?.fields?.input_material_origin?.trim() || "";
}

function listDisplay(translated: string[] | undefined, source: string[] | undefined): string[] {
  const values = (translated ?? []).map((item) => item?.trim()).filter(Boolean) as string[];
  return values.length ? values : source ?? [];
}

export function supplierPortsDisplay(supplier: Pick<Supplier, "ports" | "profile_translation_meta">): string[] {
  return listDisplay(supplier.profile_translation_meta?.fields?.ports, supplier.ports).map(publicExportPortDisplay);
}

export function supplierIncotermsDisplay(supplier: Pick<Supplier, "incoterms" | "profile_translation_meta">): string[] {
  return listDisplay(supplier.profile_translation_meta?.fields?.incoterms, supplier.incoterms);
}
