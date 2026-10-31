/**
 * Đối chiếu tên trên giấy chứng nhận với nhà máy đối tác đã khai trong hồ sơ L2.
 *
 * Giấy chứng nhận thường ghi tên pháp nhân đầy đủ ("Công ty TNHH Chế biến Nông sản
 * Tây Nguyên") còn hợp đồng đối tác có thể ghi tên nhà máy ("Nhà máy Chế biến Nông sản
 * Tây Nguyên"). Vì vậy so khớp dựa trên **phần tên riêng** sau khi bỏ loại hình doanh
 * nghiệp, dấu tiếng Việt và dấu câu; không so khớp mờ kiểu "gần giống".
 *
 * Tệp này không import gì để script kiểm tra tải thẳng bằng Node được.
 */

/** Loại hình doanh nghiệp đứng trước tên riêng; bỏ đi khi so khớp. */
const LEGAL_FORMS = [
  "cong ty trach nhiem huu han mot thanh vien",
  "cong ty trach nhiem huu han",
  "cong ty co phan",
  "cong ty hop danh",
  "doanh nghiep tu nhan",
  "doanh nghiep",
  "hop tac xa",
  "chi nhanh",
  "nha may",
  "xuong san xuat",
  "co so san xuat",
  "cong ty",
  "tnhh mtv",
  "tnhh",
  "co phan",
  "cp",
  "mtv",
  "htx",
  "dntn",
];

/** Bỏ dấu tiếng Việt, hạ chữ thường, gộp khoảng trắng và bỏ dấu câu. */
export function normalizeCertificateName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tên riêng sau khi bỏ loại hình doanh nghiệp ở đầu tên. */
export function certificateNameCore(value: string | null | undefined): string[] {
  let text = normalizeCertificateName(value);
  let changed = true;
  while (changed) {
    changed = false;
    for (const form of LEGAL_FORMS) {
      if (text === form) {
        text = "";
        changed = true;
      } else if (text.startsWith(`${form} `)) {
        text = text.slice(form.length + 1).trim();
        changed = true;
      }
    }
  }
  return text ? text.split(" ").filter(Boolean) : [];
}

/**
 * Giấy đứng tên đúng nhà máy đối tác trong hợp đồng L2 hay không.
 *
 * Chỉ nhận khi hai tên trùng nhau sau khi chuẩn hoá, hoặc tên ngắn hơn nằm trọn trong
 * tên dài hơn với ít nhất hai từ riêng — tránh trường hợp hai doanh nghiệp khác nhau
 * chỉ chia sẻ một từ chung như "nông sản".
 */
export function partnerFactoryNameMatches(
  holderName: string | null | undefined,
  partnerFactoryName: string | null | undefined,
): boolean {
  const holder = certificateNameCore(holderName);
  const partner = certificateNameCore(partnerFactoryName);
  if (holder.length === 0 || partner.length === 0) return false;
  if (holder.join(" ") === partner.join(" ")) return true;
  const [shorter, longer] = holder.length <= partner.length ? [holder, partner] : [partner, holder];
  if (shorter.length < 2) return false;
  const longerText = ` ${longer.join(" ")} `;
  return ` ${shorter.join(" ")} `.trim().split(" ").every((token) => longerText.includes(` ${token} `));
}
