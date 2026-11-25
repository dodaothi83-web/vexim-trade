import { buildSourcingReplyLetter } from "@/lib/ai/sourcing-reply-draft";
import { buyerProductTitle } from "@/lib/buyer/request-summary";
import type { DataStore } from "@/lib/db/types";
import { supplierShortName } from "@/lib/public/supplier-name";
import { rfqChannel } from "@/lib/rfq/channel";
import { rfqProductParts, rfqProductRefName } from "@/lib/rfq/product-text";
import type { Buyer, Rfq } from "@/lib/types";

/**
 * Nút "AI viết tiếp cận" với người mua đã gửi yêu cầu (quyết định 24/11/2026):
 * - Có yêu cầu tìm nguồn (Vexim điều phối): thư phản hồi theo mẫu cố định đã duyệt.
 * - Chỉ có RFQ gửi thẳng nhà cung cấp: không viết thư, chỉ trả ghi chú. Nhà cung cấp tự trả lời
 *   trong tài khoản người mua; Vexim không viết như người trung gian.
 * - Chưa có RFQ nào: trả null để dùng thư tiếp cận cũ.
 * Chỉ đọc dữ liệu; không lưu thư, không đổi trạng thái.
 */
export type BuyerRequestReply =
  | { kind: "letter"; rfqCode: string; subject: string; body: string; words: number; asks: string[]; questions: string[] }
  | { kind: "direct"; message: string };

const CLOSED: Rfq["status"][] = ["won", "lost", "spam"];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function quantityOf(rfq: Rfq | null | undefined): string {
  if (!rfq || rfq.quantity == null) return "";
  return [String(rfq.quantity), text(rfq.unit)].filter(Boolean).join(" ");
}

export async function buyerRequestReply(store: Pick<DataStore, "listRfqs" | "getSupplier">, buyer: Buyer): Promise<BuyerRequestReply | null> {
  const rfqs = (await store.listRfqs({ buyerId: buyer.id }).catch(() => [] as Rfq[]))
    .filter((r) => r.status !== "spam" && rfqChannel(r) !== "question")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!rfqs.length) return null;

  const sourcing = rfqs.filter((r) => rfqChannel(r) === "sourcing");
  const pick = sourcing.find((r) => !CLOSED.includes(r.status)) ?? sourcing[0] ?? null;

  if (!pick) {
    const direct = rfqs.filter((r) => rfqChannel(r) === "direct");
    const supplierIds = [...new Set(direct.flatMap((r) => r.preferred_supplier_ids ?? []))];
    const names = (
      await Promise.all(supplierIds.slice(0, 3).map((id) => store.getSupplier(id).catch(() => null)))
    )
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => supplierShortName(s));
    const codes = direct.slice(0, 3).map((r) => r.code).join(", ");
    const who = names.length ? names.join(", ") : "nhà cung cấp người mua đã chọn";
    return {
      kind: "direct",
      message:
        `${codes} đã gửi thẳng tới ${who}. Nhà cung cấp trả lời trong tài khoản người mua, ` +
        `nên AI không viết thư báo giá thay.`,
    };
  }

  const specs = (pick.specs ?? {}) as Record<string, unknown>;
  const other = rfqs.find((r) => r.id !== pick.id && (r.quantity != null || text(r.destination_country)));
  const product =
    rfqProductRefName(pick.specs) ? rfqProductParts(pick).product : buyerProductTitle(pick.product_text) || buyerProductTitle(buyer.product);
  const letter = buildSourcingReplyLetter({
    recipientName: text(buyer.contact_name) || null,
    rfqCode: pick.code,
    product,
    quantity: quantityOf(pick) || text(buyer.quantity) || quantityOf(other) || null,
    destinationCountry: text(pick.destination_country) || text(other?.destination_country) || null,
    buyerText: [pick.product_text, text(specs.notes)].filter(Boolean).join("\n\n") || buyer.product,
    has: {
      targetPrice: pick.target_price != null || Boolean(text(buyer.target_price)),
      packaging: Boolean(text(specs.packaging)),
      deliveryTerms: Boolean(text(pick.incoterm) || text(buyer.incoterm) || text(specs.destination_port) || text(buyer.port)),
      neededBy: Boolean(text(pick.needed_by) || text(specs.shipment_month) || text(buyer.expected_ship_date)),
    },
  });
  return { kind: "letter", rfqCode: pick.code, ...letter };
}
