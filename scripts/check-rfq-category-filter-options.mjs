// Synthetic server-render checks only; no network or production data writes.
// node scripts/check-rfq-category-filter-options.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';

let categories = [], suppliers = [], listFailed = false, productContext = null;
const RfqForm = () => null;
let buyerSession = { uid: 'buyer-account', email: 'buyer@example.com' };
const BuyerEnquiryEntry = () => null;
const mocks = {
  '@/lib/auth/buyer-session': { getBuyerSession: async () => buyerSession },
  '@/components/buyer-enquiry-auth': { BuyerEnquiryEntry },
  'react/jsx-runtime': jsx,
  'next/navigation': { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
  'next/link': { default: () => null },
  './rfq-form': { RfqForm },
  '@/components/ui': { Breadcrumbs: () => null },
  '@/lib/db': { getStore: () => ({ getSupplier: async (id) => suppliers.find((s) => s.id === id) ?? null, listCategories: async ({ publishedOnly }) => {
    assert.equal(publishedOnly, true);
    if (listFailed) throw new Error('category read unavailable');
    return categories;
  } }) },
  '@/lib/products/grade-pricing': { standardGradesForCategory: (category) => category.standardGrades ?? [] },
  '@/lib/public/catalog': { listPublicSuppliers: async () => suppliers },
  '@/lib/public/product-catalog': { listCachedPublicSuppliers: async () => suppliers },
  '@/lib/supplier-portal/onboarding': { canInviteSupplier: async () => true },
};
// Tên nhà cung cấp hiện trên banner đi qua helper thật (module thuần, không import gì),
// để kiểm này bắt luôn việc banner rơi về tên pháp nhân viết hoa.
const supplierNameExports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL('../lib/public/supplier-name.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: supplierNameExports, require: (key) => { throw Error(`Unexpected import in lib/public/supplier-name.ts: ${key}`); } },
);
mocks['@/lib/public/supplier-name'] = supplierNameExports;
// Thẻ ngữ cảnh sản phẩm: kiểm này chỉ cần biết trang có chuyển nguyên object xuống form.
mocks['@/lib/public/rfq-product-context'] = { loadRfqProductContext: async () => productContext };

// Trang đọc cột jsonb qua bộ chuẩn hoá dùng chung, nên biên dịch luôn module đó
// thật thay vì giả lập: kiểm này bao trọn cả hình dạng dữ liệu cũ.
const filterExports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL('../lib/category-filters.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: filterExports, require: (key) => { throw Error(`Unexpected import in lib/category-filters.ts: ${key}`); } },
);
mocks['@/lib/category-filters'] = filterExports;
const exports = {};
const js = ts.transpileModule(readFileSync(new URL('../app/(public)/rfq/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(js, { exports, URLSearchParams, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import: ${key}`);
  return mocks[key];
} });
function findForm(node) {
  if (!React.isValidElement(node)) return null;
  if (node.type === RfqForm) return node.props;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = findForm(child);
    if (found) return found;
  }
  return null;
}
const render = async (params = {}) => {
  const element = await exports.default({ searchParams: Promise.resolve(params) });
  const props = findForm(element);
  assert.ok(props, 'The RFQ form is rendered');
  return props;
};
const plain = (value) => JSON.parse(JSON.stringify(value));

categories = [
  { slug: 'cashew-kernels', name_i18n: { en: 'Cashew kernels' },
    filters: { grades: ['W180', 'W320'], certifications: ['HACCP', { value: 'Organic' }] }, standardGrades: ['W180', 'W320', 'W450'] },
  { slug: 'legacy-object', filters: { grades: ['Special', { value: 'Other grade' }], certifications: ['ISO', null, { value: 'BRC' }] } },
  { slug: 'current-array', filters: [{ key: 'grade', options: [{ value: '500 g/L', label: '500' }, { value: '550 g/L', label: '550' }] },
    { key: 'certifications', options: [{ value: 'HACCP', label: 'HACCP' }, { value: 'ISO', label: 'ISO' }] }] },
  { slug: 'broken-entry', filters: [null, 42, { key: 'grade', options: null }, { key: 'certifications', options: 'invalid' }] },
  { slug: 'null', filters: null },
  { slug: 'broken-object', filters: { grades: 'W320', certifications: [{ value: 1 }, {}, ''] } },
];
let props = await render({ category: 'cashew-kernels', product: 'Cashew', product_id: 'product-1', grade: 'W320' });
assert.deepEqual(plain(props.categorySpecs['cashew-kernels']), { grades: ['W180', 'W320', 'W450'], certs: ['HACCP', 'Organic'] },
  'Standard grades keep priority; object-shaped certifications remain usable');
assert.deepEqual(plain(props.categorySpecs['legacy-object']), { grades: ['Special', 'Other grade'], certs: ['ISO', 'BRC'] });
assert.deepEqual(plain(props.categorySpecs['current-array']), { grades: ['500 g/L', '550 g/L'], certs: ['HACCP', 'ISO'] });
for (const name of ['broken-entry', 'null', 'broken-object'])
  assert.deepEqual(plain(props.categorySpecs[name]), { grades: [], certs: [] }, `${name} should not crash the page`);
assert.equal(props.initialCategory, 'cashew-kernels');
assert.equal(props.initialProductId, 'product-1');
assert.equal(props.initialGrade, 'W320');
assert.equal(props.mode, 'quote');

suppliers = [{ id: 'supplier-1', name: 'Vendor', display_name: 'Public vendor' }];
await assert.rejects(() => render({ intent: 'question', suppliers: 'supplier-1', product_id: 'product-1' }), /REDIRECT:\/rfq/);
// Banner phải dùng tên ngắn, không bày tên pháp nhân viết hoa toàn bộ.
suppliers = [{ id: 'supplier-2', name: 'CÔNG TY TNHH CHẾ BIẾN HẠT ĐIỀU BÌNH PHƯỚC', trade_name: null, display_name: null }];
props = await render({ suppliers: 'supplier-2' });
assert.deepEqual(plain(props.initialSuppliers), [{ id: 'supplier-2', name: 'Chế Biến Hạt Điều Bình Phước' }],
  'Banner dùng tên ngắn đã hạ kiểu chữ, bỏ tiền tố loại hình doanh nghiệp');
suppliers = [{ id: 'supplier-3', name: 'CÔNG TY TNHH ABC', trade_name: 'ABC Nuts', display_name: null }];
props = await render({ suppliers: 'supplier-3' });
assert.deepEqual(plain(props.initialSuppliers), [{ id: 'supplier-3', name: 'ABC Nuts' }], 'Tên thương mại thắng tên pháp nhân');
suppliers = [{ id: 'supplier-1', name: 'Vendor', display_name: 'Public vendor' }];
await assert.rejects(() => render({ intent: 'question', suppliers: 'unlisted', product_id: 'product-1' }), /REDIRECT:\/rfq/);
// Thẻ ngữ cảnh sản phẩm được chuyển nguyên xuống form, không tự dựng lại ở client.
productContext = { id: 'product-1', name: 'Cashew Kernels W320', supplierName: 'Bình Phước Kernel Co.', checks: ['Documents checked'] };
await assert.rejects(() => render({ intent: 'question', category: 'cashew-kernels', suppliers: 'supplier-1', product_id: 'product-1' }), /REDIRECT:\/products\/cashew-kernels\/product-1\?ask=1/);
props = await render({ category: 'cashew-kernels', suppliers: 'supplier-1', product_id: 'product-1' });
assert.deepEqual(plain(props.contextProduct), productContext, 'Trang chuyển thẻ ngữ cảnh sản phẩm xuống form');
productContext = null;
props = await render({ category: 'cashew-kernels' });
assert.equal(props.contextProduct, null, 'Vào từ menu không có thẻ ngữ cảnh');

listFailed = true;
props = await render();
assert.deepEqual(plain(props.categories), [], 'Existing category-read fallback remains intact');
console.log('RFQ page: object and array category filters, malformed data, grade precedence and targeted supplier behavior passed.');

buyerSession = null;
const gated = await exports.default({ searchParams: Promise.resolve({ product_id: 'product-1', suppliers: 'supplier-1', sample: '1', grade: 'W320' }) });
assert.equal(gated.type, BuyerEnquiryEntry);
assert.equal(findForm(gated), null, 'No quote form before authentication');
assert.match(gated.props.next, /product_id=product-1/);
assert.match(gated.props.next, /suppliers=supplier-1/);
assert.match(gated.props.next, /sample=1/);
assert.match(gated.props.next, /grade=W320/);
