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
  '@/lib/rfq/input-limits': await import('../lib/rfq/input-limits.ts'),
  '@/lib/rfq/grade-tags': await import('../lib/rfq/grade-tags.ts'),
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
const menuOnly = renderToStaticMarkup(React.createElement(RfqForm, { ...baseProps, initialProductId: null, initialGrade: '', initialSupplierIds: [], initialSuppliers: [] }));

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
  'Packaging and lead time',
  '$6.90–7.10/kg',
  'updated 2 Nov 2026',
  'This request goes straight to the selected supplier.',
  'If it does not work out, send a new general RFQ to Vexim.',
  '1/6 required',
]) {
  assert.ok(withCard.includes(needle), `Thẻ sản phẩm phải render "${needle}"`);
}
assert.ok(!withCard.includes('1/3 approved'), 'Không được hiện "x/3 approved"');
// Shipment month (ô type="month") nằm trong mục chi tiết đang đóng; check-rfq-form-compact kiểm nguồn.
assert.ok(!withCard.includes('Only Vexim sees it'), 'Đã bỏ câu chú thích dưới ô chia sẻ giá mục tiêu');
assert.ok(!withCard.includes('What do you need?'), 'Có thẻ sản phẩm thì không còn nhãn mô tả sản phẩm');
assert.match(withCard, /Your requirements<\/label>|Your requirements/, 'Ô yêu cầu đổi nhãn');

// Mục "Add details" đóng khi mở trang, kể cả khi URL đã có grade (W320).
assert.ok(withCard.includes('aria-expanded="false"'), 'Mục chi tiết đóng mặc định');
assert.ok(!withCard.includes('id="rfq-details"'), 'Nội dung chi tiết chưa render khi đang đóng');
assert.ok(withCard.includes('Phone / WhatsApp (optional)'), 'Phone / WhatsApp hiện ngay trong YOUR DETAILS');
assert.ok(!/target price/i.test(withCard), 'Không còn giá mục tiêu');
// Sản phẩm đã có danh mục + grade → tóm tắt mục chi tiết không nhắc Category/Grade.
assert.ok(withCard.includes('Incoterm, shipment month, certificates, packing.'), 'Tóm tắt bỏ Category/Grade khi đã biết từ sản phẩm');

/* Trạng thái 2: vào từ menu */
for (const needle of ['What do you need?', 'What you need', '0/6 required', 'Not sure which supplier fits?', 'Category, grade, incoterm, shipment month, certificates, packing.']) {
  assert.ok(menuOnly.includes(needle), `Trạng thái menu phải render "${needle}"`);
}
for (const absent of ['You are asking about', 'Your requirements', 'Supplier holds:', 'Supplier MOQ:']) {
  assert.ok(!menuOnly.includes(absent), `Trạng thái menu không được có "${absent}"`);
}

/* Chip grade chỉ thuộc đúng ngành hàng đang hỏi */
const { relevantGradeTags } = await import('../lib/rfq/grade-tags.ts');
const coffeeTea = ['Robusta G1 S18', 'Robusta G2 S16', 'Arabica S18'];
const slug = 'coffee-tea-specialty-beverages';
assert.deepEqual(
  relevantGradeTags(coffeeTea, { categorySlug: slug, context: 'Vietnam Special Thai Nguyen Green Tea Assam Type', strict: true }),
  [], 'Sản phẩm trà không nhận chip grade cà phê');
assert.deepEqual(
  relevantGradeTags(coffeeTea, { categorySlug: slug, context: 'Vietnam Green Robusta Coffee Beans Grade 1', strict: true }),
  coffeeTea, 'Sản phẩm cà phê vẫn có chip grade cà phê');
assert.deepEqual(
  relevantGradeTags(coffeeTea, { categorySlug: slug, context: 'Premium Vietnam beverage', strict: true }),
  [], 'Sản phẩm trong danh mục gộp mà tên không rõ ngành → không đoán');
assert.deepEqual(relevantGradeTags(coffeeTea, { categorySlug: slug, context: '' }), coffeeTea, 'RFQ chung chưa gõ gì → giữ grade của danh mục');
assert.deepEqual(relevantGradeTags(coffeeTea, { categorySlug: slug, context: 'Black tea OP for blending' }), [], 'RFQ chung gõ "tea" → bỏ grade cà phê');
const anise = ['Cassia whole', 'Cassia split', 'Star anise', 'Star anise oil'];
assert.deepEqual(
  relevantGradeTags(anise, { categorySlug: 'cinnamon-star-anise', context: 'Premium Star Anise Vietnam Autumn Crop', strict: true }),
  ['Star anise', 'Star anise oil'], 'Hoa hồi không nhận chip quế');
const cashew = ['W180', 'W240', 'W320', 'LP'];
assert.deepEqual(relevantGradeTags(cashew, { categorySlug: 'cashew-kernels', context: 'Cashew kernels', strict: true }), cashew, 'Grade trung tính giữ nguyên');

console.log('✅ RFQ form states: có thẻ sản phẩm thì "Your requirements" tuỳ chọn + Product tự tick; vào từ menu vẫn bắt buộc mô tả.');
