import "server-only";

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { authMessages, type AuthMessages } from "./auth";

/** Locale của người dùng lấy từ cookie; không có hoặc sai thì dùng mặc định (tiếng Anh). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value) ?? DEFAULT_LOCALE;
}

/** Từ điển kèm locale để trang truyền xuống client component và đặt đúng thuộc tính lang. */
export async function getAuthMessages(): Promise<{ locale: Locale; m: AuthMessages }> {
  const locale = await getLocale();
  return { locale, m: authMessages[locale] };
}
