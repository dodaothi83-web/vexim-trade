"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, Loader2, Mail, Pencil, Save, ShieldCheck, UserRound, X } from "lucide-react";

import { changeMyPasswordAction, saveMySignatureAction, updateMyProfileAction } from "@/app/auth-actions";
import { RichEditor } from "@/components/rich-editor";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

/**
 * Trang "Hồ sơ của tôi": thông tin tài khoản (chỉ xem), tự đổi mật khẩu,
 * và xem/sửa chữ ký email cá nhân — gom về một chỗ thay vì rải rác.
 */
export function ProfilePanel({
  name,
  email,
  phone,
  roleLabel,
  roleDescription,
  signatureHtml,
  autoSignature,
}: {
  name: string;
  email: string;
  /** Số điện thoại cá nhân; null = chưa có */
  phone: string | null;
  roleLabel: string;
  roleDescription: string;
  /** Chữ ký tuỳ chỉnh đang lưu; null = đang dùng chữ ký tự động */
  signatureHtml: string | null;
  autoSignature: string;
}) {
  const router = useRouter();
  const toast = useToast();

  // ----- Thông tin tài khoản (sửa tên, email) -----
  const [editing, setEditing] = useState(false);
  const [infoBusy, setInfoBusy] = useState(false);
  const [infoDraft, setInfoDraft] = useState({ name, email, phone: phone ?? "", currentPassword: "" });
  const emailChanged = infoDraft.email.trim().toLowerCase() !== email.trim().toLowerCase();
  const infoDirty =
    emailChanged || infoDraft.name.trim() !== name.trim() || infoDraft.phone.trim() !== (phone ?? "").trim();

  function startEditing() {
    setInfoDraft({ name, email, phone: phone ?? "", currentPassword: "" });
    setEditing(true);
  }

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setInfoBusy(true);
    try {
      const res = await updateMyProfileAction({
        name: infoDraft.name,
        email: infoDraft.email,
        phone: infoDraft.phone,
        currentPassword: infoDraft.currentPassword,
      });
      toast.push({ kind: res.ok ? "success" : "error", title: res.message });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } catch {
      toast.push({ kind: "error", title: "Không lưu được thông tin, thử lại sau." });
    } finally {
      setInfoBusy(false);
    }
  }

  // ----- Chữ ký -----
  const [sigDraft, setSigDraft] = useState(signatureHtml ?? autoSignature);
  const [sigBusy, setSigBusy] = useState(false);
  const hasCustom = signatureHtml !== null;

  async function saveSig() {
    setSigBusy(true);
    const res = await saveMySignatureAction(sigDraft);
    setSigBusy(false);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) router.refresh();
  }

  async function clearSig() {
    setSigBusy(true);
    const res = await saveMySignatureAction(null);
    setSigBusy(false);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      setSigDraft(autoSignature);
      router.refresh();
    }
  }

  // ----- Đổi mật khẩu -----
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  async function changePw() {
    if (!cur || !pw || !pw2) {
      toast.push({ kind: "error", title: "Hãy điền đủ ba ô mật khẩu." });
      return;
    }
    setPwBusy(true);
    const res = await changeMyPasswordAction(cur, pw, pw2);
    setPwBusy(false);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      setCur("");
      setPw("");
      setPw2("");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Thông tin tài khoản */}
      <section className="card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
          <UserRound className="h-4 w-4 text-brand-700" />
          <h2 className="flex-1 text-[15px] font-bold text-ink-900">Thông tin tài khoản</h2>
          {!editing && (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-brand-700"
              title="Sửa thông tin tài khoản"
              aria-label="Sửa thông tin tài khoản"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </header>
        {editing ? (
          <form onSubmit={saveInfo} className="space-y-3 px-4 py-4 text-[13px]">
            <label className="block">
              <span className="label">Họ tên</span>
              <input
                className="input"
                value={infoDraft.name}
                maxLength={80}
                onChange={(e) => setInfoDraft((d) => ({ ...d, name: e.target.value }))}
                required
              />
            </label>
            <label className="block">
              <span className="label">Email đăng nhập</span>
              <input
                className="input"
                type="email"
                value={infoDraft.email}
                onChange={(e) => setInfoDraft((d) => ({ ...d, email: e.target.value }))}
                required
              />
            </label>
            <label className="block">
              <span className="label">Số điện thoại</span>
              <input
                className="input"
                type="tel"
                value={infoDraft.phone}
                placeholder="+84 912 345 678"
                onChange={(e) => setInfoDraft((d) => ({ ...d, phone: e.target.value }))}
              />
            </label>
            {emailChanged && (
              <label className="block">
                <span className="label">Mật khẩu hiện tại (bắt buộc khi đổi email)</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={infoDraft.currentPassword}
                  onChange={(e) => setInfoDraft((d) => ({ ...d, currentPassword: e.target.value }))}
                  required
                />
              </label>
            )}
            <p className="text-[12px] leading-relaxed text-ink-500">
              Đổi tên sẽ chuyển các buyer và khách hàng mục tiêu đang phụ trách sang tên mới.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" className="btn btn-primary" disabled={infoBusy || !infoDirty}>
                {infoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditing(false)}
                disabled={infoBusy}
              >
                <X className="h-4 w-4" />
                Hủy
              </button>
            </div>
          </form>
        ) : (
          <dl className="space-y-2.5 px-4 py-4 text-[13px]">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-400">Họ tên</dt>
              <dd className="min-w-0 flex-1 font-semibold text-ink-900">{name}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-400">Email</dt>
              <dd className="min-w-0 flex-1 break-all text-ink-700">{email}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-400">Điện thoại</dt>
              <dd className="min-w-0 flex-1 text-ink-700">{phone || <span className="text-ink-400">Chưa có</span>}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-400">Vai trò</dt>
              <dd className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
                  <ShieldCheck className="h-3.5 w-3.5 text-brand-700" />
                  {roleLabel}
                </span>
                {roleDescription && (
                  <span className="mt-0.5 block text-[12px] text-ink-500">{roleDescription}</span>
                )}
              </dd>
            </div>
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-[12px] leading-relaxed text-ink-500">
              Bấm biểu tượng bút để sửa tên hoặc email. Mật khẩu và chữ ký thì bạn tự quản ở hai khối bên dưới.
            </p>
          </dl>
        )}
      </section>

      {/* Đổi mật khẩu */}
      <section className="card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
          <KeyRound className="h-4 w-4 text-brand-700" />
          <h2 className="text-[15px] font-bold text-ink-900">Đổi mật khẩu</h2>
        </header>
        <div className="space-y-3 px-4 py-4">
          <label className="block">
            <span className="label">Mật khẩu hiện tại</span>
            <input
              type="password"
              className="input"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              placeholder="Nhập mật khẩu đang dùng"
              autoComplete="current-password"
            />
          </label>
          <label className="block">
            <span className="label">Mật khẩu mới</span>
            <input
              type="password"
              className="input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Ít nhất 8 ký tự, có chữ và số"
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="label">Nhập lại mật khẩu mới</span>
            <input
              type="password"
              className="input"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Giống ô bên trên"
              autoComplete="new-password"
            />
          </label>
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={pwBusy} onClick={() => void changePw()}>
              {pwBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Đổi mật khẩu
            </Button>
            <span className="text-[11.5px] text-ink-400">
              Đổi xong hãy đăng nhập lại ở các thiết bị khác.
            </span>
          </div>
        </div>
      </section>

      {/* Chữ ký email */}
      <section className="card overflow-hidden lg:col-span-2">
        <header className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
          <Mail className="h-4 w-4 text-brand-700" />
          <h2 className="text-[15px] font-bold text-ink-900">Chữ ký email của tôi</h2>
          <span className="ml-auto text-[11.5px] text-ink-400">
            {hasCustom ? "đang dùng chữ ký riêng" : "đang dùng chữ ký tự động"}
          </span>
        </header>
        <div className="px-4 py-4">
          <RichEditor
            value={sigDraft}
            onChange={setSigDraft}
            minHeight={160}
            placeholder="Nội dung chữ ký của bạn…"
          />
          {!hasCustom && (
            <p className="mt-2 text-[12px] text-ink-500">
              Bạn chưa lưu chữ ký riêng — khung trên đang hiển thị chữ ký tự động của hệ thống.
              Sửa rồi bấm Lưu để tạo chữ ký của riêng bạn.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={sigBusy} onClick={() => void saveSig()}>
              {sigBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Lưu chữ ký
            </Button>
            {hasCustom && (
              <Button variant="ghost" disabled={sigBusy} onClick={() => void clearSig()}>
                Xoá chữ ký tuỳ chỉnh
              </Button>
            )}
            <span className="ml-auto text-[11.5px] text-ink-400">
              Chữ ký áp dụng cho thư soạn mới và khung trả lời / chuyển tiếp trong Hộp thư.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
