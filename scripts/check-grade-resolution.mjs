#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-grade-resolution.mjs
//
// Quy cách sản phẩm: thuộc tính có cấu trúc phải thắng tên gõ tay, tên chỉ còn là
// nguồn dự phòng và nguồn cảnh báo. Bộ kiểm này khoá đúng thứ tự đó, và so phép đọc
// tên ở lib/public/grade-resolution.ts với bản cũ trong product-selection để hai nơi
// không lệch nhau về sau.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

import {
  cashewGradeFromText,
  gradeFromName,
  gradeKey,
  pepperGradeFromText,
  resolveGrade,
} from "../lib/public/grade-resolution.ts";
import { assignProductCategory } from "../lib/public/category-assignment.ts";

/* ---------------- 1. Đọc quy cách từ tên ---------------- */

assert.equal(cashewGradeFromText("Cashew kernels W320", null), "W320");
assert.equal(cashewGradeFromText("Cashew kernels W320", "AFI W320"), "W320");
assert.equal(cashewGradeFromText("Cashew white splits", null), "WS", "Splits là WS");
assert.equal(cashewGradeFromText("Cashew LP pieces", null), "LP");
assert.equal(gradeFromName("Cashew W240", null, "cashew-kernels"), "W240");
assert.equal(gradeFromName("Cashew W240", null, "rice"), null, "Danh mục khác không đọc quy cách hạt điều");

assert.equal(pepperGradeFromText("Black pepper 550 g/L, machine cleaned", null), "550 g/l");
assert.equal(pepperGradeFromText("Black pepper 550 g/L", "moisture 12.5%"), "550 g/l");
assert.equal(pepperGradeFromText("Cassia split, 4 mm", null), null, "Quế không có quy cách g/l");

/* 500 và 550 là hai mức giá khác nhau: không được gộp, không được làm tròn. */
assert.notEqual(pepperGradeFromText("Black pepper 500 g/L, FAQ", null), pepperGradeFromText("Black pepper 550 g/L, FAQ", null));
assert.equal(gradeFromName("Black pepper 570 g/L", null, "pepper"), "570 g/l");
assert.equal(gradeFromName("White pepper 630 g/L", null, "pepper"), "630 g/l");

/* ---------------- 2. Thứ tự ưu tiên ---------------- */

/* Có thuộc tính thì thuộc tính thắng, kể cả khi tên nói khác. */
const conflict = resolveGrade({
  name: "Black pepper 550 g/L, machine cleaned",
  spec: null,
  categorySlug: "pepper",
  attributes: { grade: "500 g/l" },
});
assert.equal(conflict.value, "500 g/l", "Ô quy cách thắng tên");
assert.equal(conflict.source, "attributes");
assert.equal(conflict.fromName, "550 g/l", "Vẫn giữ giá trị đọc từ tên để cảnh báo");
assert.equal(conflict.conflict, true);

/* Hai bên khớp nhau, chỉ khác cách viết, thì không phải cảnh báo. */
const agree = resolveGrade({
  name: "Black pepper 550 g/L",
  spec: null,
  categorySlug: "pepper",
  attributes: { grade: "550 g/l" },
});
assert.equal(agree.value, "550 g/l");
assert.equal(agree.conflict, false, "550 g/L và 550 g/l là cùng một quy cách");
assert.equal(gradeKey(" 550  G / L "), gradeKey("550 g/l"));

/* Chưa khai thuộc tính thì dùng tên: dữ liệu cũ vẫn hiện được. */
const legacy = resolveGrade({
  name: "Cashew kernels W240, steam treated",
  spec: "AFI W240",
  categorySlug: "cashew-kernels",
  attributes: null,
});
assert.equal(legacy.value, "W240");
assert.equal(legacy.source, "name");
assert.equal(legacy.conflict, false);

/* Không có gì thì không có gì, không suy diễn. */
const empty = resolveGrade({ name: "Vietnamese pepper for export", spec: null, categorySlug: "pepper", attributes: {} });
assert.equal(empty.value, null);
assert.equal(empty.source, "none");

/* Quế và hồi tách mặt hàng bằng product_type, nên thuộc tính vẫn thắng. */
const spice = resolveGrade({
  name: "Cassia split, 4 mm",
  spec: null,
  categorySlug: "cinnamon-star-anise",
  attributes: { product_type: "Cassia split" },
});
assert.equal(spice.value, "Cassia split");
assert.equal(spice.source, "attributes");

/* ---------------- 3. Không lệch với product-selection ---------------- */

const selection = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL("../lib/public/product-selection.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  {
    exports: selection,
    require: (path) => (path === "@/lib/public/category-assignment" ? { assignProductCategory } : null),
    Date,
  },
);

const fixtures = [
  ["Cashew kernels W180", null],
  ["Cashew kernels W240, steam treated", "AFI W240"],
  ["Cashew white splits", null],
  ["Cashew LP", "large pieces"],
  ["Cashew kernels W999", null],
  ["Black pepper 500 g/L, FAQ", null],
  ["Black pepper 550 g/L", "moisture 12.5% max"],
  ["White pepper 630 g/l", null],
  ["Cassia split, 4 mm", null],
];
for (const [name, spec] of fixtures) {
  assert.equal(
    cashewGradeFromText(name, spec),
    selection.productGrade(name, spec, "cashew-kernels"),
    `Quy cách hạt điều phải giống bản cũ: ${name}`,
  );
  assert.equal(
    pepperGradeFromText(name, spec),
    selection.pepperGrade(name, spec),
    `Quy cách hồ tiêu phải giống bản cũ: ${name}`,
  );
}

console.log("✅ check-grade-resolution: thuộc tính thắng tên, cảnh báo khi lệch, dữ liệu cũ vẫn đọc được.");
