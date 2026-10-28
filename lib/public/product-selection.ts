import type { Category, SupplierProduct } from "@/lib/types";

import { assignProductCategory } from "@/lib/public/category-assignment";

type CategoryProduct = Pick<SupplierProduct, "category" | "name"> & Partial<Pick<SupplierProduct, "spec" | "description" | "reviewed_category_slug" | "supplier_originated">>;
type KnownCategory = Pick<Category, "slug" | "name_i18n">;

/** The single category a product belongs to under the existing public rules. */
export function publicProductCategorySlug(product: CategoryProduct, knownCategories: KnownCategory[]): string | null {
  // Supplier-authored products never fall back to keyword inference after a decision was invalidated.
  if (product.supplier_originated && !product.reviewed_category_slug) return null;
  // Explicit human decision wins over a keyword guess. An invalid/archived slug fails closed.
  if (product.reviewed_category_slug) return knownCategories.some((c) => c.slug === product.reviewed_category_slug)
    ? product.reviewed_category_slug : null;
  const choices = knownCategories.map((c) => ({ ...c, id: c.slug }));
  return assignProductCategory({
    name: product.name, category: product.category,
    spec: product.spec ?? null, description: product.description ?? null,
  }, choices)?.slug ?? null;
}

/** The product itself wins over a stale or incorrect saved category on public reads. */
export function productBelongsToCategory(
  product: CategoryProduct,
  category: Pick<Category, "slug">,
  knownCategories: KnownCategory[],
): boolean {
  return publicProductCategorySlug(product, knownCategories) === category.slug;
}

export function productReviewApproved(product: Pick<SupplierProduct, "supplier_review_status"> & Partial<Pick<SupplierProduct, "supplier_originated" | "reviewed_category_slug">>): boolean {
  // A supplier-authored product without a current Vexim category decision fails closed.
  // Historical/staff-managed products (no supplier_originated flag) preserve their prior behavior.
  if (product.supplier_originated && !product.reviewed_category_slug) return false;
  return product.supplier_review_status === "approved" || product.supplier_review_status == null;
}

export function isTestOnlyProduct(name: string): boolean {
  return /^\s*(?:\[\s*)?test\s+only\b/i.test(name);
}

export function withoutDirectContacts(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contact via Vexim]")
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+|\b[a-z\d-]+(?:\.[a-z\d-]+)*\.(?:com|vn|net|org|co|io|biz)(?:\/[^\s<>]*)?/gi, "[contact via Vexim]")
    .replace(/(?:\+?\d[\s().-]?){9,15}\d/g, "[contact via Vexim]");
}

/**
 * Danh mục có quy cách đọc được bằng máy.
 *
 * "cashew" là slug cũ, "cashew-kernels" là slug ra mắt ngày 23/10/2026. Giữ cả hai
 * để sản phẩm cũ chưa chuyển slug vẫn tách được quy cách trong khối giá.
 */
const GRADED_CATEGORY_SLUGS = new Set(["cashew", "cashew-kernels"]);

export function productGrade(name: string, spec: string | null, categorySlug: string): string | null {
  if (!GRADED_CATEGORY_SLUGS.has(categorySlug)) return null;
  const text = `${name} ${spec ?? ""}`.toUpperCase();
  const code = /\b(W180|W240|W320|W450|SW|WS|LP|SP)\b/.exec(text)?.[1];
  if (code) return code;
  if (/\bSPLITS?\b/.test(text)) return "WS";
  if (/\bPIECES?\b/.test(text)) return "LP";
  return null;
}

/**
 * Quy cách hồ tiêu: khối lượng riêng, tính bằng g/l.
 *
 * Đây là chỉ tiêu đứng đầu bảng quy cách của ngành (IPC BP-1 từ 550 g/l, BP-2 từ
 * 500 g/l), nên 500 và 550 là hai mức giá khác nhau chứ không phải một. Gộp lại
 * thì khoảng giá vừa thấp hơn vừa cao hơn giá thật, và buyer đọc sai mặt hàng.
 */
export function pepperGrade(name: string, spec: string | null): string | null {
  const text = `${name} ${spec ?? ""}`.toUpperCase();
  const density = /\b(\d{3})\s*G\s*\/\s*L\b/.exec(text)?.[1];
  return density ? `${density} g/l` : null;
}

/** Consent belongs to the supplier, expires after 180 days, and is never renewed by a normal product edit. */
export function supplierPriceConsentCurrent(supplier: { fob_publicly_visible?: boolean; fob_updated_at?: string | null }, now = Date.now()): boolean {
  if (!supplier.fob_publicly_visible || !supplier.fob_updated_at) return false;
  const age = now - new Date(supplier.fob_updated_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < 180 * 86400_000;
}

type PriceFields = Pick<SupplierProduct, "ref_price" | "currency" | "price_valid_until" | "unit" | "price_publicly_visible"> & Partial<Pick<SupplierProduct, "ref_price_max">>;
type PriceConsent = { fob_publicly_visible?: boolean; fob_updated_at?: string | null };

/** Private editor diagnostics, in the exact same order and with the same checks as the public price gate. */
export function productPriceBlockers(
  product: PriceFields, supplier: PriceConsent,
  today: string = new Date().toISOString().slice(0, 10), now = Date.now(),
): string[] {
  const blockers: string[] = [];
  if (!product.price_publicly_visible) blockers.push("Chưa bật công khai giá cho riêng sản phẩm này và lưu thay đổi.");
  if (product.ref_price == null || !Number.isFinite(product.ref_price) || product.ref_price <= 0)
    blockers.push("Giá tham khảo từ của sản phẩm phải lớn hơn 0.");
  if (product.ref_price_max != null && (!Number.isFinite(product.ref_price_max) || product.ref_price_max <= 0 || product.ref_price == null || product.ref_price_max < product.ref_price))
    blockers.push("Giá tham khảo đến phải lớn hơn hoặc bằng giá từ; để trống nếu chỉ có một mức giá.");
  if (product.price_valid_until && product.price_valid_until < today)
    blockers.push(`Giá tham khảo đã hết hạn (${product.price_valid_until}).`);
  if (!supplier.fob_publicly_visible) blockers.push("Doanh nghiệp chưa xác nhận chia sẻ giá; ô công khai của sản phẩm không thay thế xác nhận này.");
  else if (!supplierPriceConsentCurrent(supplier, now)) blockers.push("Xác nhận chia sẻ giá đã hết hiệu lực (quá 180 ngày hoặc ngày xác nhận không hợp lệ); cần xác nhận lại.");
  return blockers;
}

/**
 * Cùng một cổng kiểm tra với publicProductPrice, nhưng trả số thay vì chuỗi.
 *
 * Dùng cho khoảng giá tham khảo của danh mục: cần cộng được nhiều nhà cung cấp
 * nên phải có đơn vị và ngày cập nhật riêng, không thể đọc từ câu đã định dạng.
 */
export function publicProductPricePoint(
  product: PriceFields & { updated_at?: string | null },
  supplier: PriceConsent,
  today: string = new Date().toISOString().slice(0, 10),
): { value: number; unit: string | null; currency: string | null; updatedAt: string | null } | null {
  if (productPriceBlockers(product, supplier, today).length) return null;
  const value = product.ref_price;
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return {
    value,
    unit: product.unit ?? null,
    currency: product.currency || "USD",
    updatedAt: product.updated_at ?? null,
  };
}

/** Product ref price is public only when separately opted in, consent is current and the price is valid. */
export function publicProductPrice(
  product: PriceFields,
  supplier: PriceConsent,
  today: string = new Date().toISOString().slice(0, 10),
): string | null {
  if (productPriceBlockers(product, supplier, today).length) return null;
  const currency = product.currency || "USD";
  // The CRM currency can already contain a unit (e.g. USD/kg); never invent a conversion to /ton.
  const range = product.ref_price_max != null && product.ref_price_max > product.ref_price!
    ? `-${product.ref_price_max.toLocaleString("en-US")}` : "";
  return `${currency} ${product.ref_price!.toLocaleString("en-US")}${range}${currency.includes("/") ? "" : product.unit ? `/${product.unit}` : ""}`;
}
