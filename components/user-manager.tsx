"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CheckCircle2,
  Cloud,
  HardDrive,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";

import {
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  updateUserAction,
} from "@/app/auth-actions";
import { ROLES, roleMeta } from "@/lib/auth/permissions";
import { assignSenderEmails } from "@/lib/email/sender";
import type { AppUser, UserRole } from "@/lib/types";
import { Badge, Button, cx, formatDateTime } from "@/components/ui";
import { useToast } from "@/components/toast";

type AccountTab = "internal" | "supplier";

export function UserManager({
  users,
  supabaseReachable,
  meId,
}: {
  users: AppUser[];
  supabaseReachable: boolean;
  meId: string;
}) {
  const router = useRouter();
  const toast = useToast();

  // Địa chỉ gửi riêng của từng người — tự sinh từ họ tên, quản trị sửa được trong hồ sơ người đó
  const senderById = assignSenderEmails(users);
  const [accountTab, setAccountTab] = useState<AccountTab>("internal");
  const internalUsers = users.filter((user) => user.role !== "supplier");
  const supplierUsers = users.filter((user) => user.role === "supplier");
  const visibleUsers = accountTab === "internal" ? internalUsers : supplierUsers;
  const accountTabs = [
    { key: "internal" as const, label: "Nhân sự Vexim", count: internalUsers.length },
    { key: "supplier" as const, label: "Tài khoản NCC", count: supplierUsers.length },
  ];

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("sale");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: AccountTab = event.key === "Home"
      ? "internal"
      : event.key === "End"
        ? "supplier"
        : accountTab === "internal" ? "supplier" : "internal";
    setAccountTab(next);
    document.getElementById(`account-tab-${next}`)?.focus();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createUserAction({ email, name, role, password });
    toast.push({ kind: res.ok ? "success" : "error", title: res.message, lines: res.details });
    setBusy(false);
    if (res.ok) {
      setEmail("");
      setName("");
      setPassword("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-ink-200" role="tablist" aria-label="Nhóm tài khoản">
        {accountTabs.map((tab) => (
          <button
            key={tab.key}
            id={`account-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={accountTab === tab.key}
            aria-controls={`account-panel-${tab.key}`}
            tabIndex={accountTab === tab.key ? 0 : -1}
            onClick={() => setAccountTab(tab.key)}
            onKeyDown={handleTabKeyDown}
            className={cx(
              "inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition",
              accountTab === tab.key ? "border-brand-600 text-brand-800" : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800",
            )}
          >
            {tab.label}
            <span className="rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-500">{tab.count}</span>
          </button>
        ))}
      </div>

      <div id={`account-panel-${accountTab}`} role="tabpanel" aria-labelledby={`account-tab-${accountTab}`} className="space-y-5">
      {accountTab === "internal" && (
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <UserPlus className="h-4 w-4 text-brand-700" />
          <h2 className="text-[15px] font-bold text-ink-900">Thêm tài khoản</h2>
          <span className="ml-auto text-[11.5px] text-ink-500">
            {supabaseReachable
              ? "Tạo ở cả Supabase Auth và mật khẩu nội bộ"
              : "Supabase chưa kết nối được — tạo tài khoản nội bộ (dùng được ngay)"}
          </span>
        </div>
        <form onSubmit={create} className="grid gap-3 p-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nhanvien@veximtrade.com"
            />
          </label>
          <label className="block">
            <span className="label">Tên hiển thị</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Nguyễn Thị Lan"
            />
          </label>
          <label className="block">
            <span className="label">Vai trò</span>
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              {ROLES.filter((r) => r.value !== "supplier").map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.description}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Mật khẩu ban đầu</span>
            <input
              className="input"
              type="text"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ít nhất 8 ký tự, có chữ và số"
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Tạo tài khoản
            </Button>
          </div>
        </form>
      </div>
      )}

      {/* Danh sách */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-brand-700" />
          <h2 className="text-[15px] font-bold text-ink-900">Người dùng ({visibleUsers.length})</h2>
        </div>
        <ul className="divide-y divide-ink-100">
          {visibleUsers.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              senderAddress={senderById.get(u.id) ?? null}
              senderAuto={!u.sender_email}
              isMe={u.id === meId}
              onChanged={() => router.refresh()}
              onToast={(kind, title, lines) => toast.push({ kind, title, lines })}
            />
          ))}
          {visibleUsers.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-500">Chưa có tài khoản trong nhóm này.</li>}
        </ul>
      </div>

      <div className="card p-4 text-[12.5px] leading-relaxed text-ink-600">
        <p className="mb-1.5 font-bold text-ink-900">Cách hoạt động</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Khi máy chạy app kết nối được Supabase: đăng nhập bằng <strong>Supabase Auth</strong>{" "}
            (mật khẩu do Supabase quản lý).
          </li>
          <li>
            Khi không kết nối được Supabase: hệ thống tự chuyển sang <strong>mật khẩu nội bộ</strong>{" "}
            (băm scrypt, lưu trong cơ sở dữ liệu của app) để công việc không bị chặn.
          </li>
          <li>
            Tài khoản bên Supabase nhưng chưa được thêm vào hệ thống sẽ <strong>không vào được</strong> —
            quyền luôn do app quyết định.
          </li>
        </ul>
      </div>
      </div>
    </div>
  );
}

function UserRow({
  user,
  senderAddress,
  senderAuto = true,
  isMe,
  onChanged,
  onToast,
}: {
  user: AppUser;
  /** Địa chỉ ghi ở header From khi người này gửi thư */
  senderAddress: string | null;
  /** true = địa chỉ do hệ thống sinh từ họ tên, chưa được đặt tay */
  senderAuto?: boolean;
  isMe: boolean;
  onChanged: () => void;
  onToast: (kind: "success" | "error", title: string, lines?: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPass, setNewPass] = useState("");
  const meta = roleMeta(user.role);

  async function patch(next: Parameters<typeof updateUserAction>[1]) {
    setBusy(true);
    const res = await updateUserAction(user.id, next);
    onToast(res.ok ? "success" : "error", res.message);
    setBusy(false);
    onChanged();
  }

  async function resetPassword() {
    setBusy(true);
    const res = await resetUserPasswordAction(user.id, newPass, newPass);
    onToast(res.ok ? "success" : "error", res.message);
    setBusy(false);
    if (res.ok) {
      setNewPass("");
      setResetting(false);
      onChanged();
    }
  }

  async function remove() {
    if (!window.confirm(`Xoá tài khoản ${user.email}? Người này sẽ không đăng nhập được nữa.`)) {
      return;
    }
    setBusy(true);
    const res = await deleteUserAction(user.id);
    onToast(res.ok ? "success" : "error", res.message);
    setBusy(false);
    onChanged();
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
            meta.badge,
          )}
        >
          {(user.name || user.email).slice(0, 2).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink-900">
            {user.name || user.email}
            {isMe && <Badge className="bg-brand-50 text-brand-700">bạn</Badge>}
            {!user.is_active && <Badge className="bg-red-50 text-red-700">đã khoá</Badge>}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-500">{user.email}</p>
          <p className="mt-0.5 text-[12px] text-ink-500">
            Gửi từ{" "}
            <span className="font-semibold text-ink-700">{senderAddress ?? "địa chỉ chung của công ty"}</span>
            {senderAddress && senderAuto && <span className="text-ink-400"> · tự sinh theo họ tên</span>}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge className={meta.badge}>{meta.label}</Badge>
            {user.auth_provider === "supabase" ? (
              <span className="inline-flex items-center gap-1 text-ink-600">
                <Cloud className="h-3 w-3" /> Supabase Auth
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-ink-600">
                <HardDrive className="h-3 w-3" /> Tài khoản nội bộ
              </span>
            )}
            {user.has_local_password ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> có mật khẩu dự phòng
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <XCircle className="h-3 w-3" /> chưa có mật khẩu dự phòng
              </span>
            )}
            {user.last_login_at && (
              <span className="text-ink-400">đăng nhập gần nhất {formatDateTime(user.last_login_at)}</span>
            )}
          </div>

          {resetting && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                className="input w-56 py-1.5 text-[12.5px]"
                type="text"
                placeholder="Mật khẩu mới"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
              <Button size="sm" variant="soft" disabled={busy || !newPass} onClick={() => void resetPassword()}>
                <KeyRound className="h-3.5 w-3.5" />
                Lưu mật khẩu
              </Button>
              <button
                type="button"
                className="text-[12px] text-ink-500 hover:underline"
                onClick={() => {
                  setResetting(false);
                  setNewPass("");
                }}
              >
                Huỷ
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-auto py-1.5 text-[12px]"
            value={user.role}
            disabled={busy || user.role === "supplier"}
            onChange={(e) => void patch({ role: e.target.value as UserRole })}
          >
            {ROLES.filter((r) => r.value !== "supplier" || user.role === "supplier").map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void patch({ is_active: !user.is_active })}
            title={user.is_active ? "Tạm khoá tài khoản" : "Mở lại tài khoản"}
          >
            {user.is_active ? "Khoá" : "Mở khoá"}
          </Button>

          {user.role !== "supplier" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setResetting((v) => !v)}>
            <KeyRound className="h-3.5 w-3.5" />
            Đặt lại mật khẩu
          </Button>}

          <button
            type="button"
            disabled={busy || isMe}
            onClick={() => void remove()}
            className="flex items-center gap-1 text-[12px] font-semibold text-red-600 transition hover:underline disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Xoá
          </button>
        </div>
      </div>
    </li>
  );
}
