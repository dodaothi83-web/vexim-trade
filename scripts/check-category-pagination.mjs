// node --experimental-strip-types --no-warnings scripts/check-category-pagination.mjs
// Lưới trang danh mục chia 12 thẻ mỗi trang. Trang một và trang hai không lặp thẻ,
// số trang nằm trên địa chỉ `?page=` để chia sẻ và cho máy tìm kiếm đọc được.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as order from '../lib/public/supplier-product-order.ts';

// Phần thuần: cắt trang và đếm trang.
assert.equal(order.CATEGORY_PAGE_SIZE, 12, 'Mỗi trang mười hai thẻ, đúng ba hàng bốn cột');
const items = Array.from({ length: 30 }, (_, index) => index);
assert.deepEqual(order.categoryPageSlice(items, 1).items, items.slice(0, 12));
assert.deepEqual(order.categoryPageSlice(items, 2).items, items.slice(12, 24));
assert.deepEqual(order.categoryPageSlice(items, 3).items, items.slice(24, 30));
assert.equal(order.categoryPageSlice(items, 3).pages, 3);
assert.equal(order.categoryPageSlice(items, 99).page, 3, 'Số trang vượt phạm vi kẹp về trang cuối');
assert.equal(order.categoryPageSlice(items, 0).page, 1, 'Số trang không hợp lệ quay về trang một');
assert.equal(order.categoryPageCount(0), 1, 'Danh sách rỗng vẫn là một trang');
assert.equal(order.categoryPageCount(12), 1, 'Đúng một trang thì không hiện dãy số');

// Phần giao diện: render thật lưới ở trang một và trang hai.
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
  '@/lib/public/sponsored-band': { withoutSponsoredBand: (list) => list },
  '@/lib/public/supplier-product-order': order,
  '@/lib/products/grade-pricing': { classifyMoqFilterGroup: () => 'ask' },
  '@/lib/public/product-comparison': { hasProductComparisonPeer: () => false },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../components/category-product-grid.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(code, { exports, console, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });

// 30 sản phẩm của 10 nhà cung cấp, mỗi nhà 3 sản phẩm nên không nhà nào bị cắt.
const products = Array.from({ length: 30 }, (_, index) => ({
  id: `p${index}`, supplierId: `s${Math.floor(index / 3)}`, supplierName: `NCC ${Math.floor(index / 3)}`,
  name: `Product ${index}`, grade: 'W320', grades: ['W320'], imagePaths: [], moq: '1 MT',
  price: '$6', incoterm: 'FOB', verificationSteps: [], province: 'Binh Phuoc',
}));
const render = (props = {}) => renderToStaticMarkup(React.createElement(exports.CategoryProductGrid,
  { products, categorySlug: 'cashew-kernels', grades: ['W320'], ...props }));
const namesOn = (html) => [...html.matchAll(/Product (\d+)/g)].map((match) => Number(match[1]));

const firstPage = render();
const firstNames = namesOn(firstPage);
assert.equal(firstNames.length, 12, 'Trang một hiện mười hai thẻ');
assert.equal(new Set(firstNames).size, 12, 'Trong một trang không lặp thẻ');
// Thứ tự trên lưới là thứ tự xếp hạng đã xen kẽ nhà cung cấp, chỉ cắt bớt chứ không sắp lại.
const ranked = order.arrangeSupplierProducts(products, 3).shown.map((product) => Number(product.name.split(' ')[1]));
assert.deepEqual(firstNames, ranked.slice(0, 12), 'Trang một là mười hai thẻ đầu của danh sách đã xếp hạng');
assert.match(firstPage, /page 1 of 3/, 'Dòng đếm nói rõ đang ở trang nào');
assert.match(firstPage, /href="\/products\/cashew-kernels\?page=2"/, 'Số trang là liên kết thật, máy tìm kiếm theo được');
assert.match(firstPage, /aria-label="Pagination"/);
assert.match(firstPage, /aria-current="page"[^>]*>1</, 'Trang hiện tại được đánh dấu');
assert.doesNotMatch(firstPage, /rel="prev"/, 'Trang một không có Previous');

const secondPage = render({ page: 2 });
const secondNames = namesOn(secondPage);
assert.equal(secondNames.length, 12, 'Trang hai cũng mười hai thẻ');
assert.equal(secondNames.filter((name) => firstNames.includes(name)).length, 0, 'Hai trang không lặp thẻ');
assert.deepEqual(secondNames, ranked.slice(12, 24), 'Trang hai tiếp đúng thứ tự, không nhảy cóc');
assert.match(secondPage, /rel="prev"/);
assert.match(secondPage, /href="\/products\/cashew-kernels\?page=3"/);
assert.match(secondPage, /page 2 of 3/);

const lastPage = render({ page: 3 });
assert.equal(namesOn(lastPage).length, 6, 'Trang cuối giữ phần còn lại');
assert.doesNotMatch(lastPage, /rel="next"/, 'Trang cuối không có Next');

// Tham số lọc khác được giữ khi chuyển trang.
assert.match(render({ keepQuery: 'cert=haccp' }), /href="\/products\/cashew-kernels\?cert=haccp&amp;page=2"/,
  'Chuyển trang không làm mất bộ lọc chứng nhận');
// Số trang vượt phạm vi không tạo trang trắng.
assert.equal(namesOn(render({ page: 99 })).length, 6, '?page=99 rơi về trang cuối');
console.log('Category pagination: 12 thẻ mỗi trang, không lặp thẻ, số trang nằm trên ?page=');
