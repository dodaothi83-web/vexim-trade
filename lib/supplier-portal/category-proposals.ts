import type { Category, Supplier, SupplierCategory } from "@/lib/types";

export type CategoryProposalOption = { id: string; slug: string; label: string; group: string | null; product_fields?: Category["product_fields"] };

/** Only categories Vexim has published in the CMS; suppliers cannot create taxonomy entries. */
export function categoryProposalOptions(categories: Category[]): CategoryProposalOption[] {
  const published = categories.filter((c) => c.status === "published" && c.is_published);
  const byId = new Map(published.map((c) => [c.id, c]));
  return published
    .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    .map((c) => {
      const parent = c.parent_id ? byId.get(c.parent_id) : null;
      return { id: c.id, slug: c.slug, label: c.name_i18n.vi || c.name_i18n.en || c.slug,
        group: parent?.name_i18n.vi || parent?.name_i18n.en || null, product_fields: c.product_fields ?? [] };
    });
}

export function parseSupplierCategoryProposals(form: FormData, options: CategoryProposalOption[]) {
  const submitted = form.getAll("requested_category_slugs");
  if (!options.length) throw new Error("Vexim chưa mở danh mục để chọn. Vui lòng liên hệ Vexim trước khi gửi hồ sơ.");
  if (!submitted.length || submitted.length > 5 ||
      submitted.some((v) => typeof v !== "string" || !options.some((c) => c.slug === v)) ||
      new Set(submitted).size !== submitted.length) throw new Error("Chọn 1–5 danh mục hợp lệ trong danh sách Vexim.");
  // A free-text 'other' field from a stale client must never expand the supplier's allowed scope.
  return { requested_category_slugs: submitted as string[], requested_category_other: null };
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

export function parseProductCategoryProposal(form: FormData, options: CategoryProposalOption[]): string {
  const raw = String(form.get("supplier_category_proposal") ?? "").trim();
  if (!raw || !options.some((c) => c.slug === raw)) throw new Error("Chọn danh mục sản phẩm trong phạm vi danh mục NCC đã chọn từ Vexim.");
  return raw;
}
