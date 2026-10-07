import { Check, Copy, Database, Mail, TriangleAlert, X } from "lucide-react";

import { COMPANY } from "@/lib/config";
import { dataMode } from "@/lib/db";
import { STAGES } from "@/lib/pipeline";
import { STAGE_CONTENT } from "@/lib/email/stage-content";
import Link from "next/link";

import { Card, cx } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { CopyButton } from "@/components/copy-button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cài đặt" };

const SQL_SNIPPET = `-- Chạy trong Supabase → SQL Editor
\\i supabase/schema.sql   -- hoặc copy toàn bộ nội dung file supabase/schema.sql`;

export default function SettingsPage() {
  const db = dataMode();
  const hasResend = Boolean(process.env.RESEND_API_KEY);

  const rows = [
    {
      key: "SUPABASE_URL",
      value: process.env.SUPABASE_URL,
      label: "Địa chỉ dự án Supabase",
    },
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      value: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY,
      label: "Khoá Supabase (service role hoặc anon)",
      secret: true,
    },
    { key: "RESEND_API_KEY", value: process.env.RESEND_API_KEY, label: "Khoá API Resend", secret: true },
    { key: "EMAIL_FROM", value: process.env.EMAIL_FROM, label: "Địa chỉ gửi email" },
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
            <StatusPill ok={db === "supabase"} label={db === "supabase" ? "Đã kết nối Supabase" : "Chế độ demo (local)"} />
          </div>
          <div className="space-y-3 p-4 text-[13px] text-ink-600">
            {db === "supabase" ? (
              <p>
                Dữ liệu đang được lưu trên Supabase. Mọi thao tác thêm / sửa buyer, nhà cung cấp và
                đổi trạng thái đều ghi thẳng lên đó.
              </p>
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
