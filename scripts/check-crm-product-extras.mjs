// node scripts/check-crm-product-extras.mjs
//
// Hai form sửa sản phẩm (cổng nhà cung cấp và CRM) phải sửa được **cùng một bộ dữ liệu**
// đóng gói: đóng gói có cấu trúc (loại kiện, khối lượng, số đơn vị/thùng, kích thước) là
// thứ trang người mua hiển thị thay cho dòng "Bao bì / đóng gói" tự do. Trước đây CRM chỉ
// sửa được dòng tự do, nên đổi bao bì sang 50kg mà trang người mua vẫn hiện "bao 25 kg".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

/* ---------------- 1. CRM form có đủ ô như form nhà cung cấp ---------------- */

const crmForm = read("components/product-form.tsx");
for (const key of ["package_type", "package_weight_kg", "package_size", "units_per_carton", "keywords", "sample_price_usd"]) {
  assert.match(crmForm, new RegExp(`value=\\{v\\("${key}"\\)\\}`), `CRM thiếu ô ${key}`);
  assert.match(crmForm, new RegExp(`set\\("${key}", `), `CRM không ghi được ${key}`);
  assert.match(crmForm, new RegExp(`${key}: `), `CRM không nạp giá trị đã lưu của ${key}`);
}
assert.match(crmForm, /Đóng gói người mua thấy/, "CRM nói rõ khối đóng gói nào người mua thấy");
assert.match(crmForm, /Người mua chỉ thấy dòng này khi chưa khai đóng gói có cấu trúc/,
  "CRM nói rõ dòng Bao bì tự do chỉ dùng khi chưa khai cấu trúc");
const supplierForm = read("app/supplier/portal/products/product-editor.tsx");
for (const key of ["package_type", "package_weight_kg", "package_size", "units_per_carton"]) {
  assert.match(supplierForm, new RegExp(`name="${key}"`), `form nhà cung cấp thiếu ${key}`);
}
assert.match(crmForm, /Kích thước kiện \(cm\)/, "Nhãn kích thước giống form nhà cung cấp");
assert.match(supplierForm, /Kích thước kiện \(cm\)/, "Form nhà cung cấp vẫn giữ nhãn kích thước");

/* ---------------- 2. Server action lưu được các cột đó ---------------- */

const category = { id: "cat", slug: "pepper", name_i18n: { en: "Pepper" }, status: "published", is_published: true };
const baseProduct = {
  id: "p", supplier_id: "s", name: "Hạt tiêu đen", spec: "570 g/l", description: null, description_detail: null,
  category: "pepper", reviewed_category_slug: "pepper", supplier_originated: true, supplier_review_status: "approved",
  ready_for_buyer: true, ref_price: 5, ref_price_max: 6, unit: "MT", currency: "USD", moq: "1 MT", moq_qty: null,
  moq_unit: null, incoterm: "FOB", price_valid_until: "2030-01-01", specs: {}, packaging: "Bao bì 25kg",
  package_type: "bao", package_weight_kg: 25, package_size: "60x30x60", units_per_carton: null,
  keywords: ["black pepper"], sample_price_usd: 0,
};
let product = { ...baseProduct };
let writes = [];
let created = null;
const store = {
  getProduct: async () => product,
  listCategories: async () => [category],
  getCategoryBySlug: async () => category,
  getSupplier: async () => ({ id: "s", categories_reviewed_at: "2026-01-01", requested_category_slugs: ["pepper"] }),
  listSupplierCategories: async () => [],
  listProductsBySupplier: async () => [product],
  updateSupplierProductIfState: async (_id, _sid, _expected, input) => {
    writes.push(input);
    product = { ...product, ...input };
    return product;
  },
  createProduct: async (input) => { created = input; return { ...input, id: "new" }; },
};
const extrasModule = {};
vm.runInNewContext(
  ts.transpileModule(read("lib/products/product-extras.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: extrasModule, Intl, Number, String, Array, Object, Set, Map, Math, JSON, Boolean },
);
const mocks = {
  "@/lib/products/product-extras": extrasModule,
  "next/cache": { revalidatePath() {} },
  "@/lib/crm/badges": { refreshCrmBadges() {} },
  "@/lib/db": { getStore: () => store },
  "@/lib/auth/session": { guard: async () => null },
  "@/lib/product-attributes": { saveProductAttributes: (_cat, _raw, previous = {}) => previous },
  "@/lib/products/product-description": { sanitizeProductDescriptionForSave: (s) => s, sanitizeProductDescriptionHtml: (s) => s },
  "@/lib/products/grade-pricing": { applyLeadTimeToSpecs: (s) => s },
  "@/lib/public/category-assignment": { assignProductCategory: () => category, assignSupplierCategories: () => ({ slugs: ["pepper"], ids: [] }) },
  "@/lib/public/display-name": { isPlaceholderDisplayName: () => false },
};
const exports = {};
const code = ts.transpileModule(read("app/actions.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, console, Date, process, require: (key) => mocks[key] ?? {} });

const payload = {
  name: baseProduct.name, spec: baseProduct.spec, supplier_id: "s", category: "pepper",
  packaging: "Bao bì 50kg", package_type: "bao giấy", package_weight_kg: "50", package_size: "65 × 40 × 40",
  units_per_carton: "20", keywords: "black pepper, pepper 570, tiêu đen", sample_price_usd: "5",
};
const saved = await exports.updateProductAction("p", payload);
assert.equal(saved.ok, true, saved.message);
assert.equal(writes.length, 1);
const patch = writes[0];
assert.equal(patch.packaging, "Bao bì 50kg");
assert.equal(patch.package_weight_kg, 50, "CRM lưu được khối lượng kiện mới");
assert.equal(patch.package_type, "bao giấy");
assert.equal(patch.package_size, "65 × 40 × 40", "CRM lưu được kích thước kiện");
assert.equal(patch.units_per_carton, 20);
assert.equal(patch.sample_price_usd, 5);
assert.equal([...patch.keywords].join(", "), "black pepper, pepper 570, tieu den",
  "Từ khoá bỏ dấu, chữ thường, tối đa 3 — cùng quy tắc với form nhà cung cấp");

/* ---------------- 3. Payload thiếu ô thì giữ giá trị đã lưu ---------------- */

writes = [];
const partial = await exports.updateProductAction("p", { name: baseProduct.name, spec: baseProduct.spec, supplier_id: "s", category: "pepper" });
assert.equal(partial.ok, true, partial.message);
assert.equal(writes[0].package_weight_kg, 50, "Không gửi ô đóng gói thì không xoá dữ liệu đã lưu");
assert.equal(writes[0].package_size, "65 × 40 × 40");
assert.equal([...writes[0].keywords].join(", "), "black pepper, pepper 570, tieu den");

/* ---------------- 4. Tạo mới cũng lưu đóng gói ---------------- */

await exports.createProductAction({
  name: "Hạt tiêu đen", spec: "570 g/l", supplier_id: "s", category: "pepper",
  package_type: "bao", package_weight_kg: "50", package_size: "60 × 40 × 40",
});
assert.ok(created, "Sản phẩm mới được tạo");
assert.equal(created.package_weight_kg, 50, "Tạo mới từ CRM lưu được khối lượng kiện");

/* ---------------- 5. Người mua thấy khối có cấu trúc, không phải dòng tự do ---------------- */

const display = {};
const displayCode = ts.transpileModule(read("lib/public/product-extras-display.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(displayCode, { exports: display, Intl, Number });
const summary = display.packagingSummaryEnglish({ package_type: "bao", package_weight_kg: 50, package_size: "65 × 40 × 40" });
assert.match(summary, /50 kg/, "Người mua thấy khối lượng kiện vừa sửa");
assert.doesNotMatch(summary, /25/, "Khối lượng cũ không còn trong câu người mua thấy");
const pdp = read("app/(public)/products/[slug]/[productId]/page.tsx");
assert.match(pdp, /structuredPackaging \|\| detailedPackaging \|\| enPackaging/,
  "Trang sản phẩm ưu tiên đóng gói có cấu trúc, chỉ lùi về dòng tự do khi chưa khai");

console.log("✅ Đóng gói CRM ↔ cổng nhà cung cấp: cùng ô, cùng cách lưu, người mua thấy bản có cấu trúc.");
