import { redirect } from "next/navigation";
import { requireOwnedBuyerEnquiry } from "@/lib/buyer/enquiry-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "View enquiry | Vexim Trade", robots: { index: false, follow: false } };

/** Legacy email links remain valid entry points, never bearer-token access. */
export default async function RfqStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { rfq } = await requireOwnedBuyerEnquiry({ token, next: `/rfq/status/${encodeURIComponent(token)}` });
  redirect(`/buyer/account/requests/${encodeURIComponent(rfq.id)}`);
}
