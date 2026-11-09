// node --experimental-strip-types --no-warnings scripts/check-category-certificate-filter.mjs
// Bộ lọc "Certifications" trên trang danh mục: chỉ liệt kê chứng nhận thật sự có
// mặt trên ít nhất một sản phẩm, lấy nhãn trực tiếp từ certificateLabelsForProducts
// đã gắn vào thẻ (PublicCategoryProduct.certificates), không gõ cứng danh sách riêng.
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

const base = { grades: [], imagePaths: [], moq: '1 MT', price: '$6', incoterm: 'FOB', verificationSteps: [], province: 'Binh Phuoc' };
const render = (products) => renderToStaticMarkup(React.createElement(exports.CategoryProductGrid,
  { products, categorySlug: 'cashew', grades: [] }));

// Chưa sản phẩm nào có chứng nhận: không hiện mục Certifications.
const noCerts = render([
  { ...base, id: 'p1', supplierId: 's1', supplierName: 'NCC A', name: 'Cashew kernels' },
  { ...base, id: 'p2', supplierId: 's2', supplierName: 'NCC B', name: 'Cashew kernels' },
]);
assert.doesNotMatch(noCerts, /Certifications/, 'Không có sản phẩm nào có chứng nhận thì không hiện bộ lọc trống');

// Hai sản phẩm có chứng nhận khác nhau, một sản phẩm trùng một chứng nhận.
const withCerts = render([
  { ...base, id: 'p1', supplierId: 's1', supplierName: 'NCC A', name: 'Cashew kernels W320', certificates: ['HACCP', 'ISO 22000'] },
  { ...base, id: 'p2', supplierId: 's2', supplierName: 'NCC B', name: 'Cashew kernels W180', certificates: ['HACCP'] },
  { ...base, id: 'p3', supplierId: 's3', supplierName: 'NCC C', name: 'Cashew kernels SP' },
]);
assert.match(withCerts, /Certifications/, 'Có sản phẩm mang chứng nhận thì hiện bộ lọc');
// Mỗi chứng nhận chỉ liệt kê một lần trong danh sách lựa chọn (không lặp theo số sản phẩm có nó),
// nhưng khối lọc tự render hai lần (cột desktop + khối thu gọn trên điện thoại).
for (const cert of ['HACCP', 'ISO 22000']) {
  const checkboxes = (withCerts.match(new RegExp(`type="checkbox"[^]{0,20}?${cert}`, 'g')) ?? []).length;
  assert.equal(checkboxes, 2, `Chứng nhận ${cert} chỉ xuất hiện một lần mỗi khối lọc, không lặp theo số sản phẩm mang nó`);
}
// Sản phẩm chưa có chứng nhận nào vẫn hiện bình thường (không bị coi là không khớp bộ lọc mặc định).
assert.match(withCerts, /Cashew kernels SP/, 'Sản phẩm chưa gắn chứng nhận vẫn hiện khi chưa lọc');

console.log('Category certificate filter: chỉ liệt kê chứng nhận có thật, không lặp, ẩn khi danh mục không ai có chứng nhận.');
