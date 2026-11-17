import type { I18nString } from "@/lib/types";

/**
 * Lấy chuỗi hiển thị từ một trường i18n.
 *
 * Mặc định (không truyền `lang`, hoặc `lang` là "en"/rỗng): trả bản tiếng Anh,
 * dự phòng chuỗi đầu tiên có trong object, cuối cùng là `fallback`. Hành vi này
 * giữ nguyên như trước để không ảnh hưởng các trang nội bộ (CRM/portal) đang
 * gọi `t(m, fallback)` mà không biết tới khái niệm ngôn ngữ.
 *
 * Truyền `lang` khác "en" (vd "vi") để ưu tiên bản dịch đó khi có; nếu object
 * chưa có khoá đó thì vẫn rơi về bản tiếng Anh/chuỗi đầu tiên — không bao giờ
 * trả chuỗi rỗng chỉ vì thiếu bản dịch.
 */
export function t(
  m: I18nString | string | null | undefined,
  fallback = "",
  lang?: string,
): string {
  if (!m) return fallback;
  if (typeof m === "string") return m;
  if (typeof m !== "object") return fallback;
  const record = m as Record<string, string>;
  const preferred = lang && lang !== "en" ? record[lang] : undefined;
  const v = preferred ?? record.en ?? Object.values(m)[0];
  return typeof v === "string" && v.trim() ? v : fallback;
}

/**
 * Trường i18n đã có bản dịch thật cho `lang` hay chưa.
 *
 * `t()` cố tình rơi về tiếng Anh khi thiếu bản dịch để giao diện không bao giờ
 * trống. Nhưng khi KHAI BÁO hreflang thì hệ quả ngược lại: nếu danh mục chưa có
 * bản tiếng Việt, URL `?lang=vi` vẫn trả nội dung tiếng Anh, mà vẫn tự nhận là
 * bản `vi` — Google coi đó là cặp alternate sai và có thể gộp hai URL làm một.
 * Vì vậy chỉ khai alternate khi hàm này trả true.
 */
export function hasTranslation(
  m: I18nString | string | null | undefined,
  lang: string,
): boolean {
  if (!m || typeof m !== "object") return false;
  const value = (m as Record<string, string>)[lang];
  return typeof value === "string" && value.trim().length > 0;
}
