import type { SupplierInput, SupplierType } from "@/lib/types";

const TYPES: SupplierType[] = ["manufacturer", "trading", "cooperative"];
const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
const positiveInt = (form: FormData, key: string, max: number): number | null => {
  const raw = text(form, key, 12);
  if (!raw) return null;
  if (!/^\d+$/.test(raw) || Number(raw) > max) throw new Error(`Giá trị ${key} không hợp lệ.`);
  return Number(raw);
};
const list = (form: FormData, key: string) => text(form, key, 800).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);

/** Same public-page fields at initial signup and when Vexim requests corrections. No trust in status/owner. */
export function parseSupplierProfile(form: FormData): { patch: Partial<SupplierInput>; bank: string; requested: (2 | 3)[] } {
  const name = text(form, "name", 180);
  const contact = text(form, "contact_name", 120);
  const phone = text(form, "phone", 40);
  const products = text(form, "products", 1000);
  const tax = text(form, "tax_number", 32);
  const bank = text(form, "bank_account_number", 34);
  const type = text(form, "supplier_type", 32) as SupplierType;
  if (name.length < 3 || !contact || !phone || !products) throw new Error("Cần tên doanh nghiệp, người liên hệ, số điện thoại và mặt hàng chính.");
  if (!TYPES.includes(type)) throw new Error("Chọn loại hình nhà máy, thương nhân hoặc hợp tác xã.");
  // The checkbox is disabled for traders in the shared signup/correction form; reject forged submissions too.
  if (type === "trading" && form.get("request:2") === "yes")
    throw new Error("Thương nhân không thể yêu cầu thăm nhà máy qua form đăng ký. Bạn vẫn có thể chọn Lịch sử giao hàng.");
  if (!/^[0-9]{1,32}$/.test(tax) || !/^[0-9]{1,34}$/.test(bank)) throw new Error("Mã số thuế và số tài khoản phải là chữ số.");
  if (text(form, "consent", 8) !== "yes") throw new Error("Vui lòng đồng ý gửi hồ sơ cho Vexim kiểm tra.");
  const website = text(form, "website", 250);
  if (website && !/^https?:\/\/[^\s.]+(?:\.[^\s.]+)+(?:[:/?#][^\s]*)?$/i.test(website)) throw new Error("Website phải là URL http(s) hợp lệ.");
  return {
    patch: {
      name, trade_name: text(form, "trade_name", 180) || null,
      display_name: text(form, "display_name", 180) || null,
      contact_name: contact, contact_title: text(form, "contact_title", 100) || null,
      phone, zalo: text(form, "zalo", 40) || null,
      products, province: text(form, "province", 100) || null,
      country: text(form, "country", 100) || "Vietnam",
      address: text(form, "address", 250) || null, tax_id: tax,
      supplier_type: type, role: type === "manufacturer" ? "manufacturer" : "trader",
      website: website || null, markets: text(form, "markets", 800) || null,
      summary_i18n: { en: text(form, "summary_en", 1500) },
      founded_year: positiveInt(form, "founded_year", new Date().getFullYear()),
      employees: positiveInt(form, "employees", 1000000),
      capacity_per_month: text(form, "capacity_per_month", 180) || null,
      moq_text: text(form, "moq_text", 180) || null,
      lead_time_days: positiveInt(form, "lead_time_days", 3650),
      payment_terms: text(form, "payment_terms", 200) || null,
      ports: list(form, "ports"), incoterms: list(form, "incoterms"), export_markets: list(form, "export_markets"),
      private_label: form.get("private_label") === "yes",
    },
    bank,
    requested: ([2, 3] as const).filter((level) => form.get(`request:${level}`) === "yes"),
  };
}
