/**
 * Tệp chứng nhận tải theo luồng cũ (chọn ô HACCP / chứng chỉ sản phẩm) chỉ là tệp, không
 * có bản ghi chứng nhận. Khi kho chứng nhận đã có bản ghi cho cùng loại giấy đó, giữ
 * thêm dòng "Tệp chứng nhận đã tải trước đây" chỉ làm nhà cung cấp tưởng còn thiếu giấy.
 *
 * Module thuần, không đọc/ghi gì: trang Giấy tờ dùng nó để **ẩn dòng hiển thị**. Tệp vẫn
 * nằm nguyên trong kho, không xoá, không đổi dữ liệu.
 */

/** Từ chỉ hình thức tệp hoặc từ đệm — không dùng để so tên giấy. */
const NOISE = new Set([
  "giay", "chung", "nhan", "chat", "luong", "certificate", "cert", "file", "tai", "lieu",
  "ban", "sao", "pdf", "png", "jpg", "jpeg", "webp", "img", "image", "scan", "anh", "photo",
  "cua", "va", "cho", "ve", "banchup", "copy", "final", "signed", "ky",
]);

/** Bỏ dấu, viết thường, chỉ giữ chữ và số: "Chứng nhận HACCP TINIMEX.png" → "chung nhan haccp tinimex png". */
function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueTokens(value: string | null | undefined): string[] {
  return [...new Set(normalize(value).split(" ").filter(Boolean))];
}

/** Từ mang nghĩa nhận dạng giấy (bỏ "giay", "chung nhan", đuôi tệp…). */
function meaningful(tokens: readonly string[]): string[] {
  return tokens.filter((token) => !NOISE.has(token));
}

/** Có ít nhất một từ đủ dài để coi là trùng loại giấy, tránh khớp nhờ "iso" hay "2026". */
function hasDistinctive(tokens: readonly string[]): boolean {
  return tokens.some((token) => token.length >= 4);
}

/**
 * Tệp cũ này đã được thay bằng một bản ghi chứng nhận cùng loại giấy chưa?
 *
 * So theo **từ**, không theo ký tự: tên giấy phải nằm trọn trong tên tệp (hoặc ngược lại)
 * và có ít nhất một từ ≥ 4 ký tự. Nhờ vậy "HACCP" khớp "Chứng nhận HACCP TINIMEX.png",
 * còn "ISO 22000:2018" **không** khớp tệp "Chứng nhận ISO 22000 TINIMEX.png" (khác năm) —
 * thà để lại một dòng thừa còn hơn ẩn nhầm tệp mà kho chưa có bản ghi.
 */
export function legacyCertificateFileCovered(
  caption: string | null | undefined,
  certificateNames: readonly string[],
): boolean {
  const fileTokens = uniqueTokens(caption);
  const fileMeaningful = meaningful(fileTokens);
  if (fileMeaningful.length === 0) return false;

  for (const name of certificateNames) {
    const nameTokens = uniqueTokens(name);
    const nameMeaningful = meaningful(nameTokens);
    if (nameMeaningful.length === 0) continue;

    // Tên giấy nằm gọn trong tên tệp: giấy "HACCP" ⊂ tệp "chung nhan haccp tinimex png".
    if (hasDistinctive(nameMeaningful) && nameMeaningful.every((token) => fileTokens.includes(token))) {
      return true;
    }
    // Tên tệp nằm gọn trong tên giấy: tệp "haccp.pdf" vs giấy "Chứng nhận HACCP TINIMEX".
    if (hasDistinctive(fileMeaningful) && fileMeaningful.every((token) => nameTokens.includes(token))) {
      return true;
    }
  }
  return false;
}

/** Lọc danh sách tệp cũ còn nên hiển thị. */
export function visibleLegacyCertificateFiles<T extends { caption?: string | null }>(
  files: readonly T[],
  certificateNames: readonly string[],
): T[] {
  const names = certificateNames.filter((name) => normalize(name).length > 0);
  return files.filter((file) => !legacyCertificateFileCovered(file.caption, names));
}
