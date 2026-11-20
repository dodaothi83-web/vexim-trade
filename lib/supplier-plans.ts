/**
 * Gói nhà cung cấp: Basic, Premium, Pro. Nội dung, giá và giới hạn chỉnh ở CRM (/crm/plans,
 * bảng supplier_plan_catalog); các hằng số dưới đây là giá trị mặc định.
 *
 * Nhân viên bật gói và ngày hết hạn trong CRM (thanh toán ngoài hệ thống). Gói trả phí hết
 * hạn được tính là Basic. Số sản phẩm phải khớp hàm supplier_product_limit trong migration
 * 20261124_supplier_plans.sql, nơi trigger chặn tạo sản phẩm vượt mức.
 *
 * Video sản phẩm (trong dãy ảnh) và nội dung A+ là quyền của Premium/Pro, bật tắt chung bằng
 * `rich_content` trong CRM. Trang nhà cung cấp sang trọng làm ở giai đoạn sau và đọc quyền từ đây.
 *
 * Tệp không import gì để script kiểm tra nạp thẳng bằng Node.
 */
export const SUPPLIER_PLANS = ["basic", "premium", "pro"] as const;
export type SupplierPlan = (typeof SUPPLIER_PLANS)[number];

export interface SupplierPlanRules {
  /** null là không giới hạn. */
  maxProducts: number | null;
  /** Video sản phẩm trong dãy ảnh; luôn đi cùng `richContent`. */
  video: boolean;
  premiumStorefront: boolean;
  /**
   * Nội dung A+ trong mô tả chi tiết (khối ảnh, ảnh + chữ, lưới ảnh, video). Basic chỉ có mô tả
   * bằng chữ; ảnh sản phẩm chính thì mọi gói đều có.
   */
  richContent: boolean;
}

/** Giá trị mặc định khi chưa đọc được bảng gói trong CSDL; khớp nội dung khởi tạo của migration 20261129. */
export const SUPPLIER_PLAN_RULES: Record<SupplierPlan, SupplierPlanRules> = {
  basic: { maxProducts: 5, video: false, premiumStorefront: false, richContent: false },
  premium: { maxProducts: 20, video: true, premiumStorefront: true, richContent: true },
  pro: { maxProducts: null, video: true, premiumStorefront: true, richContent: true },
};

export interface SupplierPlanPrice { months: number; price_vnd: number }

/** Nội dung một gói chỉnh trong CRM (/crm/plans). */
export interface SupplierPlanCatalogEntry {
  plan: SupplierPlan;
  name: string;
  summary: string;
  features: string[];
  prices: SupplierPlanPrice[];
  maxProducts: number | null;
  /** Mở video sản phẩm (trong dãy ảnh) và nội dung A+ (ảnh, video) trong mô tả chi tiết. */
  richContent: boolean;
  updatedAt?: string | null;
}
export type SupplierPlanCatalog = Record<SupplierPlan, SupplierPlanCatalogEntry>;

export const DEFAULT_PLAN_CATALOG: SupplierPlanCatalog = {
  basic: { plan: "basic", name: "Basic", summary: "Miễn phí", maxProducts: 5, richContent: false, prices: [],
    features: ["Đăng tối đa 5 sản phẩm", "Ảnh sản phẩm và mô tả bằng chữ; không có video và nội dung A+", "Hồ sơ nhà cung cấp cơ bản trên nền tảng"] },
  premium: { plan: "premium", name: "Premium", summary: "", maxProducts: 20, richContent: true,
    prices: [{ months: 3, price_vnd: 1_399_000 }, { months: 6, price_vnd: 2_499_000 }],
    features: ["Đăng tối đa 20 sản phẩm, có video sản phẩm và nội dung A+ (ảnh, video)", "1 bài SEO tiếng Anh mỗi tháng trên website Vexim Trade",
      "1 bài SEO mỗi tháng trên website của doanh nghiệp (nếu có)", "Nhân viên Vexim tư vấn tối ưu gian hàng và hồ sơ năng lực",
      "Dùng thử 15 ngày cho khách hàng đã dùng dịch vụ FDA/GACC của Vexim Global"] },
  pro: { plan: "pro", name: "Pro", summary: "", maxProducts: null, richContent: true,
    prices: [{ months: 3, price_vnd: 1_999_000 }, { months: 6, price_vnd: 3_499_000 }],
    features: ["Đăng không giới hạn sản phẩm, có video sản phẩm và nội dung A+ (ảnh, video)", "2 bài SEO tiếng Anh mỗi tháng trên website Vexim Trade",
      "2 bài SEO mỗi tháng trên website của doanh nghiệp (nếu có)", "Nhân viên Vexim tư vấn tối ưu gian hàng và hồ sơ năng lực",
      "Tặng Gói 1 · Website Health Check (khám website tổng thể) khi mua gói 6 tháng"] },
};

/** "1.399.000₫" */
export function formatVnd(value: number): string {
  return `${Math.round(value).toLocaleString("vi-VN")}₫`;
}

export const SUPPLIER_PLAN_LABELS: Record<SupplierPlan, string> = {
  basic: "Basic",
  premium: "Premium",
  pro: "Pro",
};

export function isSupplierPlan(value: unknown): value is SupplierPlan {
  return typeof value === "string" && (SUPPLIER_PLANS as readonly string[]).includes(value);
}

/** Gói đang có hiệu lực: giá trị lạ hoặc gói trả phí đã hết hạn đều là Basic. */
export function effectiveSupplierPlan(
  supplier: { plan?: string | null; plan_expires_at?: string | null },
  now: Date = new Date(),
): SupplierPlan {
  const plan = isSupplierPlan(supplier.plan) ? supplier.plan : "basic";
  if (plan === "basic") return "basic";
  const expires = supplier.plan_expires_at ? new Date(supplier.plan_expires_at) : null;
  if (expires && Number.isFinite(expires.getTime()) && expires.getTime() <= now.getTime()) return "basic";
  return plan;
}

/**
 * Quyền của gói đang có hiệu lực. Truyền `catalog` (đọc từ CRM) để số sản phẩm và quyền
 * nội dung A+ theo đúng bảng gói hiện hành; thiếu thì dùng giá trị mặc định.
 */
export function supplierPlanRules(
  supplier: { plan?: string | null; plan_expires_at?: string | null },
  now: Date = new Date(),
  catalog?: SupplierPlanCatalog | null,
): SupplierPlanRules & { plan: SupplierPlan } {
  const plan = effectiveSupplierPlan(supplier, now);
  const entry = catalog?.[plan];
  return { plan, ...SUPPLIER_PLAN_RULES[plan], ...(entry ? { maxProducts: entry.maxProducts, richContent: entry.richContent, video: entry.richContent } : {}) };
}

/** Còn thêm được sản phẩm mới không (đếm mọi sản phẩm của nhà cung cấp, kể cả bản nháp). */
export function canAddSupplierProduct(
  supplier: { plan?: string | null; plan_expires_at?: string | null },
  productCount: number,
  now: Date = new Date(),
  catalog?: SupplierPlanCatalog | null,
): boolean {
  const max = supplierPlanRules(supplier, now, catalog).maxProducts;
  return max === null || productCount < max;
}

/** Lỗi do trigger CSDL trả về khi vượt giới hạn gói. */
export function isProductLimitError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error ?? "");
  return /supplier_product_limit_reached/.test(text);
}
