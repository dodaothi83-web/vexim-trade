export type Priority = "low" | "normal" | "high";

export type SupplierRole = "manufacturer" | "trader" | "agent" | "exporter";
export type SupplierStatus = "new" | "verifying" | "verified" | "paused";

export interface Supplier {
  id: string;
  /** Tên pháp nhân */
  name: string;
  /** Tên thương mại (nếu khác pháp nhân) */
  trade_name: string | null;
  contact_name: string | null;
  /** Chức vụ người liên hệ */
  contact_title: string | null;
  email: string | null;
  phone: string | null;
  zalo: string | null;
  website: string | null;
  country: string | null;
  address: string | null;
  province: string | null;
  /** Vai trò: nhà sản xuất / thương nhân / đại lý / XK trung gian */
  role: SupplierRole;
  /** Thị trường đang phục vụ hoặc muốn bán */
  markets: string | null;
  /** Tóm tắt ngành hàng chính – hồ sơ chi tiết nằm ở từng sản phẩm */
  products: string | null;
  tax_id: string | null;
  payment_terms: string | null;
  lead_time_days: number | null;
  rating: number | null;
  notes: string | null;
  status: SupplierStatus;
  created_at: string;
  updated_at: string;
}

/** Hồ sơ sản phẩm riêng của NCC – dùng để so khớp với nhu cầu mua của buyer */
export interface SupplierProduct {
  id: string;
  supplier_id: string;
  name: string;
  /** Nhóm ngành: Nông sản, Thủy sản, Gỗ... */
  category: string | null;
  description: string | null;
  spec: string | null;
  unit: string | null;
  moq: string | null;
  monthly_capacity: string | null;
  lead_time_days: number | null;
  /** Bao bì / đóng gói */
  packaging: string | null;
  /** Nhận làm nhãn riêng */
  oem: boolean;
  certifications: string | null;
  export_port: string | null;
  /** Giá tham khảo – KHÔNG tự gửi cho buyer như báo giá chính thức */
  ref_price: number | null;
  currency: string | null;
  price_valid_until: string | null;
  incoterm: string | null;
  /** Địa điểm Incoterm, VD: Cát Lái */
  incoterm_place: string | null;
  payment_terms: string | null;
  /** Có thể gửi mẫu */
  samples: boolean;
  created_at: string;
  updated_at: string;
}

export type SupplierProductInput = Omit<SupplierProduct, "id" | "created_at" | "updated_at">;

export interface Buyer {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  cc_emails: string | null;
  phone: string | null;
  country: string | null;
  website: string | null;
  linkedin: string | null;
  instagram: string | null;
  product: string | null;
  spec: string | null;
  quantity: string | null;
  target_price: string | null;
  /** Phương thức thanh toán: T/T, L/C at sight, D/P... */
  payment_method: string | null;
  /** Điều khoản thanh toán: tỷ lệ cọc, thời điểm thanh toán phần còn lại */
  payment_terms: string | null;
  incoterm: string | null;
  port: string | null;
  expected_ship_date: string | null;
  deal_value: number | null;
  /** null khi chưa chọn NCC – điều hoàn toàn bình thường ở giai đoạn đầu */
  supplier_id: string | null;
  /** Ẩn danh buyer khi email cho supplier (mặc định: ẩn) */
  hide_buyer_from_supplier: boolean;
  stage: string;
  owner: string | null;
  source: string | null;
  priority: Priority;
  next_action: string | null;
  next_action_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ActivityType =
  | "created"
  | "updated"
  | "stage_change"
  | "supplier_change"
  | "note"
  | "email";

export interface Activity {
  id: string;
  buyer_id: string;
  type: ActivityType;
  from_stage: string | null;
  to_stage: string | null;
  message: string;
  created_by: string | null;
  created_at: string;
}

export type MessageKind = "auto" | "manual";
export type MessageStatus = "draft" | "sent" | "failed" | "simulated";
export type MessageDirection = "buyer" | "supplier";

export interface Attachment {
  name: string;
  size: number;
  type: string;
  /** base64, không kèm prefix data: */
  content: string;
}

/** Một email trong hộp thư: có thể là email tự động theo giai đoạn hoặc do đội ngũ tự soạn */
export interface EmailMessage {
  id: string;
  buyer_id: string | null;
  supplier_id: string | null;
  kind: MessageKind;
  /** chỉ có với email tự động theo giai đoạn */
  stage: string | null;
  direction: MessageDirection;
  /** nhóm hội thoại: buyer|supplier + địa chỉ chính */
  thread_id: string;
  subject: string;
  to_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  body_html: string;
  body_text: string;
  attachments: Attachment[];
  status: MessageStatus;
  provider: "resend" | "local";
  error: string | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface BuyerWithSupplier extends Buyer {
  supplier: Pick<Supplier, "id" | "name" | "email" | "phone" | "contact_name"> | null;
}

export type BuyerInput = Omit<Buyer, "id" | "created_at" | "updated_at">;
export type SupplierInput = Omit<Supplier, "id" | "created_at" | "updated_at">;
