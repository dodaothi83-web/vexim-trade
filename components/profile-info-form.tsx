"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { updateMyProfileAction } from "@/app/auth-actions";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/toast";

export function ProfileInfoForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ name, email, currentPassword: "" });
  const [busy, setBusy] = useState(false);

  const emailChanged = form.email.trim().toLowerCase() !== email.trim().toLowerCase();
  const nameChanged = form.name.trim() !== name.trim();
  const dirty = emailChanged || nameChanged;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await updateMyProfileAction({
        name: form.name,
        email: form.email,
        currentPassword: form.currentPassword,
      });
      toast.push({
        kind: res.ok ? "success" : "error",
        title: res.message,
      });
      if (res.ok) {
        setForm((f) => ({ ...f, currentPassword: "" }));
        router.refresh();
      }
    } catch {
      toast.push({ kind: "error", title: "Không lưu được thông tin, thử lại sau." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 p-5">
      <h2 className="text-[15px] font-semibold text-ink-800">Thông tin tài khoản</h2>
      <p className="mt-1 text-[12.5px] text-ink-500">
        Tên hiển thị dùng trên giao diện và phụ trách buyer. Đổi tên sẽ chuyển các buyer/khách hàng mục tiêu đang
        phụ trách sang tên mới. Đổi email cần nhập mật khẩu hiện tại.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Tên hiển thị</span>
          <input
            className="input"
            value={form.name}
            maxLength={80}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label className="block">
          <span className="label">Email đăng nhập</span>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </label>
        {emailChanged && (
          <label className="block sm:col-span-2">
            <span className="label">Mật khẩu hiện tại (bắt buộc khi đổi email)</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
              required
            />
          </label>
        )}
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy || !dirty}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu thông tin
          </Button>
          {!dirty && <span className="text-[12px] text-ink-400">Chưa có thay đổi</span>}
        </div>
      </form>
    </Card>
  );
}
