import type { Category, MediaAsset, Supplier, SupplierProduct } from "@/lib/types";
import { productReadiness } from "@/lib/media/readiness";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { isTestOnlyProduct, productBelongsToCategory, productReviewApproved } from "@/lib/public/product-selection";

export type SupplierProductPublicationCheck = {
  key: "review" | "category" | "media" | "ready" | "supplier" | "test";
  label: string;
  done: boolean;
  /** Explanation shown only when this condition is still missing. */
  missing: string;
};

export type SupplierProductPublication = {
  isPublic: boolean;
  /** A buyer URL is exposed only after every public gate has passed. */
  publicHref: string | null;
  checks: SupplierProductPublicationCheck[];
  /** Short reasons for compact cards; derived from the same checks as the detail panel. */
  missing: string[];
};

/**
 * Explain the real buyer-facing gates for a product owned by a supplier.
 *
 * This is deliberately a read-only projection. It does not grant publication or
 * sharing permission: staff still chooses buyer media and sets ready_for_buyer.
 * Keep the conditions aligned with lib/public/catalog.ts and product-catalog.ts.
 */
export function getSupplierProductPublication({
  product,
  supplier,
  media,
  categories,
}: {
  product: SupplierProduct;
  supplier: Supplier;
  media: MediaAsset[];
  categories: Category[];
}): SupplierProductPublication {
  const productMedia = media.filter((asset) => asset.owner_type === "product" && asset.product_id === product.id);
  const readiness = productReadiness(productMedia);
  const reviewed = productReviewApproved(product);
  const reviewedCategory = product.reviewed_category_slug
    ? categories.find((category) => category.slug === product.reviewed_category_slug) ?? null
    : null;
  // Legacy staff products may still use the existing category inference. A
  // supplier-authored product never reaches this fallback without a staff decision.
  const category = reviewedCategory ?? categories.find((candidate) =>
    candidate.status === "published" && candidate.is_published &&
    productBelongsToCategory(product, candidate, categories),
  ) ?? null;
  const categoryPublished = !!category && category.status === "published" && category.is_published &&
    productBelongsToCategory(product, category, categories);
  const supplierPublished = supplier.status === "published" && !isSyntheticSupplier(supplier);
  const notTestProduct = !isTestOnlyProduct(product.name);
  const reviewState = product.supplier_review_status;
  const reviewMissing = reviewState === "pending"
    ? "Sản phẩm đang chờ duyệt nội dung."
    : reviewState === "changes_requested"
      ? "Sản phẩm cần chỉnh sửa và gửi duyệt lại."
      : reviewState === "draft"
        ? "Sản phẩm chưa được gửi duyệt."
        : "Sản phẩm chưa có danh mục được bộ phận duyệt chốt.";

  const checks: SupplierProductPublicationCheck[] = [
    {
      key: "review",
      label: "Nội dung và danh mục đã được duyệt",
      done: reviewed,
      missing: reviewMissing,
    },
    {
      key: "category",
      label: "Danh mục đang mở cho buyer",
      done: categoryPublished,
      missing: product.supplier_originated && !product.reviewed_category_slug
        ? "Chưa có danh mục được bộ phận duyệt chốt cho sản phẩm."
        : "Danh mục đã chốt chưa được xuất bản hoặc không còn khớp sản phẩm.",
    },
    {
      key: "media",
      label: "Có ảnh hoặc catalogue được chia sẻ buyer",
      done: readiness.ready,
      missing: readiness.message,
    },
    {
      key: "ready",
      label: "Đã bật sẵn sàng gửi buyer",
      done: !!product.ready_for_buyer,
      missing: "Sản phẩm chưa được bật sẵn sàng gửi buyer sau bước duyệt.",
    },
    {
      key: "supplier",
      label: "Hồ sơ doanh nghiệp đang công khai",
      done: supplierPublished,
      missing: supplier.status !== "published"
        ? "Hồ sơ doanh nghiệp chưa được công khai."
        : "Hồ sơ đang ở chế độ test nên không phải chào hàng công khai.",
    },
    {
      key: "test",
      label: "Không phải dữ liệu test",
      done: notTestProduct,
      missing: "Tên sản phẩm bắt đầu bằng TEST ONLY nên không xuất hiện như chào hàng công khai.",
    },
  ];
  const isPublic = checks.every((check) => check.done);
  return {
    isPublic,
    publicHref: isPublic && category
      ? `/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(product.id)}`
      : null,
    checks,
    missing: checks.filter((check) => !check.done).map((check) => check.missing),
  };
}
