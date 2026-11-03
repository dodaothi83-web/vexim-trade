import type { Category, SupplierCategoryRequest } from "@/lib/types";

/**
 * Ngành hàng NCC tự khai — ĐƯỜNG DỰ PHÒNG, không phải đường chính.
 *
 * Vì sao có file này: phạm vi bán hàng của NCC bị giới hạn trong các danh mục Vexim đã
 * xuất bản. Khi ngành của họ chưa có trong danh mục (dừa lúc chưa mở), form hồ sơ không có
 * gì để chọn và hồ sơ treo lại: người dùng bỏ đi, nhân viên cũng không biết họ bán gì.
 *
 * Cách chữa giữ nguyên nguyên tắc cũ: **NCC không tự tạo danh mục**. Họ ghi ngành bằng chữ,
 * dưới dạng một YÊU CẦU có trạng thái (`pending` → `opened` | `rejected`):
 *
 *  - lưu ở bảng `supplier_category_requests`, không phải `supplier_categories`;
 *  - KHÔNG cấp phạm vi, KHÔNG mở sản phẩm, KHÔNG hiện với buyer, chỉ CRM đọc;
 *  - gõ đúng một ngành đã mở thì bị từ chối ngay (chọn trong danh sách), gần đúng thì CRM
 *    gợi ý danh mục đã có để nhân viên mở yêu cầu bằng danh mục đó.
 *
 * Hồ sơ vẫn được duyệt bình thường khi chỉ có yêu cầu ngành; sản phẩm chỉ đăng được sau khi
 * ngành đó thực sự mở trong danh mục.
 */

export const REQUESTED_CATEGORY_MAX = 2;
export const REQUESTED_CATEGORY_LENGTH = 120;
/** Nhiều hơn thế thì không ai điền thật; coi như dữ liệu rác. */
const REQUESTED_CATEGORY_TOTAL = 260;

/**
 * Câu cam kết hiện ngay dưới ô nhập — nguyên văn do người đặt yêu cầu chốt.
 *
 * Đây là lời hứa với NCC nên phải nằm trong một hằng số dùng chung: form, email xác nhận
 * và thư trả lời đều trích đúng câu này, không ai diễn giải lại thành khác.
 */
export const REQUESTED_CATEGORY_PROMISE_VI =
  "Vexim sẽ xem xét mở ngành này trong 3 ngày làm việc và báo bạn qua email. Hồ sơ doanh nghiệp vẫn được duyệt, sản phẩm đăng được khi ngành đã mở.";

export const REQUESTED_CATEGORY_PROMISE_EN =
  "Vexim reviews this industry within 3 working days and replies by email. Your company profile is still reviewed, and you can publish products once the industry is open.";

/** Bỏ dấu để so khớp: "Dừa" và "dua" phải bị coi là cùng một ngành. */
export function foldCategoryLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tên gọi của một danh mục, gồm cả tiếng Việt, tiếng Anh và slug để so khớp. */
function categoryNames(category: Pick<Category, "slug" | "name_i18n">): string[] {
  const names = [category.slug, ...Object.values(category.name_i18n ?? {})]
    .filter((name): name is string => typeof name === "string" && !!name.trim());
  return [...new Set(names.map(foldCategoryLabel).filter(Boolean))];
}

/** Hai từ ghép có giao nhau không: "cơm dừa sấy" và "dừa" chia sẻ từ "dua". */
function shareWord(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const words = new Set(a.split(" ").filter((word) => word.length >= 3));
  return b.split(" ").some((word) => word.length >= 3 && words.has(word));
}

export type CategoryMatch = {
  category: Pick<Category, "slug" | "name_i18n">;
  /** `exact` = trùng tên đã mở; `near` = gợi ý gần đúng để nhân viên chọn. */
  kind: "exact" | "near";
};

/**
 * So khớp một ngành tự khai với danh mục đang mở, gần đúng trước khi chặn trùng.
 *
 * Vì sao cần "gần đúng": NCC gõ "coconut", "cơm dừa", "dừa sấy" trong khi danh mục tên
 * "Dừa" — chỉ so trùng tuyệt đối thì CRM hiện 3 yêu cầu cho cùng một ngành và nhân viên
 * phải tự nhận ra. Gợi ý này chỉ để hiển thị cho nhân viên quyết định; nó KHÔNG tự mở
 * quyền gì.
 */
export function matchOpenCategory(
  label: string,
  options: readonly Pick<Category, "slug" | "name_i18n">[],
): CategoryMatch | null {
  const needle = foldCategoryLabel(label);
  if (!needle) return null;
  let near: CategoryMatch | null = null;
  for (const category of options) {
    for (const name of categoryNames(category)) {
      if (!name) continue;
      if (name === needle) return { category, kind: "exact" };
      if (!near && shareWord(needle, name)) near = { category, kind: "near" };
    }
  }
  return near;
}

export type RequestedCategoryInput = {
  /** Giá trị thô của ô "ngành khác" (có thể nhiều ngành, ngăn bằng dấu phẩy). */
  note?: string | null;
  /** Các danh mục NCC đã chọn được (slug). */
  selected: readonly string[];
};

export type RequestedCategoryResult =
  | { ok: true; note: string | null; requests: { label: string; normalized: string }[] }
  | { ok: false; reason: "too_long" | "too_many" | "already_open" | "empty" };

/**
 * Chuẩn hoá yêu cầu "ngành khác" trước khi lưu.
 *
 * Không có yêu cầu thì trả `null` (cột sạch). Có yêu cầu thì phải là ngành Vexim CHƯA mở:
 * ngành đã mở thì NCC chọn danh mục là xong, ghi chú chỉ làm nhân viên phải đọc hai chỗ.
 */
export function parseRequestedCategory(input: RequestedCategoryInput, options: readonly Pick<Category, "slug" | "name_i18n">[]): RequestedCategoryResult {
  const raw = (input.note ?? "").trim();
  if (!raw) return { ok: true, note: null, requests: [] };
  if (raw.length > REQUESTED_CATEGORY_TOTAL) return { ok: false, reason: "too_long" };

  const parts = [...new Set(raw.split(/[,;\n]+/).map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean))];
  if (!parts.length) return { ok: true, note: null, requests: [] };
  if (parts.length > REQUESTED_CATEGORY_MAX) return { ok: false, reason: "too_many" };
  if (parts.some((part) => part.length > REQUESTED_CATEGORY_LENGTH)) return { ok: false, reason: "too_long" };

  for (const part of parts) {
    // Ngành đã mở (kể cả gần đúng) thì phải chọn bằng danh sách, không ghi bằng chữ.
    const match = matchOpenCategory(part, options);
    if (match?.kind === "exact") return { ok: false, reason: "already_open" };
    // Chốt an toàn: chỉ nhận chữ, số và vài dấu phân cách thông dụng, không nhận URL/markup.
    if (!/^[\p{L}\p{N} .,'()/+-]+$/u.test(part)) return { ok: false, reason: "empty" };
  }
  return {
    ok: true,
    note: parts.join(", "),
    requests: parts.map((label) => ({ label, normalized: foldCategoryLabel(label) })),
  };
}

/** Ledger theo NCC: NCC đọc được câu trả lời của mình ngay trên cổng. */
export type CategoryRequestView = {
  label: string;
  status: SupplierCategoryRequest["status"];
  categorySlug: string | null;
  note: string | null;
  decidedAt: string | null;
};

export function categoryRequestViews(rows: readonly SupplierCategoryRequest[]): CategoryRequestView[] {
  return rows.map((row) => ({
    label: row.label,
    status: row.status,
    categorySlug: row.category_slug,
    note: row.note,
    decidedAt: row.decided_at,
  }));
}

/**
 * Gom yêu cầu còn chờ cho CRM: một dòng cho mỗi ngành, kèm số NCC và gợi ý danh mục đã có.
 *
 * Gom theo `normalized` để "Dừa", "dua", "Dừa " không thành ba dòng. Chữ hiển thị lấy bản
 * gõ nhiều nhất (dễ đọc nhất với nhân viên), kèm danh sách NCC để bấm vào xử lý.
 */
export type CategoryRequestGroup = {
  normalized: string;
  label: string;
  count: number;
  supplierIds: string[];
  labels: string[];
  suggestion: CategoryMatch | null;
  oldestRequestedAt: string;
  /** Id của từng yêu cầu trong nhóm, để một lần trả lời chốt cả nhóm. */
  requestIds: string[];
};

export function groupPendingCategoryRequests(
  rows: readonly SupplierCategoryRequest[],
  options: readonly Pick<Category, "slug" | "name_i18n">[],
): CategoryRequestGroup[] {
  const groups = new Map<string, CategoryRequestGroup>();
  for (const row of rows) {
    if (row.status !== "pending") continue;
    const key = row.normalized || foldCategoryLabel(row.label);
    if (!key) continue;
    const current = groups.get(key);
    if (current) {
      current.count += 1;
      if (!current.supplierIds.includes(row.supplier_id)) current.supplierIds.push(row.supplier_id);
      current.requestIds.push(row.id);
      if (!current.labels.includes(row.label)) current.labels.push(row.label);
      if (row.created_at < current.oldestRequestedAt) current.oldestRequestedAt = row.created_at;
      continue;
    }
    groups.set(key, {
      normalized: key,
      label: row.label,
      count: 1,
      supplierIds: [row.supplier_id],
      labels: [row.label],
      suggestion: matchOpenCategory(row.label, options),
      oldestRequestedAt: row.created_at,
      requestIds: [row.id],
    });
  }
  // Nhóm đông NCC nhất lên trước: đó là ngành đáng mở trước.
  return [...groups.values()].sort((a, b) => b.count - a.count || a.oldestRequestedAt.localeCompare(b.oldestRequestedAt));
}

/** Nhân viên đọc đúng một dòng trong CRM; hồ sơ cũ không có yêu cầu thì trả `null`. */
export function requestedCategoryLabel(supplier: { requested_category_other?: string | null }): string | null {
  const note = supplier.requested_category_other?.trim();
  return note ? note : null;
}
