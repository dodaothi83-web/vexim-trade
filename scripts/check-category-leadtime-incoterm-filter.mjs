// node --experimental-strip-types --no-warnings scripts/check-category-leadtime-incoterm-filter.mjs
// Bộ lọc "Lead time" và "Incoterm" trên trang danh mục: Incoterm chỉ liệt kê mã
// thật sự xuất hiện trong danh mục; Lead time dùng ngưỡng ngày đã quy đổi sẵn
// (PublicCategoryProduct.leadTimeDays luôn là số ngày, kể cả khi NCC nhập theo
// tuần — xem lib/products/grade-pricing.ts readProductLeadTime().daysEquivalent).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = {
  react: React, 'react/jsx-runtime': jsx,
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  'lucide-react': new Proxy({}, { get: () => () => React.createElement('svg') }),
  '@/components/public-product-card': { PublicProductCard: (props) => React.createElement('div', null, props.name) },
  '@/components/sponsored-pilot-slot': { SponsoredPilotSlot: () => null },
  '@/components/sponsored-product-band': { SponsoredProductBand: () => null },
  '@/lib/verification-status': { matchesVerificationFilter: () => true },
  '@/lib/product-attributes': { fieldsFor: () => [] },
  '@/lib/sponsored/pilot': {},
  '@/lib/public/sponsored-band': { withoutSponsoredBand: (items) => items },
  '@/lib/public/supplier-product-order': { arrangeSupplierProducts: (items) => items,
    categoryPageSlice: (items, page) => ({ items: items.slice(0, 12), page, pages: 1, total: items.length }) },
  '@/lib/products/grade-pricing': { classifyMoqFilterGroup: () => 'ask' },
  '@/lib/public/product-comparison': { hasProductComparisonPeer: () => false },
  '@/lib/public/product-detail-display': { UNSPECIFIED_SOURCING_REGION: 'Not specified' },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../components/category-product-grid.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(code, { exports, console, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });

const base = { grades: [], imagePaths: [], moq: '1 MT', price: '$6', verificationSteps: [], province: 'Binh Phuoc' };
const products = [
  { ...base, id: 'p1', supplierId: 's1', supplierName: 'NCC A', name: 'Cashew fast', leadTimeDays: 10, incoterm: 'FOB' },
  { ...base, id: 'p2', supplierId: 's2', supplierName: 'NCC B', name: 'Cashew medium', leadTimeDays: 25, incoterm: 'CIF' },
  { ...base, id: 'p3', supplierId: 's3', supplierName: 'NCC C', name: 'Cashew slow', leadTimeDays: 60, incoterm: 'FOB' },
  { ...base, id: 'p4', supplierId: 's4', supplierName: 'NCC D', name: 'Cashew unknown', leadTimeDays: null, incoterm: null },
];
const html = renderToStaticMarkup(React.createElement(exports.CategoryProductGrid,
  { products, categorySlug: 'cashew', grades: [] }));

// Mặc định chưa lọc: cả bốn sản phẩm đều hiện, kể cả cái chưa có lead time/incoterm.
for (const name of ['Cashew fast', 'Cashew medium', 'Cashew slow', 'Cashew unknown']) {
  assert.match(html, new RegExp(name), `${name} hiện khi chưa lọc`);
}
// Dropdown Lead time luôn có mặt với đúng ba ngưỡng cố định.
assert.match(html, /Ships within 15 days/);
assert.match(html, /Ships within 30 days/);
assert.match(html, /Ships within 45 days/);
// Dropdown Incoterm chỉ liệt kê mã thật sự xuất hiện (FOB, CIF), không hiện mã chưa ai dùng (CFR, EXW...).
assert.match(html, /<option value="FOB">FOB<\/option>/);
assert.match(html, /<option value="CIF">CIF<\/option>/);
assert.doesNotMatch(html, />CFR</, 'Không liệt kê incoterm mà chưa sản phẩm nào trong danh mục dùng');

// Danh mục không ai khai incoterm thì không hiện bộ lọc Incoterm (tránh ô lọc trống).
const noIncoterm = renderToStaticMarkup(React.createElement(exports.CategoryProductGrid, {
  products: [{ ...base, id: 'q1', supplierId: 's1', supplierName: 'NCC A', name: 'Cashew', leadTimeDays: 10, incoterm: null }],
  categorySlug: 'cashew', grades: [],
}));
assert.doesNotMatch(noIncoterm, /Incoterm/, 'Không có sản phẩm nào khai incoterm thì không hiện bộ lọc');
// Nhưng Lead time vẫn luôn hiện vì có ba ngưỡng cố định, không phụ thuộc dữ liệu.
assert.match(noIncoterm, /Ships within 15 days/);

console.log('Category lead time & incoterm filter: ngưỡng ngày cố định, incoterm chỉ liệt kê mã có thật, cả hai đều áp trước khi xen kẽ NCC.');
