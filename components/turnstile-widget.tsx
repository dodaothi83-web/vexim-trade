"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { cx } from "@/components/ui";

type TurnstileStatus = "loading" | "interactive" | "success" | "error";

type TurnstileRenderOptions = {
  sitekey: string;
  theme: "light" | "dark" | "auto";
  size: "normal" | "compact" | "flexible";
  appearance: "always" | "execute" | "interaction-only";
  callback: (token: string) => void;
  "before-interactive-callback"?: () => void;
  "error-callback"?: (errorCode: string | number) => boolean | void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  "unsupported-callback"?: () => boolean | void;
};

type TurnstileApi = {
  render: (element: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Keep Cloudflare's iframe out of the loading and error UI. The iframe remains
 * mounted so challenges can run, but only becomes visible when interaction is
 * required. Token validation still happens on the server after form submit.
 */
export function TurnstileWidget({ siteKey, onChange }: {
  siteKey: string;
  onChange: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState<TurnstileStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const fail = useCallback(() => {
    onChangeRef.current(null);
    setStatus("error");
  }, []);

  const renderWidget = useCallback(() => {
    const element = containerRef.current;
    if (!element || widgetIdRef.current || !window.turnstile) return;
    try {
      const id = window.turnstile.render(element, {
        sitekey: siteKey,
        theme: "light",
        size: "flexible",
        appearance: "interaction-only",
        callback: (token) => {
          onChangeRef.current(token);
          setStatus("success");
        },
        "before-interactive-callback": () => setStatus("interactive"),
        "error-callback": () => {
          fail();
          // Tell Cloudflare that the form owns the error presentation.
          return true;
        },
        "expired-callback": fail,
        "timeout-callback": fail,
        "unsupported-callback": () => {
          fail();
          return true;
        },
      });
      widgetIdRef.current = id;
    } catch {
      fail();
    }
  }, [fail, siteKey]);

  // Also cover client-side navigation where the script was loaded already.
  useEffect(() => {
    if (window.turnstile) renderWidget();
  }, [attempt, renderWidget]);

  // A blocked script may not fire a useful browser error in every browser.
  useEffect(() => {
    if (status !== "loading") return;
    const timeout = window.setTimeout(fail, 20_000);
    return () => window.clearTimeout(timeout);
  }, [attempt, fail, status]);

  // Remove the iframe when a multi-step form unmounts this component.
  useEffect(() => () => {
    onChangeRef.current(null);
    const id = widgetIdRef.current;
    if (id && window.turnstile?.remove) {
      try {
        window.turnstile.remove(id);
      } catch {
        // The document is already being discarded or the iframe is gone.
      }
    }
    widgetIdRef.current = null;
  }, []);

  const retry = () => {
    onChangeRef.current(null);
    setStatus("loading");
    const id = widgetIdRef.current;
    if (id && window.turnstile) {
      try {
        window.turnstile.reset(id);
        return;
      } catch {
        // Recreate the widget below if the old instance cannot be reset.
      }
    }
    if (id && window.turnstile?.remove) {
      try {
        window.turnstile.remove(id);
      } catch {
        // The dedicated container is cleared below as a final cleanup.
      }
    }
    widgetIdRef.current = null;
    containerRef.current?.replaceChildren();
    setAttempt((value) => value + 1);
  };

  return (
    <div className="pt-2">
      <Script
        key={attempt}
        src={TURNSTILE_SCRIPT}
        strategy="afterInteractive"
        onLoad={renderWidget}
        onError={fail}
      />
      <div
        data-turnstile-status={status}
        className="relative min-h-[65px] overflow-hidden rounded-xl border border-ink-200 bg-white"
      >
        <div
          ref={containerRef}
          aria-hidden={status !== "interactive"}
          className={cx(
            "w-full transition-opacity duration-200",
            status === "interactive"
              ? "relative min-h-[65px] opacity-100"
              : "pointer-events-none absolute inset-0 opacity-0",
          )}
        />
        {status === "loading" && (
          <div role="status" className="flex min-h-[65px] items-center justify-center gap-2 px-4 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin text-brand-700" aria-hidden="true" />
            Loading security check…
          </div>
        )}
        {status === "success" && (
          <div role="status" className="flex min-h-[65px] items-center justify-center gap-2 px-4 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Security check complete
          </div>
        )}
        {status === "error" && (
          <div role="alert" className="flex min-h-[65px] flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-3 text-sm text-ink-600">
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              We couldn’t complete the security check.
            </span>
            <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-bold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
          </div>
        )}
      </div>
      <noscript><p className="mt-2 text-[12px] text-red-600">Please enable JavaScript to complete the security check.</p></noscript>
    </div>
  );
}
