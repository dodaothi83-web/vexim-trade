import type { SVGProps } from "react";

/** Decorative empty-state artwork, never a request status or verification mark. */
export function VeximBuyerEnquiriesIcon(props: SVGProps<SVGSVGElement>) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="48" height="48" fill="none" focusable="false" aria-hidden="true" {...props} data-vexim-buyer-icon="enquiries">
    <rect x="9" y="7" width="36" height="46" rx="8" fill="#EBEFF5" />
    <path d="M9 20v-5a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v5Z" fill="currentColor" />
    <path d="M17 28h18m-18 8h11m-11 8h8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M36 35h15a8 8 0 0 1 8 8v6a8 8 0 0 1-8 8h-9l-8 5v-6a8 8 0 0 1-6-7v-6a8 8 0 0 1 8-8Z" fill="#478C87" stroke="white" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="37" cy="46" r="2" fill="white" /><circle cx="44" cy="46" r="2" fill="white" /><circle cx="51" cy="46" r="2" fill="white" />
  </svg>;
}

export function VeximBuyerSavedProductsIcon(props: SVGProps<SVGSVGElement>) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="48" height="48" fill="none" focusable="false" aria-hidden="true" {...props} data-vexim-buyer-icon="saved-products">
    <rect x="9" y="8" width="39" height="47" rx="8" fill="#EBEFF5" />
    <path d="M9 21v-5a8 8 0 0 1 8-8h23a8 8 0 0 1 8 8v5Z" fill="currentColor" />
    <rect x="17" y="28" width="13" height="14" rx="4" fill="currentColor" />
    <path d="M17 48h10m8-18h6m-6 7h6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M45 39c-7-9-19 1-12 9l12 12 12-12c7-8-5-18-12-9Z" fill="#478C87" stroke="white" strokeWidth="2" strokeLinejoin="round" />
  </svg>;
}
