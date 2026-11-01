import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { requireSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { listSuppressions } from "@/lib/email/suppression-store";
import { AllowResendButton } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Địa chỉ ngừng nhận thư" };

const REASONS: Record<string, string> = {
  hard_bounce: "Hộp thư không tồn tại",
  complaint: "Người nhận báo cáo thư rác",
  provider_suppressed: "Resend tự chặn",
  manual: "Thêm tay",
};

type Row = {
  email: string;
  reason: string;
  event_type: string | null;
  detail: Record<string, unknown> | null;
  first_seen_at: string;
  last_seen_at: string;
};

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function note(detail: Record<string, unknown> | null) {
  if (!detail) return "";
  return String(detail.message ?? detail.subType ?? detail.type ?? "").slice(0, 160);
}

export default async function EmailSuppressionsPage() {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/crm/settings");
  const db = getSupabaseClient();
  // Chỉ quản trị viên đang hoạt động thật sự mới xem được danh sách này.
  const user = db ? await supabaseStore.getUser(session.uid) : null;
  if (!user?.is_active || user.role !== "admin" || user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) {
    redirect("/crm/settings");
  }

  const rows = (await listSuppressions()) as Row[];
  const connected = Boolean(db);

  return (
    <>
      <PageHeader
        title="Địa chỉ ngừng nhận thư"
        sub="Thư gửi tới những địa chỉ này bị chặn để giữ uy tín tên miền gửi. Gỡ khi người nhận đã sửa hộp thư."
      />
      {!connected && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Chưa kết nối Supabase nên bounce chưa được ghi nhận. Thư vẫn gửi bình thường.
        </p>
      )}
      <p className="mb-4 text-sm text-ink-600">
        <Link className="font-semibold text-brand-700" href="/crm/settings">
          Quay lại cài đặt
        </Link>
      </p>
      <section className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">Địa chỉ</th>
              <th className="table-th">Lý do</th>
              <th className="table-th">Ghi chú từ Resend</th>
              <th className="table-th">Lần đầu</th>
              <th className="table-th">Gần nhất</th>
              <th className="table-th" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-ink-500" colSpan={6}>
                  Chưa có địa chỉ nào bị chặn.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.email} className="border-t border-ink-100 align-top">
                <td className="px-4 py-3 font-medium text-ink-900">{row.email}</td>
                <td className="px-4 py-3 text-ink-700">{REASONS[row.reason] ?? row.reason}</td>
                <td className="px-4 py-3 text-ink-600">{note(row.detail)}</td>
                <td className="px-4 py-3 text-ink-600">{when(row.first_seen_at)}</td>
                <td className="px-4 py-3 text-ink-600">{when(row.last_seen_at)}</td>
                <td className="px-4 py-3">
                  <AllowResendButton email={row.email} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="mt-4 text-xs text-ink-500">
        Hộp thư chỉ đầy tạm thời không bị chặn. Khi một địa chỉ bị chặn, tài khoản nhà cung cấp dùng địa chỉ đó cũng bị tắt; bật lại trong trang Người dùng sau khi đã sửa hộp thư.
      </p>
    </>
  );
}
