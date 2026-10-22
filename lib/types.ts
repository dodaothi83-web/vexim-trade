export type Priority = "low" | "normal" | "high";

export type SupplierRole = "manufacturer" | "trader" | "agent" | "exporter";
export type SupplierType = "manufacturer" | "trading" | "cooperative";
/**
 * Trạng thái hồ sơ nhà cung cấp theo luồng GĐ1:
 *   draft            – sale vừa tạo / seller tự đăng ký, chưa nộp đủ
 *   submitted        – đã nộp đủ hồ sơ, chờ bộ phận kiểm tra
 *   in_verification  – bộ phận kiểm tra đang xem
 *   published        – đã xác thực, hiện trang công khai
 *   suspended        – tạm ngừng công khai
 *   archived         – đã xoá khỏi danh sách hoạt động
 *
 * new / verifying / verified / paused giữ lại để tương thích với dữ liệu cũ;
 * code mới vui lòng dùng các trạng thái mới.
 */
export type SupplierStatus =
  | "new"
  | "verifying"
  | "verified"
  | "paused"
  | "draft"
  | "submitted"
  | "in_verification"
  | "published"
  | "suspended"
  | "archived";

/** Chuỗi dịch JSON theo mã ngôn ngữ: {"en": "...", "ja": "..."}. MVP chỉ có en. */
export type I18nString = Record<string, string>;
/** Danh sách ngắn theo ngôn ngữ, ví dụ tên thị trường xuất khẩu: { en: ["United States", "Japan"] } */
export type I18nList = Record<string, string[]>;

export interface Supplier {
  id: string;
  /** Tên pháp nhân */
  name: string;
  /** Tên thương mại (nếu khác pháp nhân) */
  trade_name: string | null;
  /** Tên hiển thị công khai (nếu null thì fallback trade_name → name) */
  display_name?: string | null;
  /** URL slug trên trang công khai */
  slug?: string | null;
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
  /**
   * Vai trò cũ (manufacturer/trader/agent/exporter) — giữ lại để code cũ không vỡ
   * khi di chuyển; code mới đọc `supplier_type`.
   */
  role: SupplierRole;
  /** Loại hình theo đặc tả mới: nhà máy / thương mại / HTX */
  supplier_type?: SupplierType | null;
  /** Thị trường đang phục vụ hoặc muốn bán */
  markets: string | null;
  /** Tóm tắt ngành hàng chính – hồ sơ chi tiết nằm ở từng sản phẩm */
  products: string | null;
  /** Danh mục NCC tự đề xuất lúc đăng ký, KHÔNG phải liên kết/ngành đã được Vexim xác nhận. */
  requested_category_slugs?: string[];
  requested_category_other?: string | null;
  /** Đánh dấu lần staff chủ động chốt danh mục NCC; không đồng nghĩa công khai NCC. */
  categories_reviewed_at?: string | null;
  tax_id: string | null;
  payment_terms: string | null;
  lead_time_days: number | null;
  rating: number | null;
  notes: string | null;
  status: SupplierStatus;
  /** Quyền dùng cổng NCC; độc lập với status công khai và các kết quả xác minh. */
  onboarding_status?: "not_started" | "pending" | "approved" | "changes_requested";
  onboarding_note?: string | null;
  /** Năm thành lập */
  founded_year?: number | null;
  /** Số nhân sự */
  employees?: number | null;
  /** Tóm tắt giới thiệu công khai theo ngôn ngữ */
  summary_i18n?: I18nString;
  /** Câu chuyện, điểm khác biệt do nhà cung cấp tự viết bằng ngôn ngữ gốc; là nguồn để AI dịch thành summary_i18n.en cho trang buyer. */
  intro_source?: string | null;
  /** MOQ mô tả dạng text (vd "1 MT for W320") */
  moq_text?: string | null;
  /** Bản tiếng Anh của MOQ dạng text, hiển thị trên trang buyer thay cho nội dung gốc */
  moq_text_i18n?: I18nString;
  /** Thị trường xuất khẩu theo ngôn ngữ, hiển thị trên trang buyer */
  export_markets_i18n?: I18nList;
  /** Dấu vết dịch tự động hồ sơ: hash nội dung gốc (MOQ, thị trường) tại thời điểm dịch để phát hiện bản dịch đã cũ. */
  profile_translation_meta?: {
    source_hash: string;
    translated_at: string;
    origin: "ai" | "staff";
    model?: string | null;
    /** True khi phần giới thiệu tiếng Anh do AI soạn từ dữ kiện hồ sơ vì NCC không viết phần giới thiệu. */
    summary_generated?: boolean;
    /** Hash phần giới thiệu gốc tại thời điểm dịch, để dịch lại khi NCC sửa câu chuyện của họ. */
    summary_source_hash?: string;
  } | null;
  /** Công suất tháng mô tả text */
  capacity_per_month?: string | null;
  /** Cảng xuất (mảng) */
  ports?: string[];
  /** Điều kiện Incoterm hỗ trợ */
  incoterms?: string[];
  /** Thị trường xuất khẩu */
  export_markets?: string[];
  /** Nhận làm nhãn riêng / OEM */
  private_label?: boolean;
  /** Ảnh đại diện công khai (logo hoặc ảnh nhà máy), storage_path trong media hoặc URL công khai */
  profile_image?: string | null;
  /** Ảnh bìa trang chi tiết NCC */
  cover_image?: string | null;
  /** Cấp xác minh 0–3, 0 = chưa xác minh */
  verification_level?: number;
  verified_at?: string | null;
  next_reverify_at?: string | null;
  /** Điểm đánh giá trung bình (chỉ hiện khi có ≥ 3 đánh giá) */
  rating_avg?: number | null;
  rating_count?: number;
  /** Giá FOB chung cũ: chỉ lưu tương thích, không nhập/hiển thị công khai nữa. */
  fob_min?: number | null;
  fob_max?: number | null;
  fob_unit?: string | null;
  fob_currency?: string | null;
  /** Lần NCC xác nhận quyền chia sẻ giá từng sản phẩm, không phải ngày cập nhật giá. */
  fob_updated_at?: string | null;
  /** NCC đã chấp thuận bằng văn bản để công khai giá từng sản phẩm. */
  fob_publicly_visible?: boolean;
  /**
   * Hồ sơ demo dùng cho preview nội bộ / cho seller xem tại sự kiện.
   * Luôn được lọc khỏi public list trừ khi VEXIM_SHOW_DEMO=true hoặc staff đăng nhập.
   * Không dùng tên công ty thật, không xuất hiện trong sitemap/thống kê.
   */
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

/** Hồ sơ sản phẩm riêng của NCC – dùng để so khớp với nhu cầu mua của buyer */
export interface SupplierProduct {
  id: string;
  supplier_id: string;
  name: string;
  /** URL slug */
  slug?: string | null;
  /** Tên theo ngôn ngữ */
  name_i18n?: I18nString;
  /** Nhóm ngành: Nông sản, Thủy sản, Gỗ... — giữ text để tương thích code cũ, ưu tiên qua categories */
  category: string | null;
  description: string | null;
  /** Bản tiếng Anh của mô tả, do AI dịch tự động hoặc nhân viên Vexim chốt; trang buyer ưu tiên bản này. */
  description_i18n?: I18nString;
  /** Optional long-form buyer-facing product information (plain text, no HTML). */
  description_detail?: string | null;
  description_detail_i18n?: I18nString;
  spec: string | null;
  spec_i18n?: I18nString;
  /** Dấu vết bản dịch tiếng Anh: hash nội dung gốc tại thời điểm dịch để phát hiện bản dịch đã cũ khi NCC sửa nội dung. */
  translation_meta?: {
    source_hash: string;
    translated_at: string;
    origin: "ai" | "staff";
    model?: string | null;
  } | null;
  /** Thông số theo ngành (JSON linh hoạt) */
  specs?: Record<string, unknown>;
  unit: string | null;
  moq: string | null;
  moq_qty?: number | null;
  moq_unit?: string | null;
  monthly_capacity: string | null;
  lead_time_days: number | null;
  /** Bao bì / đóng gói */
  packaging: string | null;
  packaging_i18n?: I18nString;
  /** Nhận làm nhãn riêng */
  oem: boolean;
  /** Thiết kế và sản xuất theo yêu cầu; NCC tự khai, không phải xác minh. */
  odm?: boolean;
  certifications: string | null;
  certifications_i18n?: I18nString;
  export_port: string | null;
  /** Giá tham khảo từ (hoặc giá đơn nếu không có giá đến) – không phải báo giá RFQ. */
  ref_price: number | null;
  /** Giá tham khảo đến, tùy chọn; chỉ công khai cùng giá từ hợp lệ và consent. */
  ref_price_max?: number | null;
  /** Explicit per-product opt-in, separate from time-limited supplier consent. */
  price_publicly_visible?: boolean;
  currency: string | null;
  price_valid_until: string | null;
  incoterm: string | null;
  /** Địa điểm Incoterm, VD: Cát Lái */
  incoterm_place: string | null;
  payment_terms: string | null;
  /** Có thể gửi mẫu */
  samples: boolean;
  /**
   * Sẵn sàng gửi buyer. Chỉ bật được khi hồ sơ đã có ít nhất một ảnh sản phẩm
   * hoặc catalogue chia sẻ được cho buyer (xem lib/media/readiness.ts).
   */
  ready_for_buyer: boolean;
  /** Supplier-authored changes require a separate Vexim decision; distinct from buyer-ready/publication. */
  supplier_review_status?: "draft" | "pending" | "approved" | "changes_requested";
  supplier_review_note?: string | null;
  /** Bản do NCC tạo/sửa: luôn cần danh mục staff xác nhận để được công khai. Legacy/staff cũ = false. */
  supplier_originated?: boolean;
  /** Danh mục NCC đề xuất, không được dùng trực tiếp để phân loại public. */
  supplier_category_proposal?: string | null;
  /** Danh mục staff chọn khi duyệt; ưu tiên hơn suy đoán tên khi xuất bản. */
  reviewed_category_slug?: string | null;
  /** Staff-selected buyer-shareable product image; null means first eligible image. */
  featured_media_id?: string | null;
  /** Mảng media_assets.id cho ảnh sản phẩm */
  images?: string[];
  created_at: string;
  updated_at: string;
}

export type SupplierProductInput = Omit<SupplierProduct, "id" | "created_at" | "updated_at">;

/* ----------------- RFQ FOUNDATION — CATEGORIES / SUPPLIER ----------------- */

/** Category-specific product fields configured by Vexim, separate from editorial reference tables. */
export interface ProductAttributeField {
  key: string;
  label: string;
  type: "select" | "text";
  options: string[];
  filterable?: boolean;
  showWhen?: { key: string; value: string };
}

export interface Category {
  id: string;
  slug: string;
  parent_id: string | null;
  name_i18n: I18nString;
  intro_i18n: I18nString;
  /** Hero H1 override — nếu để trống thì dùng "{Name} suppliers in Vietnam". */
  h1_i18n?: I18nString | null;
  /** Khối mô tả dài, đặt sau danh sách NCC (hoặc sau form lead khi chưa có NCC). */
  body_i18n?: I18nString | null;
  /** Các cột bảng thông số (xem CategoryColumn). Bảng hiển thị khi có ≥1 cột. */
  spec_columns?: CategoryColumn[];
  product_fields?: ProductAttributeField[];
  /** Các hàng trong bảng thông số. */
  spec_rows?: CategoryRow[];
  /** Các mục trong khối "thông tin mua hàng" (xem CategoryFact). */
  buying_facts?: CategoryFact[];
  /** FAQ — tự render thành accordion và tự sinh schema FAQPage JSON-LD. */
  faq_i18n: { q: string; a: string }[] | I18nString[] | unknown[];
  /** Mẫu thuộc tính lọc (verification, type, FOB, grade chips, certifications). */
  filters?: CategoryFilter[];
  /** Lịch mùa vụ hiển thị trên trang danh mục. Xem HarvestCalendar. */
  harvest?: HarvestCalendar | null;
  seo_title_i18n: I18nString;
  seo_desc_i18n: I18nString;
  /** Ảnh hero cho trang public + thẻ trang chủ. Đường dẫn trong kho public media (/public-media/categories/xxx.jpg). */
  hero_image?: string | null;
  /** Alt text cho ảnh hero (cho SEO + screen readers). */
  hero_alt_i18n?: I18nString | null;
  /** Kicker/hàng phụ hiển thị dưới ảnh trên thẻ trang chủ. */
  homepage_kicker_i18n?: I18nString | null;
  /** Hiện thẻ category này ở khối "What we source" trang chủ. */
  active_on_homepage?: boolean;
  /**
   * Cờ "đã có hồ sơ NCC công khai" — được tính khi load DB (từ suppliers[]).
   * Giữ lại để các thành phần cũ (thẻ trang chủ) không phải query riêng.
   */
  public_page_ready?: boolean;
  /** Trạng thái biên tập: draft | published. published mới hiện cho buyer. */
  status?: "draft" | "published";
  /** Cho Google index trang này. Mặc định false trong giai đoạn đầu. */
  seo_indexable?: boolean;
  /** Slug cũ dùng để tự 301 redirect (khi đổi slug). */
  previous_slugs?: string[];
  /** ID người tạo / cập nhật cuối (cho audit). */
  created_by?: string | null;
  updated_by?: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Một cột trong bảng thông số (grade reference). */
export interface CategoryColumn {
  key: string;          // khóa duy nhất không đổi
  label: string;        // tiêu đề cột
  width?: string;       // class Tailwind (vd: "w-20")
  emphasis?: boolean;   // in đậm (dùng cho mã grade như W240)
}

/** Một hàng trong bảng thông số. values map theo column.key; supports [placeholders]. */
/**
 * Một cửa sổ mùa vụ của danh mục.
 *
 * Tháng tính từ 1 đến 12. Nếu end_month nhỏ hơn start_month thì cửa sổ vắt qua
 * năm mới, ví dụ cà phê robusta từ tháng 11 đến tháng 1.
 */
export interface HarvestWindow {
  /** Khóa ổn định cho React, sinh ở trình sửa; không cần duy nhất toàn hệ thống. */
  id?: string;
  /** Tên vụ, ví dụ "Main crop" hay "Second crop". */
  label: string;
  start_month: number;
  end_month: number;
  /** Vùng trồng, hiển thị dạng chú thích dưới biểu đồ. */
  regions?: string[];
  /** Vụ chính: biểu đồ tô đậm hơn. */
  peak?: boolean;
  note?: string;
}

/**
 * Lịch mùa vụ của một danh mục.
 *
 * Lưu dạng danh sách cửa sổ chứ không phải mảng 12 tháng, vì gạo có ba vụ rời
 * nhau và thủy sản cao điểm theo loài. Thanh 12 tháng chỉ là cách vẽ ra từ đây.
 */
export interface HarvestCalendar {
  windows: HarvestWindow[];
  /** Câu giải thích chung dưới biểu đồ. */
  note_i18n?: I18nString;
  /** Ngày rà soát gần nhất (YYYY-MM-DD). Để trống thì giao diện nói rõ là chưa rà soát. */
  reviewed_on?: string | null;
}

export interface CategoryRow {
  key: string;
  values: Record<string, string>;
}

/** Một mục trong khối "Buying from X" (icon + label + paragraph). */
export interface CategoryFact {
  key: string;
  icon: "scale" | "package" | "ship" | "anchor" | "calendar" | "users" | "shield" | "tag" | "factory" | "check";
  label: string;
  value: string;
}

/** Một chip/bộ lọc trên đầu trang (hiện tại chips grade cho cashew). */
export interface CategoryFilter {
  key: string;           // vd: "grade"
  label: string;         // "Grades"
  options: { value: string; label: string }[];
}


export interface SupplierCategory {
  supplier_id: string;
  category_id: string;
  is_primary: boolean;
  created_at: string;
}

export type CertificateCheckStatus = "on_file" | "original_seen" | "checked_with_issuer";
export type CertificateHolderMatch = "owner" | "partner" | "unclear";
export type CertificateAiConfidence = "low" | "medium" | "high";
export type CertificateSource = "manual" | "l1-supplier" | "l1-staff";

export interface Certificate {
  /** Dedicated review/publication flow + L1 AI-scanned certificate columns. */
  holder_name?: string | null;
  holder_match?: CertificateHolderMatch | null;
  ai_scanned_at?: string | null;
  ai_summary?: string | null;
  ai_confidence?: CertificateAiConfidence | null;
  source?: CertificateSource;
  checklist_key?: string | null;
  verification_id?: string | null;
  staff_hidden?: boolean;
  expiry_notified?: Record<string, string>;
  scope_text?: string | null;
  requested_product_ids?: string[];
  approved_product_ids?: string[];
  review_status?: "unreviewed" | "pending" | "changes_requested" | "approved" | "rejected";
  review_note?: string | null;
  publicly_visible?: boolean;
  id: string;
  supplier_id: string;
  name: string;
  issuer: string | null;
  number: string | null;
  valid_until: string | null;
  file_media_id: string | null;
  check_status: CertificateCheckStatus;
  checked_at: string | null;
  checked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type VerificationStatus = "scheduled" | "in_progress" | "submitted" | "approved" | "returned";

export type VerificationLevel = 1 | 2 | 3;

/** Các hạng mục checklist L1 — giấy tờ doanh nghiệp & an toàn thực phẩm */
export const L1_DOC_ITEMS = [
  { key: "business_license", label: "Đăng ký doanh nghiệp", required: true },
  { key: "tax_certificate", label: "Mã số thuế", required: true },
  { key: "bank_letter", label: "Số tài khoản ngân hàng", required: false },
  { key: "food_safety", label: "Giấy chứng nhận an toàn thực phẩm (nếu có)", required: false },
  { key: "haccp_or_brc", label: "HACCP / BRC / ISO 22000 (nếu có)", required: false },
  { key: "product_certs", label: "Chứng chỉ sản phẩm đã công bố", required: false },
  { key: "export_license", label: "Giấy phép xuất khẩu (nếu áp dụng)", required: false }
] as const;

/**
 * Danh mục L2 CŨ (trước 20/10/2026) — CHỈ dùng để hiển thị dữ liệu lịch sử của các
 * đợt kiểm cũ (kết quả checklist + tệp đã gắn theo key cũ). Đợt kiểm mới dùng chung
 * chuẩn 9 ảnh nhà máy với cổng NCC tự gửi — xem L2_VISIT_ITEMS bên dưới.
 */
export const LEGACY_L2_VISIT_ITEMS = [
  { key: "factory_address_confirmed", label: "Đối chiếu địa chỉ và GPS tại cơ sở" },
  { key: "production_line_seen", label: "Quan sát dây chuyền sản xuất" },
  { key: "warehouse_seen", label: "Kiểm tra kho thành phẩm" },
  { key: "qc_lab_seen", label: "Kiểm tra thiết bị kiểm soát chất lượng" },
  { key: "documents_original", label: "Đối chiếu chứng chỉ gốc với bản tải lên" },
  { key: "capacity_verified", label: "Đối chiếu công suất với máy móc và nhân sự" },
  { key: "worker_interview", label: "Trao đổi với công nhân / nhân viên QC" },
  { key: "management_interview", label: "Trao đổi với quản lý về tiến độ và MOQ" },
  { key: "photos_taken", label: "Ảnh hiện trường: cổng, dây chuyền, kho" }
] as const;

export const LEGACY_L2_VISIT_KEYS: readonly string[] = LEGACY_L2_VISIT_ITEMS.map((item) => item.key);

export const DELIVERY_ITEMS = [
  { key: "order_matched", label: "Đối chiếu mã đơn hàng thực tế của Vexim" },
  { key: "shipping_proof", label: "Đối chiếu vận đơn / chứng từ xuất hàng" },
  { key: "delivery_proof", label: "Đối chiếu xác nhận giao nhận hoàn tất" },
] as const;

export type L1DocKey = typeof L1_DOC_ITEMS[number]["key"];
export type L2VisitKey = typeof L2_VISIT_ITEMS[number]["key"];
export type DeliveryKey = typeof DELIVERY_ITEMS[number]["key"];

/* --------- CỔNG TỰ XÁC THỰC CỦA NHÀ CUNG CẤP (L2 nhà máy / L3 xuất khẩu) --------- */

/**
 * 9 ảnh bắt buộc của L2 — áp dụng cho MỌI ngành hàng. Danh mục này là chuẩn DUY NHẤT:
 * cổng NCC tự gửi dùng để nộp ảnh, người kiểm Vexim dùng làm checklist đối chiếu (L2_VISIT_ITEMS).
 * `requires_code`: ảnh phải có tờ mã xác minh Vexim phát hành (🔖). NCC tải/in tờ mã rồi
 * chụp cùng cảnh. Đây là điều kiện bắt buộc duy nhất của ảnh — EXIF, GPS, giờ chụp chỉ là ghi chú.
 */
export const L2_FACTORY_PHOTO_ITEMS = [
  { key: "factory_gate", label: "Cổng nhà máy", requirement: "Thấy rõ biển tên công ty", requires_code: true, order: 1 },
  { key: "raw_material_warehouse", label: "Kho nguyên liệu", requirement: "Chụp rộng, thấy quy mô kho", requires_code: false, order: 2 },
  { key: "production_line_running", label: "Dây chuyền chính đang chạy", requirement: "Có công nhân đang làm việc", requires_code: true, order: 3 },
  { key: "packing_area", label: "Khu đóng gói", requirement: "Thấy khu vực đóng gói đang hoạt động", requires_code: false, order: 4 },
  { key: "finished_goods_warehouse", label: "Kho thành phẩm", requirement: "Hàng đã đóng thùng", requires_code: true, order: 5 },
  { key: "open_carton_lot_label", label: "Một thùng hàng mở ra", requirement: "Thấy sản phẩm và nhãn có mã lô", requires_code: false, order: 6 },
  { key: "hygiene_station", label: "Khu rửa tay, thay đồ bảo hộ", requirement: "Trước khi vào xưởng", requires_code: false, order: 7 },
  { key: "worker_ppe", label: "Công nhân mặc bảo hộ", requirement: "Mũ, khẩu trang, găng tay, áo bảo hộ", requires_code: false, order: 8 },
  { key: "pest_control", label: "Bẫy / trạm kiểm soát côn trùng, chuột", requirement: "Thấy bẫy hoặc trạm đang đặt tại xưởng", requires_code: false, order: 9 },
] as const;

export type FactoryPhotoKey = typeof L2_FACTORY_PHOTO_ITEMS[number]["key"];

/**
 * Checklist L2 của người kiểm Vexim — dùng CHUNG một chuẩn 9 ảnh với cổng NCC tự gửi.
 * Ảnh NCC tự nộp (khi được nhận vào đợt kiểm) rơi đúng vào dòng cùng key để đối chiếu 1-1.
 */
export const L2_VISIT_ITEMS = L2_FACTORY_PHOTO_ITEMS;

/** Chứng từ lịch sử xuất khẩu (L3) — ảnh chụp hoặc bản gốc + link nguồn công khai. */
export const L3_EXPORT_ITEMS = [
  { key: "bill_of_lading", label: "Vận đơn đường biển / hàng không (B/L, AWB)", required: true },
  { key: "customs_declaration", label: "Tờ khai hải quan xuất khẩu", required: true },
  { key: "commercial_invoice", label: "Hóa đơn thương mại", required: false },
  { key: "packing_list", label: "Phiếu đóng gói", required: false },
  { key: "certificate_of_origin", label: "C/O — giấy chứng nhận xuất xứ", required: false },
  { key: "phytosanitary_or_health", label: "Kiểm dịch / y tế / hun trùng (nếu ngành hàng yêu cầu)", required: false },
] as const;

export type ExportDocKey = typeof L3_EXPORT_ITEMS[number]["key"];

/**
 * Loại cờ liêm chính/đối chiếu mà hệ thống tự tính từ EXIF + GPS + AI.
 * Cờ KHÔNG phải kết luận: người duyệt của Vexim vẫn là người quyết định.
 */
export const SUBMISSION_FLAG_LABELS: Record<string, string> = {
  no_exif: "Ảnh không còn dữ liệu gốc (thường do gửi qua Zalo/Facebook) — vẫn nhận",
  edited_software: "Dữ liệu ảnh ghi phần mềm chỉnh sửa — chỉ để lưu ý",
  shared_via_app: "Ảnh từng đi qua ứng dụng chat/mạng xã hội — vẫn nhận",
  no_gps: "Ảnh không kèm toạ độ — không bắt buộc",
  gps_outside_vn: "Toạ độ trong ảnh nằm ngoài Việt Nam",
  gps_mismatch: "Toạ độ trong ảnh lệch xa vị trí trình duyệt báo",
  not_daylight: "Ảnh chụp ngoài khung 06:00–18:00 (giờ VN) — chỉ để lưu ý",
  no_capture_time: "Ảnh không cho biết thời điểm chụp — không bắt buộc",
  capture_before_code: "Dữ liệu ảnh cho thấy chụp trước khi phát hành mã",
  code_missing: "Không thấy tờ giấy viết tay mã xác minh trong ảnh bắt buộc",
  code_mismatch: "Mã viết tay trong ảnh không khớp mã hệ thống phát hành",
  content_mismatch: "Nội dung ảnh không đúng với mục yêu cầu (AI)",
  resolution_low: "Độ phân giải ảnh thấp bất thường",
};

export type SubmissionFlag = keyof typeof SUBMISSION_FLAG_LABELS;

/** Nguồn gốc của cờ: máy tự suy ra hay AI đọc ảnh. */
export type SubmissionFlagSource = "exif" | "gps" | "time" | "ai" | "system";

export interface SubmissionIntegrityFlag {
  flag: SubmissionFlag;
  /** "hard" = vi phạm yêu cầu bắt buộc; "warning" = cần người duyệt để ý. */
  severity: "hard" | "warning";
  source: SubmissionFlagSource;
  detail: string | null;
}

/** Kết quả AI đọc MỘT ảnh/chứng từ. Không bao giờ là quyết định duyệt. */
export interface AiSubmissionItemReview {
  verdict: "pass" | "fail" | "uncertain";
  reason: string | null;
  /** Chữ AI đọc được trong ảnh (biển tên, nhãn mã lô, tờ giấy viết tay…). */
  detected_text: string | null;
  /** AI có thấy mã xác minh viết tay và đọc ra được không. */
  code_visible: boolean | null;
  code_read: string | null;
  flags: SubmissionFlag[];
}

export interface AiSubmissionReview {
  model: string;
  scanned_at: string;
  summary: string | null;
  /** true khi AI thấy ảnh có dấu hiệu dàn dựng/chỉnh sửa nội dung. */
  manipulation_suspected: boolean | null;
  items: Record<string, AiSubmissionItemReview>;
}

/** Hồ sơ bằng chứng do NHÀ CUNG CẤP tự gửi — không phải đợt kiểm của nhân viên Vexim. */
export type SubmissionStatus = "draft" | "pending_review" | "returned" | "accepted";

export interface SupplierSubmission {
  id: string;
  supplier_id: string;
  target_level: 2 | 3;
  status: SubmissionStatus;
  /** Người gửi (tài khoản supplier). */
  created_by: string | null;
  /** Mã xác minh viết tay cho các ảnh 🔖; null khi chưa bấm “Tạo mã xác minh”. */
  verification_code: string | null;
  code_issued_at: string | null;
  /** Vị trí trình duyệt báo lúc chụp/tải ảnh (đối chiếu với GPS EXIF). */
  device_lat: number | null;
  device_lng: number | null;
  device_accuracy_m: number | null;
  device_captured_at: string | null;
  /** NCC tự khai về lô hàng (L3) — luôn là supplier-stated, không phải dữ liệu Hải quan. */
  shipment_ref: string | null;
  shipped_on: string | null;
  shipment_destination: string | null;
  supplier_note: string | null;
  /** Cờ hệ thống + AI, đã khử trùng lặp. */
  flags: SubmissionIntegrityFlag[];
  ai_review: AiSubmissionReview | null;
  ai_scanned_at: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  /** Đợt kiểm của nhân viên Vexim được tạo khi chấp thuận hồ sơ (bốn mắt vẫn áp dụng ở đó). */
  verification_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Link nguồn công khai NCC khai cho lịch sử xuất khẩu (L3). */
export interface SupplierSubmissionLink {
  id: string;
  submission_id: string;
  url: string;
  label: string | null;
  /** Domain có nằm trong danh sách nguồn công khai Vexim cho phép quét hay không. */
  allowed_source: boolean;
  /** Chỉ quét domain công khai; không bao giờ truy cập link nội bộ/địa chỉ riêng. */
  fetched_at: string | null;
  fetch_status: "pending" | "fetched" | "blocked" | "failed" | "manual";
  fetch_note: string | null;
  created_by: string | null;
  created_at: string;
}

/** Một ảnh/chứng từ của hồ sơ tự gửi, gắn đúng mục bắt buộc. */
export interface SupplierSubmissionItem {
  id: string;
  submission_id: string;
  supplier_id: string;
  checklist_key: FactoryPhotoKey | ExportDocKey;
  media_id: string | null;
  storage_path: string | null;
  thumb_path: string | null;
  /** GPS đọc từ EXIF của ảnh gốc. */
  exif_lat: number | null;
  exif_lng: number | null;
  exif_captured_at: string | null;
  exif_camera_make: string | null;
  exif_camera_model: string | null;
  exif_software: string | null;
  /** false khi ảnh không còn EXIF (đã bị nén/đăng lại). */
  has_exif: boolean;
  mime: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  /** Vị trí trình duyệt báo đúng lúc chụp ảnh này. */
  capture_lat: number | null;
  capture_lng: number | null;
  capture_accuracy_m: number | null;
  captured_at: string | null;
  flags: SubmissionIntegrityFlag[];
  ai_verdict: "pass" | "fail" | "uncertain" | null;
  ai_reason: string | null;
  ai_detected_text: string | null;
  ai_code_visible: boolean | null;
  ai_code_read: string | null;
  uploaded_at: string;
}

export type SubmissionKey = FactoryPhotoKey | ExportDocKey;

export type AuditEvidenceKey = L1DocKey | L2VisitKey | DeliveryKey | FactoryPhotoKey | ExportDocKey;

/** Yêu cầu Vexim liên hệ để kiểm tra nhà máy / lịch sử giao hàng; không phải kết quả xác minh. */
export interface SupplierVerificationRequest {
  supplier_id: string;
  target_level: 2 | 3;
  status: "requested" | "contacted";
  requested_at: string;
  contacted_at: string | null;
  contacted_by: string | null;
}

export interface Verification {
  id: string;
  supplier_id: string;
  target_level: VerificationLevel;
  status: VerificationStatus;
  inspector_id: string | null;
  /** L1: ngày nhận đủ tài liệu; L2: ngày thăm nhà máy */
  visit_date: string | null;
  /** GPS latitude khi thăm nhà máy (L2) */
  visit_lat: number | null;
  /** GPS longitude khi thăm nhà máy (L2) */
  visit_lng: number | null;
  /** Địa chỉ ghi nhận lúc thăm nhà máy */
  visit_address: string | null;
  /** Một lần kiểm lịch sử giao hàng phải gắn với một lô hàng đã hoàn tất. */
  shipment_ref: string | null;
  shipped_on: string | null;
  shipment_destination: string | null;
  /** Checklist kết quả — null = chưa kiểm; not_applicable chỉ dành cho mục tùy chọn. */
  checklist: Record<string, boolean | null | "not_applicable">;
  /** Ghi chú từng mục (key → text) */
  checklist_notes: Record<string, string | null>;
  /** Số được nhập thủ công, nội bộ; giữ dạng chuỗi để không mất số 0 đầu. Không phải kết quả xác minh tự động. */
  tax_number?: string | null;
  bank_account_number?: string | null;
  /** Lý do trả hồ sơ (khi status=returned) */
  return_reason: string | null;
  /** Bản tóm tắt do người có quyền duyệt soạn; chỉ công khai khi được duyệt riêng. */
  public_summary_i18n: I18nString;
  public_summary_published_at?: string | null;
  public_summary_published_by?: string | null;
  /** Ghi chú nội bộ */
  internal_notes: string | null;
  /** Người duyệt (chỉ admin) */
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ----------------------------- RFQs --------------------------------------- */

export type RfqStatus =
  | "new"             // vừa vào hộp, chưa chạm
  | "needs_review"    // cần kiểm tra / qualify thêm (thiếu thông tin, cần hỏi lại buyer)
  | "in_progress"     // đang xử lý, chưa đủ NCC để báo giá
  | "matching"        // đang chọn NCC phù hợp để ghép
  | "quoted"          // đã gửi báo giá cho buyer
  | "sampling"        // đang gửi/nhận mẫu
  | "won"             // chốt đơn
  | "lost"            // không đi tiếp — BẮT BUỘC có lost_reason
  | "spam";           // spam/không nghiêm túc, loại ra khỏi hộp chính

export type RfqMatchStatus =
  | "proposed"
  | "sent_to_supplier"
  | "quoted"
  | "declined"
  | "no_response"
  | "presented_to_buyer"
  | "selected"
  | "not_selected";

export interface RfqAttachment {
  id: string;
  rfq_id: string;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface Rfq {
  id: string;
  code: string;
  buyer_id: string;
  category_id: string | null;
  product_text: string;
  specs: Record<string, unknown>;
  quantity: number | null;
  unit: string | null;
  frequency: string | null;
  destination_country: string | null;
  incoterm: string | null;
  needed_by: string | null;
  target_price: number | null;
  target_price_currency: string | null;
  wants_samples: boolean;
  wants_inspection: boolean;
  wants_video_call: boolean;
  preferred_supplier_ids: string[];
  source_page: string | null;
  utm: Record<string, unknown>;
  referrer: string | null;
  spam_score: number;
  spam_flags: string[];
  status: RfqStatus;
  assigned_to: string | null;
  first_response_at: string | null;
  /** Lý do mất đơn — BẮT BUỘC khi status === "lost". Danh sách gợi ý: price, moq, lead_time, spec, certification, no_response, other */
  lost_reason: string | null;
  /** Ghi chú thêm khi đóng/thua đơn. */
  closed_reason: string | null;
  access_token: string;
  /** Canonical product detail which opened the RFQ; null for generic / legacy RFQs. */
  source_product_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RfqMatch {
  id: string;
  rfq_id: string;
  supplier_id: string;
  status: RfqMatchStatus;
  sent_to_supplier_at: string | null;
  /** Actual outreach deadline, never inferred from RFQ creation time. */
  response_due_at?: string | null;
  /** First matched supplier reply from verified Resend inbound; not a quote by itself. */
  supplier_replied_at?: string | null;
  quote_price: number | null;
  quote_currency: string | null;
  quote_unit: string | null;
  quote_incoterm: string | null;
  quote_lead_time_days: number | null;
  quote_valid_until: string | null;
  quote_file_id: string | null;
  sent_to_buyer_at: string | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
}

/** Server-side projection: scoped match joined only to non-sensitive RFQ fields (never buyers/access tokens). */
export type SupplierRfqInvitation = Pick<RfqMatch,
  "id" | "rfq_id" | "supplier_id" | "status" | "sent_to_supplier_at" | "response_due_at" | "supplier_replied_at" |
  "quote_price" | "quote_currency" | "quote_unit" | "created_at" | "updated_at"> & {
  rfq: Pick<Rfq, "code" | "product_text" | "quantity" | "unit" | "destination_country" |
    "incoterm" | "needed_by" | "source_product_id">;
};

export interface SupplierNoticeRead {
  supplier_id: string;
  notice_key: string;
  read_at: string;
}

export interface Introduction {
  id: string;
  buyer_id: string;
  supplier_id: string;
  first_rfq_id: string;
  introduced_at: string;
  protected_until: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  entity: string;
  entity_id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

/* ---------------- BUYER mở rộng ---------------- */
export type BuyerConsent = {
  consent_at: string;
  version: string;
};

// Các field bổ sung cho Buyer đã khai báo trong interface Buyer bên dưới;
// giữ export type BuyerInput ở cuối file để tự đồng bộ.

/* --------------------------------- MEDIA --------------------------------- */

export type MediaOwnerType = "product" | "supplier" | "verification";

/**
 * image       – ảnh sản phẩm / ảnh nhà máy, chia sẻ được cho buyer
 * catalogue   – PDF catalogue / bảng thông số
 * certificate – chứng nhận (PDF hoặc ảnh), có thể có ngày hết hạn
 * document    – giấy tờ xác minh NCC (mặc định chỉ nội bộ)
 * video       – chỉ lưu link (YouTube/Drive), không tải tệp lên
 */
export type MediaKind = "image" | "catalogue" | "certificate" | "document" | "video";

/** Chia sẻ cho buyer hay chỉ dùng nội bộ */
export type MediaAudience = "buyer" | "internal";

/** Mỗi tệp có trạng thái riêng, không mặc nhiên coi nội dung là đúng */
export type MediaStatus = "unverified" | "checked" | "expired";

export interface MediaAsset {
  id: string;
  owner_type: MediaOwnerType;
  product_id: string | null;
  supplier_id: string | null;
  /** Khi owner_type === "verification" — ảnh/giấy tờ đính kèm cho một lần xác minh cụ thể */
  verification_id?: string | null;
  /** Mục bảng kiểm giấy tờ gắn với tệp; null cho bằng chứng chung/tệp cũ. */
  checklist_key?: AuditEvidenceKey | null;
  kind: MediaKind;
  audience: MediaAudience;
  status: MediaStatus;
  /** Ngày hết hạn (chứng nhận / giá…) */
  expires_on: string | null;
  caption: string | null;
  /** Đường dẫn tệp trong kho media (ảnh/PDF) */
  storage_path: string | null;
  /** Đường dẫn ảnh xem trước cỡ nhỏ */
  thumb_path: string | null;
  /** Link ngoài (video) */
  external_url: string | null;
  mime: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MediaInput = Omit<MediaAsset, "id" | "created_at" | "updated_at">;

export interface Buyer {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  /** Phần domain của email, tính tự động khi lưu */
  email_domain?: string | null;
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
  /** Loại hình doanh nghiệp (importer/distributor/brand…) */
  business_type?: string | null;
  /** Thời điểm buyer đồng ý chia sẻ yêu cầu với seller */
  consent_at?: string | null;
  consent_policy_version?: string | null;
  /** Chặn nhận RFQ từ buyer này (spam/lạm dụng) */
  is_blocked?: boolean;
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

export type MessageKind = "auto" | "manual" | "inbound" | "rfq_outreach" | "rfq_followup" | "shortlist_buyer" | "buyer_status_update";
export type MessageStatus = "draft" | "sent" | "failed" | "simulated" | "received";
export type MessageDirection = "buyer" | "supplier";

/**
 * Tệp đính kèm email: nội dung nằm trong Supabase Storage (bucket riêng, private),
 * cơ sở dữ liệu chỉ giữ metadata. Không lưu base64/binary trong DB.
 */
export type AttachmentStatus = "pending" | "uploaded" | "attached" | "failed" | "deleted";

export interface EmailAttachment {
  id: string;
  /** Gắn vào email khi gửi; null = tệp vừa tải lên, chưa thuộc email nào */
  message_id: string | null;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: AttachmentStatus;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Tham chiếu rút gọn để gắn vào email và hiển thị ở giao diện */
export interface AttachmentRef {
  id: string;
  name: string;
  size: number;
  type: string;
  status?: AttachmentStatus;
}

/** Một email trong hộp thư: có thể là email tự động theo giai đoạn hoặc do đội ngũ tự soạn */
export interface EmailMessage {
  id: string;
  buyer_id: string | null;
  supplier_id: string | null;
  /** Contact prospect cold (nếu thư được gửi/nhận trước khi có Buyer thật). */
  prospect_id?: string | null;
  /** Liên kết với RFQ (để hiện timeline ở trang chi tiết RFQ). */
  rfq_id?: string | null;
  /** Liên kết với 1 RfqMatch cụ thể (thư cho NCC / hồi âm của NCC). */
  rfq_match_id?: string | null;
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
  attachments: AttachmentRef[];
  /** Thư đến: id email trong Resend Receiving (kiêm khoá chống trùng webhook) */
  rfc_message_id?: string | null;
  /** Thư đến: thời điểm đánh dấu đã đọc trong app; chưa có = chưa đọc */
  read_at?: string | null;
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

export type ProspectStatus =
  | "new"
  | "researched"
  | "ready"
  | "contacted"
  | "replied"
  | "meeting"
  | "qualified"
  | "converted"
  | "disqualified"
  | "unsubscribed";

export interface ProspectCompanySource {
  title: string;
  url: string;
}

/** Người liên hệ tiềm năng từ Apollo hoặc nguồn outbound khác, chưa phải Buyer có nhu cầu. */
export interface Prospect {
  id: string;
  company: string;
  contact_name: string | null;
  contact_title: string | null;
  email: string | null;
  email_status: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  linkedin_url: string | null;
  company_linkedin_url: string | null;
  industry: string | null;
  employee_range: string | null;
  apollo_id: string | null;
  data_source: string;
  source_list: string | null;
  target_product: string | null;
  status: ProspectStatus;
  owner: string | null;
  next_action: string | null;
  next_action_at: string | null;
  notes: string | null;
  converted_buyer_id: string | null;
  ai_company_summary: string | null;
  ai_company_sources: ProspectCompanySource[];
  ai_company_analyzed_at: string | null;
  /**
   * Sản phẩm AI đọc được trên website của đầu mối (tối đa 6 tên) + nhóm hàng suy ra.
   * Là căn cứ duy nhất để thư tiếp cận dám viết "I understand that X supplies Y".
   */
  ai_products: ProspectProductScan | null;
  created_at: string;
  updated_at: string;
}

/** Kết quả quét danh mục sản phẩm trên website đầu mối (xem lib/ai/company-products.ts) */
export interface ProspectProductScan {
  products: string[];
  group: string | null;
  /** "finished" = thành phẩm có nhãn; "raw" = nông sản thô/chưa chín; "mixed"; "unknown" */
  form: "finished" | "raw" | "mixed" | "unknown";
  /** Model nói nó dựa vào gì (kèm ảnh) — để nhân viên tự kiểm tra nhanh */
  evidence: string | null;
  note: string | null;
  /** Số ảnh sản phẩm thực sự đọc được từ website */
  images_seen: number;
  sources: ProspectCompanySource[];
  /** ISO timestamp — thư chỉ dùng khi bản quét còn "tươi" */
  scanned_at: string;
}

export type ProspectInput = Omit<
  Prospect,
  "id" | "created_at" | "updated_at" | "ai_company_summary" | "ai_company_sources" | "ai_company_analyzed_at" | "ai_products"
>;

export type ProspectActivityChannel = "email" | "linkedin" | "phone" | "meeting" | "note";

export interface ProspectActivity {
  id: string;
  prospect_id: string;
  channel: ProspectActivityChannel;
  summary: string;
  created_by: string | null;
  created_at: string;
}

/* ------------------------------- NGƯỜI DÙNG ------------------------------ */

export type UserRole = "admin" | "sale" | "sourcing" | "reviewer" | "viewer" | "supplier";

/** Cách tài khoản được xác thực */
export type AuthProvider = "supabase" | "local";

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  /** Chỉ tài khoản doanh nghiệp được liên kết hồ sơ NCC này. */
  supplier_id?: string | null;
  /** Tài khoản được tạo bên Supabase Auth (đăng nhập qua Supabase khi có mạng) */
  auth_provider: AuthProvider;
  /** Có mật khẩu nội bộ (dùng khi không kết nối được Supabase) */
  has_local_password: boolean;
  /** Chữ ký cá nhân (HTML) dùng cho email tự soạn; null = dùng chữ ký tự động */
  signature_html: string | null;
  /**
   * Địa chỉ gửi riêng của người này (dung@veximtrade.com). null = hệ thống tự sinh
   * từ họ tên (xem lib/email/sender.ts) — đổi tên thì địa chỉ đổi theo.
   */
  sender_email: string | null;
  /** Số điện thoại cá nhân hiển thị trong chữ ký; null = không hiển thị */
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Bản ghi đầy đủ chỉ dùng ở server (có hash mật khẩu) */
export interface AppUserRecord extends Omit<AppUser, "has_local_password"> {
  password_hash: string | null;
}

export type AppUserInput = Omit<
  AppUserRecord,
  | "id"
  | "created_at"
  | "updated_at"
  | "last_login_at"
  | "signature_html"
  | "phone"
  | "sender_email"
>;

/** Bản ghi ghi đè nội dung email theo giai đoạn (trang Templates) */
export interface TemplateOverride {
  stage: string;
  dir: "buyer" | "supplier";
  subject: string;
  /** Các đoạn văn ngăn cách bằng một dòng trống */
  body: string;
  /** buyer: bước kế tiếp / điều cần ở buyer */
  action: string | null;
  /** supplier: mỗi việc một dòng (checklist trong email) */
  tasks: string | null;
  /** supplier: thời hạn phản hồi */
  deadline: string | null;
  updated_at: string;
}

/** Mẫu tiếp cận Prospect, lưu riêng khỏi email theo giai đoạn Buyer */
export interface ProspectOutreachTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
  updated_at?: string;
}

/* ------------------------------ Bài viết blog ------------------------------ */

export type PostStatus = "draft" | "published";

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  /** JSON các khối nội dung (xem components/block-editor/types.ts) */
  content: string;
  category: string;
  featured_image: string | null;
  featured_image_alt: string | null;
  meta_title: string | null;
  meta_description: string | null;
  focus_keyword: string | null;
  /** Tác giả hiển thị cho người đọc; null thì hiển thị Veximtrade */
  author_name: string | null;
  /** Người kiểm duyệt nội dung chuyên môn (tùy chọn) */
  reviewer_name: string | null;
  status: PostStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Dữ liệu ghi vào bảng posts (đã qua whitelist ở lib/blog/post-payload.ts) */
export type PostInput = Omit<Post, "id" | "created_at" | "updated_at">;
