// node scripts/check-product-card-grade.mjs — thẻ sản phẩm công khai không vẽ chip grade
// nữa: grade đã nằm trong tên sản phẩm. Chỉ khi tên không nhắc tới grade nào thì tooltip
// của tên mới nhắc, để thông tin grade không bị mất.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const req = createRequire(import.meta.url);
const jsx = req('react/jsx-runtime');

function load(file, mocks) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, console, Date, Number, RegExp, Set, Map, Array, Object, String, Math,
    require(id) { assert.ok(id in mocks, `unexpected import ${id}`); return mocks[id]; },
  });
  return module.exports;
}

const icon = () => null;
const { PublicProductCard } = load('../components/public-product-card.tsx', {
  '@/lib/products/price-display': {},
  'react/jsx-runtime': jsx,
  'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': new Proxy({}, { get: () => icon }),
  '@/components/sponsored-disclosure': { SponsoredDisclosure: icon },
  '@/components/product-compare-checkbox': { ProductCompareCheckbox: icon },
  '@/components/product-trade-labels': { ProductTradeLabels: icon },
  '@/components/verification-tier': { VerificationPips: icon, VerificationTierBadge: icon },
});

const base = { href: '/p/1', moq: '1 MT', price: '$1,500–2,000/MT', incoterm: 'FOB', leadTimeDays: 19, supplierName: 'Supplier', verificationSteps: [1], quoteHref: '/rfq' };
const render = (props) => renderToStaticMarkup(React.createElement(PublicProductCard, { ...base, ...props }));

// 1. Tên đã ghi grade: không còn chip grade, không lặp grade ở tooltip.
const withGrade = render({ name: 'Premium Vietnam Black Pepper 570g/l Wholesale', grades: ['570 g/L'] });
assert.doesNotMatch(withGrade, /All grades:/, 'Không còn nút chip grade trên thẻ');
assert.match(withGrade, /Premium Vietnam Black Pepper 570g\/l Wholesale/, 'Tên sản phẩm giữ nguyên, không bị bóc grade');
assert.match(withGrade, /title="Premium Vietnam Black Pepper 570g\/l Wholesale"/,
  'Tên đã có grade thì tooltip không nhắc lại grade');

// 2. Nhiều grade trong bảng giá: vẫn không vẽ chip, kể cả chip "+N".
const many = render({ name: 'Vietnam Raw Cashew Kernels', grades: ['W180', 'W240', 'W320', 'LP'] });
assert.doesNotMatch(many, /All grades:|>\+3<|>\+2</, 'Không còn chip grade hay nút +N');
assert.match(many, /title="Vietnam Raw Cashew Kernels · W180, W240, W320, LP"/,
  'Tên chưa có grade thì tooltip liệt kê grade từ bảng Grade và giá');

// 3. Ô test không nhắc grade.
assert.doesNotMatch(render({ name: 'Test item', test: true, grades: ['W320'] }), /W320/, 'Thẻ test không nhắc grade');

console.log('✅ Thẻ sản phẩm: bỏ chip grade, grade chỉ còn trong tên hoặc tooltip.');
