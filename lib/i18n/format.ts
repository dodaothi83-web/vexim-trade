/**
 * Thay chỗ giữ `{ten}` trong câu của từ điển.
 *
 * Câu trong từ điển giữ nguyên chỗ trống thay vì nối chuỗi, để dịch giả đổi được thứ tự
 * trong câu mà không phải sửa code. Khoá không có trong `values` thì giữ nguyên cả cụm
 * `{ten}` — thà thấy lỗi ngay trên màn hình còn hơn nuốt mất câu.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole);
}
