export const CRM_PRODUCTS_PAGE_SIZE = 15;

type ProductListRow = {
  id: string;
  name: string;
  supplier_review_status?: "draft" | "pending" | "approved" | "changes_requested" | "paused";
  pendingReview?: boolean;
};

/** Chờ Vexim kiểm tra luôn đứng trước; mức độ khớp và tên chỉ sắp xếp trong từng nhóm. */
export function orderCrmProducts<T extends ProductListRow>(rows: T[], score?: (row: T) => number): T[] {
  return [...rows].sort((a, b) => {
    const reviewOrder = Number(b.pendingReview || b.supplier_review_status === "pending") - Number(a.pendingReview || a.supplier_review_status === "pending");
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

type PriceSummaryInput = {
  ref_price: number | null;
  ref_price_max?: number | null;
  currency: string | null;
  unit: string | null;
  incoterm: string | null;
  incoterm_place: string | null;
  export_port: string | null;
  moq: string | null;
  moq_qty?: number | null;
  moq_unit?: string | null;
  price_valid_until: string | null;
};

export type CrmPriceSummary = {
  /** "$1,450 – 1,600 / MT"; null khi chưa có giá tham khảo. */
  price: string | null;
  /** "FOB Cát Lái · MOQ 1 MT"; null khi chưa khai cả điều kiện giao lẫn MOQ. */
  terms: string | null;
  /** "Đến 31/12/2026"; null khi chưa khai hạn giá. */
  validUntil: string | null;
  expired: boolean;
  /** Có giá nhưng chưa khai hạn: nhắc staff hỏi lại, không chặn gì. */
  missingValidity: boolean;
};

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", VND: "₫" };

/** Số đầy đủ có dấu phân cách nghìn, tối đa 2 chữ số lẻ: staff cần đúng con số để kiểm tra, không rút gọn "1.5K". */
function fullAmount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function money(n: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency];
  return symbol && currency !== "VND" ? `${symbol}${fullAmount(n)}` : `${fullAmount(n)} ${currency}`;
}

function viDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Tóm tắt giá tham khảo cho danh sách sản phẩm CRM (chỉ hiển thị, không đổi dữ liệu hay quy tắc công khai giá).
 * Giá có hiện cho người mua hay không vẫn do productPriceBlockers quyết định (trang gọi riêng).
 * Mỗi sản phẩm có một điều kiện giao hàng duy nhất (FOB, CIF…): hiển thị đúng điều kiện nhà cung cấp đã khai.
 */
export function crmPriceSummary(product: PriceSummaryInput, today: string): CrmPriceSummary {
  const currency = (product.currency || "USD").trim().toUpperCase();
  const unit = product.unit?.trim() || "đv";
  const min = product.ref_price;
  const max = product.ref_price_max;
  const price = min === null || min === undefined || !Number.isFinite(min) ? null
    : max !== null && max !== undefined && Number.isFinite(max) && max > min
      ? `${money(min, currency)} – ${fullAmount(max)} / ${unit}`
      : `${money(min, currency)} / ${unit}`;
  const incoterm = product.incoterm?.trim().toUpperCase() || "";
  const place = product.incoterm_place?.trim() || product.export_port?.trim() || "";
  const moqStructured = product.moq_qty && product.moq_qty > 0
    ? `${fullAmount(product.moq_qty)}${product.moq_unit?.trim() ? ` ${product.moq_unit.trim()}` : ""}`
    : "";
  const moq = moqStructured || product.moq?.trim() || "";
  const terms = [incoterm ? [incoterm, place].filter(Boolean).join(" ") : "", moq ? `MOQ ${moq}` : ""]
    .filter(Boolean).join(" · ") || null;
  const valid = product.price_valid_until?.slice(0, 10) || null;
  return {
    price,
    terms,
    validUntil: valid ? `Đến ${viDate(valid)}` : null,
    expired: !!price && !!valid && valid < today,
    missingValidity: !!price && !valid,
  };
}

/** Chỉ nhận đường dẫn quay lại danh sách sản phẩm CRM (kèm bộ lọc), chặn chuyển hướng ra ngoài. */
export function safeCrmProductsBack(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return /^\/crm\/products(?:\?[^#\s\\]*)?$/.test(v) && !v.includes("//") ? v : "/crm/products";
}
