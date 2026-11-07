import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Database, Mail, MailX, Scale, ShieldCheck, TableProperties, UserRound, Users, FileText, Check, TriangleAlert } from "lucide-react";

import { dataStatus } from "@/lib/db";
import { checkSchema } from "@/lib/db/schema-check";
import { supabaseKeyRole } from "@/lib/db/supabase";
import { hasPermission, roleMeta } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";

import { Card, cx } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { RetrySupabaseButton } from "@/components/retry-supabase-button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cài đặt" };

/**
 * Trang cài đặt cho người vận hành: lối tắt tới các trang cấu hình, vai trò của người
 * đang đăng nhập và (chỉ admin) tình trạng hệ thống ngắn gọn. Không hiện hướng dẫn cài đặt
 * cho lập trình viên và không hiện bất kỳ ký tự nào của khoá bí mật.
 */
export default async function SettingsPage() {
  const session = await requireSession();
  if (!hasPermission(session.role, "settings.view")) redirect("/crm/");
  const admin = session.role === "admin";
  const role = roleMeta(session.role);

  const shortcuts = [
    { href: "/crm/settings/profile", icon: UserRound, title: "Hồ sơ cá nhân", body: "Họ tên, số điện thoại, địa chỉ gửi thư và chữ ký email.", show: true },
    { href: "/crm/settings/users", icon: Users, title: "Tài khoản & phân quyền", body: "Thêm, khoá tài khoản và đổi vai trò nhân viên, nhà cung cấp.", show: hasPermission(session.role, "users.manage") },
    { href: "/crm/settings/quantity-pricing", icon: Scale, title: "Giá theo số lượng", body: "Tham số và ngưỡng theo grade cho mô hình giá theo số lượng.", show: admin },
    { href: "/crm/settings/email-suppressions", icon: MailX, title: "Địa chỉ ngừng nhận thư", body: "Địa chỉ bị chặn do thư trả lại hoặc bị báo cáo thư rác.", show: admin },
    { href: "/crm/templates", icon: FileText, title: "Nội dung email theo giai đoạn", body: "Thư gửi người mua và nhà cung cấp ở từng giai đoạn đơn hàng.", show: hasPermission(session.role, "templates.manage") },
  ].filter((item) => item.show);

  return (
    <>
      <PageHeader title="Cài đặt" sub="Cấu hình tài khoản và các thiết lập vận hành." />

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return <li key={item.href}>
            <Link href={item.href} className="flex h-full items-start gap-3 rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-4.5 w-4.5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-ink-900">{item.title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-5 text-ink-500">{item.body}</span>
              </span>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
            </Link>
          </li>;
        })}
      </ul>

      <Card className="mt-5 flex flex-wrap items-center gap-3 p-4 text-[13px] text-ink-600">
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold", role.badge)}>
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />Bạn là {role.label}
        </span>
        <p className="min-w-[240px] flex-1">{role.description}</p>
      </Card>

      {admin && <SystemStatus canRetry={hasPermission(session.role, "users.manage")} />}
    </>
  );
}

/** Tình trạng hệ thống, chỉ admin: mỗi mục một dòng, chi tiết chỉ hiện khi có vấn đề. */
async function SystemStatus({ canRetry }: { canRetry: boolean }) {
  const db = dataStatus();
  const keyRole = supabaseKeyRole();
  const schema = db.mode === "supabase" ? await checkSchema() : null;
  const emailReady = Boolean(process.env.RESEND_API_KEY);
  const missingTables = schema ? schema.tables.filter((table) => !table.ok).map((table) => table.table) : [];

  return <Card className="mt-5 overflow-hidden">
    <div className="border-b border-ink-200 px-4 py-3">
      <h2 className="text-[15px] font-bold text-ink-900">Tình trạng hệ thống</h2>
      <p className="mt-0.5 text-xs text-ink-500">Chỉ quản trị viên thấy mục này.</p>
    </div>
    <ul className="divide-y divide-ink-100 text-[13px]">
      <StatusRow icon={Database} title="Cơ sở dữ liệu"
        ok={db.mode === "supabase" && keyRole !== "anon"}
        okText="Đã kết nối"
        problem={db.mode !== "supabase"
          ? <>
              <p>{db.degraded ? "Không kết nối được cơ sở dữ liệu; hệ thống đang ghi tạm." : "Đang chạy dữ liệu thử, chưa kết nối cơ sở dữ liệu thật."}</p>
              {db.reason && <p className="mt-1 text-ink-500">Lỗi: {db.reason}</p>}
              {canRetry && db.degraded && <div className="mt-2"><RetrySupabaseButton /></div>}
            </>
          : keyRole === "anon"
            ? <p>Máy chủ đang dùng khoá truy cập hạn chế nên không đọc/ghi được một số bảng. Báo người phụ trách kỹ thuật.</p>
            : null} />
      {schema && <StatusRow icon={TableProperties} title="Cấu trúc bảng"
        ok={schema.ready}
        okText="Đầy đủ"
        problem={<>
          <p>Cơ sở dữ liệu còn thiếu bảng hoặc cột. Báo người phụ trách kỹ thuật cập nhật.</p>
          {missingTables.length > 0 && <p className="mt-1">Bảng thiếu: <code>{missingTables.join(", ")}</code></p>}
          {schema.missingColumns.length > 0 && <p className="mt-1">Cột thiếu: <code>{schema.missingColumns.join(", ")}</code></p>}
        </>} />}
      <StatusRow icon={Mail} title="Gửi email"
        ok={emailReady}
        okText="Đã bật"
        problem={<p>Chưa cấu hình gửi thư. Email chỉ được tạo và lưu lại trong nhật ký, chưa gửi ra ngoài.</p>} />
    </ul>
  </Card>;
}

function StatusRow({ icon: Icon, title, ok, okText, problem }: {
  icon: typeof Database; title: string; ok: boolean; okText: string; problem: React.ReactNode;
}) {
  return <li className="px-4 py-3">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-brand-700" aria-hidden="true" />
      <span className="font-semibold text-ink-900">{title}</span>
      <span className={cx("ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
        ok ? "bg-success-surface text-success" : "bg-warning-surface text-warning")}>
        {ok ? <Check className="h-3 w-3" aria-hidden="true" /> : <TriangleAlert className="h-3 w-3" aria-hidden="true" />}
        {ok ? okText : "Cần xử lý"}
      </span>
    </div>
    {!ok && problem && <div className="mt-2 rounded-lg bg-warning-surface/60 px-3 py-2 text-[12.5px] leading-5 text-ink-700">{problem}</div>}
  </li>;
}
