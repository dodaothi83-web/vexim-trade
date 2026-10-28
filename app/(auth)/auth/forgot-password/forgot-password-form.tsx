"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui";
import { FormChallenge } from "@/components/form-challenge";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
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
      setMessage({
        ok: false,
        text: "Vui lòng hoàn tất bước kiểm tra bảo mật.",
      });
      return;
    }

    const form = new FormData(e.currentTarget);
    form.set("email", email.trim());
    form.set("challenge_token", challengeToken);

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/forgot-password", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!res.ok || !data?.ok) {
        setMessage({
          ok: false,
          text: data?.message ?? "Chưa gửi được yêu cầu. Vui lòng thử lại.",
        });
        resetChallenge();
        return;
      }
      setMessage({ ok: true, text: data.message ?? "Đã gửi hướng dẫn đặt lại mật khẩu." });
    } catch {
      setMessage({
        ok: false,
        text: "Không gửi được yêu cầu. Vui lòng kiểm tra kết nối và thử lại.",
      });
      resetChallenge();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="reset-email">
          Email
        </label>
        <input
          id="reset-email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@congty.com"
          className="input"
        />
      </div>

      <input
        type="text"
        name="website_hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

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
                Về trang đăng nhập
              </Link>
            </>
          )}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={busy || !email.trim() || !challengeToken || Boolean(message?.ok)}
        className="w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        Gửi liên kết đặt lại mật khẩu
      </Button>
    </form>
  );
}
