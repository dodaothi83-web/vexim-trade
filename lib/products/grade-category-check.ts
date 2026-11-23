/**
 * Kiểm tra grade hiện tại của sản phẩm có thuộc danh mục đang gắn hay không.
 *
 * Grade lệch danh mục thường là dấu vết của một lần đổi danh mục: ví dụ sản phẩm mít sấy
 * từng nằm ở hạt điều nên bảng giá vẫn ghi "W450", hay hoa hồi còn ghi "Cassia whole".
 * Hàm chỉ CẢNH BÁO cho nhân viên Vexim, không chặn lưu và không tự sửa grade: grade trong
 * bảng giá đã duyệt là dữ liệu nhà cung cấp xác nhận.
 */
import { gradeKey } from "@/lib/public/grade-resolution";
import { isBuiltinCategoryGrade, matchStandardGrade, standardGradesForCategory, type CategoryGradeSource } from "./grade-pricing";
import { readQuantityRevisionV2 } from "./quantity-revision-v2";

export type CurrentProductGrade = {
  grade: string;
  /** Grade nhà cung cấp tự đặt cho bảng giá (không thuộc danh sách chuẩn có chủ đích). */
  custom: boolean;
  source: "price" | "specs";
};

type PriceRevisionGrade = { grade?: unknown; tiers?: unknown } | null | undefined;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Grade bảng giá đã duyệt được ưu tiên; không có bảng giá thì dùng grade/loại trong thông số. */
export function currentProductGrade(
  specs: Record<string, unknown> | null | undefined,
  revision: PriceRevisionGrade,
): CurrentProductGrade | null {
  const priceGrade = clean(revision?.grade);
  if (priceGrade) {
    const v2 = readQuantityRevisionV2(revision?.tiers);
    return { grade: priceGrade, custom: v2?.customGrade === true, source: "price" };
  }
  const specGrade = clean(specs?.grade) || clean(specs?.product_type);
  return specGrade ? { grade: specGrade, custom: false, source: "specs" } : null;
}

/**
 * Trả về grade đang lệch danh mục, hoặc null khi grade hợp lệ hay là grade tự đặt.
 * Danh mục chưa khai danh sách grade (vd. mít sấy) vẫn cảnh báo khi grade là grade chuẩn của
 * ngành hàng khác, như "W450" của hạt điều; còn lại thì không có căn cứ để cảnh báo.
 */
export function gradeOutsideCategory(current: CurrentProductGrade | null, category: CategoryGradeSource): string | null {
  if (!current || current.custom || !gradeKey(current.grade)) return null;
  const standard = standardGradesForCategory(category);
  if (!standard.length) return isBuiltinCategoryGrade(current.grade) ? current.grade : null;
  return matchStandardGrade(current.grade, standard) ? null : current.grade;
}

/** Câu cảnh báo dùng chung cho trang review và thông báo sau khi đổi danh mục. */
export function gradeOutsideCategoryMessage(grade: string, current: CurrentProductGrade): string {
  const where = current.source === "price" ? "bảng giá theo số lượng" : "thông số sản phẩm";
  return `Grade “${grade}” không thuộc danh mục này. Sửa lại grade trong ${where} để người mua lọc và so sánh đúng.`;
}
