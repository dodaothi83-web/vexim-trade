// node --experimental-strip-types --no-warnings scripts/check-category-grade-filter.mjs
// Grade chỉ được lọc ở một chỗ trên trang danh mục: danh sách trong cột lọc (bản
// desktop và bản thu gọn trên điện thoại dùng chung một khối). Trước đây còn một
// dãy chip grade nằm ngay trên lưới sản phẩm, trùng đúng danh sách đó.
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
  // Danh mục kiểu cũ: grade nằm trong cột filters, không nằm trong product_fields.
  '@/lib/product-attributes': { fieldsFor: () => [] },
  '@/lib/sponsored/pilot': {},
  '@/lib/public/sponsored-band': { withoutSponsoredBand: (items) => items },
  '@/lib/public/supplier-product-order': { arrangeSupplierProducts: (items) => ({ shown: items, hidden: new Map() }),
    categoryPageSlice: (items, page) => ({ items: items.slice(0, 12), page, pages: 1, total: items.length }) },
  '@/lib/products/grade-pricing': { classifyMoqFilterGroup: () => 'ask' },
  '@/lib/public/product-comparison': { hasProductComparisonPeer: () => false },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../components/category-product-grid.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(code, { exports, console, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });

const products = [
  { id: 'p1', supplierId: 's1', supplierName: 'NCC A', name: 'Cashew kernels W320', grade: 'W320', grades: ['W320'],
    imagePaths: [], moq: '1 MT', price: '$6', incoterm: 'FOB', verificationSteps: [], province: 'Binh Phuoc' },
  { id: 'p2', supplierId: 's2', supplierName: 'NCC B', name: 'Cashew kernels W180', grade: 'W180', grades: ['W180'],
    imagePaths: [], moq: '1 MT', price: '$9', incoterm: 'FOB', verificationSteps: [], province: 'Binh Phuoc' },
];
const html = renderToStaticMarkup(React.createElement(exports.CategoryProductGrid,
  { products, categorySlug: 'cashew', grades: ['W180', 'W320'] }));

assert.doesNotMatch(html, /Quick grade filters/, 'Không còn dãy chip grade phía trên lưới sản phẩm');
assert.match(html, /^<div class="mt-7 grid /, 'Lưới sản phẩm bắt đầu ngay sau tiêu đề, không chen dãy chip');
// Mỗi grade hiện đúng hai lần: cột lọc desktop và bản thu gọn trên điện thoại.
for (const grade of ['W180', 'W320']) {
  const checkboxes = (html.match(new RegExp(`type="checkbox"[^]{0,20}?${grade}`, 'g')) ?? []).length;
  assert.equal(checkboxes, 2, `Grade ${grade} chỉ nằm trong khối lọc, không lặp ở đầu trang`);
}
assert.equal((html.match(/Grade \/ type/g) ?? []).length, 2, 'Mục Grade / type chỉ có trong khối lọc');
assert.doesNotMatch(html, /aria-label="Quick grade filters"/);
console.log('Category grade filter: grade chỉ lọc ở cột lọc danh mục, không có dãy chip trùng phía trên');
