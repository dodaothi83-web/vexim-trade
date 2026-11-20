/**
 * Các trường hồ sơ nhà cung cấp sửa được ngay trong "Thiết kế trang", theo từng khối. Cùng giới
 * hạn với form "Hồ sơ công ty" (app/supplier/portal/profile/profile-actions.ts). Tên pháp lý,
 * địa chỉ đăng ký và MOQ là dữ liệu Vexim giữ, chỉ hiện để xem.
 */
export const STOREFRONT_PROFILE_FIELDS = {
  display_name: { kind: "text", max: 180 },
  intro_source: { kind: "text", max: 1500 },
  products: { kind: "text", max: 1000, required: true },
  markets: { kind: "text", max: 800 },
  trade_name: { kind: "text", max: 180 },
  annual_output: { kind: "text", max: 180 },
  payment_terms: { kind: "text", max: 200 },
  founded_year: { kind: "int", max: 2100 },
  employees: { kind: "int", max: 1000000 },
  lead_time_days: { kind: "int", max: 3650 },
  ports: { kind: "list" },
  incoterms: { kind: "list" },
  export_markets: { kind: "list" },
} as const satisfies Record<string, { kind: "text"; max: number; required?: boolean } | { kind: "int"; max: number } | { kind: "list" }>;

export type StorefrontProfileField = keyof typeof STOREFRONT_PROFILE_FIELDS;
export type StorefrontProfilePatch = Partial<Record<StorefrontProfileField, string>>;

/** Trường hồ sơ theo khối, theo thứ tự hiện trong bảng chỉnh. */
export const PROFILE_FIELDS_BY_BLOCK: Record<string, StorefrontProfileField[]> = {
  company: ["intro_source", "products", "markets"],
  header: ["display_name"],
  stats: ["annual_output", "founded_year", "employees", "lead_time_days", "incoterms", "export_markets"],
  trade: ["ports", "incoterms", "lead_time_days", "annual_output", "payment_terms", "export_markets"],
  details: ["trade_name"],
  markets: ["export_markets"],
};
