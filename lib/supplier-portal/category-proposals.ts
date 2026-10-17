import type { Category } from "@/lib/types";

export type CategoryProposalOption = { id: string; slug: string; label: string; group: string | null };

/** Selectable, published categories from Vexim's CMS — never client-supplied taxonomy. */
export function categoryProposalOptions(categories: Category[]): CategoryProposalOption[] {
  const published = categories.filter((c) => c.status === "published" && c.is_published);
  const byId = new Map(published.map((c) => [c.id, c]));
  return published
    .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    .map((c) => {
      const parent = c.parent_id ? byId.get(c.parent_id) : null;
      return { id: c.id, slug: c.slug, label: c.name_i18n.vi || c.name_i18n.en || c.slug,
        group: parent?.name_i18n.vi || parent?.name_i18n.en || null };
    });
}

export function parseSupplierCategoryProposals(form: FormData, options: CategoryProposalOption[]) {
  const submitted = form.getAll("requested_category_slugs");
  if (submitted.length > 5 || submitted.some((v) => typeof v !== "string" || !options.some((c) => c.slug === v)) ||
      new Set(submitted).size !== submitted.length) throw new Error("Chỉ chọn tối đa 5 danh mục hợp lệ trong danh sách Vexim.");
  const otherRaw = String(form.get("requested_category_other") ?? "").trim();
  if (otherRaw.length > 180) throw new Error("Tên danh mục khác tối đa 180 ký tự.");
  // New users can still register if the CMS has no published categories yet.
  if (options.length && !submitted.length && !otherRaw) throw new Error("Chọn ít nhất một danh mục hoặc ghi rõ mục Khác.");
  return { requested_category_slugs: submitted as string[], requested_category_other: otherRaw || null };
}

export function parseProductCategoryProposal(form: FormData, options: CategoryProposalOption[]): string | null {
  const raw = String(form.get("supplier_category_proposal") ?? "").trim();
  if (raw && !options.some((c) => c.slug === raw)) throw new Error("Danh mục sản phẩm đề xuất không có trong danh sách Vexim.");
  return raw || null;
}
