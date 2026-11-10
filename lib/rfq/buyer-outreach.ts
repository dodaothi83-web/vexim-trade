import type { Buyer, BuyerRfqOutreach, RfqMatchStatus } from "@/lib/types";

export function groupBuyerRfqOutreach(rows: BuyerRfqOutreach[]): Map<string, BuyerRfqOutreach[]> {
  const byBuyer = new Map<string, BuyerRfqOutreach[]>();
  for (const row of [...rows].sort((a, b) => Date.parse(b.sent_to_supplier_at) - Date.parse(a.sent_to_supplier_at))) {
    const current = byBuyer.get(row.buyer_id) ?? [];
    current.push(row);
    byBuyer.set(row.buyer_id, current);
  }
  return byBuyer;
}

/** One supplier can appear in several RFQs. The Buyer detail summary shows their latest outreach; its history shows all. */
export function uniqueRfqSuppliers(rows: readonly BuyerRfqOutreach[]): BuyerRfqOutreach[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.supplier_id)) return false;
    seen.add(row.supplier_id);
    return true;
  });
}

/** The "no supplier" filter counts neither an assigned CRM supplier nor a dispatched RFQ. */
export function hasBuyerSupplierRelation(
  buyer: Pick<Buyer, "supplier_id">,
  outreach: readonly BuyerRfqOutreach[],
): boolean {
  return Boolean(buyer.supplier_id) || outreach.length > 0;
}

export function rfqOutreachStatusLabel(status: RfqMatchStatus): string {
  switch (status) {
    case "proposed": return "Chưa gửi RFQ";
    case "quoted": return "Có báo giá";
    case "declined": return "Đã từ chối";
    case "no_response": return "Chưa phản hồi";
    case "presented_to_buyer": return "Đã trình người mua";
    case "selected": return "Đã chọn";
    case "not_selected": return "Không được chọn";
    default: return "Đã gửi RFQ";
  }
}
