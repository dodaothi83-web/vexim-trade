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
    QuantityPricingV2Editor: (props) => React.createElement('div', { 'data-component': 'pricing', 'data-errors': String(props.showErrors), 'data-warnings': String(props.showWarnings) }, props.incotermPlace) },
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
assert.match(html, /Tên bắt buộc/); assert.match(html, /<button[^>]*disabled=""[^>]*>Gửi duyệt/);
assert.match(html, /data-component="pricing" data-errors="true" data-warnings="false"/);
errors.push({ section: 'transaction', field: 'incotermPlace', message: 'Nhập địa điểm Incoterm.' },
  { section: 'transaction', field: 'priceConsent', message: 'Hãy xác nhận cam kết giá trước khi công khai.' });
html = renderToStaticMarkup(React.createElement(exports.ProductFormFiveSections, props));
assert.match(html, /aria-label="Địa điểm Incoterm" aria-invalid="true"/);
assert.match(html, /Nhập địa điểm Incoterm\./); assert.match(html, /Hãy xác nhận cam kết giá/);
errors.length = 0;
html = renderToStaticMarkup(React.createElement(exports.ProductFormFiveSections, props));
assert.match(html, /<button[^>]*>Gửi duyệt/); assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Gửi duyệt/);
const serverErrors = [{ section: 'attributes', field: 'attributes', code: 'attributes', message: 'Thông số cần kiểm tra' },
  { section: 'transaction', field: 'tiers', code: 'price_spread', message: 'Tỷ lệ giá đã đổi' }];
html = renderToStaticMarkup(React.createElement(exports.ProductFormFiveSections, { ...props, serverErrors }));
assert.ok(html.indexOf('Thông số cần kiểm tra') > html.indexOf('id="product-form-attributes"'));
assert.ok(html.indexOf('Tỷ lệ giá đã đổi') > html.indexOf('id="product-form-transaction"'));
assert.match(html, /<button[^>]*disabled=""[^>]*>Gửi duyệt/);
console.log('Five-section product form: sections, navigation, preview, rich editor and submit state passed');
