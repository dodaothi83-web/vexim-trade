// node --experimental-strip-types --no-warnings scripts/check-quantity-v2-editor.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as pricing from '../lib/products/quantity-pricing.ts';
import { entry, revision } from './quantity-v2-test-utils.mjs';
function compile(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, console, Intl, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected ${key}`); return mocks[key]; } });
  return exports;
}
const editor = compile('../components/products/quantity-pricing-v2-editor.tsx', {
  react: React, 'react/jsx-runtime': jsx,
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/lib/products/quantity-entry': entry, '@/lib/products/quantity-pricing': pricing, '@/lib/products/quantity-revision-v2': revision,
});
const { formatV2QuantityInput: format } = editor;
assert.equal(format('5000'), '5,000'); assert.equal(format('5000.25'), '5,000.25');
assert.equal(format('5,00'), '5,00', 'Invalid pasted grouping is not silently reinterpreted');
assert.equal(format('5,0000', '5,000'), '50,000'); assert.equal(format('1.234567'), '1.234567');
const value = { grade: 'W320', incoterm: 'FOB', nameVi: 'Nhân điều', customGrade: false, unit: 'mt', tiers: [{ quantity: '1.5', price: '6401' }, { quantity: '2', price: '6000' }] };
const props = { value, onChange() {}, standardGrades: ['W320'], policy: pricing.DEFAULT_QUANTITY_PRICING_POLICY, pricePubliclyVisible: true, consentChecked: false, onConsentChange() {}, isolated: true };
const render = (changes = {}) => renderToStaticMarkup(React.createElement(editor.QuantityPricingV2Editor, { ...props, ...changes }));
const html = render();
for (const text of ['Khác (tự nhập)', '>kg</option>', '>tấn</option>', 'Đơn giá (USD/tấn)', 'Đến 1.999999 tấn', 'Quy chế hoạt động', 'type="checkbox"']) assert.ok(html.includes(text), text);
assert.doesNotMatch(html, /<option[^>]*>bao|<option[^>]*>thùng/i);
const separate = render({ showGrade: false, incotermPlace: React.createElement('input', { name: 'incoterm_place' }) });
assert.doesNotMatch(separate, /aria-label="Grade"/);
assert.ok(separate.indexOf('aria-label="Incoterm"') < separate.indexOf('name="incoterm_place"'));
assert.ok(separate.indexOf('name="incoterm_place"') < separate.indexOf('<table'));
const compact = render({ productFormLayout: true, showGrade: false, showIncoterm: false, showConsent: false });
assert.doesNotMatch(compact, /aria-label="Incoterm"|Quy chế hoạt động/);
assert.match(compact, /Buyer thấy:/); assert.match(compact, /1\.5 MT đến 1\.999999 MT/);
assert.match(compact, /aria-label="Xóa mức giá 1"/); assert.match(compact, /US\$/); assert.equal((compact.match(/\+ Thêm mức giá/g) ?? []).length, 1);
assert.doesNotMatch(render({ productFormLayout: true, pricePubliclyVisible: false }), /Buyer thấy:/);
const grade = renderToStaticMarkup(React.createElement(editor.QuantityGradeV2Field, props));
assert.match(grade, /aria-label="Grade"/); assert.doesNotMatch(grade, /Incoterm/);
const preview = renderToStaticMarkup(React.createElement(editor.QuantityBuyerV2Preview, { ...props, incotermPlace: 'Cát Lái' }));
assert.match(preview, /FOB Cát Lái/);
assert.doesNotMatch(preview, /font-mono/, 'Buyer preview numbers use site font and tabular figures');
assert.match(html, /text-right font-mono tabular-nums/, 'Internal price and quantity inputs use the mono font');
assert.match(preview, /Tên tiếng Anh do Vexim dịch khi duyệt/);
assert.match(preview, /USD 6,000\.00–6,401\.00\/MT/); assert.match(preview, /MOQ: 1\.5 MT/);
assert.match(preview, /USD 6,401\.00\/MT/);
const hiddenPreview = renderToStaticMarkup(React.createElement(editor.QuantityBuyerV2Preview, { ...props, pricePubliclyVisible: false }));
assert.match(hiddenPreview, /Price on request/); assert.doesNotMatch(hiddenPreview, /USD 6,401/);
assert.doesNotMatch(readFileSync(new URL('../components/products/quantity-pricing-v2-editor.tsx', import.meta.url), 'utf8'), /window\.confirm/, 'Changing unit uses an inline confirmation');
assert.doesNotMatch(render({ pricePubliclyVisible: false }), /Quy chế hoạt động|type="checkbox"/);
const custom = render({ value: { ...value, customGrade: true, grade: 'Special' } });
assert.match(custom, /Grade khác/); assert.match(custom, /không thuộc bộ lọc grade chuẩn/);
const outlierPolicy = { ...pricing.DEFAULT_QUANTITY_PRICING_POLICY, gradeBounds: { W320: { minUsdPerKg: 6, maxUsdPerKg: 7 } } };
const outlierValue = { ...value, tiers: [{ quantity: '1', price: '1000' }] };
assert.doesNotMatch(render({ value: outlierValue, policy: outlierPolicy }), /ngoài ngưỡng tham khảo/, 'Supplier does not receive the internal grade-price warning');
assert.match(render({ value: outlierValue, policy: outlierPolicy, showWarnings: true }), /ngoài ngưỡng tham khảo/, 'Staff can review an outlier');
const invalid = render({ value: { ...value, tiers: [{ quantity: '', price: '' }] }, showErrors: true });
assert.match(invalid, /Nhập số lượng hợp lệ/); assert.match(invalid, /Nhập đơn giá lớn hơn 0/);
for (const label of ['Số lượng mức 1 (tấn)', 'Đơn giá mức 1 (USD/tấn)']) {
  const input = invalid.match(new RegExp(`<input[^>]*aria-label="${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`))?.[0];
  const errorId = input?.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(errorId && invalid.includes(`id="${errorId}"`), `${label} must reference its visible error`);
}
assert.equal((html.match(/form="quantity-pricing-separate"/g) ?? []).length, 8, 'Fields are detached from the parent form');
assert.equal(pricing.normalizePriceInput('6,40'), '6.40');
console.log('Staged V2 pricing editor: kg/MT, exact tiers, custom grade, consent and inline errors passed');
