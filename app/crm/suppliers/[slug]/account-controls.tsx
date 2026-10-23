"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { provisionSupplierAccountAction, handOverSupplierAccountAction } from "./account-actions";

export interface SupplierAccountInfo {
  email: string;
  isActive: boolean;
  lastLoginLabel: string;
  createdLabel: string;
}

function generatePassword(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;
  const values = new Uint32Array(14);
  crypto.getRandomValues(values);
  const chars = Array.from(values, (n, i) => (i === 3 ? digits[n % digits.length] : all[n % all.length]));
  return chars.join("");
}

export function SupplierAccountControls({
  supplierId,
  defaultEmail,
  defaultName,
  account,
  canProvision,
  canHandOver,
}: {
  supplierId: string;
  defaultEmail: string;
  defaultName: string;
  account: SupplierAccountInfo | null;
  canProvision: boolean;
  canHandOver: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [handoverPassword, setHandoverPassword] = useState("");
  const [handoverMessage, setHandoverMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await provisionSupplierAccountAction(new FormData(event.currentTarget));
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setPassword("");
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: "Không kết nối được máy chủ. Vui lòng thử lại." });
    } finally {
      setBusy(false);
    }
  }

  async function handOver(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHandoverBusy(true);
    setHandoverMessage(null);
    try {
      const result = await handOverSupplierAccountAction(new FormData(event.currentTarget));
      setHandoverMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setHandoverPassword("");
        router.refresh();
      }
    } catch {
      setHandoverMessage({ ok: false, text: "Không kết nối được máy chủ. Vui lòng thử lại." });
    } finally {
      setHandoverBusy(false);
    }
  }

  if (account) {
    return (
      <div className="mt-3 space-y-1 text-sm text-ink-700">
        <p>Email đăng nhập: <strong className="text-ink-900">{account.email}</strong></p>
        <p>Trạng thái: {account.isActive ? "Đang hoạt động" : "Đã tạm khoá"}</p>
        <p>Ngày cấp: {account.createdLabel}</p>
        <p>Lần đăng nhập gần nhất: {account.lastLoginLabel}</p>

        {canHandOver && (
          <details className="mt-3 rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink-800">Bàn giao cho doanh nghiệp</summary>
            <p className="mt-2 text-xs leading-5 text-ink-600">
              Đổi email đăng nhập sang địa chỉ của doanh nghiệp và đặt mật khẩu mới. Hồ sơ, giấy tờ, sản phẩm và lịch sử duyệt giữ nguyên trên cùng tài khoản. Không có thư xác nhận nào được gửi; gửi email và mật khẩu mới cho họ là đăng nhập được ngay. Email liên hệ trên hồ sơ không đổi, đây chỉ là email đăng nhập.
            </p>
            <form onSubmit={handOver} className="mt-3 grid gap-3">
              <input type="hidden" name="supplier_id" value={supplierId} />
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Email đăng nhập mới *</span>
                <input name="new_email" type="email" required maxLength={180} className="input" defaultValue={account.email} placeholder="nguoidung@congty.vn" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Mật khẩu mới *</span>
                <span className="flex gap-2">
                  <input name="new_password" type="text" autoComplete="off" required maxLength={72} className="input" value={handoverPassword} onChange={(event) => setHandoverPassword(event.target.value)} placeholder="Ít nhất 8 ký tự, gồm chữ và số" />
                  <button type="button" className="btn btn-soft shrink-0" onClick={() => setHandoverPassword(generatePassword())}>Tạo mật khẩu</button>
                </span>
              </label>
              <div>
                <button type="submit" disabled={handoverBusy} className="btn btn-primary">{handoverBusy ? "Đang bàn giao..." : "Bàn giao tài khoản"}</button>
              </div>
            </form>
            {handoverMessage && <p role="status" className={`mt-2 text-sm ${handoverMessage.ok ? "text-emerald-700" : "text-rose-700"}`}>{handoverMessage.text}</p>}
          </details>
        )}
      </div>
    );
  }

  if (!canProvision) {
    return <p className="mt-3 text-sm text-ink-600">Chưa có tài khoản đăng nhập gắn với hồ sơ này. Chỉ quản trị và thu mua được cấp tài khoản cho nhà cung cấp.</p>;
  }

  return (
    <div className="mt-4">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="supplier_id" value={supplierId} />
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Email đăng nhập *</span>
          <input name="email" type="email" required maxLength={180} className="input" defaultValue={defaultEmail} placeholder="nguoidung@congty.vn" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Tên người dùng</span>
          <input name="name" maxLength={120} className="input" defaultValue={defaultName} />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-semibold">Mật khẩu tạm</span>
          <span className="flex gap-2">
            <input name="temp_password" type="text" autoComplete="off" maxLength={72} className="input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ít nhất 8 ký tự, gồm chữ và số" />
            <button type="button" className="btn btn-soft shrink-0" onClick={() => setPassword(generatePassword())}>Tạo mật khẩu</button>
          </span>
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "Đang cấp tài khoản..." : "Cấp tài khoản"}</button>
        </div>
      </form>
      <p className="mt-3 text-xs leading-5 text-ink-500">Nếu email này đã tự đăng ký tài khoản nhà cung cấp nhưng chưa gắn doanh nghiệp, hệ thống gắn tài khoản đó vào hồ sơ này và không dùng mật khẩu tạm. Nếu chưa có tài khoản, hệ thống tạo mới bằng mật khẩu tạm ở trên và nhà cung cấp đăng nhập được ngay, không cần chờ email xác nhận.</p>
      {message && <p role="status" className={`mt-3 text-sm ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
    </div>
  );
}
