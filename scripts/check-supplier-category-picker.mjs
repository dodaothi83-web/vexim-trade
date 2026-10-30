// node scripts/check-supplier-category-picker.mjs — chọn danh mục là thêm ngay, tối đa 5.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const path = '../app/supplier/portal/supplier-category-picker.tsx';
const source = readFileSync(new URL(path, import.meta.url), 'utf8');
const jsx = await import('react/jsx-runtime');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports, require: (key) => key === 'react/jsx-runtime' ? jsx : key === 'react' ? React : null, React, console });

const categories = [
  { id: 'c1', slug: 'cashew-kernels', label: 'Hạt điều nhân', group: 'Hạt' },
  { id: 'c2', slug: 'pepper', label: 'Hồ tiêu', group: 'Gia vị' },
];
const render = (initial) => renderToStaticMarkup(React.createElement(exports.SupplierCategoryPicker, { categories, initial }));

// Không còn nút "Thêm": chọn trong ô là thêm thẳng.
assert.doesNotMatch(source, />Thêm</, 'Nút Thêm đã bỏ');
assert.match(source, /onChange=\{\(event\) => add\(event\.target\.value\)\}/, 'Chọn trong ô là gọi add ngay');
assert.doesNotMatch(render([]), /name="requested_category_slugs"/, 'Chưa chọn gì thì không gửi danh mục nào');
assert.match(render([]), /Đã chọn 0\/5/);

// Danh mục đã chọn được gửi kèm bằng input ẩn và có nút bỏ.
const chosen = render(['cashew-kernels']);
assert.match(chosen, /name="requested_category_slugs" value="cashew-kernels"/);
assert.match(chosen, /Đã chọn 1\/5/);
assert.match(chosen, /Bỏ cashew-kernels/);

// Đủ 5 thì khoá ô chọn thay vì cho bấm tiếp.
const five = ['a', 'b', 'c', 'd', 'e'].map((slug) => ({ id: slug, slug, label: slug, group: null }));
const full = renderToStaticMarkup(React.createElement(exports.SupplierCategoryPicker, { categories: five, initial: ['a', 'b', 'c', 'd', 'e'] }));
assert.match(full, /Đã chọn đủ 5 danh mục/);
assert.match(full, /Đã chọn 5\/5/);

// Form phải chặn ở bước 1 nếu chưa chọn danh mục nào.
const form = readFileSync(new URL('../app/supplier/portal/supplier-profile-form.tsx', import.meta.url), 'utf8');
assert.match(form, /function categoriesChosen\(/, 'Form kiểm danh mục đã chọn');
assert.match(form, /setStepError\("Chọn ít nhất một danh mục kinh doanh trước khi gửi hồ sơ\."\)/, 'Gửi hồ sơ không có danh mục bị chặn tại chỗ');
console.log('✅ Category picker: choosing a category adds it immediately, five max, blocked before submit.');
