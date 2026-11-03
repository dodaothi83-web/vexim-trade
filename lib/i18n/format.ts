/**
 * Thay giá trị vào chuỗi mẫu dạng `{ten}`.
 *
 * Cố ý không dùng thư viện i18n: chỉ cần nội suy một chiều, và `Intl` lo phần số/ngày.
 * Giá trị thiếu thì giữ nguyên chỗ trống trong ngoặc để lỗi lộ ra ngay trên giao diện,
 * thay vì in ra "undefined".
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
