import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck, ShieldX } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { DownloadFactoryReport } from "@/components/download-factory-report";
import { getBuyerSession } from "@/lib/auth/buyer-session";
import { loadFactoryReport } from "@/lib/public/factory-report-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify a factory review report | Veximtrade",
  robots: { index: false, follow: false },
};

const STATUS: Record<string, { text: string; className: string }> = {
  seen: { text: "Seen", className: "text-success" },
  not_seen: { text: "Not seen", className: "text-error" },
  not_applicable: { text: "Not applicable", className: "text-ink-500" },
  not_recorded: { text: "Not recorded", className: "text-ink-500" },
};

/**
 * Trang công khai để người mua kiểm tra mã báo cáo in trên PDF (mã QR).
 * Chỉ nói báo cáo có thật hay không và phạm vi đã ghi; không hiện ảnh hay liên hệ.
 */
export default async function VerifyReportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [loaded, buyer] = await Promise.all([
    loadFactoryReport(decodeURIComponent(code)).catch(() => null),
    getBuyerSession(),
  ]);
  return <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-14">
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "How we verify", href: "/how-we-verify" }, { label: "Verify a report" }]} />
    {!loaded ? <section className="mt-6 rounded-lg border border-ink-200 bg-white p-6">
      <h1 className="flex items-center gap-2 text-[22px] font-bold text-ink-900"><ShieldX className="h-6 w-6 text-error" aria-hidden="true" />Report not found</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        No approved Vexim factory review matches this code, or the supplier is no longer published. If you received a PDF with this code, treat it with caution and contact Vexim.
      </p>
    </section> : <section className="mt-6 rounded-lg border border-ink-200 bg-white p-6">
      <p className="flex items-center gap-2 text-sm font-semibold text-success"><ShieldCheck className="h-5 w-5" aria-hidden="true" />Genuine Vexim report · {loaded.report.code}</p>
      <h1 className="mt-2 text-[24px] font-bold leading-tight text-ink-900">{loaded.report.partner ? "Partner factory review" : "Factory review"}</h1>
      <p className="mt-1 text-[15px] text-ink-800">
        {loaded.report.supplierUrl ? <Link href={loaded.report.supplierUrl.replace(/^https?:\/\/[^/]+/, "")} className="font-semibold text-brand-700 underline">{loaded.report.supplierName}</Link> : loaded.report.supplierName}
        {loaded.report.partnerFactoryName ? ` · partner factory: ${loaded.report.partnerFactoryName}` : ""}
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Meta label="Method" value={loaded.report.method} />
        <Meta label="Review date" value={loaded.report.reviewedAt + (loaded.report.durationMinutes ? ` · ${loaded.report.durationMinutes} min` : "")} />
        <Meta label="Reviewed by" value={`${loaded.report.inspectorName}, Vexim review lead`} />
        {loaded.report.region && <Meta label="Province / city" value={loaded.report.region} />}
      </dl>
      <h2 className="mt-6 text-sm font-bold text-ink-900">What was observed</h2>
      <ul className="mt-2 divide-y divide-ink-100 rounded-lg border border-ink-200 text-sm">
        {loaded.report.items.map((item) => <li key={item.key} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-ink-800">{item.label}</span>
          <span className={"font-semibold " + STATUS[item.status].className}>{STATUS[item.status].text}</span>
        </li>)}
      </ul>
      <div className="mt-5">
        <DownloadFactoryReport code={loaded.report.code} signedIn={Boolean(buyer)} nextPath={`/verify/${loaded.report.code}`} />
      </div>
      <p className="mt-5 text-xs leading-relaxed text-ink-500">
        This is Vexim&apos;s own review, carried out by the named staff member during the call or visit. It is not an independent third-party audit and does not certify products, quality or capacity.
      </p>
    </section>}
  </div>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold text-ink-500">{label}</dt><dd className="mt-0.5 font-semibold text-ink-900">{value}</dd></div>;
}
