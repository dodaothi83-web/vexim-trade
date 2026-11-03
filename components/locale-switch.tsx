"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";

import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n/config";
import { cx } from "@/components/ui";

const LABELS: Record<Locale, string> = { en: "EN", vi: "VI" };

/**
 * Chuyển ngôn ngữ khu vực tài khoản bằng cookie.
 *
 * Không đổi URL: các trang này noindex và nằm sau đăng nhập, nên cookie là cách rẻ nhất và
 * không làm hỏng link đã gửi cho người dùng. `router.refresh()` render lại phía server để
 * mọi chuỗi đổi cùng lúc.
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
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white p-0.5">
      <Languages className="mx-1 h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => choose(option)}
          aria-pressed={option === locale}
          disabled={pending}
          lang={option}
          className={cx(
            "rounded-md px-2 py-1 text-[11.5px] font-bold transition disabled:opacity-60",
            option === locale ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
          )}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
