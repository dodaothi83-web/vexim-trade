"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { PublicComparedProduct } from "@/lib/public/product-comparison-data";

export function DownloadComparisonPdf({ products }: { products: PublicComparedProduct[] }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function download() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // Load the renderer and bundled Unicode fonts only when requested. No external font/image service.
      const [{ default: pdfMake }, { default: fonts }, { comparisonPdfDefinition }] = await Promise.all([
        import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts"), import("@/lib/public/product-comparison-pdf"),
      ]);
      pdfMake.addVirtualFileSystem(fonts);
      await pdfMake.createPdf(comparisonPdfDefinition(products, window.location.origin)).download("vexim-trade-product-comparison.pdf");
    } catch {
      setFailed(true);
    } finally { setBusy(false); }
  }
  return <div>
    <button type="button" onClick={download} disabled={busy} aria-busy={busy} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-brand-700 bg-brand-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60">
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
      {busy ? "Preparing PDF..." : "Download PDF"}
    </button>
    {failed && <p role="alert" className="mt-2 text-xs text-red-700">Could not create the PDF. Please try again.</p>}
  </div>;
}
