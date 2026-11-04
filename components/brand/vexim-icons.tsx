import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/** Approved direction 02. See docs/brand-identity.md before modifying these shapes. */
export type VeximIconName = "factory" | "trade" | "cooperative" | "document" | "inspection" | "delivery";
export type VeximIconProps = LucideProps & { name: VeximIconName; approved?: boolean };

function Artwork({ name, approved }: { name: VeximIconName; approved: boolean }) {
  switch (name) {
    case "factory": return <><path d="M8 24c0-2.2 1.8-4 4-4h21c3.9 0 7 3.1 7 7v9c0 2.2-1.8 4-4 4H12c-2.2 0-4-1.8-4-4Z" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M10 25v-4a3 3 0 0 1 1.7-2.7l6.4-3.1c1.3-.6 2.9.3 2.9 1.8v6l7.1-3.6c1.3-.7 2.9.3 2.9 1.8V37H14a4 4 0 0 1-4-4Z"/>
<path d="M31 23V11a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v22a4 4 0 0 1-4 4h-3M16 29h2m6 0h2"/>
<path d="M17 37v-3m8 3v-3" stroke="currentColor"/></>;
    case "trade": return <><rect x="10" y="8" width="26" height="33" rx="7" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M12 30V13a5 5 0 0 1 5-5h9a5 5 0 0 1 5 5v11M17 16h2m5 0h1m-8 6h2m5 0h1"/>
<path d="M9 34c2.3 3 5.9 5 10 5h10m-4-4 4 4-4 4M39 30c-2.3-3-5.9-5-10-5h-6m4-4-4 4 4 4"/></>;
    case "cooperative": return <><path d="M11 23c-5 4-3 14 3 17 5 2 10-1 10-1s5 3 10 1c6-3 8-13 3-17l-13 6Z" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M24 38V24M24 27c-7 0-12-4-12-12 8 0 12 4 12 12Zm0-3c0-8 4-13 12-13 0 8-4 13-12 13Z"/>
<path d="M24 18c-4-3-5-8-2-12 5 3 7 7 4 12M10 30c.7 6.5 5 10 14 10s13.3-3.5 14-10" stroke="currentColor"/></>;
    case "document": return <><rect x="12" y="10" width="26" height="32" rx="6" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M29 8H16a6 6 0 0 0-6 6v20a6 6 0 0 0 6 6h10M29 8l7 8v11M29 8v5a3 3 0 0 0 3 3h4M17 21h10m-10 6h6"/>
{approved && <path d="m27 34 4 4 9-10"/>}</>;
    case "inspection": return <><path d="M7 24c0-2.2 1.8-4 4-4h20c3.3 0 6 2.7 6 6v9c0 2.2-1.8 4-4 4H11c-2.2 0-4-1.8-4-4Z" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M9 33V21a3 3 0 0 1 1.7-2.7l6.4-3.1c1.3-.6 2.9.3 2.9 1.8v6l7-3.5V11a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v9M9 33a4 4 0 0 0 4 4h5M15 29h3"/>
<circle cx="31" cy="31" r="8" fill="var(--vexim-icon-surface, transparent)"/><path d="m37 37 5 5M28 31h6m-3-3v6"/></>;
    case "delivery": return <><path d="m13 15 11-6 13 7v18c0 2-1 3-3 4l-10 5-11-6c-2-1-3-2-3-4V20c0-2 1-4 3-5Z" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="m11 17 11-6a4 4 0 0 1 4 0l10 5a4 4 0 0 1 2 3.5V28M11 17l13 7 14-7M24 24v15M11 17v15a4 4 0 0 0 2 3.5l8 4a6 6 0 0 0 5.5 0L30 38M18 14l13 7v5"/>
<path d="M10 7H7a3 3 0 0 0-3 3v10M4 10l3 3m-3-3-3 3M34 40h5a5 5 0 0 0 5-5v-3m-3 3 3-3 3 3" stroke="currentColor"/></>;
  }
}

/** Duotone follows currentColor, including semantic success/muted colours. No fixed white cutout. */
export const VeximIcon = forwardRef<SVGSVGElement, VeximIconProps>(function VeximIcon(
  { name, approved = false, size = 24, strokeWidth = 1.8, absoluteStrokeWidth, children, ...props }, ref,
) {
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 48 48"
    fill="none" stroke="currentColor" strokeWidth={absoluteStrokeWidth && Number(size) > 0 ? Number(strokeWidth) * 48 / Number(size) : strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" {...props} data-vexim-icon={name}>
    <Artwork name={name} approved={approved} />{children}
  </svg>;
});

function namedIcon(name: VeximIconName, approved = false) {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function BrandIcon(props, ref) {
    return <VeximIcon {...props} ref={ref} name={name} approved={approved} />;
  });
  Icon.displayName = `Vexim${name}${approved ? "Approved" : ""}`;
  return Icon;
}
export const VeximFactoryIcon = namedIcon("factory");
export const VeximTradeIcon = namedIcon("trade");
export const VeximCooperativeIcon = namedIcon("cooperative");
export const VeximDocumentIcon = namedIcon("document");
/** Only use when the actual associated document check is approved. */
export const VeximDocumentCheckedIcon = namedIcon("document", true);
export const VeximInspectionIcon = namedIcon("inspection");
export const VeximDeliveryIcon = namedIcon("delivery");

/** Unknown type must not be illustrated as a manufacturer by default. */
export function supplierTypeIcon(type: string | null | undefined) {
  return type === "manufacturer" ? VeximFactoryIcon : type === "trading" ? VeximTradeIcon
    : type === "cooperative" ? VeximCooperativeIcon : VeximDocumentIcon;
}
