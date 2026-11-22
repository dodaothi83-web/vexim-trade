import type { Category, Supplier, SupplierCategory, SupplierProduct } from "@/lib/types";
import { parseRequestedCategory } from "./requested-category";
import { expandCategoryScope } from "../categories/tree.ts";

/**
 * Trần phạm vi bán hàng: tối đa 5 NGÀNH CHÍNH. Chọn ngành cha là gồm luôn mọi nhóm con
 * của nó (xem `expandCategoryScope`), nên nhóm con không bao giờ bị tính vào trần này.
 */
export const MAX_SUPPLIER_CATEGORIES = 5;

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
  /** Tên tiếng Anh (portal EN và ô tìm ngành hàng đọc được cả hai thứ tiếng). */
  label_en?: string | null;
  group_en?: string | null;
  /** Nhóm lớn đang mở chứa danh mục này; null là danh mục cấp 1. */
  parent_slug?: string | null;
  /** Danh mục lá (không còn nhóm nhỏ đang mở): chỉ lá mới gắn được cho sản phẩm. */
  leaf?: boolean;
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
        group: parent?.name_i18n.vi || parent?.name_i18n.en || null,
        label_en: c.name_i18n.en || null, group_en: parent ? parent.name_i18n.en || null : null,
        parent_slug: parent?.slug ?? null,
        leaf: !published.some((child) => child.parent_id === c.id),
        price_unit: c.price_unit ?? null,
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
  if (submitted.length > options.length ||
      submitted.some((v) => typeof v !== "string" || !options.some((c) => c.slug === v)) ||
      new Set(submitted).size !== submitted.length) throw new Error(messages.tooMany);
  // Nhóm con gửi kèm ngành cha là thừa (ngành cha đã gồm nó): bỏ đi trước khi đếm, để trần
  // 5 chỉ tính ngành chính và trang cũ còn mở (gửi cả nhóm con) vẫn lưu được.
  const chosen = registrationSlugs(submitted as string[], options);
  if (chosen.length > MAX_SUPPLIER_CATEGORIES) throw new Error(messages.tooMany);

  const other = parseRequestedCategory({ note: pageText(form.get("requested_category_other")), selected: chosen },
    options.map((option) => ({ slug: option.slug, name_i18n: { vi: option.label, en: option.label } })));
  if (!other.ok) throw new Error(other.reason === "too_many" ? messages.otherTooMany
    : other.reason === "too_long" ? messages.otherTooLong
    : other.reason === "already_open" ? messages.otherOpen
    : messages.otherEmpty);

  if (!chosen.length && !other.note) throw new Error(options.length ? messages.nothing : messages.none);
  // A free-text 'other' field from a stale client must never expand the supplier's allowed scope:
  // the note is stored as a REQUEST only, never as a category link.
  return {
    requested_category_slugs: chosen,
    requested_category_other: other.note,
    category_requests: other.requests,
  };
}

/** Giá trị chữ từ FormData, cắt khoảng trắng; không nhận tệp. */
function pageText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Danh mục NCC đã đăng ký, đúng như đã lưu (CHƯA bung nhóm con) — đây là thứ NCC chọn và
 * bị tính vào trần 5. Hồ sơ cũ chưa có `requested_category_slugs` dùng liên kết staff đã chốt.
 */
export function registeredSupplierCategorySlugs(
  supplier: Pick<Supplier, "requested_category_slugs" | "categories_reviewed_at">,
  options: CategoryProposalOption[], linked: Pick<SupplierCategory, "category_id">[] = [],
): string[] {
  const slugs = supplier.requested_category_slugs?.length ? supplier.requested_category_slugs :
    supplier.categories_reviewed_at ? options.filter((c) => linked.some((row) => row.category_id === c.id)).map((c) => c.slug) : [];
  return registrationSlugs(slugs.filter((slug) => options.some((c) => c.slug === slug)), options);
}

/** Bỏ nhóm con đã nằm trong một ngành cha cũng được chọn; giữ nguyên thứ tự. */
export function registrationSlugs(slugs: readonly string[], options: CategoryProposalOption[]): string[] {
  const picked = new Set(slugs);
  return slugs.filter((slug, index) => {
    const parent = options.find((c) => c.slug === slug)?.parent_slug;
    return slugs.indexOf(slug) === index && (!parent || !picked.has(parent));
  });
}

/**
 * Danh mục để NCC tích chọn phạm vi: chỉ ngành chính. Nhóm con đi theo ngành cha nên không
 * hiện thành dòng riêng — trừ khi hồ sơ cũ đã lưu riêng một nhóm con (`keep`), để không mất.
 */
export function registrationCategoryOptions(options: CategoryProposalOption[], keep: readonly string[] = []): CategoryProposalOption[] {
  return options.filter((c) => !c.parent_slug || !options.some((p) => p.slug === c.parent_slug) || keep.includes(c.slug));
}

/** Phạm vi thực tế: danh mục đã đăng ký + mọi nhóm con đang mở của chúng. */
export function supplierCategoryScope(slugs: readonly string[], options: CategoryProposalOption[]): string[] {
  // Được bán ở nhóm lớn thì được bán ở các nhóm nhỏ của nó (khi Vexim tách danh mục).
  return expandCategoryScope(slugs, options.map((c) => ({
    id: c.id, slug: c.slug, parent_id: c.parent_slug ? options.find((p) => p.slug === c.parent_slug)?.id ?? null : null,
  })));
}

/** Historical confirmed supplier_categories remain selectable until the supplier saves a new selection. */
export function allowedSupplierCategories(
  supplier: Pick<Supplier, "requested_category_slugs" | "categories_reviewed_at">,
  options: CategoryProposalOption[], linked: Pick<SupplierCategory, "category_id">[] = [],
): CategoryProposalOption[] {
  const scope = supplierCategoryScope(registeredSupplierCategorySlugs(supplier, options, linked), options);
  return options.filter((c) => scope.includes(c.slug));
}

/** Gắn được cho sản phẩm: danh mục đang mở và là lá. */
export function isProductCategoryChoice(slug: string | null | undefined, options: CategoryProposalOption[]): boolean {
  const option = slug ? options.find((c) => c.slug === slug) : undefined;
  return !!option && option.leaf !== false;
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

/**
 * Danh mục NCC chọn cho sản phẩm. Phải là danh mục lá (giống Shopee: nhóm lớn đã
 * có nhóm nhỏ thì phải chọn nhóm nhỏ). Ngoại lệ duy nhất: giữ nguyên danh mục
 * sản phẩm đang có, để sản phẩm đã duyệt trước khi tách vẫn lưu được.
 */
export function parseProductCategoryProposal(form: FormData, options: CategoryProposalOption[], rules: {
  current?: string | null; invalid?: string; needLeaf?: string;
} = {}): string {
  const raw = String(form.get("supplier_category_proposal") ?? "").trim();
  if (!raw || !options.some((c) => c.slug === raw)) throw new Error(rules.invalid ?? "Chọn danh mục sản phẩm đang xuất bản.");
  if (!isProductCategoryChoice(raw, options) && raw !== rules.current)
    throw new Error(rules.needLeaf ?? "Danh mục này đã chia nhóm nhỏ. Chọn nhóm nhỏ phù hợp với sản phẩm.");
  return raw;
}
