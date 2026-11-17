/**
 * Domain chính của landing công khai. veximtrade.com (không www) chuyển hướng về
 * www.veximtrade.com, nên mọi canonical, sitemap và Open Graph đều dùng bản www.
 */
export const SITE_URL = "https://www.veximtrade.com";

/**
 * Tên thương hiệu hiển thị, viết đúng chính tả: "Vexim Trade" (hai từ, có khoảng
 * trắng). Trước đây nhiều trang tự viết "Veximtrade" hoặc tự ghép thêm
 * "| Vexim Trade" vào tiêu đề, rồi template ở app/layout.tsx ghép thêm
 * " · Vexim Trade" một lần nữa — kết quả là tiêu đề hiện trên Google thành
 * "… | Vexim Trade · Vexim Trade". Dùng hằng số + helper dưới đây thay vì tự
 * viết tên thương hiệu trong từng trang.
 */
export const SITE_NAME = "Vexim Trade";

/**
 * Dựng `title` cho một trang.
 *
 * - Trả `{ absolute }` để Next.js KHÔNG ghép template `%s · Vexim Trade` của
 *   layout gốc thêm lần nữa, tránh lặp tên thương hiệu hai lần.
 * - Tự bỏ hậu tố thương hiệu nếu trang đã lỡ viết sẵn (kể cả biến thể cũ
 *   "Veximtrade"), rồi ghép đúng một lần với dấu "·".
 *
 * Dùng cho mọi trang có title tự dựng; trang không muốn có tên thương hiệu thì
 * truyền `{ brand: false }`.
 */
export function pageTitle(text: string, options: { brand?: boolean } = {}): { absolute: string } {
  const cleaned = text
    .replace(/\s*[|·–—-]\s*Vexim\s*Trade\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const label = cleaned || SITE_NAME;
  const alreadyBranded = new RegExp(`(?:^|[·|–—-]\\s*)${SITE_NAME}$`, "i").test(label);
  if (options.brand === false || alreadyBranded) return { absolute: label };
  return { absolute: `${label} · ${SITE_NAME}` };
}
