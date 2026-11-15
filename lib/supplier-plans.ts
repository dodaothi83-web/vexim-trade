/**
 * Gói nhà cung cấp: Basic, Premium, Pro.
 *
 * Nhân viên bật gói và ngày hết hạn trong CRM (thanh toán ngoài hệ thống). Gói trả phí hết
 * hạn được tính là Basic. Số sản phẩm phải khớp hàm supplier_product_limit trong migration
 * 20261124_supplier_plans.sql, nơi trigger chặn tạo sản phẩm vượt mức.
 *
 * Video và trang nhà cung cấp sang trọng là quyền của Premium/Pro; hai phần đó làm ở giai
 * đoạn sau và đọc quyền từ đây.
 *
 * Tệp không import gì để script kiểm tra nạp thẳng bằng Node.
 */
export const SUPPLIER_PLANS = ["basic", "premium", "pro"] as const;
export type SupplierPlan = (typeof SUPPLIER_PLANS)[number];

export interface SupplierPlanRules {
  maxProducts: number;
  video: boolean;
  premiumStorefront: boolean;
}

export const SUPPLIER_PLAN_RULES: Record<SupplierPlan, SupplierPlanRules> = {
  basic: { maxProducts: 5, video: false, premiumStorefront: false },
  premium: { maxProducts: 20, video: true, premiumStorefront: true },
  pro: { maxProducts: 50, video: true, premiumStorefront: true },
};

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

export function supplierPlanRules(
  supplier: { plan?: string | null; plan_expires_at?: string | null },
  now: Date = new Date(),
): SupplierPlanRules & { plan: SupplierPlan } {
  const plan = effectiveSupplierPlan(supplier, now);
  return { plan, ...SUPPLIER_PLAN_RULES[plan] };
}

/** Còn thêm được sản phẩm mới không (đếm mọi sản phẩm của nhà cung cấp, kể cả bản nháp). */
export function canAddSupplierProduct(
  supplier: { plan?: string | null; plan_expires_at?: string | null },
  productCount: number,
  now: Date = new Date(),
): boolean {
  return productCount < supplierPlanRules(supplier, now).maxProducts;
}

/** Lỗi do trigger CSDL trả về khi vượt giới hạn gói. */
export function isProductLimitError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error ?? "");
  return /supplier_product_limit_reached/.test(text);
}
