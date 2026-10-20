"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { Cookie, Settings2, X } from "lucide-react";

import {
  ACCEPTED_COOKIE_CONSENT,
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_MAX_AGE_SECONDS,
  COOKIE_CONSENT_VERSION,
  REJECTED_COOKIE_CONSENT,
  cookieConsentFromDocument,
  normalizeCookieConsentChoices,
  type CookieConsentChoices,
  type CookieConsentRecord,
} from "@/lib/cookie-consent";

interface CookieConsentContextValue {
  record: CookieConsentRecord | null;
  ready: boolean;
  analyticsAllowed: boolean;
  marketingAllowed: boolean;
  openCookieSettings: () => void;
  saveCookieConsent: (choices: Partial<CookieConsentChoices>) => void;
}

const FALLBACK_CONTEXT: CookieConsentContextValue = {
  record: null,
  ready: false,
  analyticsAllowed: false,
  marketingAllowed: false,
  openCookieSettings: () => undefined,
  saveCookieConsent: () => undefined,
};

const CookieConsentContext = createContext<CookieConsentContextValue>(FALLBACK_CONTEXT);

export function useCookieConsent(): CookieConsentContextValue {
  return useContext(CookieConsentContext);
}

const INTERNAL_PREFIXES = ["/crm", "/supplier", "/login", "/auth"];

function isInternalPath(pathname: string): boolean {
  return INTERNAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function expireAnalyticsCookie(name: string, domain?: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const domainPart = domain ? `; Domain=${domain}` : "";
  document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; SameSite=Lax${domainPart}${secure}`;
}

function clearAnalyticsCookies() {
  const names = new Set<string>();
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name && /^_(ga|gid|gat|gac|gcl)/.test(name)) names.add(name);
  }
  const host = window.location.hostname;
  const domains: Array<string | undefined> = [undefined, host, `.${host}`];
  const parts = host.split(".");
  if (parts.length > 2) domains.push(`.${parts.slice(-2).join(".")}`);
  names.forEach((name) => domains.forEach((domain) => expireAnalyticsCookie(name, domain)));
}

function ConsentToggle({
  title,
  description,
  checked,
  disabled = false,
  badge,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  badge?: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-ink-200 p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-ink-900">{title}</h3>
          {badge && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-bold text-ink-600">{badge}</span>}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${checked ? "bg-brand-700" : "bg-ink-300"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[1.375rem]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const publicSurface = !isInternalPath(pathname);
  const [record, setRecord] = useState<CookieConsentRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(false);
  const [draftMarketing, setDraftMarketing] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setRecord(cookieConsentFromDocument(document.cookie));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    setDraftAnalytics(record?.analytics ?? false);
    setDraftMarketing(record?.marketing ?? false);
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, record]);

  const saveCookieConsent = useCallback((choices: Partial<CookieConsentChoices>) => {
    const normalized = normalizeCookieConsentChoices(choices);
    const nextRecord: CookieConsentRecord = {
      ...normalized,
      version: COOKIE_CONSENT_VERSION,
      updatedAt: new Date().toISOString(),
    };
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(nextRecord))}; Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
    if (!normalized.analytics) clearAnalyticsCookies();
    setRecord(nextRecord);
    setSettingsOpen(false);
  }, []);

  const openCookieSettings = useCallback(() => {
    if (publicSurface) setSettingsOpen(true);
  }, [publicSurface]);

  const value = useMemo<CookieConsentContextValue>(() => ({
    record,
    ready,
    analyticsAllowed: record?.analytics === true,
    marketingAllowed: record?.marketing === true,
    openCookieSettings,
    saveCookieConsent,
  }), [record, ready, openCookieSettings, saveCookieConsent]);

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
      {publicSurface && ready && !record && !settingsOpen && (
        <section aria-labelledby="cookie-consent-title" className="fixed inset-x-3 bottom-3 z-[70] sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[38rem] sm:max-w-[calc(100vw-2.5rem)]">
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-2xl shadow-ink-950/20">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <Cookie className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="cookie-consent-title" className="text-[16px] font-black tracking-tight text-ink-900">We value your privacy</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-600">
                  We use strictly necessary cookies to operate Vexim Trade and remember your privacy choice. With your permission, we also use analytics and performance tools to understand visits and improve the site. You can accept all cookies, reject optional cookies or customize your choices. Read our <Link href="/cookie-policy" className="font-semibold text-brand-700 underline">Cookie Policy</Link>.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => saveCookieConsent(REJECTED_COOKIE_CONSENT)} className="rounded-md border border-ink-300 px-4 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2">
                Reject all
              </button>
              <button type="button" onClick={openCookieSettings} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-300 px-4 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2">
                <Settings2 className="h-4 w-4" aria-hidden="true" /> Customize
              </button>
              <button type="button" onClick={() => saveCookieConsent(ACCEPTED_COOKIE_CONSENT)} className="rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2">
                Accept all
              </button>
            </div>
          </div>
        </section>
      )}

      {publicSurface && settingsOpen && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-ink-950/50 p-3 sm:p-6" role="presentation">
          <section
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
            aria-describedby="cookie-settings-description"
            className="mx-auto my-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl outline-none sm:my-8"
          >
            <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 sm:px-6">
              <div>
                <h2 id="cookie-settings-title" className="text-lg font-black tracking-tight text-ink-900">Cookie settings</h2>
                <p id="cookie-settings-description" className="mt-0.5 text-[13px] leading-relaxed text-ink-500">
                  Optional cookies stay off unless you turn them on. You can change this choice at any time from the Cookie settings link in the footer.
                </p>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close cookie settings" className="rounded-md p-2 text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-5 sm:px-6">
              <ConsentToggle
                title="Strictly necessary"
                description="Needed for security, sign in, core site functions and remembering this cookie choice. These cannot be switched off here."
                checked
                disabled
                badge="Always active"
              />
              <ConsentToggle
                title="Analytics and performance"
                description="Allows Google Analytics, Vercel Speed Insights and Vexim aggregate page view counts so we can understand public page use and site performance."
                checked={draftAnalytics}
                onChange={setDraftAnalytics}
              />
              <ConsentToggle
                title="Marketing and advertising"
                description="Covers advertising and campaign measurement cookies if Vexim adds those tools in the future. No marketing cookies are currently active."
                checked={draftMarketing}
                onChange={setDraftMarketing}
              />
              <p className="text-[13px] leading-relaxed text-ink-500">
                Details about the cookies and similar technologies we use are in our <Link href="/cookie-policy" className="font-semibold text-brand-700 underline">Cookie Policy</Link> and <Link href="/privacy-policy" className="font-semibold text-brand-700 underline">Privacy Policy</Link>.
              </p>
            </div>

            <div className="grid gap-2 border-t border-ink-100 px-5 py-4 sm:grid-cols-3 sm:px-6">
              <button type="button" onClick={() => saveCookieConsent(REJECTED_COOKIE_CONSENT)} className="rounded-md border border-ink-300 px-4 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2">
                Reject all
              </button>
              <button type="button" onClick={() => saveCookieConsent({ analytics: draftAnalytics, marketing: draftMarketing })} className="rounded-md border border-brand-700 px-4 py-2.5 text-sm font-semibold text-brand-800 transition hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2">
                Save my choices
              </button>
              <button type="button" onClick={() => saveCookieConsent(ACCEPTED_COOKIE_CONSENT)} className="rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2">
                Accept all
              </button>
            </div>
          </section>
        </div>
      )}
    </CookieConsentContext.Provider>
  );
}

export function CookieSettingsButton({
  className = "",
  children = "Cookie settings",
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { openCookieSettings } = useCookieConsent();
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      {children}
    </button>
  );
}
