"use client";

import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, Trash2 } from "lucide-react";
import { getSavedProductsState, setSavedProductAction } from "@/app/(public)/buyer/account/actions";

type SavedState = { authenticated: boolean; ids: string[] };
const SavedContext = createContext<{ state: SavedState | null; update: (id: string, saved: boolean) => void; isVi: boolean; loadError: boolean; reload: () => void } | null>(null);

export function BuyerSavedProductsProvider({ children, isVi, sessionKey = "guest" }: { children: ReactNode; isVi: boolean; sessionKey?: string }) {
  // Scope the cache to the account, not a React key around the whole public page.
  // Changing accounts clears visible saved IDs immediately without destroying unfinished forms.
  const [snapshot, setSnapshot] = useState<{ owner: string; state: SavedState } | null>(null);
  const state = snapshot?.owner === sessionKey ? snapshot.state : null;
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
    getSavedProductsState().then((value) => { if (active) setSnapshot({ owner: sessionKey, state: value }); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [retry, pathname, sessionKey]);
  return <SavedContext.Provider value={{ state, isVi, loadError, reload: () => setRetry((value) => value + 1), update: (id, saved) => setSnapshot((previous) => previous?.owner === sessionKey ? { owner: sessionKey, state: { ...previous.state, ids: saved ? [...new Set([...previous.state.ids, id])] : previous.state.ids.filter((value) => value !== id) } } : previous) }}>{children}</SavedContext.Provider>;
}

export function SaveProductButton({ id, href, compact = false, iconOnly = false, removeOnly = false }: { id: string; href: string; compact?: boolean; iconOnly?: boolean; removeOnly?: boolean }) {
  const context = useContext(SavedContext);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  if (!context) return null;
  const { state, update, isVi } = context;
  if (context.loadError) return <button type="button" className="cursor-pointer rounded-lg border border-ink-200 bg-white p-2 text-xs text-brand-700" onClick={context.reload}>{isVi ? "Tải lại mục đã lưu" : "Retry saved products"}</button>;
  const saved = state?.ids.includes(id) ?? false;
  const label = removeOnly ? (isVi ? "Bỏ lưu sản phẩm" : "Remove saved product") : saved ? (isVi ? "Bỏ lưu" : "Remove saved product") : (isVi ? "Lưu sản phẩm" : "Save product");
  const variantClasses = removeOnly ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 hover:bg-ink-50 hover:text-brand-700" : iconOnly ? "inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-brand-700 shadow-sm hover:bg-brand-50" : compact ? "absolute bottom-2 right-2 z-20 rounded-full border border-ink-200 bg-white p-2 text-brand-700 shadow-sm" : "inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700";
  const classes = `${variantClasses} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-wait disabled:opacity-60`;
  if (state && !state.authenticated) return <Link href={`/buyer/sign-in?next=${encodeURIComponent(href)}`} className={classes} aria-label={label} title={label}><Heart className={iconOnly ? "h-5 w-5" : "h-4 w-4"} aria-hidden />{!compact && !iconOnly && !removeOnly && label}</Link>;
  return <>
    <button type="button" className={classes} aria-label={label} title={label} aria-pressed={removeOnly ? undefined : saved} disabled={pending || !state} onClick={() => {
      setError(false);
      startTransition(async () => {
        const result = await setSavedProductAction(id, removeOnly ? false : !saved).catch(() => ({ ok: false }));
        if (result.ok) { update(id, removeOnly ? false : !saved); router.refresh(); } else setError(true);
      });
    }}>{removeOnly ? <Trash2 className="h-4 w-4" aria-hidden /> : <Heart className={`${iconOnly ? "h-5 w-5" : "h-4 w-4"} ${saved ? "fill-current" : ""}`} aria-hidden />}{!compact && !iconOnly && !removeOnly && label}</button>
    {error && <span role="alert" className={iconOnly ? "absolute right-14 top-0 w-60 rounded-lg border border-ink-200 bg-white p-3 text-xs text-red-700 shadow-sm" : compact ? "absolute bottom-2 left-2 right-2 z-20 rounded bg-white p-2 text-xs text-red-700" : "block text-xs text-red-700"}>{removeOnly ? (isVi ? "Chưa bỏ lưu được. Vui lòng thử lại." : "Could not remove. Please try again.") : isVi ? "Chưa lưu được thay đổi. Tối đa 100 sản phẩm. Vui lòng thử lại." : "Could not update. Save up to 100 products. Please try again."}</span>}
  </>;
}
