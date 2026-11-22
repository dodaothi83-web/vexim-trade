import type { Category } from "@/lib/types";

/**
 * Cây danh mục 2 cấp (nhóm lớn → nhóm nhỏ), giống cách Shopee bắt chọn tới
 * ngành hàng cuối cùng: sản phẩm chỉ gắn vào danh mục LÁ, nhóm lớn chỉ để mở
 * nhóm nhỏ. Danh mục chưa có nhóm nhỏ nào đang mở vẫn là lá, nên các ngành
 * chưa tách (hồ tiêu, gạo…) vẫn chọn được như cũ.
 */
export type CategoryNode = Pick<Category, "id" | "slug"> & Partial<Pick<Category, "parent_id" | "status" | "is_published">>;

const isOpen = (c: CategoryNode) => c.status === undefined && c.is_published === undefined
  ? true : c.status === "published" && c.is_published === true;

/** Nhóm nhỏ đang mở của một danh mục. */
export function openChildren<T extends CategoryNode>(categories: readonly T[], parentId: string): T[] {
  return categories.filter((c) => c.parent_id === parentId && isOpen(c));
}

/** Danh mục lá: không có nhóm nhỏ nào đang mở bên dưới. */
export function isLeafCategory(category: CategoryNode, categories: readonly CategoryNode[]): boolean {
  return openChildren(categories, category.id).length === 0;
}

/**
 * Phạm vi đăng bán của nhà cung cấp mở rộng xuống nhóm nhỏ: được bán "Cà phê,
 * Trà & Đồ uống" thì được bán "Cà phê" và "Trà". Không mở ngược lên nhóm lớn
 * hay sang nhóm nhỏ khác cha.
 */
export function expandCategoryScope(slugs: readonly string[], categories: readonly CategoryNode[]): string[] {
  const out = new Set(slugs);
  for (const slug of slugs) {
    const parent = categories.find((c) => c.slug === slug);
    if (parent) for (const child of openChildren(categories, parent.id)) out.add(child.slug);
  }
  return [...out];
}

/** Đường dẫn từ nhóm lớn xuống danh mục (tối đa 2 cấp). */
export function categoryPath<T extends CategoryNode>(category: T, categories: readonly T[]): T[] {
  const parent = category.parent_id ? categories.find((c) => c.id === category.parent_id) : undefined;
  return parent ? [parent, category] : [category];
}

/**
 * Cấu hình danh mục con nhận từ danh mục cha khi được tạo mà chưa khai: ô
 * thuộc tính, grade NCC đã thêm, đơn vị giá, đơn vị MOQ, mùa vụ. Nhờ đó tách
 * "Hạt điều" thành nhóm nhỏ không làm mất bộ lọc grade hay đơn vị kg.
 */
export function inheritParentCategoryConfig(
  input: Partial<Category>,
  parent: Pick<Category, "product_fields" | "supplier_product_fields" | "supplier_grade_options" | "price_unit" | "moq_units" | "harvest">,
): Partial<Category> {
  const empty = (value: unknown) => value === undefined || value === null || (Array.isArray(value) && value.length === 0);
  const next = { ...input };
  if (empty(next.product_fields) && !empty(parent.product_fields)) next.product_fields = structuredClone(parent.product_fields);
  if (empty(next.supplier_product_fields) && !empty(parent.supplier_product_fields)) next.supplier_product_fields = structuredClone(parent.supplier_product_fields);
  if (empty(next.supplier_grade_options) && !empty(parent.supplier_grade_options)) next.supplier_grade_options = [...parent.supplier_grade_options!];
  if (empty(next.price_unit) && parent.price_unit) next.price_unit = parent.price_unit;
  if (next.moq_units === undefined && parent.moq_units !== undefined) next.moq_units = parent.moq_units ? [...parent.moq_units] : parent.moq_units;
  if (empty(next.harvest) && !empty(parent.harvest)) next.harvest = structuredClone(parent.harvest);
  return next;
}
