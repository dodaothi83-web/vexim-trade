import { BuyerEnquiryDetail } from "@/components/buyer-enquiry-detail";
import { requireOwnedBuyerEnquiry } from "@/lib/buyer/enquiry-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "My enquiry | Vexim Trade", robots: { index: false, follow: false } };

export default async function BuyerEnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rfq, buyer } = await requireOwnedBuyerEnquiry({ id, next: `/buyer/account/requests/${encodeURIComponent(id)}` });
  return <BuyerEnquiryDetail rfq={rfq} buyer={buyer} />;
}
