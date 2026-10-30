// node scripts/check-product-form-five-sections.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
const Component = (name) => (props) => React.createElement('div', { 'data-component': name }, props.children);
const errors = [{ section: 'basic', field: 'name', message: 'Tên bắt buộc' }];
const mocks = {
  react: React, 'react/jsx-runtime': await import('react/jsx-runtime'), 'lucide-react': icons,
  '@/components/products/product-description-editor': { ProductDescriptionEditor: Component('description') },
  '@/components/products/quantity-pricing-v2-editor': { QuantityBuyerV2Preview: Component('preview'), QuantityGradeV2Field: Component('grade'),
    QuantityIncotermV2Field: Component('incoterm'), QuantityPriceV2Consent: Component('consent'),
    QuantityPricingV2Editor: (props) => React.createElement('div', { 'data-component': 'pricing', 'data-errors': String(props.showErrors), 'data-warnings': String(props.showWarnings), 'data-incoterm': String(props.showIncoterm), 'data-consent': String(props.showConsent) }) },
  '@/components/raw-material-region-input': { RawMaterialRegionInput: Component('region') },
  '@/components/supplier-attribute-inputs': { SupplierAttributeInputs: Component('attributes') },
  '@/lib/product-attributes': { fieldsFor: () => [], supplierFieldsFor: () => [] },
  '@/lib/products/grade-pricing': { nonGradeProductFields: (x) => x, standardGradesForCategory: () => ['W320'] },
  '@/lib/products/product-form-model': { validateProductFormSubmission: () => ({ errors, warnings: [], quantity: null }) },
  '@/lib/products/quantity-pricing': { DEFAULT_QUANTITY_PRICING_POLICY: { maxTiers: 4 }, formatQuantityInput: (x) => x },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../components/products/product-form-five-sections.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
const value = { name: '', category: 'cashew', grade: '', customGrade: false, spec: '', rawMaterialRegion: '', inputMaterialOrigin: '',
  incoterm: '', incotermPlace: '', unit: 'kg', tiers: [{ quantity: '', price: '' }], pricePubliclyVisible: true, priceConsent: false,
  paymentTerms: '', oem: false, odm: false, samples: false, packaging: '', exportPort: '', leadTimeDays: '', monthlyCapacityKg: '',
  description: '', descriptionDetail: '', attributes: {}, attributePool: '' };
const props = { value, onChange() {}, categories: [{ id: 'cat', slug: 'cashew', label: 'Hạt điều', group: null }],
  policies: { cashew: { maxTiers: 4 } }, imageCount: 0, imageControls: React.createElement('div', null, 'Tải ảnh'), onSave() {}, onSubmit() {} };
let html = renderToStaticMarkup(React.createElement(exports.ProductFormFiveSections, props));
for (const id of ['basic', 'attributes', 'transaction', 'packaging', 'description']) {
  assert.match(html, new RegExp(`id="product-form-${id}"`)); assert.match(html, new RegExp(`href="#product-form-${id}"`));
}
assert.match(html, /Tải ảnh/); assert.match(html, /data-component="preview"/); assert.match(html, /data-component="description"/);
assert.match(html, />Các phần<\/h2>/); assert.match(html, />Thuộc tính sản phẩm<\/h2>/);
assert.match(html, />Thông tin giao dịch<\/h2>/); assert.match(html, />Đóng gói và giao hàng<\/h2>/);
assert.ok(html.indexOf('>Buyer sẽ thấy</h2>') < html.indexOf('data-component="preview"'));
assert.match(html, /Không bắt buộc/); assert.match(html, /Cần bổ sung/);
assert.match(html, /Còn 1 phần cần bổ sung trước khi gửi duyệt/);
assert.match(html, /aria-label="Thời gian giao hàng \(ngày\)"/); assert.match(html, /kg\/tháng/);
assert.match(html, /Tên bắt buộc/); assert.match(html, /<button[^>]*disabled=""[^>]*>Gửi duyệt/);
assert.match(html, /data-component="pricing" data-errors="true" data-warnings="false" data-incoterm="false" data-consent="false"/);
assert.ok(html.indexOf('data-component="incoterm"') < html.indexOf('data-component="pricing"'));
assert.ok(html.indexOf('Hiện giá cho buyer') < html.indexOf('data-component="consent"'));
errors.push({ section: 'transaction', field: 'incotermPlace', message: 'Nhập địa điểm Incoterm.' },
  { section: 'transaction', field: 'priceConsent', message: 'Hãy xác nhận cam kết giá trước khi công khai.' });
html = renderToStaticMarkup(React.createElement(exports.ProductFormFiveSections, props));
assert.match(html, /aria-label="Địa điểm Incoterm" aria-invalid="true"/);
assert.match(html, /Nhập địa điểm Incoterm\./); assert.match(html, /Hãy xác nhận cam kết giá/);
errors.length = 0;
html = renderToStaticMarkup(React.createElement(exports.ProductFormFiveSections, props));
assert.match(html, /<button[^>]*>Gửi duyệt/); assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Gửi duyệt/);
const pendingHtml = renderToStaticMarkup(React.createElement(exports.ProductFormFiveSections, { ...props,
  submitted: true, canSubmit: false, statusText: 'Đã gửi sản phẩm · Đang chờ Vexim kiểm tra',
  feedback: { ok: true, text: 'Đã gửi sản phẩm để Vexim kiểm tra.' } }));
const stickyAt = pendingHtml.indexOf('sticky bottom-0 z-20');
assert.ok(stickyAt > 0 && pendingHtml.indexOf('Đã gửi sản phẩm để Vexim kiểm tra.') > stickyAt,
  'Success appears inside the sticky action bar, not at the top of the page');
assert.match(pendingHtml, /<p role="status"[^>]*>Đã gửi sản phẩm để Vexim kiểm tra\.<\/p>/);
assert.match(pendingHtml, /<button[^>]*disabled=""[^>]*>Đã gửi duyệt<\/button>/);
const failureHtml = renderToStaticMarkup(React.createElement(exports.ProductFormFiveSections, { ...props,
  feedback: { ok: false, text: 'Không xác nhận được kết quả gửi.' } }));
assert.ok(failureHtml.indexOf('Không xác nhận được kết quả gửi.') > failureHtml.indexOf('sticky bottom-0 z-20'));
assert.match(failureHtml, /<p role="alert"[^>]*>Không xác nhận được kết quả gửi\.<\/p>/);
const serverErrors = [{ section: 'attributes', field: 'attributes', code: 'attributes', message: 'Thông số cần kiểm tra' },
  { section: 'transaction', field: 'tiers', code: 'price_spread', message: 'Tỷ lệ giá đã đổi' }];
html = renderToStaticMarkup(React.createElement(exports.ProductFormFiveSections, { ...props, serverErrors }));
assert.ok(html.indexOf('Thông số cần kiểm tra') > html.indexOf('id="product-form-attributes"'));
assert.ok(html.indexOf('Tỷ lệ giá đã đổi') > html.indexOf('id="product-form-transaction"'));
assert.match(html, /<button[^>]*disabled=""[^>]*>Gửi duyệt/);
const comparisonHtml = renderToStaticMarkup(React.createElement(exports.ProductFormFiveSections, { ...props, comparisonOnly: true }));
assert.match(comparisonHtml, /Giá demo không chuyển sang bảng giá mới/);
assert.doesNotMatch(comparisonHtml, /data-component="pricing"|data-component="consent"|data-component="preview"|Buyer sẽ thấy|Gửi duyệt|Lưu nháp/);
assert.match(comparisonHtml, /aria-label="Tên sản phẩm"[^>]*disabled=""/);
assert.doesNotMatch(comparisonHtml, /Tên bắt buộc|Cần bổ sung|Đã xong/);
console.log('Five-section product form: sections, navigation, preview, rich editor, submit and read-only comparison passed');
