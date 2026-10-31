import type { I18nString, MediaAsset } from "@/lib/types";
import { isExpired } from "@/lib/media/readiness";

/**
 * Độ hoàn thiện hồ sơ sản phẩm — Phase 1, chỉ đọc.
 *
 * Nguyên tắc:
 *  - Chỉ dùng cột đang có. Không thêm cột, không ghi dữ liệu, không backfill.
 *  - Không phải cổng chặn đăng: cổng thật vẫn là `productPublicationMediaState`
 *    (ảnh đã kiểm tra) và luồng duyệt của Vexim. Đây là thang đo để nhà cung cấp
 *    biết còn thiếu gì, xếp theo mức ảnh hưởng tới việc người mua hiểu sản phẩm.
 *  - Nhắc trong cổng và CRM là đủ; không gửi email nhắc.
 *  - Cổng sản phẩm truyền nội dung đang nhập vào (`supplierView`) để điểm đổi ngay khi
 *    nhà cung cấp gõ; CRM vẫn tính trên bản đã lưu.
 */

export type CompletenessStep = 1 | 2 | 3;

export interface CompletenessItem {
  key: string;
  /** Nhãn 1–3 từ, dùng được trong chip và danh sách. */
  label: string;
  /** Bắt buộc: thiếu là người mua khó hiểu hoặc khó so sánh sản phẩm. */
  required: boolean;
  weight: number;
  /** Bước trong form 3 bước để bổ sung mục này. */
  step: CompletenessStep;
  /** Một câu nói rõ cần điền gì. */
  hint: string;
  /**
   * Nhà cung cấp không có ô nào để tự điền (Vexim chốt khi duyệt). Mục này vẫn tính điểm
   * trong CRM nhưng không hiện thành việc phải làm trong cổng — xem `supplierView`.
   */
  auto?: boolean;
}

/** Phần dữ liệu sản phẩm mà thang đo cần; SupplierProduct thoả interface này. */
export interface CompletenessFacts {
  name?: string | null;
  display_name?: string | null;
  name_i18n?: I18nString | null;
  category?: string | null;
  reviewed_category_slug?: string | null;
  spec?: string | null;
  description?: string | null;
  description_i18n?: I18nString | null;
  ref_price?: number | null;
  moq?: string | null;
  moq_qty?: number | null;
  packaging?: string | null;
  lead_time_days?: number | null;
  payment_terms?: string | null;
  monthly_capacity?: string | null;
  export_port?: string | null;
  /** Phase 2 — cột mới; vắng mặt thì coi như chưa khai. */
  keywords?: string[] | null;
  sample_price_usd?: number | null;
  package_type?: string | null;
  package_weight_kg?: number | null;
}

export type CompletenessMedia = Pick<MediaAsset, "kind" | "audience" | "status" | "expires_on" | "storage_path">;

export interface ProductCompleteness {
  /** 0–100, làm tròn. */
  score: number;
  earned: number;
  total: number;
  /** Mục còn thiếu, bắt buộc trước rồi tới trọng số cao. */
  missing: CompletenessItem[];
  /** Key của các mục đã có. */
  done: string[];
  /** Mục nên bổ sung trước, null khi hồ sơ đã đủ. */
  next: CompletenessItem | null;
  /** Số mục còn thiếu ở từng bước của form. */
  missingByStep: Record<CompletenessStep, number>;
}

/** Trọng số cộng lại đúng 100 để điểm đọc như phần trăm. */
export const COMPLETENESS_ITEMS: CompletenessItem[] = [
  { key: "photo", label: "Ảnh thật", required: true, weight: 16, step: 2, hint: "Tải ít nhất một ảnh sản phẩm và chia sẻ cho người mua." },
  { key: "category", label: "Danh mục", required: true, weight: 10, step: 1, hint: "Chọn danh mục đúng ngành hàng." },
  { key: "price", label: "Giá tham khảo", required: true, weight: 9, step: 1, hint: "Nhập giá theo đơn vị đã chọn." },
  { key: "moq", label: "MOQ", required: true, weight: 9, step: 1, hint: "Cho biết số lượng đặt tối thiểu." },
  { key: "spec", label: "Quy cách", required: true, weight: 9, step: 1, hint: "Ghi quy cách chính để người mua so sánh." },
  { key: "packaging", label: "Đóng gói", required: false, weight: 9, step: 1, hint: "Cách đóng gói và khối lượng mỗi kiện." },
  { key: "lead_time", label: "Thời gian giao", required: false, weight: 7, step: 1, hint: "Số ngày từ khi xác nhận đơn đến khi hàng sẵn sàng giao." },
  { key: "description", label: "Mô tả", required: false, weight: 7, step: 1, hint: "Ba đến năm câu về sản phẩm và ứng dụng." },
  // Tên tiếng Anh do Vexim đặt khi duyệt (dịch từ tên nhà cung cấp nhập); cổng không có ô này.
  { key: "name_en", label: "Tên tiếng Anh", required: false, weight: 5, step: 1, auto: true, hint: "Tên hiển thị cho người mua trên trang công khai." },
  // Phase 2: ba mục dưới đây là cột mới (migration 20261072). Trống thì chỉ mất điểm,
  // không chặn đăng, và không suy đoán giá trị từ cột văn bản cũ.
  { key: "keywords", label: "Từ khoá", required: false, weight: 5, step: 1, hint: "Thêm 1–3 từ khoá tiếng Anh để người mua tìm thấy sản phẩm." },
  { key: "sample_price", label: "Giá mẫu", required: false, weight: 5, step: 1, hint: "Nêu giá mẫu nếu bạn bán mẫu." },
  { key: "package_measure", label: "Kích thước kiện", required: false, weight: 5, step: 1, hint: "Ghi loại kiện và khối lượng mỗi kiện." },
  { key: "payment_terms", label: "Thanh toán", required: false, weight: 2, step: 1, hint: "Ví dụ: 30% đặt cọc, phần còn lại trước khi giao." },
  { key: "capacity", label: "Năng lực tháng", required: false, weight: 1, step: 1, hint: "Sản lượng cung cấp được mỗi tháng." },
  { key: "export_port", label: "Cảng xuất", required: false, weight: 1, step: 1, hint: "Cảng thường dùng để xuất hàng." },
];

export const COMPLETENESS_TOTAL = COMPLETENESS_ITEMS.reduce((sum, item) => sum + item.weight, 0);

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function i18nText(value: I18nString | null | undefined, lang: string): string {
  return value && typeof value === "object" ? text(value[lang]) : "";
}

function positive(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasBuyerPhoto(media: CompletenessMedia[]): boolean {
  return media.some((asset) =>
    asset.kind === "image" &&
    asset.audience === "buyer" &&
    Boolean(asset.storage_path) &&
    !isExpired(asset),
  );
}

function hasAttribute(facts: CompletenessFacts, key: string): boolean {
  switch (key) {
    case "photo":
      return false; // xử lý riêng vì cần danh sách tệp
    case "category":
      return Boolean(text(facts.reviewed_category_slug) || text(facts.category));
    case "price":
      return positive(facts.ref_price);
    case "moq":
      return positive(facts.moq_qty) || Boolean(text(facts.moq));
    case "spec":
      return Boolean(text(facts.spec));
    case "packaging":
      return Boolean(text(facts.packaging));
    case "keywords":
      return Array.isArray(facts.keywords) && facts.keywords.some((k) => text(k));
    case "sample_price":
      // Giá mẫu 0 vẫn là đã khai (tặng mẫu); chỉ null mới là thiếu.
      return typeof facts.sample_price_usd === "number" && Number.isFinite(facts.sample_price_usd) && facts.sample_price_usd >= 0;
    case "package_measure":
      return positive(facts.package_weight_kg) || Boolean(text(facts.package_type));
    case "lead_time":
      return positive(facts.lead_time_days) || facts.lead_time_days === 0;
    case "description":
      return Boolean(text(facts.description) || i18nText(facts.description_i18n, "en"));
    case "name_en":
      return Boolean(text(facts.display_name) || i18nText(facts.name_i18n, "en"));
    case "payment_terms":
      return Boolean(text(facts.payment_terms));
    case "capacity":
      return Boolean(text(facts.monthly_capacity));
    case "export_port":
      return Boolean(text(facts.export_port));
    default:
      return false;
  }
}

export interface CompletenessOptions {
  /**
   * Góc nhìn nhà cung cấp trong cổng sản phẩm: bỏ những mục họ không tự điền được
   * (`auto`), cả khỏi danh sách thiếu lẫn khỏi mẫu số, để không tạo việc giả.
   */
  supplierView?: boolean;
}

/** Danh sách mục còn thiếu, đã sắp xếp: bắt buộc trước, rồi trọng số cao. */
export function productCompleteness(
  facts: CompletenessFacts,
  media: CompletenessMedia[] = [],
  options: CompletenessOptions = {},
): ProductCompleteness {
  const done: string[] = [];
  const missing: CompletenessItem[] = [];
  let earned = 0;

  const items = options.supplierView ? COMPLETENESS_ITEMS.filter((item) => !item.auto) : COMPLETENESS_ITEMS;
  const total = items.reduce((sum, item) => sum + item.weight, 0);

  for (const item of items) {
    const ok = item.key === "photo" ? hasBuyerPhoto(media) : hasAttribute(facts, item.key);
    if (ok) {
      earned += item.weight;
      done.push(item.key);
    } else {
      missing.push(item);
    }
  }

  missing.sort((a, b) =>
    Number(b.required) - Number(a.required) ||
    b.weight - a.weight ||
    items.indexOf(a) - items.indexOf(b));

  const missingByStep: Record<CompletenessStep, number> = { 1: 0, 2: 0, 3: 0 };
  for (const item of missing) missingByStep[item.step] += 1;

  return {
    score: total > 0 ? Math.round((earned / total) * 100) : 0,
    earned,
    total,
    missing,
    done,
    next: missing[0] ?? null,
    missingByStep,
  };
}

/**
 * Câu nhắc ngắn cho thẻ sản phẩm và CRM. Không gửi email; chỉ hiện trong cổng.
 * Ví dụ: "Hồ sơ 70% · còn thiếu ảnh thật".
 */
export function completenessSummary(result: ProductCompleteness): string {
  if (!result.next) return `Hồ sơ đủ ${result.total}/${result.total} mục`;
  return `Hồ sơ ${result.score}% · còn thiếu ${result.next.label.toLowerCase()}`;
}
