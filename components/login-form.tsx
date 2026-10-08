"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";

import { loginAction } from "@/app/auth-actions";
import { Button } from "@/components/ui";

export function LoginForm({ needsSetup }: { needsSetup: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await loginAction(email, password);
    setBusy(false);
    if (!res.ok) {
      setError([res.message, ...(res.details ?? [])].join(" "));
      return;
    }
    if (res.details?.length) setNotice(res.details.join(" "));
    router.replace("/dashboard");
    router.refresh();
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
          placeholder="ten@veximtrade.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          {notice}
        </p>
      )}

      <Button type="submit" variant="primary" className="w-full justify-center" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        Đăng nhập
      </Button>

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
