// node --experimental-strip-types --no-warnings scripts/check-quantity-pricing-editor.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import * as pricing from '../lib/products/quantity-pricing.ts';
const nodeRequire = createRequire(import.meta.url);
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../components/products/quantity-pricing-editor.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
vm.runInNewContext(code, { exports, Intl, Number, Math, console, require(key) {
  if (key === 'react/jsx-runtime') return nodeRequire('react/jsx-runtime');
  if (key === 'next/link') return { default: ({ children, ...props }) => React.createElement('a', props, children) };
  if (key === '@/lib/products/quantity-pricing') return pricing;
  throw Error(`Unexpected import ${key}`);
} });
const { QuantityPricingEditor } = exports;
const props = {
  onChange() {}, standardGrades: ['W320'], buyerPriceUnit: 'kg', pricePubliclyVisible: true,
  policy: pricing.DEFAULT_QUANTITY_PRICING_POLICY,
  value: { grade: 'W320', incoterm: 'FOB', nameVi: 'Nhân điều', nameEn: 'Cashew kernels', tiers: [
    { minKg: '1000', priceUsdPerKg: '6.40' }, { minKg: '5000', priceUsdPerKg: '6.00' },
  ] },
};
const render = (override = {}) => renderToStaticMarkup(React.createElement(QuantityPricingEditor, { ...props, ...override }));
const html = render();
for (const text of ['Số lượng từ (kg)', 'USD/kg', 'Giá cho 1 kg', '4999', 'trở lên', 'Buyer sẽ thấy', 'Cashew kernels W320', 'USD 6.00–6.40/kg', '1 MT', 'FOB', 'Quy chế hoạt động']) assert.ok(html.includes(text), text);
assert.match(html, /<input[^>]*required[^>]*name="confirm_quantity_price_consent"/);
assert.match(html, /href="\/quy-che-hoat-dong"/);
assert.match(html, /\+ Thêm mức giá/);
const isolated = render({ isolated: true, consentChecked: false, onConsentChange() {} });
assert.equal((isolated.match(/form="quantity-pricing-separate"/g) ?? []).length, 7, 'All editable inputs are detached from the enclosing product form');
assert.match(isolated, /type="checkbox"[^>]*name="confirm_quantity_price_consent"/);
const withoutInlinePreview = render({ showPreview: false });
assert.doesNotMatch(withoutInlinePreview, /Buyer sẽ thấy|Cashew kernels W320/, 'When the page supplies a sidebar preview, the form has no duplicate');
assert.match(withoutInlinePreview, /Số lượng từ \(kg\)/, 'Hiding the duplicate does not remove the editor');
const mt = render({ buyerPriceUnit: 'mt' });
assert.ok(mt.includes('USD 6,000–6,400/MT'));
assert.ok(mt.includes('USD 6,400/MT'));
const four = render({ value: { ...props.value, tiers: Array.from({ length: 4 }, (_, i) => ({ minKg: String((i + 1) * 1000), priceUsdPerKg: '6' })) } });
assert.ok(!four.includes('+ Thêm mức giá'));
const hidden = render({ pricePubliclyVisible: false });
assert.ok(hidden.includes('Price on request'));
assert.ok(!hidden.includes('USD 6.00–6.40/kg'));
assert.ok(!hidden.includes('name="confirm_quantity_price_consent"'));
const invalid = render({ showErrors: true, value: { ...props.value, tiers: [{ minKg: '', priceUsdPerKg: '' }] } });
assert.ok(invalid.includes('role="alert"'));
assert.ok(invalid.includes('Price on request'));
console.log('Quantity pricing editor: required fields, kg inputs, limits, live buyer preview and consent passed');
