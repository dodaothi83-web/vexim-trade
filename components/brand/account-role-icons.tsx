import type { SVGProps } from "react";

/** Filled navy/teal account roles, not approval badges or supplier-type claims. */

export function VeximBuyerAccountIcon(props: SVGProps<SVGSVGElement>) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="32" height="32" fill="none" focusable="false" aria-hidden="true" {...props} data-vexim-account-icon="buyer-account"><rect x="10" y="7" width="35" height="46" rx="8" fill="#EBEFF5"/>
<path d="M10 19v-4a8 8 0 0 1 8-8h19a8 8 0 0 1 8 8v4Z" fill="currentColor"/>
<circle cx="20" cy="29" r="5" fill="#478C87"/>
<path d="M13 42v-2a7 7 0 0 1 14 0v2Z" fill="#478C87"/>
<path d="M31 28h7m-7 7h5M17 48h13" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
<circle cx="43" cy="43" r="12" fill="#478C87"/>
<circle cx="43" cy="43" r="6" stroke="white" strokeWidth="2.5"/>
<path d="m52 52 6 6" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/></svg>;
}

export function VeximSupplierAccountIcon(props: SVGProps<SVGSVGElement>) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="32" height="32" fill="none" focusable="false" aria-hidden="true" {...props} data-vexim-account-icon="supplier-account"><rect x="7" y="8" width="41" height="47" rx="8" fill="#EBEFF5"/>
<path d="M7 20v-4a8 8 0 0 1 8-8h25a8 8 0 0 1 8 8v4Z" fill="currentColor"/>
<rect x="14" y="26" width="16" height="22" rx="4" fill="currentColor"/>
<path d="M19 32h1m5 0h1m-7 6h1m5 0h1m-4 10v-5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
<path d="M36 28h6m-6 7h6" stroke="#478C87" strokeWidth="3" strokeLinecap="round"/>
<rect x="34" y="39" width="23" height="20" rx="5" fill="#478C87" stroke="white" strokeWidth="2"/>
<path d="M41 40v7l4-2 4 2v-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
