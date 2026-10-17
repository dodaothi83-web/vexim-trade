import type { ReactNode } from "react";
import { Factory, Paintbrush, TestTube2 } from "lucide-react";

/** Self-declared commercial capabilities, never styled as Vexim verification badges. */
export function ProductTradeLabels({ oem, odm, samples, compact = false }: {
  oem?: boolean | null; odm?: boolean | null; samples?: boolean | null; compact?: boolean;
}) {
  const items: { label: string; title: string; icon: ReactNode }[] = [];
  if (oem) items.push({ label: "OEM", title: "Supplier-stated: manufacturing to buyer specifications; confirm terms with Vexim.", icon: <Factory className="size-3.5" aria-hidden="true" /> });
  if (odm) items.push({ label: "ODM", title: "Supplier-stated: design and manufacturing service; confirm scope with Vexim.", icon: <Paintbrush className="size-3.5" aria-hidden="true" /> });
  if (samples) items.push({ label: compact ? "Samples" : "Samples available", title: "Supplier-stated: samples may be available; cost and shipping are confirmed in the RFQ.", icon: <TestTube2 className="size-3.5" aria-hidden="true" /> });
  if (!items.length) return null;
  return <div className="flex flex-wrap gap-1.5" aria-label="Supplier-stated product options">
    {items.map((item) => <span key={item.label} title={item.title} aria-label={`${item.label}: ${item.title}`}
      className={"inline-flex items-center gap-1 rounded-md border border-ink-200 bg-ink-50 font-semibold text-ink-700 " + (compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-[11px]")}>
      {item.icon}{item.label}</span>)}
  </div>;
}
