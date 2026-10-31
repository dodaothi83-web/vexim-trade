// Render the real registration fields for draft, returned and legacy profiles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/supplier-profile-form.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const mod = { exports: {} };
const mocks = {
  'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
  'next/navigation': { useRouter: () => ({}) },
  '@/lib/supplier': { SUPPLIER_TYPES: [
    { value: 'manufacturer', label: 'Nhà máy' }, { value: 'trading', label: 'Thương nhân' }, { value: 'cooperative', label: 'Hợp tác xã' },
  ] },
  '@/lib/supplier-portal/policy': { INITIAL_DOCUMENT_KEYS: ['business_license', 'food_safety', 'haccp_or_brc', 'product_certs', 'export_license'],
    COMPANY_DOCUMENT_KEYS: ['business_license'] },
  './supplier-category-picker': { SupplierCategoryPicker: () => null },
  '@/components/file-picker': { FilePicker: () => null },
};
vm.runInThisContext(`(function(exports, require, module) { ${source}\n})`)(mod.exports, (id) => mocks[id] ?? require(id), mod);
function render(supplier) {
  return renderToStaticMarkup(React.createElement(mod.exports.SupplierProfileFields, { supplier, email: 'a@example.com', categories: [], step: 1 }));
}
const draft = render({ onboarding_status: 'not_started', supplier_type: 'manufacturer' });
assert.match(draft, /<select name="supplier_type"/);
assert.match(draft, /value="trading"/);
const returned = render({ onboarding_status: 'changes_requested', supplier_type: 'trading' });
assert.doesNotMatch(returned, /<select name="supplier_type"/);
assert.match(returned, /<input[^>]*type="hidden"[^>]*name="supplier_type"[^>]*value="trading"/);
assert.match(returned, /Thương nhân/);
assert.match(returned, /liên hệ nhân viên để kiểm tra và cập nhật/i);
assert.match(returned, /name="request:2"/);
const legacy = render({ onboarding_status: 'changes_requested', supplier_type: null });
assert.match(legacy, /Chưa khai/);
assert.match(legacy, /liên hệ nhân viên/i);
assert.doesNotMatch(legacy, /<select name="supplier_type"/);
console.log('✅ L2 registration UI: editable draft, read-only returned type and safe legacy guidance.');
