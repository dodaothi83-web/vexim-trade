// Render the real registration fields for draft, returned and legacy profiles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { loadPortalDictionary } from './lib/portal-dictionary.mjs';

const portal = loadPortalDictionary();
/** Câu trong từ điển có ký tự đặc biệt của RegExp (ngoặc, dấu chấm), nên phải thoát ra. */
const re = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/supplier-profile-form.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const mod = { exports: {} };
const mocks = {
  'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
  'next/navigation': { useRouter: () => ({}) },
  // Chỉ dùng danh sách giá trị; nhãn hiển thị nằm trong từ điển.
  '@/lib/supplier': { SUPPLIER_TYPES: [
    { value: 'manufacturer' }, { value: 'trading' }, { value: 'cooperative' },
  ] },
  '@/lib/supplier-portal/policy': { INITIAL_DOCUMENT_KEYS: ['business_license', 'food_safety', 'haccp_or_brc', 'product_certs', 'export_license'],
    COMPANY_DOCUMENT_KEYS: ['business_license'] },
  './supplier-category-picker': { SupplierCategoryPicker: () => null },
  '@/components/file-picker': { FilePicker: () => null },
  // `fill` chỉ thay {key} bằng giá trị; bản thật nằm ở lib/i18n/format.ts.
  '@/lib/i18n/format': { fill: (template, values) => template.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole)) },
  '@/lib/config': { COMPANY: { email: 'hello@veximtrade.com', phone: '+84373685634', phoneDisplay: '+84 373 685 634' } },
};
vm.runInThisContext(`(function(exports, require, module) { ${source}\n})`)(mod.exports, (id) => mocks[id] ?? require(id), mod);
function render(supplier, locale = 'en') {
  return renderToStaticMarkup(React.createElement(mod.exports.SupplierProfileFields, {
    supplier, email: 'a@example.com', categories: [], step: 1,
    messages: portal[locale].onboarding, types: portal[locale].shared.supplierTypes,
  }));
}
const draft = render({ onboarding_status: 'not_started', supplier_type: 'manufacturer' });
assert.match(draft, /Factory \/ direct workshop|Trading company/, 'Nhãn loại hình đọc từ từ điển, mặc định tiếng Anh');
assert.match(draft, /<select name="supplier_type"/);
assert.match(draft, /value="trading"/);
const returned = render({ onboarding_status: 'changes_requested', supplier_type: 'trading' });
assert.doesNotMatch(returned, /<select name="supplier_type"/);
assert.match(returned, /<input[^>]*type="hidden"[^>]*name="supplier_type"[^>]*value="trading"/);
assert.match(returned, re(portal.en.onboarding.company.typeLockedHint), 'Loại hình đã khoá thì giải thích vì sao');
assert.match(returned, re(portal.en.shared.supplierTypes.trading), 'Hiện đúng loại hình đã khai');
assert.match(returned, /name="request:2"/);
const legacy = render({ onboarding_status: 'changes_requested', supplier_type: null });
assert.match(legacy, re(portal.en.shared.supplierTypes.unset), 'Hồ sơ cũ chưa khai loại hình');
// Tiếng Việt vẫn còn nguyên khi chọn VI: cùng component, chỉ đổi từ điển.
const vi = render({ onboarding_status: 'changes_requested', supplier_type: 'trading' }, 'vi');
assert.match(vi, re(portal.vi.shared.supplierTypes.trading), 'Bản tiếng Việt giữ đúng nhãn cũ');
assert.match(vi, /liên hệ nhân viên để kiểm tra và cập nhật/i);
assert.doesNotMatch(legacy, /<select name="supplier_type"/);
console.log('✅ L2 registration UI: editable draft, read-only returned type and safe legacy guidance.');
