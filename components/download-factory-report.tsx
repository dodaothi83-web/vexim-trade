"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import type { FactoryReportData, FactoryReportPhoto } from "@/lib/public/factory-report";

/**
 * Tải báo cáo xác minh nhà máy (PDF). Chưa đăng nhập thì đưa tới trang đăng nhập người mua
 * và quay lại đúng trang đang xem. PDF dựng trong trình duyệt bằng font Unicode đóng gói sẵn.
 */
export function DownloadFactoryReport({ code, signedIn, nextPath, label = "Download factory review (PDF)", className = "" }: {
  code: string;
  signedIn: boolean;
  nextPath: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const classes = "inline-flex min-h-9 items-center gap-2 rounded-lg border border-brand-700 bg-white px-3 py-1.5 text-xs font-bold text-brand-800 hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60 " + className;

  if (!signedIn) {
    return <a href={`/buyer/sign-in?next=${encodeURIComponent(nextPath)}`} className={classes}>
      <FileDown className="size-4" aria-hidden="true" />{label}<span className="font-normal text-ink-500">· sign in</span>
    </a>;
  }

  async function download() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/public/factory-report/${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await response.json() as { ok?: boolean; message?: string; report?: FactoryReportData; photos?: FactoryReportPhoto[] };
      if (!response.ok || !data.report) throw new Error(data.message || "Could not load the report.");
      const [{ default: pdfMake }, { default: fonts }, { factoryReportPdfDefinition }] = await Promise.all([
        import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts"), import("@/lib/public/factory-report"),
      ]);
      pdfMake.addVirtualFileSystem(fonts);
      await pdfMake.createPdf(factoryReportPdfDefinition(data.report, data.photos ?? [])).download(`vexim-factory-review-${data.report.code}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the PDF. Please try again.");
    } finally { setBusy(false); }
  }

  return <span className="inline-flex flex-col gap-1">
    <button type="button" onClick={() => void download()} disabled={busy} aria-busy={busy} className={classes}>
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileDown className="size-4" aria-hidden="true" />}
      {busy ? "Preparing PDF…" : label}
    </button>
    {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
  </span>;
}
