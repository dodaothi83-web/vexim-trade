"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";

import { FormChallenge } from "@/components/form-challenge";
import { requestBuyerSignInAction, verifyBuyerCodeAction } from "@/app/(public)/buyer/sign-in/actions";

/**
 * Đăng nhập của người mua: email → mã 6 số.
 *
 * Chỉ hai ô, hai bước, không mật khẩu. Sau khi gửi email, form chuyển sang bước nhập mã
 * ngay trên cùng màn hình — người dùng mở thư ở tab khác rồi quay lại vẫn thấy ô nhập mã.
 * Link trong thư dùng được song song; máy quét link của công ty mở link trước cũng không
 * làm hỏng gì vì mã vẫn còn.
 */
export function BuyerSignInForm({ next, initialError }: { next?: string | null; initialError?: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
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

  if (step === "email") {
    return (
      <form onSubmit={sendCode} className="mt-6 space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
            {error}
          </p>
        )}
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
      </form>
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
