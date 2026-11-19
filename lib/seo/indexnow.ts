import "server-only";

import { after } from "next/server";
import { SITE_URL } from "@/lib/site";

/**
 * IndexNow: báo Bing (và các máy tìm kiếm cùng giao thức) ngay khi một trang công
 * khai được đăng, sửa hoặc gỡ, thay vì đợi họ tự quét lại. ChatGPT tìm kiếm dựa
 * trên chỉ mục Bing, nên trang mới lên Bing sớm thì cũng sớm được AI gợi ý.
 *
 * - Key là thông tin công khai: được đặt ở public/<key>.txt để máy tìm kiếm
 *   đối chiếu quyền sở hữu domain.
 * - Chỉ chạy khi site đang mở index (cùng điều kiện với robots.txt/sitemap.xml),
 *   nên staging và giai đoạn trước ra mắt không báo URL nào.
 * - Chạy sau khi phản hồi đã gửi (`after`), có giới hạn thời gian, không bao giờ
 *   ném lỗi: báo lỗi không được làm hỏng thao tác lưu trong CMS.
 */
export const INDEXNOW_KEY = "e6ef7b5f38cb41bc8dde701474dbb2ac";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10_000; // giới hạn của giao thức cho một lần gửi

function indexNowEnabled(): boolean {
  const nonProduction = ["preview", "development"].includes(process.env.VERCEL_ENV ?? "") || process.env.VEXIM_DEPLOY_ENV === "staging";
  return !nonProduction && process.env.PUBLIC_SITE_INDEXABLE === "true" && process.env.INDEXNOW_DISABLED !== "true";
}

/** Chuẩn hoá về URL tuyệt đối trên host chính; bỏ URL ngoài site và trùng lặp. */
export function indexNowUrls(paths: Array<string | null | undefined>): string[] {
  const host = new URL(SITE_URL).host;
  const urls = new Set<string>();
  for (const raw of paths) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      const url = new URL(value, SITE_URL);
      if (url.host !== host || url.protocol !== "https:") continue;
      url.hash = "";
      urls.add(url.toString());
    } catch {
      // Bỏ qua đường dẫn hỏng.
    }
    if (urls.size >= MAX_URLS) break;
  }
  return [...urls];
}

/** Gửi ngay danh sách URL. Trả về mã HTTP, hoặc null khi bị tắt/không có URL/lỗi mạng. */
export async function submitIndexNow(paths: Array<string | null | undefined>): Promise<number | null> {
  if (!indexNowEnabled()) return null;
  const urlList = indexNowUrls(paths);
  if (!urlList.length) return null;
  const host = new URL(SITE_URL).host;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`, urlList }),
      signal: AbortSignal.timeout(8000),
    });
    // 200/202 là đã nhận. 4xx thường do key chưa xác minh hoặc URL sai host.
    if (res.status >= 400) console.error(`[indexnow] submit failed: HTTP ${res.status}`, urlList.slice(0, 5));
    return res.status;
  } catch (error) {
    console.error("[indexnow] submit failed", error);
    return null;
  }
}

/** Báo IndexNow sau khi phản hồi cho người dùng đã gửi xong. Dùng trong server action. */
export function notifyIndexNow(paths: Array<string | null | undefined>): void {
  if (!indexNowEnabled()) return;
  try {
    after(() => submitIndexNow(paths).then(() => undefined));
  } catch {
    // Ngoài phạm vi request (script, test): gửi luôn, không chờ.
    void submitIndexNow(paths);
  }
}
