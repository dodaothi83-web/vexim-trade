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

export function attributesFromForm(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of form) if (name.startsWith("attribute:") && KEY.test(name.slice(10)) && typeof value === "string") {
    values[name.slice(10)] = value;
  }
  return values;
}

/** Preserve unrelated historical specs, but never trust edits to undeclared keys or select options. */
export function saveProductAttributes(category: Pick<Category, "product_fields"> | null | undefined,
  raw: unknown, previous: Record<string, unknown> = {}): Record<string, unknown> {
  const fields = fieldsFor(category);
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
