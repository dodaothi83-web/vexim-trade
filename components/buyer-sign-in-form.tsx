"use client";

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
  next,
  initialError,
  initialOauthError,
}: {
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
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? initialOauthError ?? null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeVersion, setChallengeVersion] = useState(0);

  function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await requestBuyerSignInAction({ email, challengeToken, next });
      // Challenge chỉ dùng được một lần: đổi khoá để widget phát cái mới kể cả khi lỗi.
      setChallengeVersion((v) => v + 1);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setStep("code");
      setNotice(res.message);
    });
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await verifyBuyerCodeAction({ email, code, next });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.replace(res.redirectTo ?? "/");
    });
  }

  /** Đường dẫn bắt đầu luồng Google, mang theo đích quay lại để không mất ngữ cảnh. */
  const googleStartHref = `/api/auth/google/buyer/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  if (step === "email") {
    return (
      <div className="mt-6">
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
            {error}
          </p>
        )}
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Work email</span>
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
            <span className="mt-1 block text-[11.5px] font-normal leading-snug text-ink-500">
              We send a 6-digit code. No password to remember.
            </span>
          </label>

          <FormChallenge key={challengeVersion} purpose="buyer-sign-in" onChange={(token) => setChallengeToken(token ?? "")} />

          <button type="submit" className="btn btn-primary min-h-12 w-full justify-center text-base font-bold" disabled={busy || !email.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
            Email me a code
          </button>

          <p className="text-center text-[12px] leading-relaxed text-ink-500">
            First time here? This also creates your account.
          </p>

          <div className="flex items-center gap-3 pt-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
            <span className="h-px flex-1 bg-ink-200" />
            or
            <span className="h-px flex-1 bg-ink-200" />
          </div>

          <a
            href={googleStartHref}
            rel="nofollow"
            className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50"
          >
            <GoogleGIcon />
            Continue with Google
          </a>
          <p className="text-center text-[11px] leading-snug text-ink-400">
            We receive only your verified email and basic profile.
          </p>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={submitCode} className="mt-6 space-y-4" noValidate>
      {notice && (
        <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-brand-900">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
          {error}
        </p>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">6-digit code</span>
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
          Sent to {email}. The code and the link in the email both work once, for 15 minutes.
        </span>
      </label>

      <button type="submit" className="btn btn-primary min-h-12 w-full justify-center text-base font-bold" disabled={busy || code.length !== 6}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Sign in
      </button>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-1.5 text-[12.5px] font-semibold text-ink-600 hover:text-brand-800"
        onClick={() => {
          setStep("email");
          setCode("");
          setNotice(null);
          setError(null);
        }}
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Use a different email
      </button>
    </form>
  );
}
