import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/** Approved direction 02. See docs/brand-identity.md before modifying these shapes. */
export type VeximIconName = "factory" | "trade" | "cooperative" | "document" | "inspection" | "delivery" | "minimum-order" | "export-port" | "lead-time" | "capacity" | "payment" | "markets" | "oem" | "odm" | "samples" | "messages" | "sourcing-request" | "platform-support";
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
    case "oem": return <><rect x="9" y="9" width="30" height="32" rx="7" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<rect x="9" y="8" width="29" height="32" rx="6"/><path d="M15 15h11m-11 6h6m-6 12h5M27 24l7-3 7 3v10l-7 3-7-3Zm0 0 7 3 7-3m-7 3v10"/></>;
    case "odm": return <><rect x="9" y="9" width="30" height="32" rx="7" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M24 8h-9a6 6 0 0 0-6 6v20a6 6 0 0 0 6 6h18a6 6 0 0 0 6-6v-9M16 16h7m-7 18h9"/>
<path d="m24 25 2-7L36 8a3.5 3.5 0 0 1 5 5L31 23Zm9-14 5 5"/></>;
    case "samples": return <><rect x="10" y="20" width="29" height="21" rx="6" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M11 24v10a5 5 0 0 0 3 4.6l8 3.4a5 5 0 0 0 4 0l8-3.4a5 5 0 0 0 3-4.6V24M24 28v14M8 21l8-4 8 5-7 5Zm32 0-8-4-8 5 7 5Z"/>
<rect x="19" y="7" width="10" height="10" rx="3"/></>;
    case "minimum-order": return <><rect x="9" y="13" width="30" height="27" rx="7" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M9 19a5 5 0 0 1 3-4.6l10-4.5a5 5 0 0 1 4 0l10 4.5a5 5 0 0 1 3 4.6v14a5 5 0 0 1-3 4.6l-10 4.5a5 5 0 0 1-4 0l-10-4.5A5 5 0 0 1 9 33Z"/>
<path d="m10 17 14 6 14-6M24 23v18M18 12l14 6v8M15 29l4 2"/></>;
    case "export-port": return <><path d="M8 29h32l-5 10H16Z" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M9 27l13-4a7 7 0 0 1 4 0l13 4-4 10M13 37l-4-10M15 25V14a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v11M21 11V7h6v4M21 17h6M24 24v9M7 39c3 3 6 3 9 0 3 3 6 3 9 0 3 3 6 3 9 0 3 3 5 3 7 1"/></>;
    case "lead-time": return <><circle cx="25" cy="25" r="16" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<circle cx="24" cy="24" r="16"/><path d="M24 14v10l7 4M10 10l-3 3M38 10l3 3"/></>;
    case "capacity": return <><rect x="7" y="28" width="9" height="12" rx="4" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<rect x="20" y="20" width="9" height="20" rx="4" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<rect x="33" y="10" width="9" height="30" rx="4" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<rect x="7" y="27" width="8" height="12" rx="3"/><rect x="20" y="19" width="8" height="20" rx="3"/><rect x="33" y="9" width="8" height="30" rx="3"/></>;
    case "payment": return <><rect x="8" y="13" width="34" height="26" rx="7" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<rect x="7" y="11" width="34" height="26" rx="6"/><path d="M8 20h32M14 29h7m8 0h5"/></>;
    case "messages": return <><rect x="15" y="18" width="27" height="20" rx="7" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M30 13v-1a5 5 0 0 0-5-5H11a5 5 0 0 0-5 5v9a5 5 0 0 0 5 5h1v5l5.5-5"/>
<path d="M22 18h15a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-1v5l-6-5h-8a5 5 0 0 1-5-5v-8a5 5 0 0 1 5-5ZM23.5 27h1m4 0h1m4 0h1"/></>;
    case "sourcing-request": return <><rect x="11" y="11" width="26" height="31" rx="7" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M17 9h-2a5 5 0 0 0-5 5v23a5 5 0 0 0 5 5h11M31 9h2a5 5 0 0 1 5 5v9M16 20h16m-16 6h10m-10 6h6"/>
<rect x="17" y="6" width="14" height="6" rx="3"/><path d="m31 41 10-10m-7 0h7v7"/></>;
    case "platform-support": return <><rect x="8" y="23" width="8" height="12" rx="4" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<rect x="32" y="23" width="8" height="12" rx="4" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<path d="M9 28v-4a15 15 0 0 1 30 0v4M36 35v1a6 6 0 0 1-6 6h-3"/>
<rect x="8" y="23" width="8" height="12" rx="4"/><rect x="32" y="23" width="8" height="12" rx="4"/><rect x="21" y="40" width="6" height="4" rx="2"/></>;
    case "markets": return <><circle cx="25" cy="25" r="16" fill="currentColor" fillOpacity="0.09" stroke="none"/>
<circle cx="24" cy="24" r="16"/><ellipse cx="24" cy="24" rx="7" ry="16"/><path d="M9 19h30M9 29h30"/></>;
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

// Commercial facts are neutral metadata, never verification guarantees.
export const VeximMinimumOrderIcon = namedIcon("minimum-order");
export const VeximExportPortIcon = namedIcon("export-port");
export const VeximLeadTimeIcon = namedIcon("lead-time");
export const VeximCapacityIcon = namedIcon("capacity");
export const VeximPaymentIcon = namedIcon("payment");
export const VeximMarketsIcon = namedIcon("markets");

// Supplier-declared capabilities: these never imply verification or free samples.
export const VeximOemIcon = namedIcon("oem");
export const VeximOdmIcon = namedIcon("odm");
export const VeximSamplesIcon = namedIcon("samples");

// Thanh công cụ nổi trên trang công khai (chờ duyệt hình theo docs/brand-identity.md).
/** Tin nhắn giữa người mua và nhà cung cấp trên Vexim. */
export const VeximMessagesIcon = namedIcon("messages");
/** Yêu cầu tìm nguồn gửi cho Vexim (RFQ chung, chưa chọn nhà cung cấp). */
export const VeximSourcingRequestIcon = namedIcon("sourcing-request");
/** Liên hệ đội ngũ Vexim (chủ sàn), không phải nhà cung cấp. */
export const VeximPlatformSupportIcon = namedIcon("platform-support");
