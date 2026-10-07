import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Factory,
  LineChart,
  MailCheck,
  PackageSearch,
  TrendingUp,
  UserPlus,
} from "lucide-react";

import { listBuyersWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { emailMode } from "@/lib/config";
import { FUNNEL_STAGES, getStage } from "@/lib/pipeline";
import { PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/stage-select";
import { Badge, Card, EmptyState, cx, formatDate, formatMoney, relativeTime } from "@/components/ui";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);

export default async function DashboardPage() {
  const buyers = await listBuyersWithSupplier();
  const activities = (await getStore().listActivities()).slice(0, 12);
  const suppliers = await getStore().listSuppliers();
  const mode = emailMode();
  const d0 = today();

  const active = buyers.filter((b) => !getStage(b.stage).terminal);
  const pipelineValue = active.reduce((s, b) => s + (b.deal_value ?? 0), 0);
  const executing = buyers.filter((b) =>
    ["confirmed", "production", "shipping"].includes(b.stage),
  );
  const overdue = buyers.filter(
    (b) => b.next_action_date && b.next_action_date < d0 && !getStage(b.stage).terminal,
  );
  const soon = buyers
    .filter(
      (b) =>
        b.next_action_date &&
        b.next_action_date >= d0 &&
        !getStage(b.stage).terminal,
    )
    .sort((a, b) => (a.next_action_date ?? "").localeCompare(b.next_action_date ?? ""))
    .slice(0, 6);
  const needSupplier = buyers.filter(
    (b) => getStage(b.stage).wantsSupplier && !b.supplier_id && !getStage(b.stage).terminal,
  );
  const missingEmail = buyers.filter((b) => !b.email);
  const nameOf = (id: string) => buyers.find((b) => b.id === id)?.company ?? "—";

  const funnel = FUNNEL_STAGES.map((s) => ({
    ...s,
    count: buyers.filter((b) => b.stage === s.key).length,
    value: buyers
      .filter((b) => b.stage === s.key)
      .reduce((sum, b) => sum + (b.deal_value ?? 0), 0),
  }));
  const totalCount = funnel.reduce((s, f) => s + f.count, 0) || 1;

  return (
    <>
      <PageHeader
        title="Tổng quan"
        sub={`Pipeline xuất khẩu của phòng sale · ${new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}`}
        actions={
          <>
            <Link href="/buyers/new" className="btn btn-primary">
              <UserPlus className="h-4 w-4" />
              Thêm buyer
            </Link>
          </>
        }
      />

      {mode === "local" && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>Chế độ demo:</strong> chưa cấu hình <code className="rounded bg-amber-100 px-1">SUPABASE_URL</code> và{" "}
            <code className="rounded bg-amber-100 px-1">RESEND_API_KEY</code> nên dữ liệu lưu ở máy và email chưa gửi thật.
            Xem hướng dẫn tại{" "}
            <Link href="/settings" className="font-semibold underline">
              Cài đặt
            </Link>
            .
          </span>
        </div>
      )}

      {/* KPI */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<TrendingUp className="h-4 w-4" />}
          label="Buyer đang chạy"
          value={String(active.length)}
          sub={`trên tổng ${buyers.length} buyer`}
          tone="brand"
        />
        <Kpi
          icon={<LineChart className="h-4 w-4" />}
          label="Giá trị pipeline"
          value={formatMoney(pipelineValue)}
          sub="tổng đơn chưa hoàn tất"
          tone="ink"
        />
        <Kpi
          icon={<PackageSearch className="h-4 w-4" />}
          label="Đang thực hiện"
          value={String(executing.length)}
          sub="đã chốt cọc / sản xuất / giao hàng"
          tone="emerald"
        />
        <Kpi
          icon={<CalendarClock className="h-4 w-4" />}
          label="Việc trễ hạn"
          value={String(overdue.length)}
          sub="cần xử lý ngay"
          tone={overdue.length ? "red" : "ink"}
        />
      </div>

      {/* Funnel */}
      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
          <div>
            <h2 className="text-[15px] font-bold text-ink-900">Phễu pipeline</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Nhấn vào một giai đoạn để mở pipeline chi tiết
            </p>
          </div>
          <Link href="/pipeline" className="btn btn-ghost text-[13px]">
            Mở pipeline
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="flex h-3 w-full overflow-hidden bg-ink-100">
          {funnel.map((f) =>
            f.count === 0 ? null : (
              <div
                key={f.key}
                title={`${f.label}: ${f.count} buyer · ${formatMoney(f.value)}`}
                style={{ width: `${(f.count / totalCount) * 100}%`, backgroundColor: f.color }}
              />
            ),
          )}
        </div>
        <div className="grid grid-cols-2 gap-px bg-ink-100 sm:grid-cols-4 xl:grid-cols-8">
          {funnel.map((f) => (
            <Link
              key={f.key}
              href={`/pipeline?stage=${f.key}`}
              className="bg-white px-3 py-2.5 transition hover:bg-ink-50"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.color }} />
                <span className="truncate text-[11px] font-semibold text-ink-600">{f.label}</span>
              </span>
              <span className="mt-1 block text-lg leading-none font-black text-ink-900">
                {f.count}
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-400">{formatMoney(f.value)}</span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Việc cần làm */}
        <Card className="xl:col-span-2">
          <div className="border-b border-ink-200 px-4 py-3">
            <h2 className="text-[15px] font-bold text-ink-900">Việc cần làm</h2>
            <p className="mt-0.5 text-xs text-ink-500">Trễ hạn và sắp đến hạn</p>
          </div>
          {[...overdue, ...soon].length === 0 ? (
            <EmptyState
              icon={<MailCheck className="h-5 w-5" />}
              title="Không có việc nào tới hạn"
              sub="Thêm việc cần làm và hạn xử lý trong trang chi tiết buyer để được nhắc ở đây."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {[...overdue, ...soon].slice(0, 9).map((b) => {
                const late = (b.next_action_date ?? "") < d0;
                return (
                  <li key={b.id}>
                    <Link
                      href={`/buyers/${b.id}`}
                      className="flex items-start gap-3 px-4 py-3 transition hover:bg-brand-50/40"
                    >
                      <span
                        className={cx(
                          "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                          late ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700",
                        )}
                      >
                        <CalendarClock className="h-3 w-3" />
                        {formatDate(b.next_action_date)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink-900">
                          {b.next_action}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-ink-500">
                          {b.company}
                          {b.country ? ` · ${b.country}` : ""}
                          {b.owner ? ` · PT: ${b.owner}` : ""}
                        </span>
                      </span>
                      <StageBadge stage={b.stage} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Hoạt động */}
        <Card>
          <div className="border-b border-ink-200 px-4 py-3">
            <h2 className="text-[15px] font-bold text-ink-900">Hoạt động gần đây</h2>
          </div>
          {activities.length === 0 ? (
            <EmptyState icon={<LineChart className="h-5 w-5" />} title="Chưa có hoạt động" />
          ) : (
            <ul className="max-h-[420px] divide-y divide-ink-100 overflow-y-auto">
              {activities.map((a) => (
                <li key={a.id} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getStage(a.to_stage ?? "lead").color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug text-ink-800">{a.message}</p>
                      <p className="mt-0.5 text-[11px] text-ink-400">
                        {nameOf(a.buyer_id)} · {relativeTime(a.created_at)}
                        {a.created_by ? ` · ${a.created_by}` : ""}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Cần chú ý */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
            <Factory className="h-4 w-4 text-amber-600" />
            <h2 className="text-[15px] font-bold text-ink-900">Cần gắn nhà cung cấp</h2>
            <Badge className="ml-auto bg-amber-50 text-amber-700">{needSupplier.length}</Badge>
          </div>
          {needSupplier.length === 0 ? (
            <EmptyState
              icon={<MailCheck className="h-5 w-5" />}
              title="Mọi đơn đã có nhà cung cấp"
              sub="Các đơn đã qua bước báo giá đều được gắn NCC — email sẽ gửi cho cả hai bên."
            />
          ) : (
            <>
              <p className="border-b border-amber-100 bg-amber-50/60 px-4 py-2 text-[11.5px] text-amber-800">
                Các đơn này đã qua bước báo giá nhưng chưa chọn NCC — hiện email chỉ gửi tới buyer.
              </p>
              <ul className="divide-y divide-ink-100">
                {needSupplier.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/buyers/${b.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-brand-50/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink-900">
                          {b.company}
                        </span>
                        <span className="block truncate text-[11.5px] text-ink-500">
                          {b.product || "—"} · {b.quantity || "chưa rõ số lượng"}
                        </span>
                      </span>
                      <StageBadge stage={b.stage} />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h2 className="text-[15px] font-bold text-ink-900">Thiếu thông tin liên hệ</h2>
            <Badge className="ml-auto bg-red-50 text-red-700">
              {missingEmail.length + suppliers.filter((s) => !s.email).length}
            </Badge>
          </div>
          {missingEmail.length + suppliers.filter((s) => !s.email).length === 0 ? (
            <EmptyState
              icon={<MailCheck className="h-5 w-5" />}
              title="Đủ email cho tất cả buyer &amp; NCC"
              sub="Hệ thống có thể gửi thông báo tiến độ cho mọi bên liên quan."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {missingEmail.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/buyers/${b.id}`}
                      className="block truncate text-[13px] font-semibold text-ink-900 hover:text-brand-700"
                    >
                      {b.company}
                    </Link>
                    <span className="text-[11.5px] text-ink-500">Buyer chưa có email</span>
                  </span>
                  <Badge className="bg-red-50 text-red-700">không gửi được mail</Badge>
                </li>
              ))}
              {suppliers
                .filter((s) => !s.email)
                .map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/suppliers/${s.id}`}
                        className="block truncate text-[13px] font-semibold text-ink-900 hover:text-brand-700"
                      >
                        {s.name}
                      </Link>
                      <span className="text-[11.5px] text-ink-500">NCC chưa có email</span>
                    </span>
                    <Badge className="bg-amber-50 text-amber-700">bổ sung email</Badge>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "brand" | "ink" | "emerald" | "red";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700",
    ink: "bg-ink-100 text-ink-600",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
          <p className="mt-0.5 text-2xl leading-none font-black text-ink-900">{value}</p>
          <p className="mt-1 truncate text-[11.5px] text-ink-400">{sub}</p>
        </div>
      </div>
    </Card>
  );
}
