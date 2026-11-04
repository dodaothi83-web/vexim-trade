"use client";

import type { BuyerAuthMessages, BuyerAuthErrorKey } from "@/lib/i18n/buyer-auth";
import type { Locale } from "@/lib/i18n/config";
import { fill } from "@/lib/i18n/format";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";

import { FormChallenge } from "@/components/form-challenge";
import { GoogleGIcon } from "@/components/google-g-icon";
import { requestBuyerSignInAction, verifyBuyerCodeAction } from "@/app/(public)/buyer/sign-in/actions";

/**
 * Đăng nhập của người mua: email → mã 6 số.
 *
 * Chỉ hai ô, hai bước, không mật khẩu. Sau khi gửi email, form chuyển sang bước nhập mã
 * ngay trên cùng màn hình — người dùng mở thư ở tab khác rồi quay lại vẫn thấy ô nhập mã.
 * Link trong thư dùng được song song; máy quét link của công ty mở link trước cũng không
 * làm hỏng gì vì mã vẫn còn.
 */
export function BuyerSignInForm({
  messages: m,
  lang,
  next,
  initialError,
  initialOauthError,
  compact = false,
  onSignedIn,
}: {
  compact?: boolean;
  onSignedIn?: (email: string) => void;
  messages: BuyerAuthMessages;
  lang: Locale;
  next?: string | null;
  initialError?: string | null;
  /** Lỗi từ luồng Google (?oauth=...), đổi sẵn thành câu người dùng hiểu được. */
  initialOauthError?: string | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState(false);
  const [errorKey, setErrorKey] = useState<BuyerAuthErrorKey | null>(null);
  const [dismissInitial, setDismissInitial] = useState(false);
  const error = errorKey ? m.errors[errorKey] : !dismissInitial ? initialError ?? initialOauthError : null;
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeVersion, setChallengeVersion] = useState(0);

  function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setErrorKey(null);
    setDismissInitial(true);
    start(async () => {
      const res = await requestBuyerSignInAction({ email, challengeToken, next });
      // Challenge chỉ dùng được một lần: đổi khoá để widget phát cái mới kể cả khi lỗi.
      setChallengeVersion((v) => v + 1);
      if (!res.ok) {
        setErrorKey(res.errorKey ?? "generic");
        return;
      }
      setStep("code");
      setNotice(true);
    });
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setErrorKey(null);
    setDismissInitial(true);
    start(async () => {
      const res = await verifyBuyerCodeAction({ email, code, next });
      if (!res.ok) {
        setErrorKey(res.errorKey ?? "generic");
        return;
      }
      if (onSignedIn) { onSignedIn(email.trim().toLowerCase()); return; }
      router.replace(res.redirectTo ?? "/");
      router.refresh();
    });
  }

  /** Đường dẫn bắt đầu luồng Google, mang theo đích quay lại để không mất ngữ cảnh. */
  const googleStartHref = `/api/auth/google/buyer/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  if (step === "email") {
    return (
      <div lang={lang} className="mt-6">
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
            {error}
          </p>
        )}
        <form onSubmit={sendCode} className={compact ? "flex flex-col gap-4" : "space-y-4"} noValidate>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">{m.email}</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              maxLength={320}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@company.com"
            />
            {!compact && <span className="mt-1 block text-[11.5px] font-normal leading-snug text-ink-500">{m.emailHint}</span>}
          </label>

          <FormChallenge key={challengeVersion} purpose="buyer-sign-in" messages={m.challenge} onChange={(token) => setChallengeToken(token ?? "")} />

          <button type="submit" className="btn btn-primary min-h-12 w-full justify-center text-base font-bold" disabled={busy || !email.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
            {m.sendCode}
          </button>

          {!compact && <p className="text-center text-[12px] leading-relaxed text-ink-500">{m.firstTime}</p>}

          <div className={`${compact ? "-order-1" : ""} flex items-center gap-3 pt-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400`}>
            <span className="h-px flex-1 bg-ink-200" />
            {m.or}
            <span className="h-px flex-1 bg-ink-200" />
          </div>

          <a
            href={googleStartHref}
            rel="nofollow"
            className={`${compact ? "-order-2" : ""} flex min-h-12 w-full items-center justify-center gap-2.5 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50`}
          >
            <GoogleGIcon />
            {m.google}
          </a>
          {!compact && <p className="text-center text-[11px] leading-snug text-ink-400">{m.googleHint}</p>}
        </form>
      </div>
    );
  }

  return (
    <form lang={lang} onSubmit={submitCode} className="mt-6 space-y-4" noValidate>
      {notice && (
        <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-brand-900">
          {m.sent}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
          {error}
        </p>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">{m.code}</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="input text-center text-2xl font-bold tracking-[0.5em]"
          placeholder="000000"
        />
        <span className="mt-1 block text-[11.5px] font-normal leading-snug text-ink-500">
          {fill(m.codeHint, { email })}
        </span>
      </label>

      <button type="submit" className="btn btn-primary min-h-12 w-full justify-center text-base font-bold" disabled={busy || code.length !== 6}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {m.signIn}
      </button>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-1.5 text-[12.5px] font-semibold text-ink-600 hover:text-brand-800"
        onClick={() => {
          setStep("email");
          setCode("");
          setNotice(false);
          setErrorKey(null);
          setDismissInitial(true);
        }}
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {m.differentEmail}
      </button>
    </form>
  );
}
