import type { Category, Supplier, SupplierCategory, SupplierProduct } from "@/lib/types";
import { parseRequestedCategory } from "./requested-category";

/** Kết quả đọc phạm vi NCC: danh mục đã chọn (quyền) + yêu cầu ngành chưa mở (chỉ là yêu cầu). */
export type SupplierCategoryProposalParseResult = {
  requested_category_slugs: string[];
  requested_category_other: string | null;
  category_requests: { label: string; normalized: string }[];
};

export type CategoryProposalOption = {
  id: string;
  slug: string;
  label: string;
  group: string | null;
  price_unit?: Category["price_unit"];
  moq_units?: Category["moq_units"];
  product_fields?: Category["product_fields"];
  /** Thông số do NCC khác đã tự thêm cho nhóm hàng này - hiện sẵn để dùng lại. */
  supplier_product_fields?: Category["supplier_product_fields"];
  /** Grade do NCC tự thêm cho nhóm hàng; form sản phẩm phải thấy để chọn lại được. */
  supplier_grade_options?: Category["supplier_grade_options"];
  /** Mô tả ngắn của danh mục (CMS) - chỉ dùng để NCC nhận ra ngành hàng. */
  intro?: string | null;
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const pickVi = (m: Category["intro_i18n"] | undefined): string | null => {
  if (!m || typeof m !== "object") return null;
  const record = m as Record<string, unknown>;
  return text(record.vi) ?? text(record.en) ?? text(Object.values(record)[0]);
};

/** Only categories Vexim has published in the CMS; suppliers cannot create taxonomy entries. */
export function categoryProposalOptions(categories: Category[]): CategoryProposalOption[] {
  const published = categories.filter((c) => c.status === "published" && c.is_published);
  const byId = new Map(published.map((c) => [c.id, c]));
  return published
    .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    .map((c) => {
      const parent = c.parent_id ? byId.get(c.parent_id) : null;
      return { id: c.id, slug: c.slug, label: c.name_i18n.vi || c.name_i18n.en || c.slug,
        group: parent?.name_i18n.vi || parent?.name_i18n.en || null, price_unit: c.price_unit ?? null,
        moq_units: c.moq_units ?? null,
        product_fields: c.product_fields ?? [],
        supplier_product_fields: c.supplier_product_fields ?? [],
        supplier_grade_options: c.supplier_grade_options ?? [],
        intro: pickVi(c.intro_i18n) };
    });
}

/**
 * Đọc phạm vi NCC gửi lên.
 *
 * Hai đường, không phải hai quyền: chọn 1-5 danh mục đang mở, HOẶC (chỉ khi ngành của họ
 * chưa có trong danh mục) ghi ngành bằng chữ để nhân viên mở danh mục. Ghi chú không cấp
 * phạm vi — `allowedSupplierCategories()` vẫn chỉ đọc danh mục đã chọn.
 *
 * Chấp nhận "chỉ ghi chú, chưa chọn danh mục nào" vì đó chính là ca hồ sơ từng bị treo:
 * ngành chưa mở thì không có gì để chọn, chặn ở đây là chặn đúng người cần được giúp.
 */
export function parseSupplierCategoryProposals(
  form: FormData,
  options: CategoryProposalOption[],
  locale: "en" | "vi" = "vi",
): SupplierCategoryProposalParseResult {
  const submitted = form.getAll("requested_category_slugs");
  const messages = locale === "en" ? {
    none: "No category is open yet. Tell us what you sell in the box below so support can open it.",
    tooMany: "Choose 1-5 valid categories from the open list.",
    otherTooMany: "List at most 2 industries that are not open yet.",
    otherTooLong: "Each industry name must be 120 characters or fewer.",
    otherOpen: "That industry is already open. Pick it from the list instead of typing it.",
    otherEmpty: "The industry name contains characters we cannot read. Use letters and numbers.",
    nothing: "Pick at least one open category, or tell us the industry you sell in.",
  } : {
    none: "Chưa có danh mục nào đang mở. Ghi ngành bạn bán ở ô bên dưới để bộ phận hỗ trợ mở.",
    tooMany: "Chọn 1-5 danh mục hợp lệ trong danh sách đang mở.",
    otherTooMany: "Ghi tối đa 2 ngành chưa được mở.",
    otherTooLong: "Mỗi tên ngành tối đa 120 ký tự.",
    otherOpen: "Ngành này đã mở. Chọn trong danh sách thay vì gõ lại.",
    otherEmpty: "Tên ngành có ký tự không đọc được. Dùng chữ và số.",
    nothing: "Chọn ít nhất một danh mục đang mở, hoặc ghi ngành bạn bán.",
  };
  if (submitted.length > 5 ||
      submitted.some((v) => typeof v !== "string" || !options.some((c) => c.slug === v)) ||
      new Set(submitted).size !== submitted.length) throw new Error(messages.tooMany);

  const other = parseRequestedCategory({ note: pageText(form.get("requested_category_other")), selected: submitted as string[] },
    options.map((option) => ({ slug: option.slug, name_i18n: { vi: option.label, en: option.label } })));
  if (!other.ok) throw new Error(other.reason === "too_many" ? messages.otherTooMany
    : other.reason === "too_long" ? messages.otherTooLong
    : other.reason === "already_open" ? messages.otherOpen
    : messages.otherEmpty);

  if (!submitted.length && !other.note) throw new Error(options.length ? messages.nothing : messages.none);
  // A free-text 'other' field from a stale client must never expand the supplier's allowed scope:
  // the note is stored as a REQUEST only, never as a category link.
  return {
    requested_category_slugs: submitted as string[],
    requested_category_other: other.note,
    category_requests: other.requests,
  };
}

/** Giá trị chữ từ FormData, cắt khoảng trắng; không nhận tệp. */
function pageText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Historical confirmed supplier_categories remain selectable until the supplier saves a new selection. */
export function allowedSupplierCategories(
  supplier: Pick<Supplier, "requested_category_slugs" | "categories_reviewed_at">,
  options: CategoryProposalOption[], linked: Pick<SupplierCategory, "category_id">[] = [],
): CategoryProposalOption[] {
  const slugs = supplier.requested_category_slugs?.length ? supplier.requested_category_slugs :
    supplier.categories_reviewed_at ? options.filter((c) => linked.some((row) => row.category_id === c.id)).map((c) => c.slug) : [];
  return options.filter((c) => slugs.includes(c.slug));
}

/**
 * Danh mục đang gắn với một sản phẩm. Một nơi duy nhất để trang danh mục, form sản phẩm
 * và server action không hiểu khác nhau về cùng một sản phẩm.
 */
export function productCategorySlug(
  product: Pick<SupplierProduct, "reviewed_category_slug" | "supplier_category_proposal" | "category">,
): string | null {
  return product.reviewed_category_slug || product.supplier_category_proposal || product.category || null;
}

export function parseProductCategoryProposal(form: FormData, options: CategoryProposalOption[]): string {
  const raw = String(form.get("supplier_category_proposal") ?? "").trim();
  if (!raw || !options.some((c) => c.slug === raw)) throw new Error("Chọn danh mục sản phẩm đang xuất bản.");
  return raw;
}
