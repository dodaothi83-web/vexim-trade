import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

import type { VerificationProgress, VerificationProgressStep } from "@/lib/supplier-portal/verification-progress";
import { fill } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { OverviewMessages } from "@/lib/i18n/portal/overview";
import { Panel } from "./portal-ui";
import { displayLevel } from "@/lib/types";

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

/**
 * Dải tiến độ trên trang tổng quan: trạng thái từng bước, việc đang chờ và nút đi tiếp.
 *
 * Câu của từng bước do mô hình `buildVerificationProgress` sinh theo `locale`; khung của
 * khối (tiêu đề, ghi chú) đọc từ từ điển cổng.
 */
export function VerificationProgressPanel({ progress, messages, lang }: {
  progress: VerificationProgress;
  messages: OverviewMessages["verificationPanel"];
  lang: Locale;
}) {
  return <div lang={lang}><Panel
    id="xac-minh"
    icon={<ShieldCheck className="h-4 w-4 text-brand-700" />}
    title={messages.title}
    sub={messages.sub}
    action={<span className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-800">
      {fill(messages.counter, { approved: progress.approvedCount })}
    </span>}
    flush
  >
    {/* Gọn: bước đã duyệt một dòng; chỉ bước đang làm mở mô tả, ghi chú và nút chính. */}
    <ol className="divide-y divide-ink-100">
      {progress.steps.map((step) => {
        const current = progress.currentLevel === step.level;
        return <li key={step.level} aria-current={current ? "step" : undefined}
          className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 px-5 sm:flex sm:items-center ${current ? "bg-brand-50/40 py-4" : "py-3"}`}>
          <StepDot step={step} size={current ? "h-9 w-9 text-[12px]" : "h-7 w-7 text-[11px]"} icon={current ? "h-4 w-4" : "h-3.5 w-3.5"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="sr-only">{fill(messages.step, { level: displayLevel(step.level) })}</span>
              <h3 className="text-[13.5px] font-bold text-ink-900">{step.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${CHIP[step.tone]}`}>{step.status}</span>
              <span className="text-[11px] text-ink-500">{step.metric}</span>
            </div>
            {current && <>
              <p className="mt-1 text-[12px] leading-5 text-ink-600">{step.description}</p>
              {step.note && <p className={`mt-0.5 text-[12px] leading-5 ${step.tone === "rose" ? "font-semibold text-rose-700" : "text-ink-700"}`}>{step.note}</p>}
            </>}
            {!current && step.tone === "rose" && step.note && <p className="mt-0.5 text-[12px] font-semibold leading-5 text-rose-700">{step.note}</p>}
          </div>
          <Link href={step.href} className={`${current ? "btn btn-primary" : "btn btn-ghost"} btn-sm col-start-2 justify-self-start sm:shrink-0`}>
            {step.action}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </li>;
      })}
    </ol>

    <p className="border-t border-ink-100 bg-ink-50/60 px-5 py-3 text-[11px] leading-5 text-ink-500">
      {messages.footnote}
    </p>
  </Panel></div>;
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
        return <li key={step.level} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2.5 sm:flex sm:flex-wrap">
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
          <Link href={step.href} className={`${current ? "btn btn-primary" : "btn btn-ghost"} btn-sm col-start-2 justify-self-start sm:shrink-0`}>
            {step.actionEn}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </li>;
      })}
    </ol>
  </section>;
}
