"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { BuyerSignInForm } from "@/components/buyer-sign-in-form";
import type { BuyerAuthMessages } from "@/lib/i18n/buyer-auth";
import type { Locale } from "@/lib/i18n/config";
import { lockDialogScroll } from "@/lib/browser/dialog-scroll-lock";
import { safeNextPath } from "@/lib/buyer/next-path";

type Auth = { email: string | null; requireBuyer: (next: string, resume?: () => void, forceSignIn?: boolean) => void };
const Context = createContext<Auth>({ email: null, requireBuyer: () => {} });
export const useBuyerEnquiryAuth = () => useContext(Context);

export function BuyerEnquiryAuthProvider({ buyerEmail, locale, messages, children }: {
  buyerEmail: string | null; locale: Locale; messages: BuyerAuthMessages; children: ReactNode;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(buyerEmail);
  const [next, setNext] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const resume = useRef<(() => void) | undefined>(undefined);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => setEmail(buyerEmail), [buyerEmail]);
  const requireBuyer = useCallback((destination: string, continuation?: () => void, forceSignIn = false) => {
    const safe = safeNextPath(destination) ?? (destination.startsWith("/rfq?") ? "/rfq" : null);
    if (!safe) return;
    if (email && !forceSignIn) { if (continuation) continuation(); else router.push(safe); return; }
    if (forceSignIn) setEmail(null);
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resume.current = continuation;
    setNext(safe);
  }, [email, router]);

  // One gate for all current and future /rfq links, including cards, header and comparison tray.
  // Capture precedes Next Link navigation; modified clicks retain native browser behaviour,
  // with the same authentication requirement enforced on the destination and submission.
  useEffect(() => {
    function intercept(event: MouseEvent) {
      if (email || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !/^\/rfq\/?$/.test(url.pathname)) return;
      event.preventDefault();
      event.stopPropagation();
      trigger.current = anchor;
      resume.current = undefined;
      setNext(safeNextPath(url.pathname + url.search + url.hash) ?? "/rfq");
    }
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [email]);

  useEffect(() => {
    if (!next) return;
    const element = dialog.current;
    const unlock = lockDialogScroll();
    element?.showModal();
    return () => { element?.close(); unlock(); trigger.current?.focus(); };
  }, [next]);

  function close() { setNext(null); resume.current = undefined; }
  function signedIn(verifiedEmail: string) {
    const destination = next;
    const continuation = resume.current;
    setEmail(verifiedEmail);
    close();
    if (continuation) continuation();
    else if (destination) router.push(destination);
    router.refresh();
  }
  return <Context.Provider value={{ email, requireBuyer }}>
    {children}
    <dialog ref={dialog} aria-labelledby="buyer-quick-auth-title" onCancel={close}
      onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } }}
      className="m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-ink-200 bg-white p-6 text-ink-900 shadow-xl backdrop:bg-black/40">
      <div className="flex items-center justify-between gap-3"><h2 id="buyer-quick-auth-title" className="text-lg font-bold">{locale === "vi" ? "Đăng nhập / Tạo tài khoản" : "Sign in / Create account"}</h2>
        <button type="button" onClick={close} aria-label={locale === "vi" ? "Đóng" : "Close"} className="rounded-lg p-2 hover:bg-ink-50"><X className="h-5 w-5" /></button>
      </div>
      {next && <BuyerSignInForm key={next} messages={messages} lang={locale} next={next} compact onSignedIn={signedIn} />}
    </dialog>
  </Context.Provider>;
}

/** Direct/bookmarked/new-tab RFQ visits also authenticate before any enquiry form is rendered. */
export function BuyerEnquiryEntry({ next }: { next: string }) {
  const { requireBuyer } = useBuyerEnquiryAuth();
  useEffect(() => { requireBuyer(next); }, [requireBuyer, next]);
  return <div className="mx-auto max-w-md px-5 py-16"><button type="button" className="btn btn-primary" onClick={() => requireBuyer(next)}>Sign in / Create account</button><noscript><a href={`/buyer/sign-in?next=${encodeURIComponent(safeNextPath(next) ?? "/rfq")}`}>Sign in / Create account</a></noscript></div>;
}
