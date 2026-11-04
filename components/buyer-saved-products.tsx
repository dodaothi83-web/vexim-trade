"use client";

import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Heart } from "lucide-react";
import { getSavedProductsState, setSavedProductAction } from "@/app/(public)/buyer/account/actions";

type SavedState = { authenticated: boolean; ids: string[] };
const SavedContext = createContext<{ state: SavedState | null; update: (id: string, saved: boolean) => void; isVi: boolean; loadError: boolean; reload: () => void } | null>(null);

export function BuyerSavedProductsProvider({ children, isVi }: { children: ReactNode; isVi: boolean }) {
  const [state, setState] = useState<SavedState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const pathname = usePathname();
  useEffect(() => {
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    let active = true;
    setLoadError(false);
    getSavedProductsState().then((value) => { if (active) setState(value); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [retry, pathname]);
  return <SavedContext.Provider value={{ state, isVi, loadError, reload: () => setRetry((value) => value + 1), update: (id, saved) => setState((previous) => previous ? { ...previous, ids: saved ? [...new Set([...previous.ids, id])] : previous.ids.filter((value) => value !== id) } : previous) }}>{children}</SavedContext.Provider>;
}

export function SaveProductButton({ id, href, compact = false, iconOnly = false }: { id: string; href: string; compact?: boolean; iconOnly?: boolean }) {
  const context = useContext(SavedContext);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  if (!context) return null;
  const { state, update, isVi } = context;
  if (context.loadError) return <button type="button" className="rounded-lg border border-ink-200 bg-white p-2 text-xs text-brand-700" onClick={context.reload}>{isVi ? "Tải lại mục đã lưu" : "Retry saved products"}</button>;
  const saved = state?.ids.includes(id) ?? false;
  const label = saved ? (isVi ? "Bỏ lưu" : "Remove saved product") : (isVi ? "Lưu sản phẩm" : "Save product");
  const classes = iconOnly ? "inline-flex h-11 w-11 items-center justify-center rounded-full border border-ink-200 bg-white text-brand-700 shadow-sm" : compact ? "absolute bottom-2 right-2 z-20 rounded-full border border-ink-200 bg-white p-2 text-brand-700 shadow-sm" : "inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700";
  if (state && !state.authenticated) return <Link href={`/buyer/sign-in?next=${encodeURIComponent(href)}`} className={classes} aria-label={label} title={label}><Heart className="h-4 w-4" />{!compact && !iconOnly && label}</Link>;
  return <>
    <button type="button" className={classes} aria-label={label} title={label} aria-pressed={saved} disabled={pending || !state} onClick={() => {
      setError(false);
      startTransition(async () => {
        const result = await setSavedProductAction(id, !saved).catch(() => ({ ok: false }));
        if (result.ok) { update(id, !saved); router.refresh(); } else setError(true);
      });
    }}><Heart className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />{!compact && !iconOnly && label}</button>
    {error && <span role="alert" className={iconOnly ? "absolute right-14 top-0 w-60 rounded-lg border border-ink-200 bg-white p-3 text-xs text-red-700 shadow-sm" : compact ? "absolute bottom-2 left-2 right-2 z-20 rounded bg-white p-2 text-xs text-red-700" : "block text-xs text-red-700"}>{isVi ? "Chưa lưu được thay đổi. Tối đa 100 sản phẩm. Vui lòng thử lại." : "Could not update. Save up to 100 products. Please try again."}</span>}
  </>;
}
