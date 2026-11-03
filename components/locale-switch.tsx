"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Languages } from "lucide-react";

import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/config";

/**
 * Chọn ngôn ngữ khu vực tài khoản bằng cookie.
 *
 * Không đổi URL: các trang này noindex và nằm sau đăng nhập, nên cookie là cách rẻ nhất và
 * không làm hỏng link đã gửi cho người dùng. `router.refresh()` render lại phía server để
 * mọi chuỗi đổi cùng lúc.
 *
 * Dùng ô chọn thả xuống (native `<select>`) thay vì hai nút: chỉ một lựa chọn đang bật nên
 * một ô chọn đọc đúng bản chất hơn, và trên điện thoại nó mở danh sách quen thuộc của hệ điều
 * hành. Mỗi lựa chọn ghi tên ngôn ngữ bằng chính ngôn ngữ đó (`LOCALE_NAMES`), để người không
 * quen chữ viết tắt "EN/VI" vẫn hiểu.
 */
export function LocaleSwitch({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <span className="relative inline-flex items-center rounded-lg border border-ink-200 bg-white">
      <Languages className="ml-2 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
      <select
        value={locale}
        onChange={(event) => choose(event.target.value as Locale)}
        aria-label={label}
        disabled={pending}
        className="appearance-none bg-transparent py-1.5 pl-1.5 pr-7 text-[11.5px] font-bold text-ink-700 disabled:opacity-60"
      >
        {LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
    </span>
  );
}
