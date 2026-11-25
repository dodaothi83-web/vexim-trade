import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";

import { getStore } from "@/lib/db";
import { publicProductCategorySlug } from "@/lib/public/product-selection";
import { SITE_URL } from "@/lib/site";

/**
 * Làm nóng trang chi tiết sản phẩm ngay sau khi nhà cung cấp/nhân viên sửa hoặc duyệt sản phẩm.
 *
 * revalidateProductEdit xoá bản cache của trang (`expire: 0`), nên trước đây NGƯỜI MUA ĐẦU TIÊN mở
 * trang phải chờ máy chủ dựng lại (vài giây, nhất là sản phẩm mới). Giờ, sau khi phản hồi cho người
 * sửa đã gửi xong (`after`), máy chủ tự mở trang công khai một lần — không cookie, như khách — để
 * Next.js dựng và lưu bản cache. Người mua sau đó nhận ngay bản đã dựng.
 *
 * Chỉ là tối ưu tốc độ: không đổi dữ liệu, quyền, hay quy tắc hiển thị. Trang vẫn tự kiểm tra
 * sản phẩm có được công khai không (không công khai thì chỉ trả 404 như mọi lượt xem khác).
 * Lượt mở này không tính là lượt xem (lượt xem do trình duyệt gửi, xem SupplierTrafficBeacon).
 * Lỗi gì cũng bỏ qua: trang vẫn được dựng ở lượt xem đầu như trước.
 */

/** Chờ một chút để lệnh xoá cache của Next.js/CDN có hiệu lực trước khi mở lại trang. */
const WARM_DELAY_MS = 1_500;
/** Dựng trang sản phẩm nặng nhất cũng chỉ vài giây; quá lâu thì bỏ, không giữ hàm chạy. */
const WARM_TIMEOUT_MS = 30_000;
export const WARM_USER_AGENT = "VeximCacheWarm/1.0";

/** Chỉ mở lại chính trang này (tên miền của site hoặc bản deploy hiện tại), không theo Host lạ. */
function allowedHosts(env: Record<string, string | undefined> = process.env): Set<string> {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  const site = new URL(SITE_URL).hostname;
  hosts.add(site);
  hosts.add(site.replace(/^www\./, ""));
  for (const value of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (value) hosts.add(value.toLowerCase());
  }
  return hosts;
}

/** Gốc URL (https://host) của request hiện tại, hoặc null nếu host không nằm trong danh sách cho phép. */
export function warmOrigin(host: string | null, forwardedProto: string | null, env?: Record<string, string | undefined>): string | null {
  const value = host?.split(",")[0]?.trim().toLowerCase();
  if (!value || !/^[a-z0-9.-]+(?::\d{1,5})?$/.test(value)) return null;
  const hostname = value.replace(/:\d+$/, "");
  if (!allowedHosts(env).has(hostname)) return null;
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const proto = forwardedProto?.split(",")[0]?.trim() === "http" || local ? "http" : "https";
  return `${proto}://${value}`;
}

/** Mở lần lượt (không song song) để không dồn tải lên máy chủ và CSDL cùng lúc. */
async function warmNow(productIds: readonly string[], origin: string): Promise<void> {
  const store = getStore();
  const categories = await store.listCategories({ publishedOnly: true });
  const paths: string[] = [];
  for (const productId of productIds) {
    const product = await store.getProduct(productId);
    const slug = product ? publicProductCategorySlug(product, categories) : null;
    if (slug) paths.push(`/products/${encodeURIComponent(slug)}/${encodeURIComponent(productId)}`);
  }
  if (!paths.length) return;
  await new Promise((resolve) => setTimeout(resolve, WARM_DELAY_MS));
  for (const path of paths) {
    try {
      const response = await fetch(`${origin}${path}`, {
        headers: { "user-agent": WARM_USER_AGENT, accept: "text/html" },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
      });
      // Đọc hết nội dung: trang truyền dần (Suspense), bản cache chỉ được lưu khi dựng xong.
      await response.text();
    } catch (error) {
      console.warn("[product-page] cache warm-up failed", path, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Hẹn làm nóng trang sản phẩm sau khi phản hồi hiện tại gửi xong. Gọi từ Server Action hoặc Route
 * Handler (nơi đọc được headers() trong `after`). Gọi ngoài request thì không làm gì.
 */
export function warmProductPageAfterResponse(productId: string): void {
  warmProductPagesAfterResponse([productId]);
}

/** Như trên cho nhiều sản phẩm (ví dụ mọi sản phẩm của một nhà cung cấp): một lần đọc danh mục. */
export function warmProductPagesAfterResponse(productIds: readonly string[]): void {
  if (!productIds.length) return;
  try {
    after(async () => {
      try {
        const requestHeaders = await headers();
        const origin = warmOrigin(
          requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
          requestHeaders.get("x-forwarded-proto"),
        );
        if (origin) await warmNow(productIds, origin);
      } catch (error) {
        console.warn("[product-page] cache warm-up skipped", error instanceof Error ? error.message : error);
      }
    });
  } catch {
    // Không có request (script, test): không cần làm nóng.
  }
}
