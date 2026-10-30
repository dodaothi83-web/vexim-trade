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
for (const text of ['Incoterm', 'Từ (kg)', 'Đến (kg)', 'Giá (USD/kg)', 'Tiền tệ', 'Tạm thời chỉ nhập giá USD', 'VND/EUR', '4,999', 'trở lên', 'Người mua sẽ thấy', 'Cashew kernels', 'USD 6.00–6.40/kg', '1 MT', 'FOB', 'Quy chế hoạt động']) assert.ok(html.includes(text), text);
assert.doesNotMatch(html, /<select[^>]*aria-label="Tiền tệ"/, 'Tiền tệ tạm thời cố định USD, không còn select VND/EUR');
const noGrades = render({ standardGrades: [] });
assert.match(noGrades, /Danh mục này chưa có grade\. Gửi Vexim bổ sung\./, 'Danh mục chưa có grade được giải thích thay vì ô chọn rỗng');
assert.match(noGrades, /<select[^>]*aria-label="Grade"[^>]*disabled=""/, 'Ô grade bị khoá khi danh mục chưa có grade');
const drafting = render({ value: { grade: '', incoterm: 'FOB', currency: 'USD', nameVi: 'Nhân điều', nameEn: '', tiers: [
  { minKg: '100', priceUsdPerKg: '2.00', incoterm: 'FOB' }, { minKg: '101', priceUsdPerKg: '1.50', incoterm: 'FOB' },
] } });
assert.match(drafting, /USD 1\.50–2\.00\/kg/, 'Xem trước hiện giá ngay khi đang nhập, chưa cần chọn grade');
assert.match(drafting, /USD 2\.00\/kg/, 'Từng mức giá hiện trong bảng xem trước');
assert.match(drafting, /Chưa chọn grade/, 'Thiếu grade là ghi chú, không xoá giá đã nhập');
assert.match(drafting, /Chọn grade để hoàn tất bảng giá/);
assert.doesNotMatch(drafting, /Price on request/, 'Có giá nhập vào thì không hiện Price on request');
assert.match(html, /<input[^>]*required[^>]*name="confirm_quantity_price_consent"/);
assert.match(html, /href="\/quy-che-hoat-dong"/);
assert.match(html, /\+ Thêm mức giá/);
const isolated = render({ isolated: true, consentChecked: false, onConsentChange() {} });
assert.equal((isolated.match(/form="quantity-pricing-separate"/g) ?? []).length, 8, 'All editable inputs are detached from the enclosing product form');
assert.match(isolated, /type="checkbox"[^>]*name="confirm_quantity_price_consent"/);
const withoutInlinePreview = render({ showPreview: false });
assert.doesNotMatch(withoutInlinePreview, /Người mua sẽ thấy|Cashew kernels/, 'When the page supplies a sidebar preview, the form has no duplicate');
assert.match(withoutInlinePreview, /Từ \(kg\)/, 'Hiding the duplicate does not remove the editor');
const mt = render({ buyerPriceUnit: 'mt' });
assert.ok(mt.includes('USD 6,000–6,400/MT'));
assert.ok(mt.includes('USD 6,400/MT'));
const four = render({ value: { ...props.value, tiers: Array.from({ length: 4 }, (_, i) => ({ minKg: String((i + 1) * 1000), priceUsdPerKg: '6' })) } });
assert.ok(!four.includes('+ Thêm mức giá'));
const hidden = render({ pricePubliclyVisible: false });
assert.ok(hidden.includes('Price on request'));
assert.ok(!hidden.includes('USD 6.00–6.40/kg'));
assert.ok(!hidden.includes('name="confirm_quantity_price_consent"'));
assert.ok(!hidden.includes('Mọi báo giá bạn gửi qua Vexim'), 'Hide price warning when visibility is off');
assert.match(html, /inputMode="numeric"/); assert.match(html, /inputMode="decimal"/);
const waiting = render({ value: { ...props.value, nameEn: '' } });
assert.ok(waiting.includes('Nhân điều')); assert.ok(waiting.includes('Tên tiếng Anh do Vexim dịch khi duyệt'));
const overPolicy = render({ policy: { ...props.policy, maxTiers: 8 }, value: { ...props.value, tiers: Array.from({ length: 4 }, (_, i) => ({ minKg: String((i + 1) * 1000), priceUsdPerKg: '6' })) } });
assert.ok(!overPolicy.includes('+ Thêm mức giá'), 'The supplier form never offers more than four tiers');
const invalid = render({ showErrors: true, value: { ...props.value, tiers: [{ minKg: '', priceUsdPerKg: '' }] } });
assert.ok(invalid.includes('role="alert"'));
assert.ok(invalid.includes('Price on request'));
console.log('Quantity pricing editor: required fields, kg inputs, limits, live buyer preview and consent passed');
