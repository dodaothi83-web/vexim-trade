import type { Category, ProductAttributeField } from "@/lib/types";

const KEY = /^[a-z][a-z0-9_]{0,31}$/;

/** The CMS is the only source of attribute definitions. Never accept client-defined keys or choices. */
export function validateProductFields(raw: unknown): ProductAttributeField[] {
  if (!Array.isArray(raw) || raw.length > 16) throw new Error("Tối đa 16 trường thông số sản phẩm.");
  const fields: ProductAttributeField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") throw new Error("Trường thông số không hợp lệ.");
    const row = item as Record<string, unknown>;
    const key = String(row.key ?? "").trim();
    const label = String(row.label ?? "").trim();
    if (!KEY.test(key) || ["constructor", "prototype", "tostring"].includes(key) || !label || label.length > 80 || fields.some((f) => f.key === key))
      throw new Error("Mỗi thông số cần mã a-z duy nhất và tên tối đa 80 ký tự.");
    if (row.type !== "select" && row.type !== "text") throw new Error("Kiểu thông số không hợp lệ.");
    const options = row.type === "select" ? row.options : [];
    if (!Array.isArray(options) || options.length > 30 ||
        (row.type === "select" && options.length < 1) ||
        options.some((v) => typeof v !== "string" || !v.trim() || v.length > 100) ||
        new Set(options).size !== options.length) throw new Error("Lựa chọn không hợp lệ (tối đa 30 giá trị, không trùng).");
    const when = row.showWhen;
    if (when != null && (!when || typeof when !== "object" ||
      !fields.some((f) => f.key === (when as { key?: string }).key && f.type === "select" &&
        f.options.includes((when as { value?: string }).value ?? "")))) {
      throw new Error("Điều kiện hiển thị phải tham chiếu một lựa chọn đã khai báo phía trên.");
    }
    fields.push({ key, label, type: row.type, options: options as string[],
      filterable: row.type === "select" && row.filterable === true,
      ...(when ? { showWhen: { key: (when as { key: string }).key, value: (when as { value: string }).value } } : {}) });
  }
  return fields;
}

export function fieldsFor(category: Pick<Category, "product_fields"> | null | undefined): ProductAttributeField[] {
  try { return validateProductFields(category?.product_fields ?? []); } catch { return []; }
}

/* ------------------------------------------------------------------ *
 * Thông số do nhà cung cấp tự thêm
 *
 * Vexim không phải người hiểu thông số bằng chính nhà máy. Khi trường CMS chưa có
 * thông số NCC cần khai, NCC tự thêm; mục đó được lưu vào danh mục
 * (`supplier_product_fields`) để nhà cung cấp khác trong cùng nhóm hàng dùng lại.
 *
 * Giới hạn an toàn: số lượng nhỏ, nhãn ngắn, không liên hệ/quảng cáo, không trùng.
 * Thông số tự thêm KHÔNG tham gia bộ lọc buyer và KHÔNG tự hiện trên trang buyer;
 * Vexim xem khi duyệt và có thể nâng thành `product_fields` chính thức.
 * ------------------------------------------------------------------ */

export const SUPPLIER_ATTRIBUTE_FIELD_LIMIT = 12;
const SUPPLIER_OPTION_LIMIT = 20;
const SUPPLIER_LABEL_LIMIT = 48;
const SUPPLIER_OPTION_LENGTH = 60;

/** Nhãn thông số/value kiểu nhà máy: chữ, số, đơn vị; chặn link, email, số điện thoại, HTML. */
export function cleanSupplierAttributeText(raw: unknown, limit = SUPPLIER_LABEL_LIMIT): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  if (text.length < 2) return "";
  if (/[<>{}@]|https?:|www\.|\b[a-z0-9-]{2,}\.(?:com|vn|net|org|io|co|biz|info)\b|\+?\d[\d .()-]{7,}/i.test(text)) return "";
  return text;
}

/** Khoá ổn định từ nhãn tiếng Việt: "Độ ẩm" → "do_am". */
export function attributeKeyFromLabel(label: string): string {
  const ascii = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  const key = ascii.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
  return /^[a-z]/.test(key) ? key : `ts${key ? `_${key}` : ""}`.replace(/_+$/, "") || "ts";
}

/** Làm sạch danh sách thông số tự thêm đọc từ DB hoặc từ form (không tin client). */
export function sanitizeSupplierAttributePool(raw: unknown): ProductAttributeField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ProductAttributeField[] = [];
  for (const item of raw) {
    if (out.length >= SUPPLIER_ATTRIBUTE_FIELD_LIMIT) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = cleanSupplierAttributeText(row.label);
    if (!label) continue;
    const key = KEY.test(String(row.key ?? "")) ? String(row.key) : attributeKeyFromLabel(label);
    if (seen.has(key)) continue;
    const options = [...new Set((Array.isArray(row.options) ? row.options : [])
      .map((value) => cleanSupplierAttributeText(value, SUPPLIER_OPTION_LENGTH))
      .filter(Boolean))].slice(0, SUPPLIER_OPTION_LIMIT);
    seen.add(key);
    out.push({ key, label, type: options.length ? "select" : "text", options, supplier_added: true });
  }
  return out;
}

/** Gộp thông số tự thêm mới vào pool đã lưu: cùng khoá thì hợp nhất lựa chọn. */
export function mergeSupplierAttributePool(saved: unknown, incoming: unknown): ProductAttributeField[] {
  const merged = new Map<string, ProductAttributeField>();
  for (const field of sanitizeSupplierAttributePool(saved)) merged.set(field.key, field);
  for (const field of sanitizeSupplierAttributePool(incoming)) {
    const existing = merged.get(field.key);
    if (!existing) { merged.set(field.key, field); continue; }
    const options = [...new Set([...existing.options, ...field.options])].slice(0, SUPPLIER_OPTION_LIMIT);
    merged.set(field.key, { ...existing, options, type: options.length ? "select" : "text" });
  }
  return [...merged.values()].slice(0, SUPPLIER_ATTRIBUTE_FIELD_LIMIT);
}

/** Dấu vân tay ổn định của pool (JSONB đổi thứ tự khoá, nên không so sánh bằng JSON.stringify). */
export function supplierAttributePoolSignature(pool: ProductAttributeField[]): string {
  return sanitizeSupplierAttributePool(pool)
    .map((field) => [field.key, field.label, field.type, [...field.options].sort().join("|")].join("~"))
    .sort().join(";");
}

/** Thông số tự thêm đang có của một danh mục. */
export function supplierFieldsFor(
  category: Pick<Category, "supplier_product_fields"> | null | undefined,
): ProductAttributeField[] {
  return sanitizeSupplierAttributePool(category?.supplier_product_fields ?? []);
}

/** Gộp trường CMS với thông số NCC tự thêm; NCC thấy cả hai, buyer chỉ thấy trường CMS. */
export function mergeAttributeFields(
  official: ProductAttributeField[], pool: ProductAttributeField[],
): ProductAttributeField[] {
  const merged = official.map((field) => ({ ...field, options: [...field.options] }));
  for (const extra of pool) {
    const hit = merged.find((field) => field.key === extra.key);
    if (hit) {
      if (hit.type === "select") hit.options = [...new Set([...hit.options, ...extra.options])].slice(0, SUPPLIER_OPTION_LIMIT);
      continue;
    }
    merged.push({ ...extra, filterable: false });
  }
  return merged;
}

/** Trường NCC thực sự nhìn thấy khi khai một sản phẩm thuộc danh mục này. */
export function effectiveFieldsFor(
  category: Pick<Category, "product_fields" | "supplier_product_fields"> | null | undefined,
): ProductAttributeField[] {
  return mergeAttributeFields(fieldsFor(category), supplierFieldsFor(category));
}

export function attributesFromForm(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of form) if (name.startsWith("attribute:") && KEY.test(name.slice(10)) && typeof value === "string") {
    values[name.slice(10)] = value;
  }
  return values;
}

/** Preserve unrelated historical specs, but never trust edits to undeclared keys or select options. */
export function saveProductAttributes(category: Pick<Category, "product_fields" | "supplier_product_fields"> | null | undefined,
  raw: unknown, previous: Record<string, unknown> = {}): Record<string, unknown> {
  // Giá trị hợp lệ gồm lựa chọn CMS và lựa chọn do NCC khác đã thêm vào nhóm hàng.
  const fields = effectiveFieldsFor(category);
  const submitted = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const next = { ...previous };
  for (const field of fields) {
    delete next[field.key];
    const value = submitted[field.key];
    if (value == null || value === "") continue;
    if (typeof value !== "string" || value.length > 200 ||
        field.type === "select" && !field.options.includes(value)) throw new Error(`Giá trị không hợp lệ: ${field.label}.`);
    if (field.showWhen && next[field.showWhen.key] !== field.showWhen.value) continue;
    if (value.trim()) next[field.key] = value.trim();
  }
  return next;
}

/** No buyer filters/labels from stale or forged values. */
export function publicProductAttributes(category: Pick<Category, "product_fields"> | null | undefined,
  specs: Record<string, unknown> | null | undefined): Record<string, string> {
  const fields = fieldsFor(category);
  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = specs?.[field.key];
    if (typeof value !== "string" || !value || value.length > 200 ||
        (field.type === "select" && !field.options.includes(value)) ||
        (field.showWhen && result[field.showWhen.key] !== field.showWhen.value)) continue;
    result[field.key] = value;
  }
  return result;
}
