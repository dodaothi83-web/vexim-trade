"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui";
import { FormChallenge } from "@/components/form-challenge";
import type { AuthMessages } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/config";

/** Chuỗi hiển thị do trang truyền xuống: client không tự chứa bản dịch. */
export function ResetPasswordForm({
  token,
  messages: m,
  lang,
  showPasswordLabel,
  hidePasswordLabel,
}: {
  token: string;
  messages: AuthMessages["reset"];
  lang: Locale;
  showPasswordLabel: string;
  hidePasswordLabel: string;
}) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeVersion, setChallengeVersion] = useState(0);

  function resetChallenge() {
    setChallengeToken("");
    setChallengeVersion((version) => version + 1);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!challengeToken) {
      setMessage({ ok: false, text: m.challengeMissing });
      return;
    }

    const form = new FormData();
    form.set("token", token);
    form.set("password", password);
    form.set("password2", password2);
    form.set("challenge_token", challengeToken);

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!res.ok || !data?.ok) {
        setMessage({
          ok: false,
          text: data?.message ?? m.failed,
        });
        resetChallenge();
        return;
      }
      setMessage({ ok: true, text: data.message ?? m.done });
      setPassword("");
      setPassword2("");
    } catch {
      setMessage({ ok: false, text: m.networkError });
      resetChallenge();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} lang={lang} className="space-y-4">
      <div>
        <label className="label" htmlFor="new-password">
          {m.newPassword}
        </label>
        <div className="relative">
          <input
            id="new-password"
            type={showPw ? "text" : "password"}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={m.newPasswordPlaceholder}
            className="input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-400 transition hover:text-ink-700"
            aria-label={showPw ? hidePasswordLabel : showPasswordLabel}
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="new-password-confirm">
          {m.repeatPassword}
        </label>
        <input
          id="new-password-confirm"
          type={showPw ? "text" : "password"}
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          placeholder={m.repeatPassword}
          className="input"
        />
      </div>

      <FormChallenge
        key={challengeVersion}
        purpose="password-reset"
        onChange={(token) => setChallengeToken(token ?? "")}
      />

      {message && (
        <p
          role="alert"
          className={`rounded-lg border px-3 py-2 text-[12.5px] ${
            message.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
          {message.ok && (
            <>
              {" "}
              <Link href="/login" className="font-semibold underline">
                {m.loginNow}
              </Link>
            </>
          )}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={busy || !password || !password2 || !challengeToken || Boolean(message?.ok)}
        className="w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {m.submit}
      </Button>
    </form>
  );
}
