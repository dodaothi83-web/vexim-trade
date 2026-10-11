import {
  collectBuyerTerms,
  collectSupplierTerms,
  type SensitiveTerm,
} from "@/lib/email/privacy";
import type { Buyer, EmailMessage, Supplier, SupplierProduct } from "@/lib/types";

/**
 * Dữ liệu cho cột phải trang Soạn email: ngữ cảnh đơn hàng của người nhận,
 * các chuỗi cần giữ kín, và danh sách email đã trao đổi.
 *
 * Tất cả đều là dữ liệu thuần (không hàm) để truyền thẳng từ server component
 * xuống client component.
 */

export interface ComposeContext {
  id: string;
  kind: "buyer" | "supplier";
  /** Tên hiển thị: tên công ty buyer hoặc tên NCC */
  name: string;
  contactName: string | null;
  contactTitle?: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  /** Đường dẫn mở hồ sơ đầy đủ */
  href: string;

  // --- riêng buyer ---
  stage?: string | null;
  product?: string | null;
  spec?: string | null;
  quantity?: string | null;
  targetPrice?: string | null;
  payment?: string | null;
  incoterm?: string | null;
  shipDate?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
  owner?: string | null;
  /** Hồ sơ tóm tắt cho cột phải trang soạn thư */
  notes?: string | null;
  source?: string | null;
  priority?: string | null;
  dealValue?: number | null;
  createdAt?: string | null;
  /** NCC đã gắn vào đơn (nếu có) */
  linkedSupplier?: { name: string; email: string | null; status: string } | null;
  /** Buyer cho phép công khai với NCC hay đang yêu cầu ẩn danh */
  hideBuyerFromSupplier?: boolean;
  /** Các chuỗi của NCC không được lộ trong email gửi buyer */
  supplierSensitive: SensitiveTerm[];

  // --- riêng supplier ---
  role?: string | null;
  status?: string | null;
  markets?: string | null;
  productsSummary?: string | null;
  paymentTerms?: string | null;
  leadTimeDays?: number | null;
  rating?: number | null;
  /** Các chuỗi của buyer không nên lộ trong email gửi NCC */
  buyerSensitive: SensitiveTerm[];
}

export interface RecentMail {
  id: string;
  subject: string;
  created_at: string;
  status: EmailMessage["status"];
  direction: EmailMessage["direction"];
  kind: EmailMessage["kind"];
  buyer_id: string | null;
  supplier_id: string | null;
}

export function buildBuyerContext(
  buyer: Buyer,
  opts: {
    suppliers: Supplier[];
    supplierProducts: SupplierProduct[];
  },
): ComposeContext {
  const supplier = buyer.supplier_id
    ? (opts.suppliers.find((s) => s.id === buyer.supplier_id) ?? null)
    : null;
  const supplierProducts = supplier
    ? opts.supplierProducts.filter((p) => p.supplier_id === supplier.id)
    : [];

  return {
    id: buyer.id,
    kind: "buyer",
    name: buyer.company,
    contactName: buyer.contact_name,
    email: buyer.email,
    phone: buyer.phone,
    country: buyer.country,
    href: `/buyers/${buyer.id}`,
    stage: buyer.stage,
    product: buyer.product,
    spec: buyer.spec,
    quantity: buyer.quantity,
    targetPrice: buyer.target_price,
    payment: [buyer.payment_method, buyer.payment_terms].filter(Boolean).join(" – ") || null,
    incoterm: buyer.incoterm,
    shipDate: buyer.expected_ship_date,
    nextAction: buyer.next_action,
    nextActionDate: buyer.next_action_date,
    owner: buyer.owner,
    notes: buyer.notes,
    source: buyer.source,
    priority: buyer.priority,
    dealValue: buyer.deal_value,
    createdAt: buyer.created_at,
    linkedSupplier: supplier
      ? { name: supplier.name, email: supplier.email, status: supplier.status }
      : null,
    hideBuyerFromSupplier: buyer.hide_buyer_from_supplier,
    supplierSensitive: collectSupplierTerms(supplier, supplierProducts),
    buyerSensitive: collectBuyerTerms(buyer),
  };
}

export function buildSupplierContext(
  supplier: Supplier,
  opts: { supplierProducts: SupplierProduct[] },
): ComposeContext {
  const products = opts.supplierProducts.filter((p) => p.supplier_id === supplier.id);
  return {
    id: supplier.id,
    kind: "supplier",
    name: supplier.name,
    contactName: supplier.contact_name,
    contactTitle: supplier.contact_title,
    email: supplier.email,
    phone: supplier.phone,
    country: supplier.country,
    href: `/suppliers/${supplier.id}`,
    role: supplier.role,
    status: supplier.status,
    markets: supplier.markets,
    productsSummary:
      supplier.products ||
      products.map((p) => p.name).join(", ") ||
      null,
    paymentTerms: supplier.payment_terms,
    leadTimeDays: supplier.lead_time_days,
    notes: supplier.notes,
    rating: supplier.rating,
    createdAt: supplier.created_at,
    supplierSensitive: [],
    buyerSensitive: [],
  };
}

export function toRecentMail(m: EmailMessage): RecentMail {
  return {
    id: m.id,
    subject: m.subject,
    created_at: m.created_at,
    status: m.status,
    direction: m.direction,
    kind: m.kind,
    buyer_id: m.buyer_id,
    supplier_id: m.supplier_id,
  };
}

/** Tìm ngữ cảnh theo địa chỉ email người nhận */
export function findContextByEmail(
  contexts: ComposeContext[],
  email: string | undefined,
): ComposeContext | null {
  if (!email) return null;
  const needle = email.trim().toLowerCase();
  return contexts.find((c) => (c.email ?? "").trim().toLowerCase() === needle) ?? null;
}
