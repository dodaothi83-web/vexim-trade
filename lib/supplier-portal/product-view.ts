import type { MediaAsset, SupplierProduct, SupplierProductReviewStatus } from "@/lib/types";

export type ProductReviewFilter = "all" | SupplierProductReviewStatus;

export const SUPPLIER_PRODUCTS_PER_PAGE = 15;

export function supplierProductPage<T>(items: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / SUPPLIER_PRODUCTS_PER_PAGE));
  const currentPage = Math.min(pageCount, Math.max(1, Math.trunc(page) || 1));
  const start = (currentPage - 1) * SUPPLIER_PRODUCTS_PER_PAGE;
  return {
    shown: items.slice(start, start + SUPPLIER_PRODUCTS_PER_PAGE),
    currentPage,
    pageCount,
    firstItem: items.length ? start + 1 : 0,
    lastItem: Math.min(start + SUPPLIER_PRODUCTS_PER_PAGE, items.length),
  };
}

export const PRODUCT_STATUS: Record<Exclude<ProductReviewFilter, "all">, { label: string; tone: string }> = {
  draft: { label: "Bản nháp", tone: "bg-slate-100 text-slate-700" },
  pending: { label: "Chờ duyệt", tone: "bg-amber-100 text-amber-900" },
  changes_requested: { label: "Cần chỉnh sửa", tone: "bg-rose-100 text-rose-800" },
  approved: { label: "Đã đăng", tone: "bg-emerald-100 text-emerald-800" },
  paused: { label: "Đã tạm ẩn", tone: "bg-slate-200 text-slate-800" },
};

/** Existing staff-managed products predate moderation; migration treats them as approved. */
export function productReview(product: SupplierProduct): Exclude<ProductReviewFilter, "all"> {
  return product.supplier_review_status ?? "approved";
}

/** Only owner's uploads or buyer-shareable staff files belong in the private supplier storefront. */
export function supplierVisibleProductMedia(media: MediaAsset[], supplierId: string, userId: string) {
  return media.filter((asset) => asset.owner_type === "product" && asset.supplier_id === supplierId &&
    (asset.created_by === userId || asset.audience === "buyer"));
}

export function privateMediaUrl(asset: MediaAsset): string | null {
  if (!asset.storage_path || asset.storage_path.split("/").some((segment) => !segment || segment === "..")) return null;
  return `/api/media/file/${asset.storage_path.split("/").map(encodeURIComponent).join("/")}`;
}

export function productCanSubmit(product: SupplierProduct, media: MediaAsset[]): boolean {
  return ["draft", "changes_requested", "paused"].includes(productReview(product)) &&
    !!(product.name.trim() && (product.description?.trim() || product.spec?.trim())) &&
    media.some((asset) => (asset.kind === "image" || asset.kind === "catalogue") && !!asset.storage_path && asset.supplier_id === product.supplier_id);
}
