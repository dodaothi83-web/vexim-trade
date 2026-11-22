import type { Category } from "@/lib/types";

/**
 * Các trường nhiều ngôn ngữ của danh mục. Form CRM chỉ sửa bản tiếng Anh; bản dịch
 * khác (vd tiếng Việt) được nhập riêng và không có ô trên form.
 */
export const CATEGORY_I18N_FIELDS = [
  "name_i18n",
  "intro_i18n",
  "h1_i18n",
  "body_i18n",
  "seo_title_i18n",
  "seo_desc_i18n",
  "homepage_kicker_i18n",
  "hero_alt_i18n",
] as const;

type I18nValue = Record<string, string> | null | undefined;

function englishOf(value: I18nValue): string {
  return typeof value?.en === "string" ? value.en.trim() : "";
}

/**
 * Lưu form CRM không được xoá bản dịch có sẵn. Với mỗi trường form gửi lên:
 * - bản tiếng Anh không đổi → giữ nguyên các ngôn ngữ khác đang có;
 * - bản tiếng Anh đã đổi hoặc trường bị xoá trống → bỏ bản dịch cũ (đã lỗi thời).
 * Trả về đúng các trường cần ghi đè lên `input`.
 */
export function keepCategoryTranslations(
  existing: Pick<Category, (typeof CATEGORY_I18N_FIELDS)[number]>,
  input: Partial<Pick<Category, (typeof CATEGORY_I18N_FIELDS)[number]>>,
): Partial<Category> {
  const out: Record<string, Record<string, string>> = {};
  for (const key of CATEGORY_I18N_FIELDS) {
    if (!Object.hasOwn(input, key)) continue;
    const next = input[key] as I18nValue;
    const prev = existing[key] as I18nValue;
    if (!next || !prev || typeof next !== "object" || typeof prev !== "object") continue;
    if (englishOf(next) !== englishOf(prev)) continue;
    const kept = Object.fromEntries(
      Object.entries(prev).filter(([locale, text]) => locale !== "en" && typeof text === "string" && text.trim() !== ""),
    );
    if (Object.keys(kept).length > 0) out[key] = { ...kept, ...next };
  }
  return out as Partial<Category>;
}

/**
 * Danh sách đường dẫn cũ sau khi đổi slug: thêm slug hiện tại để link cũ tự chuyển
 * tiếp (301), bỏ slug mới nếu danh mục đang quay về một slug từng dùng.
 */
export function previousSlugsAfterRename(
  existing: Pick<Category, "slug" | "previous_slugs">,
  nextSlug: string,
): string[] {
  const list = [...(existing.previous_slugs ?? []), existing.slug]
    .filter((slug): slug is string => typeof slug === "string" && slug.trim() !== "")
    .filter((slug) => slug !== nextSlug);
  return [...new Set(list)];
}

/** Slug mới không được trùng đường dẫn cũ (đang chuyển tiếp) của danh mục khác. */
export function slugReservedByOtherCategory(
  categories: Pick<Category, "id" | "slug" | "previous_slugs" | "name_i18n">[],
  categoryId: string,
  nextSlug: string,
): Pick<Category, "id" | "slug" | "previous_slugs" | "name_i18n"> | null {
  return categories.find((c) => c.id !== categoryId && (c.previous_slugs ?? []).includes(nextSlug)) ?? null;
}
