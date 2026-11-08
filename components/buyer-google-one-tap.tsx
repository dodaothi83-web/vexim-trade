"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCookieConsent } from "@/components/cookie-consent";
import { ONE_TAP_COOLDOWN_MS, ONE_TAP_DISMISS_KEY, oneTapCooldownActive, oneTapPublicPath } from "@/lib/buyer/one-tap";
import { usePublicSessionActions } from "@/lib/buyer/public-session-context";

type GoogleIdentity = {
  initialize(options: { client_id: string; nonce: string; auto_select: false; cancel_on_tap_outside: true;
    use_fedcm_for_prompt: true; context: "signin"; callback: (result: { credential?: string }) => void }): void;
  prompt(): void;
  cancel(): void;
};
type IdentityWindow = Window & { google?: { accounts?: { id?: GoogleIdentity } } };

/** Google owns the prompt. No custom imitation, auto-selection or internal-account session. */
export function BuyerGoogleOneTap({ clientId, isVi }: { clientId: string; isVi: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { refresh: refreshPublicSession } = usePublicSessionActions();
  const { ready, record } = useCookieConsent();
  const [eligible, setEligible] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState("/buyer/sign-in");
  const publicPath = oneTapPublicPath(pathname ?? "/");

  useEffect(() => {
    setEligible(false);
    // Resolve the privacy-choice banner first. Authentication is not tied to analytics consent.
    if (!ready || !record || !publicPath || window.location.protocol !== "https:") return;
    try {
      if (oneTapCooldownActive(localStorage.getItem(ONE_TAP_DISMISS_KEY))) return;
    } catch { return; } // Storage unavailable: use the existing explicit sign-in entrance instead.
    const timer = window.setTimeout(() => setEligible(true), 1500);
    return () => window.clearTimeout(timer);
  }, [ready, record, pathname, publicPath]);

  useEffect(() => {
    if (!eligible || !sdkReady || !publicPath) return;
    let active = true;
    let busy = false;
    const controller = new AbortController();
    const identity = (window as IdentityWindow).google?.accounts?.id;
    if (!identity) return;
    async function start() {
      try {
        // Shared across tabs and page changes, even if FedCM does not report dismissal moments.
        if (oneTapCooldownActive(localStorage.getItem(ONE_TAP_DISMISS_KEY))) return;
        const response = await fetch("/api/auth/google/buyer/one-tap", {
          method: "PUT", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok || !active) return;
        const data = await response.json();
        if (!active || typeof data.nonce !== "string" || !/^[a-f0-9]{64}$/.test(data.nonce)) return;
        identity!.initialize({
          client_id: clientId, nonce: data.nonce, auto_select: false,
          cancel_on_tap_outside: true, use_fedcm_for_prompt: true, context: "signin",
          callback: async ({ credential }) => {
            if (!active || busy || !credential) return;
            busy = true;
            try {
              const result = await fetch("/api/auth/google/buyer/one-tap", {
                method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
                headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }),
              });
              if (!active) return;
              if (!result.ok) throw new Error("Sign-in unavailable");
              identity!.cancel();
              // Không biết trước email ở đây (route chỉ trả { ok: true }) nên không thể cập
              // nhật lạc quan như luồng mã email — hỏi lại /api/public/session để header/
              // saved-products/one-tap gate thấy đúng trạng thái, không cần điều hướng hay
              // remount form đang dang dở. router.refresh() giữ lại để các Server Component
              // khác (nếu có) trên trang cũng được làm mới.
              refreshPublicSession();
              router.refresh();
            } catch {
              if (!active) return;
              setRetry(`/buyer/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
              setFailed(true);
            }
          },
        });
        localStorage.setItem(ONE_TAP_DISMISS_KEY, String(Date.now() + ONE_TAP_COOLDOWN_MS));
        identity!.prompt();
      } catch { /* A blocked SDK/provider is optional; existing email and Google buttons still work. */ }
    }
    void start();
    return () => { active = false; controller.abort(); identity.cancel(); };
  }, [eligible, sdkReady, clientId, pathname, publicPath, router]);

  return <>
    {eligible && publicPath && <Script id="buyer-google-identity" src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setSdkReady(true)} />}
    {failed && <div role="status" className="fixed bottom-5 right-4 z-40 max-w-sm rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-800 shadow-sm">
      <p>{isVi ? "Chưa đăng nhập được bằng Google." : "Google sign-in could not be completed."}</p>
      <Link href={retry} className="mt-2 inline-block font-semibold text-brand-700 underline">
        {isVi ? "Đăng nhập bằng cách khác" : "Sign in another way"}
      </Link>
      <button type="button" onClick={() => setFailed(false)} className="ml-4 px-2 py-2 text-ink-600">{isVi ? "Đóng" : "Close"}</button>
    </div>}
  </>;
}
