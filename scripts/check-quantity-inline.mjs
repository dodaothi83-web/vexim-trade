// node --experimental-strip-types --no-warnings scripts/check-quantity-inline.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as pricing from '../lib/products/quantity-pricing.ts';
function compile(path, mocks) {
 const exports = {};
 const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
 vm.runInNewContext(code, { exports, console, Intl, Number, Math, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
 return exports;
}
const editor = compile('../components/products/quantity-pricing-editor.tsx', { 'react/jsx-runtime': jsx, 'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) }, '@/lib/products/quantity-pricing': pricing });
const inline = compile('../components/products/quantity-pricing-inline.tsx', { react: React, 'react/jsx-runtime': jsx,
 'next/navigation': { useRouter: () => ({ refresh() {} }) }, '@/components/products/quantity-pricing-editor': editor,
 '@/lib/products/quantity-pricing': pricing, '@/app/supplier/portal/quantity-revision-actions': {}, '@/app/crm/products/quantity-review/submit-actions': {} });
const data = { productId: 'p', updatedAt: '2026-10-29', nameVi: 'Nhân điều', nameEn: 'Cashew', pendingPriceId: 'pending', pendingNameId: null,
 hasApprovedPrice: true, hasApprovedName: false, grade: 'W320', incoterm: 'FOB', tiers: [{ minKg: '1000', priceUsdPerKg: '6.40' }],
 standardGrades: ['W320'], policy: pricing.DEFAULT_QUANTITY_PRICING_POLICY, buyerPriceUnit: 'kg', pricePubliclyVisible: true };
const render = (props) => renderToStaticMarkup(React.createElement('form', { id: 'parent' }, React.createElement(inline.QuantityPricingInline, { data, ...props })));
const supplier = render({ actor: 'supplier' });
assert.equal((supplier.match(/<form\b/g) ?? []).length, 1, 'No nested form');
assert.equal((supplier.match(/form="quantity-pricing-separate"/g) ?? []).length, 5, 'Grade, term, quantity, price and consent inputs do not belong to the parent form');
assert.doesNotMatch(supplier, /Tên tiếng Anh \(tùy chọn\)|Gửi tên tiếng Anh để duyệt|Bảng giá theo số lượng/);
assert.match(supplier, /Giá mới đang chờ Vexim xác nhận/);
assert.match(supplier, /Giá đang hiển thị cho buyer vẫn dùng bảng cũ/);
assert.match(supplier, /Gửi bảng giá mới để duyệt/);
assert.match(supplier, /Tôi xác nhận giá trên là giá tôi sẵn sàng/);
const sidebarPreview = renderToStaticMarkup(React.createElement(React.Fragment, null,
  React.createElement('form', null, React.createElement(inline.QuantityPricingInline, { data, actor: 'supplier', onPreviewChange() {} })),
  React.createElement(editor.QuantityBuyerPreview, { value: { grade: 'W320', incoterm: 'FOB', nameVi: 'Nhân điều', nameEn: 'Cashew', tiers: data.tiers },
    standardGrades: data.standardGrades, policy: data.policy, buyerPriceUnit: 'kg', pricePubliclyVisible: true }),
));
assert.equal((sidebarPreview.match(/>Buyer sẽ thấy</g) ?? []).length, 1, 'The input area and sidebar share exactly one buyer preview');
assert.match(sidebarPreview, /USD 6\.40\/kg/);
assert.match(sidebarPreview, /1 MT/);
const previewForm = compile('../app/supplier/portal/products/[id]/quantity-pricing/preview-form.tsx', { react: React, 'react/jsx-runtime': jsx,
 'next/navigation': { useRouter: () => ({ refresh() {} }) }, '@/components/products/quantity-pricing-editor': editor,
 '@/lib/products/quantity-pricing': pricing, '../../../quantity-revision-actions': {} });
const standalone = renderToStaticMarkup(React.createElement(previewForm.QuantityPricingPreviewForm, data));
assert.doesNotMatch(standalone, /Tên tiếng Anh \(tùy chọn\)|Gửi tên tiếng Anh để duyệt|Bảng giá theo số lượng/);
assert.match(standalone, /Gửi bảng giá để duyệt/);
const staff = render({ actor: 'staff' });
assert.match(staff, /đã nhận cam kết của NCC/);
const dirty = render({ actor: 'supplier', dirty: true });
assert.match(dirty, /Hãy lưu hoặc hoàn tác/);
assert.match(dirty, /disabled=""[^>]*>Gửi bảng giá mới/);
const v2data = { ...data, grade: 'Special', tiers: [], v2: { unit: 'mt', customGrade: true, tiers: [{ quantity: '1.234567', price: '6401' }] } };
const v2html = renderToStaticMarkup(React.createElement('form', null, React.createElement(inline.QuantityPricingInline, { data: v2data, actor: 'supplier' })));
assert.match(v2html, /1\.234567/); assert.match(v2html, /6401/); assert.match(v2html, /USD\/MT/);
assert.match(v2html, /chờ Vexim xác nhận/); assert.doesNotMatch(v2html, /Gửi bảng giá mới để duyệt/, 'Old kg editor cannot overwrite v2');
assert.doesNotMatch(v2html, /staged editor/, 'The v2 editing UI is gone from the supplier portal');
console.log('Inline quantity editor: separate form controls, v2 read-only view and dirty-state lock passed');
