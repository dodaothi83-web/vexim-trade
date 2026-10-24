import type { Certificate, Supplier, SupplierNoticeRead, SupplierProduct, SupplierRfqInvitation, SupplierSubmission, SupplierVerificationRequest, Verification } from "@/lib/types";
import { withoutDirectContacts } from "@/lib/public/product-selection";

export interface PortalNotice {
  key: string;
  title: string;
  detail: string;
  at: string;
  read: boolean;
  kind: "rfq" | "verification" | "contact" | "product" | "certificate";
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
  no_response: "Chưa nhận phản hồi", presented_to_buyer: "Đã trình báo giá",
  selected: "Được chọn", not_selected: "Không được chọn",
};

type NoticeInput = {
  supplierId: string;
  supplier?: Supplier;
  invites: SupplierRfqInvitation[];
  products: SupplierProduct[];
  certificates?: Certificate[];
  reviews: Verification[];
  requests: SupplierVerificationRequest[];
  /** Hồ sơ bằng chứng NCC tự gửi qua cổng L2/L3 (nếu bảng supplier_submissions đã có). */
  submissions?: SupplierSubmission[];
  reads: SupplierNoticeRead[];
  now?: Date;
};

/** RFQ thực sự đã chuyển cho NCC này: bỏ bản nháp, bản đề xuất và bản của NCC khác. */
function relevantInvites(supplierId: string, invites: SupplierRfqInvitation[]) {
  return invites.filter((m) => m.supplier_id === supplierId && !!m.sent_to_supplier_at && m.status !== "proposed" && !!m.rfq);
}

/** Không lộ bản ghi buyer, mã truy cập, ghi chú nội bộ hay nội dung buyer tự nhập. */
function projectInvites(relevant: SupplierRfqInvitation[], products: SupplierProduct[], supplierId: string): PortalInvite[] {
  const productMap = new Map(products.filter((p) => p.supplier_id === supplierId).map((p) => [p.id, p]));
  return relevant.map((m) => {
    const product = m.rfq!.source_product_id ? productMap.get(m.rfq!.source_product_id) : null;
    return {
      matchId: m.id, code: m.rfq!.code, title: product ? withoutDirectContacts(product.name_i18n?.en || product.name) : "Mặt hàng theo thư mời",
      status: niceStatus[m.status] ?? "Đang xử lý", sentAt: m.sent_to_supplier_at!,
      dueAt: m.response_due_at ?? null,
      quantity: m.rfq!.quantity && m.rfq!.unit ? `${m.rfq!.quantity} ${withoutDirectContacts(m.rfq!.unit)}` : "Theo thư mời",
      destination: withoutDirectContacts(m.rfq!.destination_country || "Theo thư mời"),
      repliedAt: m.supplier_replied_at ?? null,
      quotePrice: m.quote_price != null ? `${m.quote_price} ${m.quote_currency || ""}/${m.quote_unit || m.rfq!.unit || ""}` : null,
      productId: product?.id ?? null,
    };
  }).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/**
 * Việc cần làm = RFQ đã chuyển mà NCC chưa trả lời. Tách khỏi trang tổng quan để
 * trang RFQ là nơi duy nhất xử lý việc này.
 */
export function buildSupplierTasks(invites: PortalInvite[], relevant: SupplierRfqInvitation[]) {
  return invites.filter((m) => !m.repliedAt && relevant.some((r) => r.id === m.matchId && ["sent_to_supplier", "no_response"].includes(r.status)));
}

/** Bốn chỉ số báo cáo lời mời báo giá trong khoảng ngày đã chọn. */
export function buildSupplierReport(input: { supplierId: string; invites: SupplierRfqInvitation[]; products: SupplierProduct[]; days: 7 | 30 | 90; now?: Date }) {
  const now = input.now ?? new Date();
  const relevant = relevantInvites(input.supplierId, input.invites);
  const productMap = new Map(input.products.filter((p) => p.supplier_id === input.supplierId).map((p) => [p.id, p]));
  const cutoff = now.getTime() - input.days * 86400_000;
  const period = relevant.filter((m) => Date.parse(m.sent_to_supplier_at!) >= cutoff && Date.parse(m.sent_to_supplier_at!) <= now.getTime());
  const group = new Map<string, { id: string; name: string; sent: number; quoted: number }>();
  for (const m of period) {
    const product = m.rfq!.source_product_id ? productMap.get(m.rfq!.source_product_id) : null;
    const key = product?.id ?? "other";
    const row = group.get(key) ?? { id: key, name: product ? withoutDirectContacts(product.name_i18n?.en || product.name) : "Chưa liên kết sản phẩm của bạn", sent: 0, quoted: 0 };
    row.sent += 1;
    if (m.quote_price != null) row.quoted += 1;
    group.set(key, row);
  }
  return {
    sent: period.length,
    responded: period.filter(responded).length,
    quoted: period.filter((m) => m.quote_price != null).length,
    selected: period.filter((m) => m.status === "selected").length,
    byProduct: [...group.values()].sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name)),
  };
}

export type SupplierRfqBoard = ReturnType<typeof buildSupplierRfqBoard>;

/** Toàn bộ dữ liệu cho trang RFQ: danh sách, việc cần trả lời và báo cáo. */
export function buildSupplierRfqBoard(input: { supplierId: string; invites: SupplierRfqInvitation[]; products: SupplierProduct[]; days: 7 | 30 | 90; now?: Date }) {
  const relevant = relevantInvites(input.supplierId, input.invites);
  const invites = projectInvites(relevant, input.products, input.supplierId);
  return {
    invites,
    tasks: buildSupplierTasks(invites, relevant),
    report: buildSupplierReport(input),
  };
}

/**
 * Thông báo là một chức năng riêng: chỉ trang Thông báo và chuông ở thanh trên dùng
 * danh sách này. Mọi thông báo đều là sự kiện đã có thật trong dữ liệu, không phải
 * lời nhắc tự sinh.
 */
export function buildSupplierNotices(input: NoticeInput): PortalNotice[] {
  const { supplierId, products, reviews, requests, reads } = input;
  const now = input.now ?? new Date();
  const relevant = relevantInvites(supplierId, input.invites);
  const readKeys = new Set(reads.filter((r) => r.supplier_id === supplierId).map((r) => r.notice_key));
  const notices: PortalNotice[] = [];
  const add = (key: string, title: string, detail: string, at: string, kind: PortalNotice["kind"]) => {
    if (at && !Number.isNaN(Date.parse(at))) notices.push({ key, title, detail, at, kind, read: readKeys.has(key) });
  };
  if (input.supplier?.id === supplierId && input.supplier.onboarding_status === "approved") {
    add(`onboarding-approved:${supplierId}`, "Tài khoản NCC đã được mở quyền", "Bạn có thể dùng cổng NCC. Việc duyệt xác minh và công khai hồ sơ là quyết định riêng.", input.supplier.updated_at, "verification");
  }
  for (const m of relevant) {
    add(`rfq:${m.id}`, `Yêu cầu báo giá ${m.rfq!.code} đã được chuyển tới`, "Mở danh sách RFQ để xem hạn phản hồi; trả lời email mời báo giá đã nhận.", m.sent_to_supplier_at!, "rfq");
    if (m.status === "selected") add(`selected:${m.id}`, `Hồ sơ ${m.rfq!.code} đã được chọn`, "Bộ phận phụ trách sẽ liên hệ để thống nhất bước tiếp theo. Chưa chia sẻ thông tin buyer tại đây.", m.updated_at, "rfq");
  }
  for (const v of reviews.filter((v) => v.supplier_id === supplierId)) {
    const label = v.target_level === 1 ? "Kiểm tra giấy tờ" : v.target_level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng";
    if (v.status === "returned") add(`returned:${v.id}`, `${label} cần bổ sung`, "Liên hệ bộ phận hỗ trợ; giấy tờ bước đầu có thể bổ sung tại hồ sơ.", v.updated_at, "verification");
    if (v.status === "approved") add(`approved:${v.id}`, `${label} đã được duyệt`, "Chỉ đánh giá này được xác nhận; việc công khai hồ sơ là quyết định riêng.", v.approved_at || v.updated_at, "verification");
  }
  // Only show the current staff decision. Draft saves, uploads and pending review are not decisions.
  for (const p of products.filter((p) => p.supplier_id === supplierId)) {
    if (p.supplier_review_status === "approved") add(`product-approved:${p.id}`, `Đã kiểm nội dung sản phẩm: ${p.name}`, "Sản phẩm chưa tự động được công khai; việc chia sẻ cho buyer còn được quyết định riêng.", p.updated_at, "product");
    if (p.supplier_review_status === "changes_requested") add(`product-changes:${p.id}`, `Sản phẩm cần chỉnh sửa: ${p.name}`, p.supplier_review_note || "Mở sản phẩm để xem phản hồi.", p.updated_at, "product");
  }
  const todayMs = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  for (const c of (input.certificates ?? []).filter((c) => c.supplier_id === supplierId)) {
    if (c.review_status === "approved") {
      if (c.publicly_visible) add(`cert-published:${c.id}`, `Chứng nhận được phép hiển thị: ${c.name}`, "Chỉ hiện nhãn trên sản phẩm đúng phạm vi nếu đủ điều kiện; tệp nội bộ vẫn riêng tư.", c.updated_at, "certificate");
      else add(`cert-approved:${c.id}`, `Đã xét duyệt bản sao: ${c.name}`, "Chưa công bố. Việc hiển thị trên trang buyer cần được quyết định riêng.", c.checked_at || c.updated_at, "certificate");
    }
    if (c.review_status === "changes_requested") add(`cert-changes:${c.id}`, `Chứng nhận cần bổ sung: ${c.name}`, c.review_note || "Mở mục Kiểm tra giấy tờ L1 để cập nhật lại.", c.updated_at, "certificate");
    if (c.review_status === "rejected") add(`cert-rejected:${c.id}`, `Chứng nhận không được chấp thuận: ${c.name}`, c.review_note || "Mở mục Kiểm tra giấy tờ L1 để xem phản hồi.", c.updated_at, "certificate");
    if (c.review_status !== "rejected" && c.valid_until && /^\d{4}-\d{2}-\d{2}$/.test(c.valid_until)) {
      const endMs = Date.parse(`${c.valid_until}T00:00:00Z`);
      const daysLeft = Math.floor((endMs - todayMs) / 86_400_000);
      if (daysLeft >= 0 && daysLeft <= 60) {
        add(
          `cert-expiring:${c.id}`,
          `Chứng nhận sắp hết hạn (còn ${daysLeft} ngày): ${c.name}`,
          `Hết hạn ngày ${c.valid_until}. Vào mục Kiểm tra giấy tờ L1 để tải bản mới - AI sẽ tự quét lại ngày hết hạn và đơn vị đứng tên.`,
          c.updated_at || now.toISOString(),
          "certificate",
        );
      }
    }
  }
  for (const s of (input.submissions ?? []).filter((row) => row.supplier_id === supplierId)) {
    const label = s.target_level === 2 ? "Xác thực nhà máy (L2)" : "Lịch sử xuất khẩu (L3)";
    if (s.status === "pending_review") add(`submission-queued:${s.id}`, `Hồ sơ tự gửi đang chờ duyệt: ${label}`, "AI đã quét và xếp hàng đợi. Hồ sơ còn phải được đối chiếu thủ công; bằng chứng đang bị khóa.", s.submitted_at || s.updated_at, "verification");
    if (s.status === "returned") add(`submission-returned:${s.id}`, `Hồ sơ tự gửi cần bổ sung: ${label}`, s.review_note || "Mở cổng tự xác thực để xem lý do và tải bằng chứng mới.", s.reviewed_at || s.updated_at, "verification");
    if (s.status === "accepted") add(`submission-accepted:${s.id}`, `Hồ sơ đã được nhận vào đợt kiểm: ${label}`, "Đây chưa phải kết quả duyệt huy hiệu; đợt kiểm vẫn cần người có quyền duyệt phê.", s.reviewed_at || s.updated_at, "verification");
  }
  for (const r of requests.filter((r) => r.supplier_id === supplierId && r.status === "contacted" && r.contacted_at)) {
    const label = r.target_level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng";
    add(`contacted:${r.target_level}`, `Đã ghi nhận liên hệ: ${label}`, "Đây là liên hệ lên kế hoạch, chưa phải kết quả duyệt.", r.contacted_at!, "contact");
  }
  return notices.sort((a, b) => b.at.localeCompare(a.at));
}

/** Dữ liệu cho trang Thông báo: danh sách và số chưa đọc. */
export function buildSupplierNoticeFeed(input: NoticeInput) {
  const notices = buildSupplierNotices(input);
  return { notices, unreadCount: notices.filter((n) => !n.read).length };
}

/** Ảnh chụp tổng hợp, giữ nguyên cho các nơi cần cả ba phần cùng lúc. */
export function buildSupplierDashboard(input: NoticeInput & { days: 7 | 30 | 90 }) {
  const relevant = relevantInvites(input.supplierId, input.invites);
  const invites = projectInvites(relevant, input.products, input.supplierId);
  const notices = buildSupplierNotices(input);
  return {
    invites,
    notices,
    unreadCount: notices.filter((n) => !n.read).length,
    tasks: buildSupplierTasks(invites, relevant),
    report: buildSupplierReport(input),
  };
}
