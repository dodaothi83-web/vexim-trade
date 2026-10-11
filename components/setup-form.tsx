"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { setupAdminAction } from "@/app/auth-actions";
import { Button } from "@/components/ui";

export function SetupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await setupAdminAction(email, name, password, password2);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (res.details?.length) setNotice(res.details.join(" "));
    router.replace("/settings/users");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="su-email">
          Email quản trị
        </label>
        <input
          id="su-email"
          type="email"
          className="input"
          placeholder="ten@veximtrade.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="su-name">
          Tên hiển thị
        </label>
        <input
          id="su-name"
          className="input"
          placeholder="VD: Trần Đức Long"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="su-pass">
            Mật khẩu
          </label>
          <input
            id="su-pass"
            type="password"
            className="input"
            placeholder="Ít nhất 8 ký tự, có chữ và số"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="su-pass2">
            Nhập lại mật khẩu
          </label>
          <input
            id="su-pass2"
            type="password"
            className="input"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
          />
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
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Tạo tài khoản quản trị &amp; đăng nhập
      </Button>

      <p className="text-[12px] leading-relaxed text-ink-500">
        Mật khẩu được băm bằng scrypt và lưu trong cơ sở dữ liệu của app (không lưu dạng thô). Nếu
        kết nối được Supabase, hệ thống tạo thêm tài khoản tương ứng bên Supabase Auth để đăng nhập
        bằng Supabase; nếu không, bạn vẫn đăng nhập được bằng mật khẩu nội bộ này.
      </p>
    </form>
  );
}
