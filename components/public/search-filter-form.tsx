"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/** GET form keeps filters shareable and works without JS; changes apply as soon as a control changes. */
export function SearchFilterForm({ children, applyLabel, pendingLabel }: {
  children: ReactNode;
  applyLabel: string;
  pendingLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string") params.append(key, value);
    }
    startTransition(() => router.replace(`/search?${params.toString()}`, { scroll: false }));
  }

  return <form action="/search" method="get" aria-busy={pending}
    onChange={(event) => apply(event.currentTarget)}
    onSubmit={(event) => { event.preventDefault(); apply(event.currentTarget); }}>
    {children}
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <button type="submit" className="rounded-lg bg-brand-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
        {applyLabel}
      </button>
      <span role="status" className="text-xs text-ink-500">{pending ? pendingLabel : ""}</span>
    </div>
  </form>;
}
