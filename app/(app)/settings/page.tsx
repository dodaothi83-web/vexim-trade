import { redirect } from "next/navigation";
import { Check, Copy, Database, Mail, ShieldCheck, TriangleAlert, Users, X } from "lucide-react";

import { COMPANY } from "@/lib/config";
import { dataStatus } from "@/lib/db";
import { checkSchema } from "@/lib/db/schema-check";
import { hasPermission } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { roleMeta } from "@/lib/auth/permissions";
import { STAGES } from "@/lib/pipeline";
import { STAGE_CONTENT } from "@/lib/email/stage-content";
import Link from "next/link";

import { Card, cx } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { CopyButton } from "@/components/copy-button";
import { RetrySupabaseButton } from "@/components/retry-supabase-button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cài đặt" };

const SQL_SNIPPET = `-- Chạy trong Supabase → SQL Editor
\\i supabase/schema.sql   -- hoặc copy toàn bộ nội dung file supabase/schema.sql`;

export default async function SettingsPage() {
  const session = await requireSession();
  if (!hasPermission(session.role, "settings.view")) redirect("/");

  const db = dataStatus();
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  // Chỉ kiểm tra schema khi thực sự kết nối được Supabase (tránh chờ vô ích)
  const schema = db.mode === "supabase" ? await checkSchema() : null;

  const rows = [
    {
      key: "SUPABASE_URL",
      value: process.env.SUPABASE_URL,
      label: "Địa chỉ dự án Supabase",
    },
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      value: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY,
      label: process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "Khoá Supabase (service_role — bỏ qua RLS)"
        : "Khoá Supabase (anon — KHÔNG đọc/ghi được bảng bật RLS)",
      secret: true,
    },
    { key: "RESEND_API_KEY", value: process.env.RESEND_API_KEY, label: "Khoá API Resend", secret: true },
    { key: "EMAIL_FROM", value: process.env.EMAIL_FROM, label: "Địa chỉ gửi email" },
    {
      key: "VEXIM_LOCAL_FALLBACK",
      value: process.env.VEXIM_LOCAL_FALLBACK,
      label: "Dự phòng dữ liệu local khi mất kết nối (auto / on / off)",
    },
  ];

  return (
    <>
      <PageHeader
        title="Cài đặt & kết nối"
        sub="Trạng thái kết nối Supabase và Resend, cùng cấu trúc pipeline đang dùng."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
            <Database className="h-4 w-4 text-brand-700" />
            <h2 className="text-[15px] font-bold text-ink-900">Cơ sở dữ liệu</h2>
            <StatusPill
              ok={db.mode === "supabase"}
              label={
                db.mode === "supabase"
                  ? "Đã kết nối Supabase"
                  : db.degraded
                    ? "Mất kết nối Supabase – dữ liệu tạm"
                    : "Chế độ demo (local)"
              }
            />
          </div>
          <div className="space-y-3 p-4 text-[13px] text-ink-600">
            {db.degraded && (
              <div className="rounded-lg border border-ink-200 bg-ink-50 p-3 text-[12.5px] text-ink-700">
                <p className="font-semibold text-ink-900">
                  Đã cấu hình Supabase nhưng máy chạy app không kết nối được.
                </p>
                <p className="mt-1">
                  URL: <code className="rounded bg-white px-1">{db.url}</code>
                  {db.projectRef && (
                    <>
                      {" "}
                      · dự án <strong>{db.projectRef}</strong>
                    </>
                  )}
                </p>
                <p className="mt-1">
                  Lỗi: <em>{db.reason}</em>
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <RetrySupabaseButton />
                  <span className="text-[12px] text-ink-500">
                    Thử lại ngay mà không cần khởi động lại app.
                  </span>
                </div>
                <p className="mt-1">
                  Hệ thống đang tạm ghi vào <code className="rounded bg-white px-1">data/local-db.json</code>{" "}
                  và sẽ tự thử lại Supabase sau mỗi lần khởi động lại app (hoặc sau 60 giây).
                  Mở app ở máy có Internet tới Supabase để dùng dữ liệu thật. Kiểm tra nhanh bằng{" "}
                  <code className="rounded bg-white px-1">npm run check:supabase</code>.
                </p>
              </div>
            )}
            {!process.env.SUPABASE_SERVICE_ROLE_KEY && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-900">
                <p className="font-semibold">Đang dùng khoá anon cho toàn bộ truy cập dữ liệu.</p>
                <p className="mt-1">
                  Các bảng <strong>bật Row Level Security</strong> (ví dụ <code>app_users</code>) sẽ
                  không đọc/ghi được từ máy chủ, gây lỗi khi đăng nhập hoặc tạo tài khoản. Hãy thêm{" "}
                  <code>SUPABASE_SERVICE_ROLE_KEY=…</code> vào <code>.env.local</code> rồi khởi động
                  lại app. Khoá service_role chỉ nằm ở máy chủ, không lộ ra trình duyệt.
                </p>
              </div>
            )}
            {db.mode === "supabase" ? (
              <>
                <p>
                  Dữ liệu đang được lưu trên Supabase (dự án{" "}
                  <strong>{db.projectRef ?? "đã cấu hình"}</strong>). Mọi thao tác thêm / sửa buyer,
                  nhà cung cấp và đổi trạng thái đều ghi thẳng lên đó.
                </p>

                {schema && (
                  <div className="rounded-lg border border-ink-200 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-ink-800">
                      <Database className="h-3.5 w-3.5 text-brand-700" />
                      Kiểm tra cấu trúc bảng
                      <span
                        className={cx(
                          "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          schema.ready
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700",
                        )}
                      >
                        {schema.ready ? "Đầy đủ" : "Còn thiếu"}
                      </span>
                    </p>
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] sm:grid-cols-3">
                      {schema.tables.map((t) => (
                        <li key={t.table} className="flex items-center gap-1.5">
                          {t.ok ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          ) : (
                            <X className="h-3.5 w-3.5 shrink-0 text-red-500" />
                          )}
                          <code className="text-[11.5px] text-ink-700">{t.table}</code>
                          {t.ok && t.rows !== null && (
                            <span className="text-[11px] text-ink-400">{t.rows}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {schema.missingColumns.length > 0 && (
                      <p className="mt-2 text-[12px] text-amber-800">
                        Thiếu cột: <code>{schema.missingColumns.join(", ")}</code>
                      </p>
                    )}
                    {!schema.ready && (
                      <p className="mt-2 text-[12px] leading-relaxed text-amber-800">
                        Mở Supabase → <strong>SQL Editor</strong>, dán toàn bộ nội dung{" "}
                        <code className="rounded bg-amber-100 px-1">supabase/schema.sql</code> rồi bấm{" "}
                        <strong>Run</strong> (script dùng <code>if not exists</code> nên chạy lại an toàn,
                        không mất dữ liệu).
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p>
                  App đang lưu dữ liệu ở file <code className="rounded bg-ink-100 px-1">data/local-db.json</code>{" "}
                  trên server để bạn dùng thử. Để chuyển sang Supabase:
                </p>
                <ol className="ml-4 list-decimal space-y-1">
                  <li>Mở dự án Supabase → <strong>SQL Editor</strong>.</li>
                  <li>
                    Copy toàn bộ nội dung file{" "}
                    <code className="rounded bg-ink-100 px-1">supabase/schema.sql</code> rồi bấm{" "}
                    <strong>Run</strong>.
                  </li>
                  <li>
                    Vào <strong>Project Settings → API</strong>, copy <em>Project URL</em> và{" "}
                    <em>service_role key</em>.
                  </li>
                  <li>
                    Điền vào <code className="rounded bg-ink-100 px-1">.env.local</code> rồi khởi động
                    lại app.
                  </li>
                </ol>
              </>
            )}
            <div className="rounded-lg bg-ink-50 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-wide text-ink-500 uppercase">
                  File schema
                </span>
                <CopyButton text={SQL_SNIPPET} label="Copy lệnh" />
              </div>
              <pre className="overflow-x-auto text-[11.5px] text-ink-700">{SQL_SNIPPET}</pre>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
            <Mail className="h-4 w-4 text-brand-700" />
            <h2 className="text-[15px] font-bold text-ink-900">Gửi email (Resend)</h2>
            <StatusPill
              ok={hasResend}
              label={hasResend ? `Đang gửi từ ${COMPANY.email}` : "Chưa cấu hình – email ở chế độ demo"}
            />
          </div>
          <div className="space-y-3 p-4 text-[13px] text-ink-600">
            <p>
              Domain <strong>veximtrade.com</strong> đã được verify trong Resend. Chỉ cần thêm khoá
              API là hệ thống gửi email thật.
            </p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>
                Resend Dashboard → <strong>API Keys</strong> → tạo key.
              </li>
              <li>
                Thêm vào <code className="rounded bg-ink-100 px-1">.env.local</code>:
                <pre className="mt-1 overflow-x-auto rounded bg-ink-50 p-2 text-[11.5px]">{`RESEND_API_KEY=re_...
EMAIL_FROM=sales@veximtrade.com
EMAIL_FROM_NAME=Vexim Trade`}</pre>
              </li>
              <li>Khởi động lại app. Các email đang ở trạng thái “demo” có thể bấm “Gửi lại”.</li>
            </ol>
            {!hasResend && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-900">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Hiện tại mọi email chỉ được <strong>tạo và lưu lại</strong> trong Nhật ký email, chưa
                gửi ra ngoài.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Người dùng & phân quyền */}
      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <Users className="h-4 w-4 text-brand-700" />
          <h2 className="text-[15px] font-bold text-ink-900">Người dùng &amp; phân quyền</h2>
          <span
            className={cx(
              "ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
              roleMeta(session.role).badge,
            )}
          >
            <ShieldCheck className="h-3 w-3" />
            Bạn là {roleMeta(session.role).label}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 p-4 text-[13px] text-ink-600">
          <p className="min-w-[240px] flex-1">
            {roleMeta(session.role).description}
          </p>
          {hasPermission(session.role, "users.manage") && (
            <Link href="/settings/users" className="btn btn-primary">
              <Users className="h-4 w-4" />
              Quản lý tài khoản
            </Link>
          )}
        </div>
      </Card>

      {/* Biến môi trường */}
      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-ink-200 px-4 py-3">
          <h2 className="text-[15px] font-bold text-ink-900">Biến môi trường</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Đọc từ <code>.env.local</code> — giá trị bí mật đã được che.
          </p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="table-th">Biến</th>
              <th className="table-th">Mô tả</th>
              <th className="table-th">Giá trị</th>
              <th className="table-th">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ok = Boolean(r.value);
              const shown = !ok
                ? "chưa đặt"
                : r.secret
                  ? `${String(r.value).slice(0, 6)}••••••${String(r.value).slice(-4)}`
                  : String(r.value);
              return (
                <tr key={r.key}>
                  <td className="table-td">
                    <code className="text-[12px] font-semibold text-ink-800">{r.key}</code>
                  </td>
                  <td className="table-td text-[12.5px] text-ink-600">{r.label}</td>
                  <td className="table-td max-w-[280px] truncate text-[12px] text-ink-500">{shown}</td>
                  <td className="table-td">
                    <StatusPill ok={ok} label={ok ? "OK" : "thiếu"} small />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Pipeline */}
      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-ink-200 px-4 py-3">
          <h2 className="text-[15px] font-bold text-ink-900">Cấu trúc pipeline</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Mỗi giai đoạn có nội dung riêng cho buyer (EN) và cho NCC (VI) — sửa trong{" "}
            <code>lib/email/stage-content.ts</code>. Danh sách giai đoạn ở{" "}
            <code>lib/pipeline.ts</code>. Xem đầy đủ tại{" "}
            <Link href="/templates" className="font-semibold text-brand-700 hover:underline">
              Nội dung email theo giai đoạn
            </Link>
            .
          </p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="table-th">Giai đoạn</th>
              <th className="table-th">Nội dung gửi buyer (EN)</th>
              <th className="table-th">Việc cần phối hợp với NCC (VI)</th>
              <th className="table-th">Email</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((s) => (
              <tr key={s.key}>
                <td className="table-td">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    <span>
                      <span className="block text-[13px] font-semibold text-ink-900">{s.label}</span>
                      <span className="block text-[11px] text-ink-500">{s.labelEn}</span>
                    </span>
                  </span>
                </td>
                <td className="table-td max-w-[380px] text-[12px] leading-relaxed text-ink-600">
                  <span className="mb-1 block font-semibold text-ink-800">
                    {STAGE_CONTENT[s.key].buyer.subject || "—"}
                  </span>
                  {STAGE_CONTENT[s.key].buyer.body[0] || "—"}
                </td>
                <td className="table-td max-w-[340px] text-[12px] leading-relaxed text-ink-600">
                  <span className="mb-1 block font-semibold text-ink-800">
                    {STAGE_CONTENT[s.key].supplier.subject || "—"}
                  </span>
                  {STAGE_CONTENT[s.key].supplier.body[0] || "—"}
                  {STAGE_CONTENT[s.key].supplier.tasks.length > 0 && (
                    <span className="mt-1 block text-[11px] text-amber-700">
                      Hạn: {STAGE_CONTENT[s.key].supplier.deadline}
                    </span>
                  )}
                </td>
                <td className="table-td">
                  <StatusPill
                    ok={!s.silent}
                    label={s.silent ? "không gửi" : s.wantsSupplier ? "buyer + NCC" : "buyer"}
                    small
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-6 text-center text-[11.5px] text-ink-400">
        {COMPANY.name} · {COMPANY.website} · chữ ký email lấy từ biến{" "}
        <code>EMAIL_FROM_NAME</code> / <code>COMPANY_*</code>
      </p>
    </>
  );
}

function StatusPill({
  ok,
  label,
  small,
}: {
  ok: boolean;
  label: string;
  small?: boolean;
}) {
  return (
    <span
      className={cx(
        "ml-auto inline-flex items-center gap-1 rounded-full font-semibold",
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]",
        ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
      )}
    >
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </span>
  );
}
