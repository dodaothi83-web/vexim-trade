"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface Props {
  categories: { slug: string; name: string }[];
}

/**
 * Ô tìm kiếm ở giữa header public — marketplace-style.
 * Ở GĐ1 chỉ điều hướng thô (search?q=...) để  giữ vững cho
 * sau khi có kết quả thật; client-side nhẹ, không fetch gì ở đây.
 */
export function SiteSearch({ categories }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    setOpen(false);
  }

  const suggestions = categories.filter(
    (c) => q.length >= 1 && c.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <form onSubmit={submit} className="relative w-full max-w-xl">
      <label htmlFor="site-search" className="sr-only">
        Search products and suppliers
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
      />
      <input
        id="site-search"
        name="q"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(e.target.value.length >= 1);
        }}
        onFocus={() => q.length >= 1 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Search products, grades, suppliers… e.g. W320 cashew"
        className="h-11 w-full rounded-md border border-ink-200 bg-white pl-10 pr-28 text-[14px] text-ink-900 placeholder:text-ink-400 shadow-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
        autoComplete="off"
      />
      <button
        type="submit"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-brand-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-800"
      >
        Search
      </button>

      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-md border border-ink-200 bg-white py-1 shadow-lg">
          {suggestions.slice(0, 6).map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  router.push(`/products/${c.slug}`);
                  setQ("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13.5px] text-ink-800 hover:bg-ink-50"
              >
                <Search className="h-3.5 w-3.5 text-ink-400" />
                {c.name}
                <span className="ml-auto text-[11.5px] text-ink-400">category</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
