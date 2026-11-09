// node --experimental-strip-types --no-warnings scripts/check-category-source-region-filter.mjs
// Bộ lọc vùng nguồn gốc trên trang danh mục (trước đây gọi "Province") phải phản ánh
// raw_material_region của SẢN PHẨM (lib/public/product-catalog.ts), không phải tỉnh
// đăng ký trụ sở của nhà cung cấp — hai giá trị này thường khác nhau (một NCC đăng ký
// trụ sở Hà Nội vẫn có thể bán hạt điều lấy nguyên liệu từ Đồng Nai). Sản phẩm chưa
// khai vùng nguyên liệu mang sentinel UNSPECIFIED_SOURCING_REGION: vẫn hiện khi không
// lọc, nhưng không được liệt kê như một lựa chọn vùng thật trong dropdown.
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

const base = { grades: [], imagePaths: [], moq: '1 MT', price: '$6', verificationSteps: [], leadTimeDays: 10, incoterm: 'FOB' };
const products = [
  { ...base, id: 'p1', supplierId: 's1', supplierName: 'Supplier A (Hanoi HQ)', name: 'Cashew Dong Nai', province: 'Dong Nai' },
  { ...base, id: 'p2', supplierId: 's2', supplierName: 'Supplier B (HCMC HQ)', name: 'Cashew Binh Phuoc', province: 'Binh Phuoc' },
  { ...base, id: 'p3', supplierId: 's3', supplierName: 'Supplier C (Hanoi HQ)', name: 'Cashew unspecified region', province: 'Not specified' },
];
const html = renderToStaticMarkup(React.createElement(exports.CategoryProductGrid,
  { products, categorySlug: 'cashew-kernels', grades: [] }));

// Mặc định chưa lọc: cả ba sản phẩm đều hiện, kể cả cái chưa khai vùng nguyên liệu.
for (const name of ['Cashew Dong Nai', 'Cashew Binh Phuoc', 'Cashew unspecified region']) {
  assert.match(html, new RegExp(name), `${name} hiện khi chưa lọc`);
}
// Nhãn đổi từ "Province" sang "Source region" để không gây hiểu nhầm là địa chỉ công ty.
assert.match(html, /Source region/, 'Nhãn bộ lọc là "Source region", không còn "Province"');
assert.doesNotMatch(html, />Province</, 'Không còn nhãn cũ "Province"');
assert.match(html, /All regions/, 'Lựa chọn mặc định là "All regions"');
// Hai vùng thật (Đồng Nai, Bình Phước — khác tỉnh đăng ký trụ sở Hà Nội/HCMC của hai NCC)
// đều lên dropdown, đúng là dữ liệu THEO SẢN PHẨM chứ không phải theo NCC.
assert.match(html, /<option value="Dong Nai">Dong Nai<\/option>/);
assert.match(html, /<option value="Binh Phuoc">Binh Phuoc<\/option>/);
// Sentinel "chưa khai vùng nguyên liệu" không được liệt kê như một lựa chọn vùng thật.
assert.doesNotMatch(html, /<option value="Not specified">/, 'Sentinel "Not specified" không xuất hiện như lựa chọn lọc');

console.log('Category source region filter: lọc theo vùng nguyên liệu của sản phẩm (không phải trụ sở NCC); sản phẩm chưa khai vùng vẫn hiện nhưng không có trong dropdown.');
