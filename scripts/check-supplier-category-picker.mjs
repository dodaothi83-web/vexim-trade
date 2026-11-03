// node scripts/check-supplier-category-picker.mjs — chọn danh mục là thêm ngay, tối đa 5.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadPortalDictionary } from './lib/portal-dictionary.mjs';
import { loadFormat } from './lib/i18n-format.mjs';

const path = '../app/supplier/portal/supplier-category-picker.tsx';
const source = readFileSync(new URL(path, import.meta.url), 'utf8');
const jsx = await import('react/jsx-runtime');
const exports = {};
const portal = loadPortalDictionary();
// Hai import runtime của component: `fill` và react. Chuỗi hiển thị nằm trong từ điển.
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports, React, console,
  require: (key) => key === 'react/jsx-runtime' ? jsx : key === 'react' ? React
    : key === '@/lib/i18n/format' ? loadFormat() : null,
});

const categories = [
  { id: 'c1', slug: 'cashew-kernels', label: 'Hạt điều nhân', group: 'Hạt' },
  { id: 'c2', slug: 'pepper', label: 'Hồ tiêu', group: 'Gia vị' },
];
const render = (initial, locale = 'vi', list = categories) => renderToStaticMarkup(React.createElement(
  exports.SupplierCategoryPicker, { categories: list, initial, messages: portal[locale].onboarding.picker },
));

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
assert.match(render(['a', 'b', 'c', 'd', 'e'], 'vi', five), /Đã chọn đủ 5 danh mục/);
assert.match(render(['a', 'b', 'c', 'd', 'e'], 'vi', five), /Đã chọn 5\/5/);

// Ngôn ngữ mặc định là tiếng Anh: cùng component, chuỗi đổi theo từ điển.
const english = render([], 'en');
assert.match(english, /0\/5 chosen/, 'Bản tiếng Anh đọc từ từ điển');
assert.doesNotMatch(english, /Đã chọn/, 'Không còn tiếng Việt khi ngôn ngữ là en');

// Form phải chặn ở bước 1 nếu chưa chọn danh mục nào.
const form = readFileSync(new URL('../app/supplier/portal/supplier-profile-form.tsx', import.meta.url), 'utf8');
assert.match(form, /function categoriesChosen\(/, 'Form kiểm danh mục đã chọn');
assert.match(form, /setStepError\(m\.form\.errors\.noCategorySubmit\)/, 'Gửi hồ sơ không có danh mục bị chặn tại chỗ');
assert.match(portal.vi.onboarding.form.errors.noCategorySubmit, /Chọn ít nhất một danh mục kinh doanh trước khi gửi hồ sơ/, 'Câu chặn nằm trong từ điển, bản tiếng Việt giữ nguyên');
console.log('✅ Category picker: choosing a category adds it immediately, five max, blocked before submit.');
