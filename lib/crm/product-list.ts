export const CRM_PRODUCTS_PAGE_SIZE = 15;

type ProductListRow = {
  id: string;
  name: string;
  supplier_review_status?: "draft" | "pending" | "approved" | "changes_requested" | "paused";
};

/** Chờ Vexim kiểm tra luôn đứng trước; mức độ khớp và tên chỉ sắp xếp trong từng nhóm. */
export function orderCrmProducts<T extends ProductListRow>(rows: T[], score?: (row: T) => number): T[] {
  return [...rows].sort((a, b) => {
    const reviewOrder = Number(b.supplier_review_status === "pending") - Number(a.supplier_review_status === "pending");
    if (reviewOrder) return reviewOrder;
    const relevanceOrder = score ? score(b) - score(a) : 0;
    return relevanceOrder || a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id);
  });
}

/** Kẹp số trang ngoài dải để không tạo trang rỗng khi bộ lọc hoặc dữ liệu thay đổi. */
export function paginateCrmProducts<T>(rows: T[], requestedPage: number, perPage = CRM_PRODUCTS_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const normalized = Number.isFinite(requestedPage) ? Math.max(1, Math.trunc(requestedPage)) : 1;
  const currentPage = Math.min(normalized, pageCount);
  const start = (currentPage - 1) * perPage;
  return {
    visibleRows: rows.slice(start, start + perPage),
    currentPage,
    pageCount,
    firstRow: rows.length ? start + 1 : 0,
    lastRow: Math.min(start + perPage, rows.length),
  };
}
