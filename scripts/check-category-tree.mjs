#!/usr/bin/env node
// node scripts/check-category-tree.mjs
//
// Tách danh mục thành nhóm lớn › nhóm nhỏ (kiểu Shopee) — phần nền, trước khi chuyển dữ liệu:
//   1. Phạm vi NCC: được bán nhóm lớn thì được bán các nhóm nhỏ của nó (không ngược lại).
//   2. Chỉ danh mục LÁ gắn được cho sản phẩm, kiểm ở server (NCC lưu/gửi duyệt, CRM duyệt/sửa,
//      CRM tạo sản phẩm). Sản phẩm cũ đang ở nhóm lớn vẫn lưu được với đúng danh mục đó.
//   3. Nhóm nhỏ mới tạo trong CRM chép cấu hình nhóm lớn (thông số, grade, đơn vị, MOQ, mùa vụ);
//      cây chỉ 2 cấp.
//   4. Logic theo slug (grade, đơn vị, mẫu quy cách, chip tìm kiếm, nhận diện ngành) hiểu
//      slug nhóm nhỏ: điều thô/điều rang vẫn có grade W và đơn vị kg, hoa hồi không nhận
//      grade quế, trà không nhận grade Robusta.
//   5. Ô chọn ngành mới thay các <select> ở cổng NCC và CRM.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const cache = new Map();
function resolveFile(from, spec) {
  const base = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(from), spec);
  for (const file of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  throw new Error(`Unexpected import ${spec} from ${path.relative(root, from)}`);
}
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, console, Intl, Date, structuredClone,
    require: (spec) => (spec.startsWith(".") || spec.startsWith("@/") ? load(resolveFile(file, spec)) : (() => { throw new Error(`Unexpected package ${spec}`); })()),
  });
  return mod.exports;
}
const lib = (p) => load(path.join(root, p));
const src = (p) => fs.readFileSync(path.join(root, p), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

const tree = lib("lib/categories/tree.ts");
const proposals = lib("lib/supplier-portal/category-proposals.ts");
const assignment = lib("lib/public/category-assignment.ts");
const grades = lib("lib/products/grade-pricing.ts");
const gradeResolution = lib("lib/public/grade-resolution.ts");
const selection = lib("lib/public/product-selection.ts");
const units = lib("lib/public/price-units.ts");
const tags = lib("lib/rfq/grade-tags.ts");
const specTemplate = lib("lib/products/spec-template.ts");

// Danh mục production (slug thật) + 6 nhóm nhỏ dự kiến.
const cat = (id, slug, en, vi, parent_id = null, extra = {}) => ({
  id, slug, parent_id, name_i18n: { en, vi }, intro_i18n: {}, status: "published", is_published: true, sort_order: 0, ...extra,
});
const base = [
  cat("c1", "cashew-kernels", "Cashew Kernels", "Hạt điều", null, { price_unit: "kg", supplier_grade_options: ["W240 roasted"] }),
  cat("c2", "pepper", "Pepper", "Hồ tiêu"),
  cat("c3", "cinnamon-star-anise", "Cinnamon & Star Anise", "Quế và hồi"),
  cat("c4", "coffee-tea-specialty-beverages", "Coffee, Tea & Specialty Beverages", "Cà phê, Trà & Đồ uống"),
  cat("c5", "dried-fruits", "Dried Fruits", "Trái cây sấy"),
  cat("c6", "rice-grain-products", "Rice & Grain Products", "Gạo"),
];
const split = [
  ...base,
  cat("k1", "raw-cashew-kernels", "Raw Cashew Kernels", "Nhân điều thô", "c1"),
  cat("k2", "roasted-cashews", "Roasted & Flavored Cashews", "Hạt điều rang & tẩm vị", "c1"),
  cat("k3", "cassia-cinnamon", "Cassia Cinnamon", "Quế", "c3"),
  cat("k4", "star-anise", "Star Anise", "Hoa hồi", "c3"),
  cat("k5", "coffee", "Coffee", "Cà phê", "c4"),
  cat("k6", "tea", "Tea", "Trà", "c4"),
  cat("d1", "draft-child", "Draft child", "Nháp", "c2", { status: "draft", is_published: false }),
];

// 1. Cây: lá, phạm vi, đường dẫn.
assert.equal(tree.isLeafCategory(split[0], split), false, "nhóm lớn có nhóm nhỏ đang mở không phải lá");
assert.equal(tree.isLeafCategory(split.find((c) => c.slug === "pepper"), split), true, "nhóm nhỏ nháp không làm nhóm lớn mất tư cách lá");
assert.equal(tree.isLeafCategory(base[0], base), true, "chưa tách thì nhóm lớn vẫn là lá");
assert.deepEqual(plain(tree.expandCategoryScope(["cashew-kernels"], split)).sort(), ["cashew-kernels", "raw-cashew-kernels", "roasted-cashews"]);
assert.deepEqual(plain(tree.expandCategoryScope(["tea"], split)), ["tea"], "nhóm nhỏ không mở ngược lên nhóm lớn");
assert.deepEqual(plain(tree.categoryPath(split.find((c) => c.slug === "tea"), split).map((c) => c.slug)), ["coffee-tea-specialty-beverages", "tea"]);

// 2. Danh sách cho NCC: lá, cha, phạm vi mở rộng, chặn chọn nhóm lớn ở server.
const options = proposals.categoryProposalOptions(split);
const opt = (slug) => options.find((o) => o.slug === slug);
assert.equal(opt("cashew-kernels").leaf, false);
assert.equal(opt("raw-cashew-kernels").leaf, true);
assert.equal(opt("raw-cashew-kernels").parent_slug, "cashew-kernels");
assert.equal(opt("raw-cashew-kernels").group, "Hạt điều");
assert.equal(opt("star-anise").label_en, "Star Anise");
assert.equal(opt("draft-child"), undefined, "danh mục nháp không vào ô chọn");
const supplier = { requested_category_slugs: ["cashew-kernels", "pepper"], categories_reviewed_at: null };
assert.deepEqual(plain(proposals.allowedSupplierCategories(supplier, options, []).map((o) => o.slug)).sort(),
  ["cashew-kernels", "pepper", "raw-cashew-kernels", "roasted-cashews"], "NCC hạt điều được bán cả 2 nhóm nhỏ của hạt điều");
const form = (slug) => { const f = new FormData(); f.set("supplier_category_proposal", slug); return f; };
assert.equal(proposals.parseProductCategoryProposal(form("roasted-cashews"), options), "roasted-cashews");
assert.throws(() => proposals.parseProductCategoryProposal(form("cashew-kernels"), options, { needLeaf: "LEAF" }), /LEAF/,
  "nhóm lớn đã chia nhóm nhỏ không chọn được cho sản phẩm mới");
assert.equal(proposals.parseProductCategoryProposal(form("cashew-kernels"), options, { current: "cashew-kernels" }), "cashew-kernels",
  "sản phẩm cũ đang ở nhóm lớn vẫn lưu được");
assert.throws(() => proposals.parseProductCategoryProposal(form("nope"), options, { invalid: "BAD" }), /BAD/);
assert.equal(proposals.isProductCategoryChoice("tea", options), true);
assert.equal(proposals.isProductCategoryChoice("coffee-tea-specialty-beverages", options), false);
assert.equal(proposals.isProductCategoryChoice("pepper", proposals.categoryProposalOptions(base)), true);

// 2b. Phạm vi kinh doanh: trần 5 chỉ đếm NGÀNH CHÍNH; nhóm con đi theo ngành cha, không bị đếm.
//     (Ca Tinimex: lưu 4 ngành chính, trang từng hiện 7/5 và không lưu được.)
const tinimex = { requested_category_slugs: ["cashew-kernels", "pepper", "cinnamon-star-anise", "dried-fruits"], categories_reviewed_at: null };
assert.deepEqual(plain(proposals.registeredSupplierCategorySlugs(tinimex, options, [])), tinimex.requested_category_slugs,
  "trang phạm vi nhận đúng 4 ngành đã lưu, không bung nhóm con");
assert.deepEqual(plain(proposals.registrationCategoryOptions(options).map((o) => o.slug)).sort(),
  ["cashew-kernels", "cinnamon-star-anise", "coffee-tea-specialty-beverages", "dried-fruits", "pepper", "rice-grain-products"],
  "dòng để tích chỉ là ngành chính");
assert.ok(proposals.registrationCategoryOptions(options, ["tea"]).some((o) => o.slug === "tea"), "hồ sơ cũ lưu riêng nhóm con vẫn giữ được");
const scopeForm = (slugs) => { const f = new FormData(); for (const slug of slugs) f.append("requested_category_slugs", slug); return f; };
const expanded = ["cashew-kernels", "raw-cashew-kernels", "roasted-cashews", "pepper", "cinnamon-star-anise", "cassia-cinnamon", "star-anise", "dried-fruits"];
assert.deepEqual(plain(proposals.parseSupplierCategoryProposals(scopeForm(expanded), options).requested_category_slugs),
  tinimex.requested_category_slugs, "trang cũ gửi cả nhóm con (8 mục) vẫn lưu được: nhóm con kèm ngành cha bị bỏ trước khi đếm");
const fiveMain = ["cashew-kernels", "pepper", "cinnamon-star-anise", "coffee-tea-specialty-beverages", "dried-fruits"];
assert.equal(proposals.parseSupplierCategoryProposals(scopeForm(fiveMain), options).requested_category_slugs.length, 5);
assert.throws(() => proposals.parseSupplierCategoryProposals(scopeForm([...fiveMain, "rice-grain-products"]), options), /1-5/,
  "6 ngành chính vẫn bị chặn");
assert.deepEqual(plain(proposals.supplierCategoryScope(["cashew-kernels"], options)).sort(), ["cashew-kernels", "raw-cashew-kernels", "roasted-cashews"],
  "sản phẩm ở nhóm con nằm trong phạm vi khi chọn ngành cha");
assert.match(src("app/supplier/portal/categories/actions.ts"), /supplierCategoryScope\(selected, options\)/,
  "lưu phạm vi: sản phẩm ở nhóm con không bị coi là ngoài phạm vi");
assert.match(src("app/supplier/portal/categories/page.tsx"), /registeredSupplierCategorySlugs/, "trang phạm vi không đếm nhóm con");

// 3. Nhóm nhỏ chép cấu hình nhóm lớn khi chưa khai.
const parent = { product_fields: [{ key: "grade", label: "Grade", type: "select", options: ["W320"] }], supplier_product_fields: [],
  supplier_grade_options: ["W240 roasted"], price_unit: "kg", moq_units: ["kg", "container"], harvest: { months: [2, 3] } };
const inherited = tree.inheritParentCategoryConfig({ slug: "x", product_fields: [] }, parent);
assert.deepEqual(plain(inherited.product_fields), plain(parent.product_fields));
assert.notEqual(inherited.product_fields, parent.product_fields, "chép bản sao, không dùng chung object");
assert.equal(inherited.price_unit, "kg");
assert.deepEqual(plain(inherited.supplier_grade_options), ["W240 roasted"]);
assert.deepEqual(plain(inherited.moq_units), ["kg", "container"]);
assert.deepEqual(plain(inherited.harvest), { months: [2, 3] });
assert.equal(tree.inheritParentCategoryConfig({ price_unit: "mt" }, parent).price_unit, "mt", "giá trị đã khai thắng giá trị chép");

// 4. Nhận diện ngành theo slug thật, trước và sau khi tách.
const assign = (name, cats) => assignment.assignProductCategory({ name, spec: null, description: null, category: null }, cats)?.slug ?? null;
assert.equal(assign("Hoa hồi Lạng Sơn", base), "cinnamon-star-anise", "chưa tách: hoa hồi vào Quế và hồi");
assert.equal(assign("Hoa hồi Lạng Sơn", split), "star-anise", "đã tách: hoa hồi vào nhóm nhỏ Hoa hồi");
assert.equal(assign("Quế ống Yên Bái", split), "cassia-cinnamon");
assert.equal(assign("Cashew kernels W320", split), "raw-cashew-kernels");
assert.equal(assign("Honey roasted cashew W240", split), "roasted-cashews", "điều rang thắng dù tên có grade W");
assert.equal(assign("Hạt điều rang muối", split), "roasted-cashews");
assert.equal(assign("Hạt điều Bình Phước", split), "cashew-kernels", "chỉ nhắc chung thì về nhóm lớn (ô chọn bắt chọn nhóm nhỏ)");
assert.equal(assign("Cashew kernels W320", base), "cashew-kernels", "chưa tách vẫn như cũ");
assert.equal(assign("Robusta coffee beans S18", split), "coffee");
assert.equal(assign("Trà xanh Thái Nguyên", split), "tea");
assert.equal(assign("Black pepper 550 g/l", split), "pepper");
assert.equal(assign("Jasmine rice 5% broken", split), "rice-grain-products");
assert.equal(assign("Freeze dried durian", split), "dried-fruits");
assert.equal(assign("Coffee and tea gift set", split), null, "tên lẫn hai nhóm nhỏ thì không tự gán");
const toChoices = (cats) => cats.map((c) => ({ id: c.id, slug: c.slug, name_i18n: c.name_i18n, parent_id: c.parent_id }));
assert.deepEqual(plain(assignment.suggestProductCategories("Coffee and tea gift set", toChoices(split)).map((c) => c.slug)).sort(), ["coffee", "tea"],
  "ô chọn vẫn gợi ý cả hai để NCC chọn");

// 5. Grade, đơn vị, mẫu quy cách, chip tìm kiếm theo slug nhóm nhỏ.
const g = (slug) => plain(grades.standardGradesForCategory({ slug }));
assert.ok(g("raw-cashew-kernels").includes("W320"));
assert.ok(g("roasted-cashews").includes("W320"));
assert.deepEqual(g("star-anise"), ["Star anise", "Star anise oil"], "hoa hồi không nhận grade quế");
assert.deepEqual(g("cassia-cinnamon"), ["Cassia whole", "Cassia split", "Cassia powder"], "quế không nhận grade hồi");
assert.equal(g("cinnamon-star-anise").length, 5, "danh mục gộp giữ cả hai");
assert.equal(gradeResolution.gradeFromName("Cashew W240", null, "raw-cashew-kernels"), "W240");
assert.equal(selection.productGrade("Roasted cashew W320", null, "roasted-cashews"), "W320");
assert.equal(units.displayUnitsForCategory("roasted-cashews").primary, "kg");
assert.equal(units.displayUnitsForCategory("raw-cashew-kernels").primary, "kg");
assert.equal(units.displayUnitsForCategory("tea").primary, "mt");
assert.equal(units.displayUnitsForCategory("star-anise").primary, "mt");
const mixed = ["Robusta G1 S18", "Black Tea OP", "W320"];
assert.deepEqual(plain(tags.relevantGradeTags(mixed, { categorySlug: "tea", context: "" })), ["Black Tea OP", "W320"], "trà không gợi ý grade cà phê chép từ nhóm lớn");
assert.deepEqual(plain(tags.relevantGradeTags(mixed, { categorySlug: "coffee-tea-specialty-beverages", context: "" })), mixed, "nhóm lớn như cũ");
assert.match(specTemplate.specTemplateFor("roasted-cashews", "vi").example, /rang muối/);
assert.match(specTemplate.specTemplateFor("tea", "vi").example, /trà xanh/i);
assert.match(specTemplate.specTemplateFor("raw-cashew-kernels", "vi").example, /AFI/);
assert.match(specTemplate.specTemplateFor("star-anise", "en").example, /star anise/);

// 6. Server dùng các cổng trên; giao diện dùng ô chọn mới.
const supplierActions = src("app/supplier/portal/product-actions.ts");
assert.match(supplierActions, /parseProductCategoryProposal\(form, options, \{[\s\S]*?current:[\s\S]*?needLeaf: a\.categoryNeedLeaf/);
assert.match(supplierActions, /!isProductCategoryChoice\(proposal, options\)\)\s*return \{ ok: false, message: a\.categoryNeedLeaf \}/);
const reviewActions = src("app/crm/products/[slug]/edit/review-actions.ts");
assert.equal((reviewActions.match(/isProductCategoryChoice\(/g) ?? []).length, 2, "duyệt và sửa danh mục đều chặn nhóm lớn");
const crmActions = src("app/actions.ts");
assert.match(crmActions, /createInput = inheritParentCategoryConfig\(createInput, parent\)/);
assert.match(crmActions, /function categoryTreeError/);
assert.match(crmActions, /isLeafCategory\(requested, categories\)/);
for (const file of ["app/supplier/portal/products/product-editor.tsx", "components/product-form.tsx",
  "app/crm/products/[slug]/edit/review-controls.tsx", "app/crm/products/[slug]/edit/category-correction-controls.tsx"]) {
  const code = src(file);
  assert.match(code, /<CategoryPicker/, `${file} dùng ô chọn ngành mới`);
  assert.doesNotMatch(code, /`\$\{c(?:ategory)?\.group\} \/ /, `${file} không còn <select> "nhóm / tên"`);
}
const picker = src("components/category-picker.tsx");
assert.match(picker, /event\.key === "Enter"\) \{ event\.preventDefault\(\)/, "Enter trong ô tìm không gửi form");
assert.match(picker, /md:grid-cols-2/, "máy tính: 2 cột");
assert.match(picker, /hidden md:block/, "điện thoại: đi từng cấp");
for (const lang of ["en", "vi"]) assert.ok(src("lib/i18n/portal/product-editor.ts").includes("categoryNeedLeaf"), lang);

console.log("✅ Category tree: phạm vi mở xuống nhóm nhỏ, chỉ chọn danh mục lá (server + ô chọn mới), nhóm nhỏ chép cấu hình, logic slug hiểu nhóm nhỏ.");
