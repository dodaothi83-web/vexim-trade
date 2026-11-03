"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { FormChallenge } from "@/components/form-challenge";
import type { AuthMessages } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/config";

/** Chuỗi hiển thị do trang truyền xuống: client không tự chứa bản dịch. */
export function SupplierAccountForm({
  messages: m,
  lang,
}: {
  messages: AuthMessages["supplierRegister"]["form"];
  lang: Locale;
}) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeVersion, setChallengeVersion] = useState(0);

  function resetChallenge() {
    setChallengeToken("");
    setChallengeVersion((version) => version + 1);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    if (!challengeToken) {
      setMessage({ ok: false, text: m.challengeMissing });
      return;
    }
    form.set("challenge_token", challengeToken);
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/supplier-signup", { method: "POST", body: form });
      const result = await response.json() as { ok: boolean; message: string };
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) element.reset();
      else resetChallenge();
    } catch {
      setMessage({ ok: false, text: m.genericError });
      resetChallenge();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} lang={lang} className="mt-6 space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">{m.email}</span>
        <input name="email" type="email" className="input" required maxLength={254} autoComplete="email" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">{m.password}</span>
        <span className="relative block">
          <input name="password" type={show ? "text" : "password"} className="input pr-10" required minLength={8} maxLength={128} autoComplete="new-password" aria-describedby="password-hint" />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? m.hidePassword : m.showPassword} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-500">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
        <span id="password-hint" className="mt-1 block text-[11.5px] leading-snug font-normal text-ink-500">{m.passwordHint}</span>
      </label>
      <label className="flex items-start gap-2 text-xs text-ink-700">
        <input name="consent" type="checkbox" value="yes" required className="mt-0.5" />
        {m.consent}
      </label>
      <div aria-hidden className="pointer-events-none absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
        <label>Leave empty <input name="website_hp" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <FormChallenge key={challengeVersion} purpose="supplier-signup" onChange={(token) => setChallengeToken(token ?? "")} />
      <button
        type="submit"
        disabled={busy || message?.ok || !challengeToken}
        className="btn btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {m.submitting}</> : m.submit}
      </button>
      {message && (
        <p role="status" className={`rounded-lg border p-3 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {message.text}{message.ok && <> <Link href="/login" className="font-bold underline">{m.goToLogin}</Link></>}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-ink-500"><span className="h-px flex-1 bg-ink-200" />{m.or}<span className="h-px flex-1 bg-ink-200" /></div>
      <a href="/api/auth/google/start?intent=signup" className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">
        <span aria-hidden="true" className="text-base font-black text-blue-600">G</span> {m.google}
      </a>
      <p className="text-center text-xs leading-5 text-ink-500">{m.googleNoteBefore} <Link href="/chinh-sach-bao-mat" className="font-semibold text-brand-700 underline">{m.googleNotePrivacy}</Link> {m.googleNoteBetween} <Link href="/dieu-khoan-su-dung" className="font-semibold text-brand-700 underline">{m.googleNoteTerms}</Link>{m.googleNoteAfter}</p>
    </form>
  );
}
