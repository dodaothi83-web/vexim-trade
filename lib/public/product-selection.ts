import type { Category, SupplierProduct } from "@/lib/types";

import { assignProductCategory } from "@/lib/public/category-assignment";
import { formatMoney, priceRangeText } from "../products/price-display.ts";

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
 * "cashew" là slug cũ, "cashew-kernels" là slug ra mắt ngày 23/10/2026, nhóm nhỏ
 * ("raw-cashew-kernels", "roasted-cashews") có từ khi tách danh mục. Nhận mọi slug
 * hạt điều để sản phẩm cũ lẫn mới vẫn tách được quy cách trong khối giá.
 */
const isGradedCategorySlug = (slug: string) => /(?:^|-)cashews?(?:-|$)/i.test(slug);

export function productGrade(name: string, spec: string | null, categorySlug: string): string | null {
  if (!isGradedCategorySlug(categorySlug)) return null;
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

/**
 * Nhà cung cấp đã đồng ý chia sẻ giá. Sự đồng ý không có hạn dùng: còn hiệu lực
 * cho tới khi nhà cung cấp hoặc Vexim tắt. fob_updated_at là ngày đồng ý, bắt buộc có.
 */
export function supplierPriceConsentCurrent(supplier: { fob_publicly_visible?: boolean; fob_updated_at?: string | null }): boolean {
  return !!supplier.fob_publicly_visible && !!supplier.fob_updated_at && Number.isFinite(Date.parse(supplier.fob_updated_at));
}

type PriceFields = Pick<SupplierProduct, "ref_price" | "currency" | "unit" | "price_publicly_visible"> & Partial<Pick<SupplierProduct, "ref_price_max">>;
type PriceConsent = { fob_publicly_visible?: boolean; fob_updated_at?: string | null };

/** Một lý do chặn giá, tách khỏi câu chữ để cổng nhà cung cấp đọc được bản tiếng Anh. */
type PriceBlockerFact =
  | { code: "hidden" }
  | { code: "fromPrice" }
  | { code: "toPrice" }
  | { code: "consentMissing" };

function priceBlockerFacts(product: PriceFields, supplier: PriceConsent): PriceBlockerFact[] {
  const facts: PriceBlockerFact[] = [];
  if (!product.price_publicly_visible) facts.push({ code: "hidden" });
  if (product.ref_price == null || !Number.isFinite(product.ref_price) || product.ref_price <= 0) facts.push({ code: "fromPrice" });
  if (product.ref_price_max != null && (!Number.isFinite(product.ref_price_max) || product.ref_price_max <= 0 || product.ref_price == null || product.ref_price_max < product.ref_price))
    facts.push({ code: "toPrice" });
  if (!supplierPriceConsentCurrent(supplier)) facts.push({ code: "consentMissing" });
  return facts;
}

/** Private editor diagnostics, in the exact same order and with the same checks as the public price gate. */
export function productPriceBlockers(product: PriceFields, supplier: PriceConsent): string[] {
  return priceBlockerFacts(product, supplier).map((fact) => {
    if (fact.code === "hidden") return "Chưa công khai giá cho sản phẩm này.";
    if (fact.code === "fromPrice") return "Giá từ phải lớn hơn 0.";
    if (fact.code === "toPrice") return "Giá đến phải ≥ giá từ.";
    return "Doanh nghiệp chưa xác nhận chia sẻ giá.";
  });
}

/** Cùng các lý do trên, viết bằng tiếng Anh cho cổng nhà cung cấp. */
export function productPriceBlockersEn(product: PriceFields, supplier: PriceConsent): string[] {
  return priceBlockerFacts(product, supplier).map((fact) => {
    if (fact.code === "hidden") return "Price sharing is off for this product. Turn it on and save the change.";
    if (fact.code === "fromPrice") return "The product's from price must be greater than 0.";
    if (fact.code === "toPrice") return "The to price must be at least the from price; leave it empty for a single price.";
    return "The company has not confirmed price sharing; the product switch does not replace that confirmation.";
  });
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
): { value: number; unit: string | null; currency: string | null; updatedAt: string | null } | null {
  if (productPriceBlockers(product, supplier).length) return null;
  const value = product.ref_price;
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return {
    value,
    unit: product.unit ?? null,
    currency: product.currency || "USD",
    updatedAt: product.updated_at ?? null,
  };
}

/** Product ref price is public only when separately opted in and the supplier has agreed to share prices. */
export function publicProductPrice(product: PriceFields, supplier: PriceConsent): string | null {
  if (productPriceBlockers(product, supplier).length) return null;
  const [code, embeddedUnit] = (product.currency || "USD").split("/");
  // The CRM currency can already contain a unit (e.g. USD/kg); never invent a conversion to /ton.
  const unit = embeddedUnit ? `/${embeddedUnit}` : product.unit ? `/${product.unit}` : "";
  const high = product.ref_price_max != null && product.ref_price_max > product.ref_price! ? product.ref_price_max : null;
  const amount = high === null ? formatMoney(product.ref_price!, code) : priceRangeText(product.ref_price!, high, code);
  return `${amount}${unit}`;
}
