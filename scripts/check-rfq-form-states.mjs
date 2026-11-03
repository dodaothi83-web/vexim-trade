// node --experimental-strip-types scripts/check-rfq-form-states.mjs
//
// Render thật component form RFQ ở cả hai trạng thái để chặn lỗi "hai chế độ lẫn vào nhau":
//  - Vào từ trang sản phẩm: có thẻ "You are asking about", ô yêu cầu đổi thành
//    "Your requirements" (tuỳ chọn), dòng "Product" tự tick, và các gợi ý MOQ/cảng/incoterm.
//  - Vào từ menu: không có thẻ, nhãn vẫn là "What do you need?" và bắt buộc.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';

const file = 'app/(public)/rfq/rfq-form.tsx';
const output = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const Icon = () => null;
const mocks = {
  react: React,
  'react/jsx-runtime': jsx,
  'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => new URLSearchParams('') },
  'next/link': { default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
  'lucide-react': new Proxy({}, { get: () => Icon }),
  './actions': { submitRfqAction: async () => ({ ok: true }) },
  '@/components/form-challenge': { FormChallenge: () => null },
  '@/components/ui': { cx: (...parts) => parts.filter(Boolean).join(' ') },
};
const mod = { exports: {} };
vm.runInNewContext(output, {
  module: mod, exports: mod.exports, process, console, Date, URLSearchParams, JSON, Math, Number, String, RegExp, Array, Object, Boolean,
  require: (key) => {
    assert.ok(key in mocks, `Unexpected import ${key} in ${file}`);
    return mocks[key];
  },
}, { filename: file });
const { RfqForm } = mod.exports;

const baseProps = {
  categories: [{ slug: 'cashew', name: 'Cashew kernels' }],
  categorySpecs: { cashew: { grades: ['W320', 'W240'], certs: ['HACCP'] } },
  initialProductId: 'p-1', initialCategory: 'cashew', initialProduct: 'Cashew Kernels W320',
  initialGrade: 'W320', initialSupplierIds: ['s-1'], initialSuppliers: [{ id: 's-1', name: 'Bình Phước Kernel Co.' }],
  wantsSamples: false, mode: 'quote',
};
const contextProduct = {
  id: 'p-1', name: 'Cashew Kernels W320', imageUrl: '/public-media/x.jpg',
  supplierName: 'Bình Phước Kernel Co.', supplierHref: '/suppliers/binh-phuoc',
  checks: ['Documents checked'], grade: 'W320', moq: '1 MT', incoterm: 'FOB',
  referencePrice: '$6.90–7.10/kg', priceUpdatedAt: '2 Nov 2026',
  packaging: '50 kg bag', leadTime: '21 days', exportPort: 'Cat Lai, HCMC',
  certificates: ['HACCP', 'BRCGS'],
};

const withCard = renderToStaticMarkup(React.createElement(RfqForm, { ...baseProps, contextProduct }));
// Vào từ menu: không chỉ định nhà cung cấp, cũng không có sản phẩm nguồn.
const menuOnly = renderToStaticMarkup(React.createElement(RfqForm, { ...baseProps, initialSupplierIds: [], initialSuppliers: [] }));

/* Trạng thái 1: mở từ trang sản phẩm */
for (const needle of [
  'You are asking about',
  'Cashew Kernels W320',
  'Bình Phước Kernel Co.',
  '✓ Documents checked',
  'Supplier holds:',
  'HACCP',
  'See certificates',
  '/suppliers/binh-phuoc#certificates',
  'Your requirements',
  'Anything specific about this product?',
  'Supplier MOQ: 1 MT',
  'Your destination port. Supplier ships from Cat Lai, HCMC.',
  'reference price is FOB', // HTML escape dấu nháy trong chuỗi gợi ý
  'Packaging and lead time',
  '$6.90–7.10/kg',
  'updated 2 Nov 2026',
  'Your request goes to this supplier first.',
  '1/6 required',
]) {
  assert.ok(withCard.includes(needle), `Thẻ sản phẩm phải render "${needle}"`);
}
assert.ok(!withCard.includes('1/3 approved'), 'Không được hiện "x/3 approved"');
assert.ok(withCard.includes('type="month"'), 'Shipment month dùng ô chọn tháng của trình duyệt');
assert.ok(!withCard.includes('Only Vexim sees it'), 'Đã bỏ câu chú thích dưới ô chia sẻ giá mục tiêu');
assert.ok(!withCard.includes('What do you need?'), 'Có thẻ sản phẩm thì không còn nhãn mô tả sản phẩm');
assert.match(withCard, /Your requirements<\/label>|Your requirements/, 'Ô yêu cầu đổi nhãn');

/* Trạng thái 2: vào từ menu */
for (const needle of ['What do you need?', 'What you need', '0/6 required', 'Not sure which supplier fits?']) {
  assert.ok(menuOnly.includes(needle), `Trạng thái menu phải render "${needle}"`);
}
for (const absent of ['You are asking about', 'Your requirements', 'Supplier holds:', 'Supplier MOQ:']) {
  assert.ok(!menuOnly.includes(absent), `Trạng thái menu không được có "${absent}"`);
}

console.log('✅ RFQ form states: có thẻ sản phẩm thì "Your requirements" tuỳ chọn + Product tự tick; vào từ menu vẫn bắt buộc mô tả.');
