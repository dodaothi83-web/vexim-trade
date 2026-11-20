import type { PublicSupplierCard } from "@/lib/public/catalog";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import {
  supplierAnnualOutputDisplay, supplierCapacityDisplay, supplierExportMarketsDisplay, supplierIncotermsDisplay, supplierMoqDisplay,
} from "@/lib/public/supplier-english";
import type { StorefrontStat } from "@/lib/storefront-theme";

/**
 * Số liệu nổi bật trên trang nhà cung cấp Premium/Pro (khối Năng lực sản xuất). Đầu trang chung
 * kiểu "Hiện đại" ở components/public/premium-header.tsx; "Thanh lịch" và "Trưng bày" đã bỏ
 * ngày 2026-11-20.
 */
const safe = (value: string | null | undefined) => withoutDirectContacts(value || "");

/** Giá trị số liệu lấy từ hồ sơ; trống thì bỏ, không hiện "On request" ở vị trí nổi bật. */
export function storefrontStatValue(s: PublicSupplierCard, stat: StorefrontStat): string {
  switch (stat) {
    case "capacity": return safe(s.annual_output?.trim() ? supplierAnnualOutputDisplay(s) : supplierCapacityDisplay(s));
    case "founded": return s.founded_year ? String(s.founded_year) : "";
    case "employees": return typeof s.employees === "number" && s.employees > 0 ? String(s.employees) : "";
    case "markets": {
      const markets = supplierExportMarketsDisplay(s);
      return markets.length > 2 ? `${markets.length} countries` : safe(markets.join(", "));
    }
    case "lead_time": return s.lead_time_days ? `${s.lead_time_days} days` : "";
    case "moq": return safe(supplierMoqDisplay(s));
    case "incoterms": return safe(supplierIncotermsDisplay(s).join(", "));
  }
}
