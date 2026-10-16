import type { I18nString } from "@/lib/types";

/** Lấy chuỗi tiếng Anh (fallback chuỗi đầu tiên, cuối cùng là fallback truyền vào). */
export function t(
  m: I18nString | string | null | undefined,
  fallback = "",
): string {
  if (!m) return fallback;
  if (typeof m === "string") return m;
  if (typeof m !== "object") return fallback;
  const v = (m as Record<string, string>).en ?? Object.values(m)[0];
  return typeof v === "string" ? v : fallback;
}
