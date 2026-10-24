import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

import type { VerificationProgress, VerificationProgressStep } from "@/lib/supplier-portal/verification-progress";
import { Panel } from "./portal-ui";

/**
 * Hai cách nhìn cùng một tiến độ xác minh:
 *  - `VerificationProgressPanel`: khối đầy đủ trên trang tổng quan, đọc như một dải
 *    trạng thái theo thứ tự bước;
 *  - `StorefrontVerificationActions`: bản gọn đặt ngay dưới phần “What we checked”
 *    ở “Trang của tôi”, chỉ nhà cung cấp thấy, để họ bấm thẳng tới nơi nộp bằng chứng.
 *
 * Cả hai chỉ đọc mô hình từ `lib/supplier-portal/verification-progress`; không tự suy ra
 * “đã duyệt” từ việc tải tệp.
 */

const CIRCLE: Record<VerificationProgressStep["tone"], string> = {
  emerald: "bg-emerald-600 text-white",
  amber: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  rose: "bg-rose-100 text-rose-900 ring-1 ring-rose-300",
  ink: "bg-ink-100 text-ink-600",
};

const CHIP: Record<VerificationProgressStep["tone"], string> = {
  emerald: "bg-emerald-50 text-emerald-800",
  amber: "bg-amber-50 text-amber-900",
  rose: "bg-rose-50 text-rose-800",
  ink: "bg-ink-100 text-ink-600",
};

function StepDot({ step, size = "h-9 w-9 text-[12px]", icon = "h-4 w-4" }: {
  step: VerificationProgressStep;
  size?: string;
  icon?: string;
}) {
  return <span className={`flex shrink-0 items-center justify-center rounded-full font-black ${size} ${CIRCLE[step.tone]}`}>
    {step.state === "approved" ? <CheckCircle2 className={icon} aria-hidden="true" /> : step.level}
  </span>;
}

/** Dải tiến độ trên trang tổng quan: trạng thái từng bước, việc đang chờ và nút đi tiếp. */
export function VerificationProgressPanel({ progress }: { progress: VerificationProgress }) {
  return <Panel
    id="xac-minh"
    icon={<ShieldCheck className="h-4 w-4 text-brand-700" />}
    title="Xác minh doanh nghiệp"
    sub="Ba bước độc lập, xếp theo tiến độ. Mỗi bước có trang riêng để nộp bằng chứng và xem kết quả."
    action={<span className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-800">
      {progress.approvedCount}/3 bước đã duyệt
    </span>}
    flush
  >
    <div className="border-b border-ink-100 px-5 py-4">
      <div className="flex items-center gap-3">
        <div role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={progress.approvedCount}
          aria-label="Số bước xác minh đã được duyệt" className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
          <div className={`h-full rounded-full ${progress.percent === 100 ? "bg-emerald-500" : "bg-brand-600"}`}
            style={{ width: `${progress.percent}%` }} />
        </div>
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-ink-600">{progress.percent}%</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-5 text-ink-600">{progress.headline}</p>
    </div>

    <ol className="divide-y divide-ink-100">
      {progress.steps.map((step) => {
        const current = progress.currentLevel === step.level;
        return <li key={step.level} className="flex flex-wrap items-start gap-3 px-5 py-4 sm:flex-nowrap">
          <StepDot step={step} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10px] font-bold tracking-[0.12em] text-ink-400 uppercase">Bước {step.level}</span>
              <h3 className="text-[13.5px] font-bold text-ink-900">{step.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${CHIP[step.tone]}`}>{step.status}</span>
              <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10.5px] font-semibold text-ink-600 ring-1 ring-ink-200/70">{step.metric}</span>
              {current && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-amber-300">Đang ở đây</span>}
            </div>
            <p className="mt-1 text-[11.5px] leading-5 text-ink-500">{step.description}</p>
            <p className={`mt-1 text-[11.5px] leading-5 ${step.tone === "rose" ? "font-semibold text-rose-700" : step.tone === "emerald" ? "font-semibold text-emerald-800" : "text-ink-700"}`}>
              {step.note}
            </p>
          </div>
          <Link href={step.href} className={`${current ? "btn btn-primary" : "btn btn-ghost"} btn-sm shrink-0 self-center`}>
            {step.action}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </li>;
      })}
    </ol>

    <p className="border-t border-ink-100 bg-ink-50/60 px-5 py-3 text-[11px] leading-5 text-ink-500">
      Tải bằng chứng không tự cấp huy hiệu. Mỗi bước chỉ chuyển sang <b className="text-ink-700">Đã duyệt</b> khi
      hồ sơ được đối chiếu thủ công và người có quyền duyệt phê kết quả.
    </p>
  </Panel>;
}

/** Khối nút ngay dưới phần kiểm toán ở “Trang của tôi”. Chỉ NCC thấy, buyer không thấy. */
export function StorefrontVerificationActions({ progress }: { progress: VerificationProgress }) {
  return <section aria-labelledby="supplier-verification-actions"
    className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-5 sm:p-6">
    <div className="flex flex-wrap items-center gap-2">
      <ShieldCheck className="h-5 w-5 text-brand-700" aria-hidden="true" />
      <h2 id="supplier-verification-actions" className="text-lg font-bold text-ink-900">Your verification steps</h2>
      <span className="rounded-full bg-white px-2.5 py-0.5 text-[10.5px] font-bold tracking-wider text-brand-800 uppercase ring-1 ring-brand-200">
        Supplier only
      </span>
    </div>
    <p className="mt-2 text-xs leading-5 text-ink-600">
      Buyers never see this panel. Add the evidence still needed; an approved check appears in the section above automatically.
      Uploading evidence does not grant a badge by itself.
    </p>
    <ol className="mt-3 space-y-2">
      {progress.steps.map((step) => {
        const current = progress.currentLevel === step.level;
        return <li key={step.level} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2.5">
          <StepDot step={step} size="h-7 w-7 text-[11px]" icon="h-3.5 w-3.5" />
          <div className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-bold text-ink-900">{step.titleEn}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-600">
              <span className={`inline-flex items-center gap-1 font-semibold ${step.tone === "emerald" ? "text-emerald-700" : step.tone === "rose" ? "text-rose-700" : step.tone === "amber" ? "text-amber-800" : "text-ink-500"}`}>
                {step.state === "reviewing" && <Clock3 className="h-3 w-3" aria-hidden="true" />}
                {step.statusEn}
              </span>
              <span aria-hidden="true">·</span>
              <span>{step.metricEn}</span>
            </span>
          </div>
          <Link href={step.href} className={`${current ? "btn btn-primary" : "btn btn-ghost"} btn-sm shrink-0`}>
            {step.actionEn}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </li>;
      })}
    </ol>
  </section>;
}
