/**
 * Quy cách sản phẩm lấy từ đâu.
 *
 * Trước đây trang công khai đọc quy cách bằng cách bắt chữ trong tên sản phẩm
 * trước, rồi mới đến trường có cấu trúc. Như vậy tên gõ tay đè lên dữ liệu nhân
 * viên đã khai: nhân viên chọn W320, tên nhà cung cấp ghi W240, trang công khai
 * hiện W240 và bộ lọc cũng lọc theo W240.
 *
 * Giờ ngược lại. Thứ tự:
 *   1. trường có cấu trúc của danh mục (nhân viên khai, có danh sách lựa chọn)
 *   2. quy cách đọc được từ tên và mô tả ngắn (dữ liệu cũ, hoặc hàng chưa khai)
 *
 * Tên vẫn cần, vì phần lớn sản phẩm hiện có chưa được khai vào trường. Nhưng khi
 * hai bên nói khác nhau thì đó là chỗ để cảnh báo, không phải chỗ để chọn bừa.
 *
 * Phép đọc chữ ở đây trùng với productGrade/pepperGrade trong
 * lib/public/product-selection.ts (tệp đó vẫn giữ nguyên cho các chỗ đang dùng).
 * scripts/check-grade-resolution.mjs so hai bên trên cùng một bảng ví dụ để chúng
 * không lệch nhau về sau.
 */

export type GradeSource = "attributes" | "name" | "none";

export interface GradeResolution {
  /** Giá trị dùng để hiển thị và để lọc. */
  value: string | null;
  source: GradeSource;
  /** Quy cách đọc được từ tên hoặc mô tả ngắn. */
  fromName: string | null;
  /** Quy cách nhân viên đã khai trong trường có cấu trúc. */
  fromAttributes: string | null;
  /** Hai bên đều có giá trị nhưng khác nhau. */
  conflict: boolean;
}

/** Slug có quy cách đọc được bằng máy. "cashew" là slug cũ, giữ để đọc dữ liệu cũ. */
const CASHEW_GRADE_SLUGS = new Set(["cashew", "cashew-kernels"]);

/**
 * Chuẩn hoá để so sánh: không phân biệt hoa thường, gộp khoảng trắng, và coi
 * "550 g/L", "550 g/l", "550g/l" là một.
 */
export function gradeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quy cách hạt điều đọc từ tên: W180, W240, W320, W450, SW, WS, LP, SP. */
export function cashewGradeFromText(name: string, spec: string | null): string | null {
  const text = `${name} ${spec ?? ""}`.toUpperCase();
  const code = /\b(W180|W240|W320|W450|SW|WS|LP|SP)\b/.exec(text)?.[1];
  if (code) return code;
  if (/\bSPLITS?\b/.test(text)) return "WS";
  if (/\bPIECES?\b/.test(text)) return "LP";
  return null;
}

/** Quy cách hồ tiêu đọc từ tên: khối lượng riêng, tính bằng g/l. */
export function pepperGradeFromText(name: string, spec: string | null): string | null {
  const text = `${name} ${spec ?? ""}`.toUpperCase();
  const density = /\b(\d{3})\s*G\s*\/\s*L\b/.exec(text)?.[1];
  return density ? `${density} g/l` : null;
}

/** Quy cách suy ra từ tên, theo đúng danh mục. */
export function gradeFromName(name: string, spec: string | null, categorySlug: string): string | null {
  if (CASHEW_GRADE_SLUGS.has(categorySlug)) return cashewGradeFromText(name, spec);
  if (categorySlug === "pepper") return pepperGradeFromText(name, spec);
  return null;
}

/**
 * Quy cách nhân viên khai trong trường có cấu trúc.
 *
 * Đọc cả `grade` và `product_type` vì quế và hồi tách mặt hàng bằng
 * `product_type` (quế thanh / quế chẻ / hoa hồi), không có trường quy cách riêng.
 * Giá trị đã được lọc theo lựa chọn của danh mục ở publicProductAttributes, nên
 * ở đây không phải kiểm lại danh sách.
 */
export function gradeFromAttributes(attributes: Record<string, string> | null | undefined): string | null {
  if (!attributes) return null;
  return attributes.grade ?? attributes.product_type ?? null;
}

/**
 * Quyết định quy cách cuối cùng.
 *
 * Không bao giờ trộn hai nguồn thành một giá trị: hoặc lấy bên có cấu trúc, hoặc
 * lấy bên đọc từ tên, hoặc không có. Khi cả hai cùng có và khác nhau thì vẫn lấy
 * bên có cấu trúc, đồng thời bật `conflict` để giao diện cảnh báo người nhập.
 */
export function resolveGrade(input: {
  name: string;
  spec?: string | null;
  categorySlug: string;
  attributes?: Record<string, string> | null;
}): GradeResolution {
  const fromAttributes = gradeFromAttributes(input.attributes);
  const fromName = gradeFromName(input.name, input.spec ?? null, input.categorySlug);
  if (fromAttributes) {
    return {
      value: fromAttributes,
      source: "attributes",
      fromName,
      fromAttributes,
      conflict: !!fromName && gradeKey(fromName) !== gradeKey(fromAttributes),
    };
  }
  if (fromName) {
    return { value: fromName, source: "name", fromName, fromAttributes: null, conflict: false };
  }
  return { value: null, source: "none", fromName: null, fromAttributes: null, conflict: false };
}
