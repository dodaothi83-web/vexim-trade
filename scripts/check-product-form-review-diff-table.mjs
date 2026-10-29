// node scripts/check-product-form-review-diff-table.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../components/products/product-form-review-diff-table.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, require: (key) => { if (key === 'react/jsx-runtime') return jsx; throw Error(`Unexpected import ${key}`); } });
const rows = [
  { section: 'basic', label: 'Tên', previous: 'Trước', submitted: 'Sau', changed: true },
  { section: 'description', label: 'Mô tả', previous: null, submitted: '<script>bad</script>', changed: null },
  { section: 'transaction', label: 'Giá', previous: '', submitted: 'USD 6.40/kg', changed: true },
];
const html = renderToStaticMarkup(React.createElement(exports.ProductFormReviewDiffTable, { rows }));
assert.match(html, /Thông tin cơ bản/); assert.match(html, /Giao dịch và bảng giá/); assert.match(html, /Mô tả/);
assert.match(html, /Có thay đổi/); assert.match(html, /Chưa xác định/); assert.match(html, /Chưa nhập/);
assert.match(html, /không coi các giá trị chưa biết là trống/);
assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
console.log('Review diff table: grouped changes, unknown legacy values and escaped description passed');
