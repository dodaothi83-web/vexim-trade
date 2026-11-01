#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-supplier-grade-options.mjs
// Grade do nhà cung cấp tự thêm cho nhóm hàng: nhập ngay trong ô chọn grade, lưu ở cấp
// danh mục nên mọi sản phẩm cùng danh mục dùng lại được, không ghi đè danh sách chuẩn.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

import * as priceUnits from "../lib/public/price-units.ts";
import * as gradeResolution from "../lib/public/grade-resolution.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function compile(path, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: (key) => {
      if (!(key in mocks)) throw new Error(`${path}: unexpected import ${key}`);
      return mocks[key];
    },
    process, console, Date, Intl,
  });
  return mod.exports;
}

const gradePricing = compile("../lib/products/grade-pricing.ts", {
  "@/lib/public/price-units": priceUnits,
  "@/lib/public/grade-resolution": gradeResolution,
});

/* ---------------- 1. Làm sạch grade tự nhập ---------------- */

assert.equal(gradePricing.cleanSupplierGrade("  600   g/L "), "600 g/L", "gộp khoảng trắng và cắt hai đầu");
assert.equal(gradePricing.cleanSupplierGrade("W240 hàng rang"), "W240 hàng rang", "giữ grade có dấu tiếng Việt");
assert.equal(gradePricing.cleanSupplierGrade("a"), "", "quá ngắn thì bỏ");
assert.equal(gradePricing.cleanSupplierGrade("   "), "", "chuỗi rỗng thì bỏ");
assert.equal(gradePricing.cleanSupplierGrade("xem veximtrade.com"), "", "chặn tên miền");
assert.equal(gradePricing.cleanSupplierGrade("gọi 0912 345 678"), "", "chặn số điện thoại");
assert.equal(gradePricing.cleanSupplierGrade("liên hệ sales@veximtrade.com"), "", "chặn email");
assert.equal(gradePricing.cleanSupplierGrade("<b>W320</b>"), "", "chặn HTML");
assert.equal(gradePricing.cleanSupplierGrade("x".repeat(80)).length, 40, "cắt còn 40 ký tự");

/* ---------------- 2. Gộp vào pool của danh mục ---------------- */

const merged = gradePricing.mergeSupplierGradeOptions(["600 g/L"], ["600 g/L", "W240 hàng rang"]);
assert.deepEqual([...merged], ["600 g/L", "W240 hàng rang"], "bỏ trùng theo gradeKey, giữ thứ tự thêm trước");

const caseInsensitive = gradePricing.mergeSupplierGradeOptions(["600 g/L"], ["600 G/L"]);
assert.deepEqual([...caseInsensitive], ["600 g/L"], "khác hoa thường vẫn là cùng một grade");

const capped = gradePricing.mergeSupplierGradeOptions(
  Array.from({ length: 20 }, (_, index) => `Grade ${index + 1}`), []);
assert.equal(capped.length, gradePricing.SUPPLIER_GRADE_LIMIT, "chặn trần số grade tự thêm");

assert.deepEqual([...gradePricing.supplierGradeOptions({ supplier_grade_options: null })], [], "cột rỗng hoặc null vẫn an toàn");
assert.deepEqual([...gradePricing.supplierGradeOptions({ supplier_grade_options: [123, "", " 600 g/L "] })],
  ["600 g/L"], "bỏ giá trị rác trong cột jsonb");

/* ---------------- 3. Danh sách grade của danh mục ---------------- */

const pepperBase = gradePricing.standardGradesForCategory({ slug: "pepper" });
const pepperWithSupplier = gradePricing.standardGradesForCategory({
  slug: "pepper", supplier_grade_options: ["600 g/L", "White pepper"],
});
assert.deepEqual([...pepperWithSupplier], [...pepperBase, "600 g/L"],
  "grade NCC thêm đứng cuối và không lặp lại grade chuẩn");
assert.ok(pepperBase.includes("580 g/L"), "grade chuẩn của Vexim vẫn nguyên");

/* ---------------- 4. Đường lưu: cấp danh mục, có kiểm quyền và nhật ký ---------------- */

const migration = read("../supabase/migrations/20261102_category_supplier_grade_options.sql");
assert.match(migration, /alter table public\.categories\s+add column if not exists supplier_grade_options jsonb not null default '\[\]'::jsonb/,
  "migration phải thêm cột supplier_grade_options cho categories");
assert.match(migration, /comment on column public\.categories\.supplier_grade_options/,
  "migration phải ghi chú cột để người vận hành hiểu nguồn gốc");

const actions = read("../app/supplier/portal/product-actions.ts");
assert.match(actions, /export async function addSupplierGradeOptionAction\(/, "phải có server action thêm grade");
assert.match(actions, /const access = await approvedAccess\(\);/, "chỉ nhà cung cấp đã duyệt được thêm grade");
assert.match(actions, /allowedSupplierCategories\(access\.supplier, categoryProposalOptions\(published\), linked\)/,
  "chỉ nhóm hàng trong phạm vi đăng bán của chính nhà cung cấp");
assert.match(actions, /cleanSupplierGrade\(input\?\.grade\)/, "grade do client gửi lên phải làm sạch lại ở máy chủ");
assert.match(actions, /await store\.updateCategory\(category\.id, \{ supplier_grade_options: pool \}\)/,
  "grade tự thêm lưu ở cấp danh mục");
assert.match(actions, /action: "supplier\.grade_option_added"/, "mọi lần thêm grade phải vào nhật ký");
assert.match(actions, /SUPPLIER_GRADE_LIMIT/, "phải chặn trần số grade tự thêm");

const crmActions = read("../app/crm/settings/quantity-pricing/actions.ts");
assert.match(crmActions, /export async function removeSupplierGradeOption\(/, "CRM phải gỡ được grade nhà cung cấp thêm");
assert.match(crmActions, /action: "quantity_pricing\.supplier_grade_removed"/, "mỗi lần gỡ phải vào nhật ký");
assert.match(crmActions, /const pool = before\.filter\(/, "gỡ đúng một mã, không xoá cả danh sách");

const crmPage = read("../app/crm/settings/quantity-pricing/page.tsx");
assert.match(crmPage, /supplierGradeOptions\(category\)/, "trang cấu hình phải liệt kê grade tự thêm");
assert.match(crmPage, /<SupplierGradesList categories=\{supplierGrades\} \/>/, "trang cấu hình phải hiện khối gỡ grade");

const hints = read("../lib/db/migration-hints.ts");
assert.match(hints, /supplier_grade_options[\s\S]{0,120}20261102_category_supplier_grade_options\.sql/,
  "lỗi thiếu cột phải chỉ đúng file migration");

const types = read("../lib/types.ts");
assert.match(types, /supplier_grade_options\?: string\[\]/, "kiểu Category phải có supplier_grade_options");

/* ---------------- 5. Giao diện: mục thêm nằm cuối danh sách chọn ---------------- */

const editor = read("../components/products/quantity-pricing-editor.tsx");
assert.match(editor, /const NEW_GRADE_OPTION = "__new_grade__";/, "phải có giá trị riêng cho mục thêm grade");
assert.match(editor, /\{onAddGrade && <option value=\{NEW_GRADE_OPTION\}>\+ Thêm grade mới<\/option>\}/,
  "mục thêm grade phải là lựa chọn cuối của ô chọn");
assert.match(editor, /const gradeOptions = \[\.\.\.standardGrades, \.\.\.addedGrades\.filter/,
  "grade vừa thêm phải hiện ngay trong danh sách, không chờ tải lại trang");
assert.match(editor, /validateQuantityPricing\(validateEnglishName \? value : \{ \.\.\.value, nameEn: "" \}, gradeOptions, policy\)/,
  "kiểm tra phía trình duyệt phải nhận grade vừa thêm");
assert.match(editor, /Grade này lưu cho cả nhóm hàng/, "câu nhắc phải nói rõ phạm vi áp dụng");
assert.match(editor, /useEffect\(\(\) => \{ setAddedGrades\(\[\]\);/, "đổi danh mục thì bỏ grade tự thêm của nhóm trước");

const proposals = read("../lib/supplier-portal/category-proposals.ts");
assert.match(proposals, /supplier_grade_options: c\.supplier_grade_options \?\? \[\]/,
  "danh mục truyền xuống form sản phẩm phải mang theo grade NCC đã thêm");

const wizard = read("../app/supplier/portal/products/product-editor.tsx");
assert.match(wizard, /onAddGrade=\{\(grade\) => addSupplierGradeOptionAction\(\{ categorySlug: activeCategorySlug, grade \}\)\}/,
  "form tạo sản phẩm phải nối nút thêm grade với server action");

const pricePage = read("../app/supplier/portal/products/[id]/quantity-pricing/preview-form.tsx");
assert.match(pricePage, /onAddGrade=\{async \(grade\) =>/, "trang gửi bảng giá cũng phải cho thêm grade");
assert.match(pricePage, /if \(result\.ok && result\.grades\?\.length\) setGrades\(result\.grades\);|if \(result\.ok && result\.grades\?\.length\) ?setGrades/,
  "gửi bảng giá phải dùng danh sách grade vừa cập nhật");

console.log("Supplier grade options: nhập grade mới ngay trong ô chọn, lưu cho cả nhóm hàng.");
