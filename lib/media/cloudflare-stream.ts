/**
 * Cloudflare Stream cho video A+. Khoá chỉ nằm ở máy chủ: CLOUDFLARE_ACCOUNT_ID và
 * CLOUDFLARE_STREAM_API_TOKEN (quyền Stream:Edit), đặt trên Vercel.
 *
 * Tối ưu đang dùng:
 * - Trình duyệt gửi tệp thẳng tới Cloudflare (direct creator upload), máy chủ Vexim không nhận video.
 * - `allowedOrigins`: video chỉ phát được khi nhúng trên tên miền Vexim, trang khác không lấy được.
 * - `maxDurationSeconds`: Cloudflare từ chối video quá dài, không tốn phút lưu trữ.
 * - Khi lưu, máy chủ hỏi lại Cloudflare để chắc video thuộc đúng sản phẩm; video bị bỏ thì xoá.
 */
import { APLUS_VIDEO_MAX_SECONDS } from "@/lib/products/aplus";
import { SITE_URL } from "@/lib/site";

export function streamConfig(): { account: string; token: string } | null {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();
  return account && token ? { account, token } : null;
}

/** Tên miền được phép nhúng video: bản www, bản không www, và tên miền thêm qua biến môi trường. */
export function streamAllowedOrigins(): string[] {
  const host = new URL(SITE_URL).host;
  const extra = (process.env.CLOUDFLARE_STREAM_EXTRA_ORIGINS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return [...new Set([host, host.replace(/^www\./, ""), ...extra])];
}

const api = (account: string, path: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/stream${path}`;

export type StreamVideo = {
  uid: string;
  readyToStream: boolean;
  state: string | null;
  duration: number | null;
  uploaded: string | null;
  creator: string | null;
  meta: Record<string, unknown>;
};

/** Xin một đường tải lên một lần cho trình duyệt. */
export async function createStreamDirectUpload(input: { supplierId: string; productId: string }):
  Promise<{ uploadURL: string; uid: string } | null> {
  const config = streamConfig();
  if (!config) return null;
  const res = await fetch(api(config.account, "/direct_upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      maxDurationSeconds: APLUS_VIDEO_MAX_SECONDS,
      creator: input.supplierId,
      allowedOrigins: streamAllowedOrigins(),
      // Ảnh bìa lấy ở 10% thời lượng thay vì khung đầu (thường đen hoặc đang mờ dần).
      thumbnailTimestampPct: 0.1,
      meta: { name: `vexim-aplus-${input.productId}`, product_id: input.productId, supplier_id: input.supplierId },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null) as { success?: boolean; result?: { uploadURL?: string; uid?: string } } | null;
  const uploadURL = data?.result?.uploadURL, uid = data?.result?.uid;
  if (!res.ok || !data?.success || typeof uploadURL !== "string" || !/^https:\/\//.test(uploadURL) ||
      typeof uid !== "string" || !/^[a-f0-9]{32}$/i.test(uid)) {
    console.error("[stream] direct upload failed", res.status, data);
    throw new Error("stream_direct_upload_failed");
  }
  return { uploadURL, uid: uid.toLowerCase() };
}

/** Thông tin một video; null khi không có trên tài khoản. Lỗi mạng thì ném lỗi. */
export async function getStreamVideo(uid: string): Promise<StreamVideo | null> {
  const config = streamConfig();
  if (!config) throw new Error("stream_not_configured");
  const res = await fetch(api(config.account, `/${encodeURIComponent(uid)}`), {
    headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(10000), cache: "no-store",
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => null) as { success?: boolean; result?: Record<string, unknown> } | null;
  if (!res.ok || !data?.success || !data.result) throw new Error(`stream_get_failed_${res.status}`);
  const r = data.result;
  const status = r.status as { state?: unknown } | undefined;
  const duration = typeof r.duration === "number" && r.duration > 0 ? r.duration : null;
  return {
    uid: String(r.uid ?? uid).toLowerCase(),
    readyToStream: r.readyToStream === true,
    state: typeof status?.state === "string" ? status.state : null,
    duration,
    uploaded: typeof r.uploaded === "string" ? r.uploaded : null,
    creator: typeof r.creator === "string" ? r.creator : null,
    meta: r.meta && typeof r.meta === "object" ? r.meta as Record<string, unknown> : {},
  };
}

/** Xoá video không còn dùng để không tốn phút lưu trữ. Lỗi chỉ ghi log. */
export async function deleteStreamVideo(uid: string): Promise<void> {
  const config = streamConfig();
  if (!config) return;
  try {
    const res = await fetch(api(config.account, `/${encodeURIComponent(uid)}`), {
      method: "DELETE", headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok && res.status !== 404) console.error("[stream] delete failed", uid, res.status);
  } catch (error) {
    console.error("[stream] delete", uid, error);
  }
}
