/**
 * Mã số thuế (MST) trong danh sách nhà cung cấp CRM: tìm kiếm và phát hiện trùng.
 *
 * MST doanh nghiệp có 10 chữ số; chi nhánh/đơn vị phụ thuộc thêm 3 số (0101234567-001).
 * Người nhập có thể gõ dấu cách, chấm hay gạch ngang, nên luôn so trên dãy chữ số.
 * Chi nhánh dùng chung 10 số đầu với công ty mẹ: coi là cùng doanh nghiệp để staff
 * thấy và tự quyết có gộp hay không (chỉ gắn nhãn, không tự gộp hay chặn).
 */

/** Dãy chữ số của MST; chuỗi rỗng khi không có số nào. */
export function taxIdDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Khoá so trùng: 10 số đầu (MST doanh nghiệp). Quá ngắn thì không đủ căn cứ để so. */
export function taxIdKey(raw: string | null | undefined): string | null {
  const digits = taxIdDigits(raw);
  return digits.length >= 10 ? digits.slice(0, 10) : null;
}

/** MST hiển thị gọn: 10 số, thêm "-xxx" khi là chi nhánh. */
export function formatTaxId(raw: string | null | undefined): string {
  const digits = taxIdDigits(raw);
  if (digits.length === 13) return `${digits.slice(0, 10)}-${digits.slice(10)}`;
  return digits || (raw ?? "").trim();
}

/**
 * Từ khoá là một đoạn MST (chỉ gồm số và dấu cách/chấm/gạch, ít nhất 3 số) thì so trên dãy
 * chữ số, để "0110 001 327" vẫn tìm ra 0110001327. Trả về null khi từ khoá không phải MST.
 */
export function taxIdNeedle(query: string): string | null {
  const trimmed = query.trim();
  if (!/^[\d\s.\-]+$/.test(trimmed)) return null;
  const digits = taxIdDigits(trimmed);
  return digits.length >= 3 ? digits : null;
}

export function taxIdMatches(raw: string | null | undefined, needle: string | null): boolean {
  return !!needle && taxIdDigits(raw).includes(needle);
}

/** Số nhà cung cấp theo từng khoá MST, chỉ giữ khoá xuất hiện từ 2 lần trở lên. */
export function duplicateTaxIds(rows: ReadonlyArray<{ tax_id: string | null | undefined }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = taxIdKey(row.tax_id);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) if (count < 2) counts.delete(key);
  return counts;
}
