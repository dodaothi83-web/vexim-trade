import Link from "next/link";
import { COMPANY } from "@/lib/config";

export function BuyerEnquiryUnavailable() {
  return <div className="mx-auto max-w-xl px-5 py-16">
    <h1 className="text-xl font-bold">Enquiry unavailable</h1>
    <p className="mt-3 text-sm text-ink-600">This enquiry is not available for this account. Use the account menu to switch to the email used to send it. For an older request, contact Vexim for help verifying ownership.</p>
    <div className="mt-5 flex flex-wrap gap-4"><Link href="/buyer/account?tab=requests" className="font-semibold text-brand-700 underline">My enquiries</Link><a href={`mailto:${COMPANY.contactEmail}`} className="font-semibold text-brand-700 underline">Contact Vexim</a></div>
  </div>;
}
