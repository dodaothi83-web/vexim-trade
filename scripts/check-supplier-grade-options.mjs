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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: (key) => {
      if (!(key in mocks)) throw new Error(`${path}: unexpected import ${key}`);
      return mocks[key];
    },
    process, console, Date, Intl, Promise, setTimeout, clearTimeout,
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
/*
  "Thêm grade" nằm cuối dropdown vì đó là nơi mọi người tìm trước, và có thêm một nút riêng
  bên dưới làm đường dự phòng. Cái từng hỏng là ô chọn controlled thẳng theo `value.grade`:
  chọn mục giả xong React kéo giá trị về rỗng nên trình duyệt đóng dropdown mà không mở ô
  nhập. Vì vậy ô chọn phải controlled theo state riêng `gradePicker`.
*/
assert.match(editor, /const NEW_GRADE_OPTION = "__new_grade__";/, "mục thêm grade có giá trị riêng");
assert.match(editor, /\{onAddGrade && <option value=\{NEW_GRADE_OPTION\}>\{copy\.addGrade\}<\/option>\}/,
  "mục thêm grade nằm cuối danh sách chọn");
assert.match(editor, /value=\{gradePicker\}/, "ô chọn controlled theo state riêng, không theo value.grade");
assert.doesNotMatch(editor, /value=\{value\.grade\}/, "ô chọn không được controlled thẳng theo value.grade");
assert.match(editor, /const \[gradePicker, setGradePicker\] = useState\(value\.grade\)/, "ô chọn giữ giá trị đang hiển thị");
assert.match(editor, /if \(e\.target\.value === NEW_GRADE_OPTION\) \{/, "chọn mục thêm grade thì mở ô nhập");
/*
  Chỉ MỘT đường vào: mục cuối dropdown. Nút thứ hai dưới ô chọn đã được bỏ theo yêu cầu —
  đừng thêm lại, vì mọi người tìm trong dropdown trước.
*/
assert.doesNotMatch(editor, /<button[^>]*>\{copy\.addGrade\}<\/button>/, "không còn nút thêm grade bên dưới ô chọn");
assert.match(editor, /<input id="quantity-new-grade"/, "ô nhập grade mới phải có trong form");
assert.match(editor, /onChange\(\{ \.\.\.value, grade: list\.find/, "lưu xong thì chọn luôn grade vừa thêm");
assert.match(editor, /const gradeOptions = \[\.\.\.standardGrades, \.\.\.addedGrades\.filter/,
  "grade vừa thêm phải hiện ngay trong danh sách, không chờ tải lại trang");
assert.match(editor, /validateQuantityPricing\(validateEnglishName \? value : \{ \.\.\.value, nameEn: "" \}, gradeOptions, policy\)/,
  "kiểm tra phía trình duyệt phải nhận grade vừa thêm");
assert.match(editor, /copy\.gradeSaved/, "ô nhập grade mới phải nói rõ phạm vi áp dụng");
assert.match(editor, /useEffect\(\(\) => \{ setAddedGrades\(\[\]\);/, "đổi danh mục thì bỏ grade tự thêm của nhóm trước");

/* ---------------- 6. Bấm thật trong jsdom: nút mở ô nhập, lưu xong chọn luôn grade ---------------- */

{
  const { JSDOM } = await import("jsdom");
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  // DOM phải có trước khi nạp react-dom: react-dom quyết định "có DOM hay không" ngay lúc
  // nạp module. Nạp trước thì nó chạy như SSR và KHÔNG gắn listener sự kiện nào.
  const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "http://localhost/", pretendToBeVisual: true });
  global.window = dom.window; global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement; global.Element = dom.window.Element;
  global.Node = dom.window.Node; global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = req("react");
  const jsx = req("react/jsx-runtime");
  const { createRoot } = req("react-dom/client");
  const { act } = req("react");
  const salesUnits = await import("../lib/products/sales-units.ts");
  const priceDisplay = await import("../lib/products/price-display.ts");
  const pricing = await import("../lib/products/quantity-pricing.ts");
  const { productEditorMessages } = await import("../lib/i18n/portal/product-editor.ts");
  const { fill } = await import("../lib/i18n/format.ts");
  const lucide = new Proxy({}, { get: (_t, name) => () => React.createElement("svg", { "data-icon": String(name) }) });
  const built = compile("../components/products/quantity-pricing-editor.tsx", {
    "@/lib/products/sales-units": salesUnits, react: React, "react/jsx-runtime": jsx,
    "next/link": { default: ({ children, ...p }) => React.createElement("a", p, children) },
    "lucide-react": lucide, "@/lib/products/quantity-pricing": pricing, "@/lib/products/price-display": priceDisplay,
    "@/lib/i18n/portal/product-editor": { productEditorMessages }, "@/lib/i18n/format": { fill },
  });
  // Bảng giá là component controlled, nên phải có state như nơi gọi thật.
  const initial = { grade: "", incoterm: "", currency: "USD", unit: "kg", nameVi: "Nhân điều", nameEn: "",
    tiers: [{ minKg: "", priceUsdPerKg: "", incoterm: "" }] };
  function Harness() {
    const [value, setValue] = React.useState(initial);
    return React.createElement(built.QuantityPricingEditor, {
      value, onChange: setValue, standardGrades: ["Mango", "Dried Banana"],
      policy: pricing.DEFAULT_QUANTITY_PRICING_POLICY, buyerPriceUnit: "kg", pricePubliclyVisible: false,
      isolated: true, showPreview: false, showTitle: false, validateEnglishName: false,
      onAddGrade: async (grade) => ({ ok: true, message: "ok", grades: ["Mango", "Dried Banana", grade] }),
    });
  }
  const root = createRoot(document.getElementById("root"));
  await act(async () => { root.render(React.createElement(Harness)); });
  const select = document.querySelector("#quantity-grade");
  assert.ok(select, "ô chọn grade phải có trong form");
  // Mục "Thêm grade" nằm CUỐI dropdown: đó là nơi mọi người tìm trước.
  assert.deepEqual([...select.querySelectorAll("option")].map((o) => o.textContent),
    ["Chọn grade", "Mango", "Dried Banana", "+ Thêm grade"],
    "mục thêm grade nằm cuối danh sách chọn, sau mọi grade thật");
  assert.equal(document.querySelector("#quantity-new-grade"), null, "ô nhập chỉ hiện sau khi chọn");
  const setSelect = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value").set;
  await act(async () => {
    setSelect.call(select, "__new_grade__");
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  const input = document.querySelector("#quantity-new-grade");
  assert.ok(input, "chọn mục thêm grade trong dropdown thì ô nhập phải hiện ra");
  // Ô chọn phải GIỮ mục giả đang chọn, nếu không trình duyệt đóng dropdown mà không mở ô nhập.
  assert.equal(document.querySelector("#quantity-grade").value, "__new_grade__",
    "ô chọn giữ đúng giá trị đang hiển thị");
  // Gán qua native setter để React thấy giá trị đổi như khi người dùng thật gõ.
  const setNative = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setNative.call(input, "Lychee riêng");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const saveButton = [...document.querySelectorAll("button")].find((b) => b.textContent === "Lưu grade");
  assert.ok(saveButton, "ô nhập grade mới phải có nút lưu");
  await act(async () => {
    saveButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
  });
  assert.equal(document.querySelector("#quantity-grade").value, "Lychee riêng", "lưu xong phải chọn luôn grade vừa thêm");

  // Không còn nút thêm grade nào ngoài dropdown.
  assert.equal([...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "+ Thêm grade").length, 0,
    "không còn nút thêm grade bên dưới ô chọn");
  // Huỷ: mở lại từ dropdown rồi huỷ, ô chọn phải trả về grade thật đang dùng, không kẹt ở mục giả.
  const select2 = document.querySelector("#quantity-grade");
  await act(async () => {
    setSelect.call(select2, "__new_grade__");
    select2.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  assert.ok(document.querySelector("#quantity-new-grade"), "mở lại ô nhập từ dropdown được");
  const cancelButton = [...document.querySelectorAll("button")].find((b) => b.textContent === "Hủy");
  assert.ok(cancelButton, "ô nhập grade mới phải có nút huỷ");
  await act(async () => { cancelButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  assert.equal(document.querySelector("#quantity-grade").value, "Lychee riêng",
    "huỷ thì ô chọn trả về grade đang dùng");
  assert.equal(document.querySelector("#quantity-new-grade"), null, "huỷ thì ô nhập đóng lại");
  assert.ok([...document.querySelectorAll("#quantity-grade option")].some((o) => o.value === "Lychee riêng"),
    "grade vừa thêm phải có trong danh sách ngay, không chờ tải lại trang");
}

const proposals = read("../lib/supplier-portal/category-proposals.ts");
assert.match(proposals, /supplier_grade_options: c\.supplier_grade_options \?\? \[\]/,
  "danh mục truyền xuống form sản phẩm phải mang theo grade NCC đã thêm");

const wizard = read("../app/supplier/portal/products/product-editor.tsx");
assert.match(wizard, /onAddGrade=\{\(grade\) => addSupplierGradeOptionAction\(\{ categorySlug: activeCategorySlug, grade \}\)\}/,
  "form tạo sản phẩm phải nối nút thêm grade với server action");

console.log("Supplier grade options: nhập grade mới ngay trong ô chọn, lưu cho cả nhóm hàng.");
