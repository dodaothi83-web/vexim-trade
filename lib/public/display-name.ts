import type { I18nString } from "@/lib/types";

/**
 * Tên hiển thị cho buyer được soạn từ dữ kiện có cấu trúc, không phải từ tên
 * nhà cung cấp gõ tay.
 *
 * Lý do tách hai trường: tên gốc của nhà cung cấp là chứng từ, phải giữ nguyên
 * văn và không được ghi đè. Nhưng tên gốc thường viết theo thói quen nội bộ
 * ("Black pepper 550 g/L, machine cleaned, new crop, big bag") nên không đọc
 * được như một tên hàng. Tên hiển thị thì soạn theo thứ tự buyer quen đọc:
 * mặt hàng, quy cách, tỉnh, rồi tối đa hai chỉ tiêu phụ.
 *
 * Không bao giờ điền chỗ trống bằng "Chưa xác định". Thiếu dữ kiện thì bỏ phần
 * đó đi, và nếu không soạn được gì thì trả về chuỗi rỗng để nơi gọi lùi về tên gốc.
 */

export interface DisplayNameInput {
  /** Nhãn danh mục tiếng Anh, VD "Pepper" hoặc "Cashew kernels". */
  categoryLabel?: string | null;
  /** Quy cách đã chốt theo thứ tự thuộc tính trước, tên sau. */
  grade?: string | null;
  /** Tỉnh của nhà cung cấp; giữ nguyên cách viết trong hồ sơ. */
  province?: string | null;
  /** Thuộc tính có cấu trúc còn lại; chỉ lấy tối đa hai chỉ tiêu phụ. */
  attributes?: Record<string, string> | null;
  /** Nhãn hiển thị của thuộc tính, theo key. */
  attributeLabels?: Record<string, string> | null;
  /** Các key đã dùng ở phần đầu, không lặp lại ở phần đuôi. */
  skipKeys?: string[];
  maxLength?: number;
}

const PLACEHOLDERS = ["chưa xác định", "chua xac dinh", "unknown", "n/a", "na", "none", "-"];

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return PLACEHOLDERS.includes(text.toLowerCase()) ? "" : text;
}

/** Bỏ phần đuôi trùng với phần đầu ("Pepper 550 g/l, pepper"). */
function alreadyThere(head: string, value: string): boolean {
  return head.toLowerCase().includes(value.toLowerCase());
}

/**
 * Quy cách dạng chữ ("Cassia split", "Star anise", "Black pepper") đã tự nó là
 * tên mặt hàng, nên đứng một mình. Quy cách dạng mã hoặc số đo ("W320",
 * "550 g/l") thì phải ghép sau nhãn danh mục mới đọc được.
 */
function namesTheProduct(grade: string): boolean {
  return grade.includes(" ") && grade.length >= 8;
}

export function composeDisplayName(input: DisplayNameInput): string {
  const maxLength = input.maxLength ?? 110;
  const label = clean(input.categoryLabel);
  const grade = clean(input.grade);
  const province = clean(input.province);

  let head: string;
  if (grade && namesTheProduct(grade)) head = grade;
  else if (label && grade) head = `${label} ${grade}`;
  else head = label || grade;
  // Phần đầu đã dài quá giới hạn thì không cắt giữa từ; trả về rỗng để nơi gọi
  // dùng tên gốc, vốn không bị giới hạn độ dài.
  if (!head || head.length > maxLength) return "";

  const parts = [head];
  let length = head.length;
  const add = (value: string) => {
    if (!value || alreadyThere(parts.join(", "), value)) return;
    if (length + 2 + value.length > maxLength) return;
    parts.push(value);
    length += 2 + value.length;
  };

  add(province);

  const skip = new Set(["grade", "product_type", ...(input.skipKeys ?? [])]);
  const labels = input.attributeLabels ?? {};
  const extras = Object.entries(input.attributes ?? {})
    .filter(([key, value]) => !skip.has(key) && clean(value))
    .slice(0, 2);
  for (const [key, value] of extras) {
    const text = clean(value);
    const attributeLabel = clean(labels[key]);
    // Nhãn chỉ hữu ích khi nó không lặp lại giá trị ("Processing Steam treated").
    add(attributeLabel && !alreadyThere(text, attributeLabel) ? `${attributeLabel} ${text}` : text);
  }

  return parts.join(", ").trim();
}

/**
 * Tên công khai: ưu tiên tên soạn sẵn, thiếu thì lùi về tên gốc của nhà cung cấp.
 * Không dùng hàm này để suy ra danh mục: danh mục luôn suy từ tên gốc, nếu không
 * một cái tên do hệ thống soạn sẽ tự chứng minh cho danh mục của chính nó.
 */
export function publicProductTitle(product: {
  display_name?: string | null;
  name_i18n?: I18nString | null;
  name: string;
}): string {
  return clean(product.display_name) || clean(product.name_i18n?.en) || clean(product.name);
}

/** Tên hiển thị do nhân viên gõ có bị coi là chỗ trống hay không. */
export function isPlaceholderDisplayName(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  return PLACEHOLDERS.includes(value.replace(/\s+/g, " ").trim().toLowerCase());
}
