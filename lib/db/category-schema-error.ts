/* Only translate PostgREST's missing category column error. Never skip a failed write. */
export function categorySchemaError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  if (!/\b(?:createCategory|updateCategory)\b/.test(message)) return null;
  if (!/\b(?:PGRST204|schema cache)\b/i.test(message)) return null;
  if (!/\bcategories\b/i.test(message) || !/\bcolumn\b/i.test(message)) return null;
  return "CSDL Supabase đang thiếu cột CMS của danh mục. Quản trị viên cần chạy toàn bộ supabase/migrations/20261017_cms_supplier_images.sql trong SQL Editor của đúng project ứng dụng đang dùng, sau đó chạy NOTIFY pgrst, 'reload schema'; và thử lưu lại. Không có thay đổi nào được lưu.";
}
