"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";

import { loginAction } from "@/app/auth-actions";
import { Button } from "@/components/ui";
import { FormChallenge } from "@/components/form-challenge";

export function LoginForm({ needsSetup }: { needsSetup: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeVersion, setChallengeVersion] = useState(0);

  function resetChallenge() {
    setChallengeToken("");
    setChallengeVersion((version) => version + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!challengeToken) {
      setError("Vui lòng hoàn tất bước kiểm tra bảo mật.");
      return;
    }
    setBusy(true);
    try {
      const res = await loginAction(email, password, challengeToken);
      if (!res.ok) {
        setError(res.message);
        resetChallenge();
        return;
      }
      router.replace(res.redirectTo ?? "/crm/dashboard");
      router.refresh();
    } catch {
      setError("Không đăng nhập được lúc này. Vui lòng thử lại.");
      resetChallenge();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          className="input"
          placeholder="email@congty.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Mật khẩu
        </label>
        <div className="relative">
          <input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            className="input pr-10"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            required
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-400 transition hover:text-ink-700"
            aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-1.5 flex justify-end">
          <Link href="/auth/forgot-password" className="text-xs font-semibold text-brand-700 hover:underline">
            Quên mật khẩu?
          </Link>
        </div>
      </div>

      <FormChallenge key={challengeVersion} purpose="login" onChange={(token) => setChallengeToken(token ?? "")} />
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy || !challengeToken}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        Đăng nhập
      </Button>

      <div className="flex items-center gap-3 text-xs text-ink-500">
        <span className="h-px flex-1 bg-ink-200" />
        hoặc
        <span className="h-px flex-1 bg-ink-200" />
      </div>
      <a
        href="/api/auth/google/start?intent=login"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50"
      >
        <span className="text-base font-black text-blue-600" aria-hidden="true">
          G
        </span>{" "}
        Đăng nhập với Google
      </a>

      {needsSetup && (
        <p className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[12.5px] text-brand-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Hệ thống chưa có tài khoản nào.{" "}
            <a href="/setup" className="font-semibold underline">
              Tạo tài khoản quản trị đầu tiên
            </a>
            .
          </span>
        </p>
      )}
    </form>
  );
}
