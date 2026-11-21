import "server-only";

import { supplierStreamSeconds } from "@/lib/media/cloudflare-stream";
import { VIDEO_LIMIT_SECONDS, type VideoKind } from "@/lib/products/aplus";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { effectiveSupplierPlan } from "@/lib/supplier-plans";

export type VideoAllowance =
  | { ok: true; maxSeconds: number; limited: boolean }
  | { ok: false; usedMinutes: number; quotaMinutes: number };

/** Dưới ngần này giây thì coi như hết phút, tránh mở đường tải lên cho video quá ngắn. */
const MIN_REMAINING_SECONDS = 15;

/**
 * Số giây tối đa cho lần tải video tiếp theo: giới hạn theo loại video, nhưng không vượt số phút
 * còn lại của gói (Premium 60, Pro 180, chỉnh ở CRM). Cloudflare từ chối video dài hơn số này,
 * nên không bao giờ lưu quá phần còn lại. Không đọc được số phút đã dùng thì cho tải theo giới hạn loại.
 */
export async function videoUploadAllowance(supplier: { id: string; plan?: string | null; plan_expires_at?: string | null }, kind: VideoKind): Promise<VideoAllowance> {
  const limit = VIDEO_LIMIT_SECONDS[kind];
  const catalog = await readPlanCatalog();
  const quotaMinutes = catalog[effectiveSupplierPlan(supplier)].videoMinutes;
  if (quotaMinutes === null) return { ok: true, maxSeconds: limit, limited: false };
  let used: number;
  try {
    used = await supplierStreamSeconds(supplier.id);
  } catch (error) {
    console.error("[video-quota] cannot read used minutes", error);
    return { ok: true, maxSeconds: limit, limited: false };
  }
  const remaining = quotaMinutes * 60 - used;
  if (remaining < MIN_REMAINING_SECONDS) return { ok: false, usedMinutes: Math.ceil(used / 60), quotaMinutes };
  return remaining < limit ? { ok: true, maxSeconds: Math.floor(remaining), limited: true } : { ok: true, maxSeconds: limit, limited: false };
}

/** Phút hiển thị cho người dùng, ví dụ 1,5. */
export const minutesLabel = (seconds: number, locale: "vi" | "en" = "vi") =>
  (Math.floor(seconds / 6) / 10).toLocaleString(locale === "vi" ? "vi-VN" : "en-GB", { maximumFractionDigits: 1 });

/** Bước chung cho các route xin đường tải video: kiểm tra phút còn lại, trả câu báo theo ngôn ngữ. */
export async function prepareVideoUpload(
  supplier: { id: string; plan?: string | null; plan_expires_at?: string | null },
  kind: VideoKind,
  copy: { videoQuota: string; videoRemaining: string; videoTooLong: string },
  locale: "vi" | "en" = "vi",
): Promise<{ ok: false; message: string } | { ok: true; maxSeconds: number; tooLongMessage: string }> {
  const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
  const allowance = await videoUploadAllowance(supplier, kind);
  if (!allowance.ok) return { ok: false, message: fill(copy.videoQuota, { used: allowance.usedMinutes, quota: allowance.quotaMinutes }) };
  return {
    ok: true, maxSeconds: allowance.maxSeconds,
    tooLongMessage: allowance.limited
      ? fill(copy.videoRemaining, { minutes: minutesLabel(allowance.maxSeconds, locale) })
      : fill(copy.videoTooLong, { minutes: VIDEO_LIMIT_SECONDS[kind] / 60 }),
  };
}
