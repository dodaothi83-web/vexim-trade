import { formatCertificateDate } from "@/lib/certificate-supplier-copy";
import { supplierPlanRules, type SupplierPlan, type SupplierPlanCatalog } from "@/lib/supplier-plans";

/**
 * Gói đang dùng của nhà cung cấp, dùng chung cho bảng chọn gói ở "Trang của tôi" và "Dịch vụ Vexim"
 * (hai nơi mở cùng một bảng, components/supplier-portal/storefront-owner.tsx).
 */
export function supplierPlanStatus(
  supplier: { plan?: string | null; plan_expires_at?: string | null },
  catalog: SupplierPlanCatalog,
  locale: string,
  now: Date = new Date(),
): { plan: SupplierPlan; expiresOn: string | null; renewable: boolean } {
  const { plan } = supplierPlanRules(supplier, now, catalog);
  const expires = supplier.plan_expires_at ? Date.parse(supplier.plan_expires_at) : NaN;
  const paid = plan !== "basic" && Number.isFinite(expires);
  return {
    plan,
    // Hạn gói hiển thị theo ngày Việt Nam; CRM lưu 23:59:59 +07:00 của ngày hết hạn.
    expiresOn: paid ? formatCertificateDate(new Date(expires + 7 * 3_600_000).toISOString().slice(0, 10), locale === "en" ? "en" : "vi") : null,
    // Còn ≤ 30 ngày thì hiện nút gia hạn chính gói đang dùng (cùng mốc với email nhắc).
    renewable: paid && expires - now.getTime() <= 30 * 86_400_000,
  };
}
