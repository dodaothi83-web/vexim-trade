import type { SupplierNoticeRead, SupplierProduct, SupplierRfqInvitation, SupplierVerificationRequest, Verification } from "@/lib/types";
import { withoutDirectContacts } from "@/lib/public/product-selection";

export interface PortalNotice {
  key: string;
  title: string;
  detail: string;
  at: string;
  read: boolean;
  kind: "rfq" | "verification" | "contact";
}

export interface PortalInvite {
  matchId: string;
  code: string;
  title: string;
  status: string;
  sentAt: string;
  dueAt: string | null;
  quantity: string;
  destination: string;
  quotePrice: string | null;
  repliedAt: string | null;
  productId: string | null;
}

const responded = (m: SupplierRfqInvitation) => !!m.supplier_replied_at || m.quote_price != null || m.status === "declined";
const niceStatus: Record<string, string> = {
  sent_to_supplier: "Chờ bạn phản hồi", quoted: "Đã ghi nhận báo giá", declined: "Đã từ chối",
  no_response: "Chưa nhận phản hồi", presented_to_buyer: "Vexim đã trình báo giá",
  selected: "Đã được Vexim chọn", not_selected: "Không được chọn",
};

/** No buyer records, access tokens, internal notes, or arbitrary buyer free text in this projection. */
export function buildSupplierDashboard(input: {
  supplierId: string;
  invites: SupplierRfqInvitation[];
  products: SupplierProduct[];
  reviews: Verification[];
  requests: SupplierVerificationRequest[];
  reads: SupplierNoticeRead[];
  days: 7 | 30 | 90;
  now?: Date;
}) {
  const { supplierId, products, reviews, requests, reads, days } = input;
  const now = input.now ?? new Date();
  const productMap = new Map(products.filter((p) => p.supplier_id === supplierId).map((p) => [p.id, p]));
  const readKeys = new Set(reads.filter((r) => r.supplier_id === supplierId).map((r) => r.notice_key));
  const relevant = input.invites.filter((m) => m.supplier_id === supplierId && !!m.sent_to_supplier_at && m.status !== "proposed" && !!m.rfq);
  const invites: PortalInvite[] = relevant.map((m) => {
    const product = m.rfq.source_product_id ? productMap.get(m.rfq.source_product_id) : null;
    return {
      matchId: m.id, code: m.rfq.code, title: product ? withoutDirectContacts(product.name_i18n?.en || product.name) : "Mặt hàng do Vexim chuyển",
      status: niceStatus[m.status] ?? "Vexim đang xử lý", sentAt: m.sent_to_supplier_at!,
      dueAt: m.response_due_at ?? null,
      quantity: m.rfq.quantity && m.rfq.unit ? `${m.rfq.quantity} ${withoutDirectContacts(m.rfq.unit)}` : "Theo thư mời",
      destination: withoutDirectContacts(m.rfq.destination_country || "Theo thư mời"),
      repliedAt: m.supplier_replied_at ?? null,
      quotePrice: m.quote_price != null ? `${m.quote_price} ${m.quote_currency || ""}/${m.quote_unit || m.rfq.unit || ""}` : null,
      productId: product?.id ?? null,
    };
  }).sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  const notices: PortalNotice[] = [];
  const add = (key: string, title: string, detail: string, at: string, kind: PortalNotice["kind"]) => {
    if (at && !Number.isNaN(Date.parse(at))) notices.push({ key, title, detail, at, kind, read: readKeys.has(key) });
  };
  for (const m of relevant) {
    add(`rfq:${m.id}`, `Vexim đã chuyển yêu cầu báo giá ${m.rfq.code}`, "Mở danh sách RFQ để xem hạn phản hồi; trả lời email mời báo giá của Vexim.", m.sent_to_supplier_at!, "rfq");
    if (m.status === "selected") add(`selected:${m.id}`, `Hồ sơ ${m.rfq.code} đã được Vexim chọn`, "Vexim sẽ liên hệ để thống nhất bước tiếp theo. Chưa chia sẻ thông tin buyer tại đây.", m.updated_at, "rfq");
  }
  for (const v of reviews.filter((v) => v.supplier_id === supplierId)) {
    const label = v.target_level === 1 ? "Kiểm tra giấy tờ" : v.target_level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng";
    if (v.status === "returned") add(`returned:${v.id}`, `${label} cần bổ sung`, "Liên hệ nhân viên Vexim; giấy tờ bước đầu có thể bổ sung tại hồ sơ.", v.updated_at, "verification");
    if (v.status === "approved") add(`approved:${v.id}`, `${label} đã được Vexim duyệt`, "Chỉ đánh giá này được xác nhận; việc công khai hồ sơ là quyết định riêng.", v.approved_at || v.updated_at, "verification");
  }
  for (const r of requests.filter((r) => r.supplier_id === supplierId && r.status === "contacted" && r.contacted_at)) {
    const label = r.target_level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng";
    add(`contacted:${r.target_level}`, `Vexim đã ghi nhận liên hệ: ${label}`, "Đây là liên hệ lên kế hoạch, chưa phải kết quả duyệt.", r.contacted_at!, "contact");
  }
  notices.sort((a, b) => b.at.localeCompare(a.at));
  const cutoff = now.getTime() - days * 86400_000;
  const period = relevant.filter((m) => Date.parse(m.sent_to_supplier_at!) >= cutoff && Date.parse(m.sent_to_supplier_at!) <= now.getTime());
  const group = new Map<string, { id: string; name: string; sent: number; quoted: number }>();
  for (const m of period) {
    const product = m.rfq.source_product_id ? productMap.get(m.rfq.source_product_id) : null;
    const key = product?.id ?? "other";
    const row = group.get(key) ?? { id: key, name: product ? withoutDirectContacts(product.name_i18n?.en || product.name) : "Chưa liên kết sản phẩm của bạn", sent: 0, quoted: 0 };
    row.sent += 1;
    if (m.quote_price != null) row.quoted += 1;
    group.set(key, row);
  }
  return {
    invites,
    notices,
    unreadCount: notices.filter((n) => !n.read).length,
    tasks: invites.filter((m) => !m.repliedAt && relevant.some((r) => r.id === m.matchId && ["sent_to_supplier", "no_response"].includes(r.status))),
    report: {
      sent: period.length,
      responded: period.filter(responded).length,
      quoted: period.filter((m) => m.quote_price != null).length,
      selected: period.filter((m) => m.status === "selected").length,
      byProduct: [...group.values()].sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name)),
    },
  };
}
