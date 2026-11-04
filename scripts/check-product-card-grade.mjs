// node scripts/check-product-card-grade.mjs — giữ grade trong tên và tooltip, không tự thêm chip.
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
  '@/components/buyer-saved-products': { SaveProductButton: icon },
  '@/components/product-compare-checkbox': { ProductCompareCheckbox: icon },
  '@/components/product-trade-labels': { ProductTradeLabels: icon },
  '@/components/verification-tier': { VerificationPips: icon, VerificationTierBadge: icon },
});

const base = { href: '/p/1', moq: '1 MT', price: '$1,500–2,000/MT', incoterm: 'FOB', leadTimeDays: 19, supplierName: 'Supplier', verificationSteps: [1] };
const render = (props) => renderToStaticMarkup(React.createElement(PublicProductCard, { ...base, ...props }));

// 1. Grade trong tên và tooltip được giữ nguyên.
const withGrade = render({ name: 'Premium Vietnam Black Pepper 570g/l Wholesale', grades: ['570 g/L'] });
assert.doesNotMatch(withGrade, /All grades:/, 'Không còn nút chip grade trên thẻ');
assert.match(withGrade, /570g\/l/, 'Tên trên thẻ giữ grade');
assert.match(withGrade, /title="Premium Vietnam Black Pepper 570g\/l Wholesale"/, 'Tooltip giữ nguyên tên và grade');

// 2. Giữ nguyên nhiều grade trong tên, không thêm chip hay +N.
const many = render({ name: 'Vietnam Raw Cashew Kernels W320, W240', grades: ['W180', 'W240', 'W320', 'LP'] });
assert.doesNotMatch(many, /All grades:|>\+3<|>\+2</, 'Không còn chip grade hay nút +N');
assert.match(many, /W320, W240/, 'Giữ cả nhiều grade trong tên');
assert.match(many, /title="Vietnam Raw Cashew Kernels W320, W240"/, 'Giữ nguyên tên nhiều grade');

// 3. Tên không có grade thì giữ nguyên, không thêm gì vào tooltip.
const clean = render({ name: 'Vietnam Raw Cashew Kernels', grades: ['W180', 'W320'] });
assert.match(clean, /title="Vietnam Raw Cashew Kernels"/, 'Tên sạch giữ nguyên văn');

// 4. Grade viết thành chữ là tên mặt hàng, không bỏ: bỏ đi thì tên chỉ còn mảnh vụn.
const wordGrade = render({ name: 'Cassia split, bark 2.5 mm', grades: ['Cassia split', 'Cassia whole'] });
assert.match(wordGrade, /title="Cassia split, bark 2.5 mm"/, 'Giữ nguyên grade dạng tên mặt hàng');

// 5. Ô test không nhắc grade.
assert.doesNotMatch(render({ name: 'Test item', test: true, grades: ['W320'] }), /W320/, 'Thẻ test không nhắc grade');

// 6. Hàng cuối chỉ còn tên người bán; không còn nút báo giá riêng, không còn nhãn "Supplied by".
const plain = render({ supplierName: 'Minh Long Coffee' });
assert.doesNotMatch(plain, /Request a quote for|>Quote</, 'Thẻ không còn nút báo giá riêng');
assert.doesNotMatch(plain, /Supplied by/, 'Bỏ nhãn "Supplied by": tên người bán đứng một mình ở hàng cuối');
assert.match(plain, /Minh Long Coffee/, 'Tên người bán vẫn hiện trên thẻ');

const cardSource = readFileSync(new URL('../components/public-product-card.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(cardSource, /quoteHref/, 'Thẻ không nhận quoteHref nữa');
assert.doesNotMatch(cardSource, /min-h-9/, 'Bỏ min-h-9: chiều cao hàng cuối do huy hiệu quyết định, không do nút');
// Đáy thẻ: đường kẻ ở trên, rồi nhà cung cấp và ba khiên trên đúng một hàng.
assert.match(cardSource, /mt-2 border-t border-ink-100 pt-2 sm:mt-auto sm:pt-2\.5/, 'Đáy thẻ có đường kẻ phía trên nhà cung cấp');
assert.ok(cardSource.includes("flex min-w-0 items-center gap-2"),
  'Tên người bán và huy hiệu nằm chung một hàng, không xuống dòng');
assert.match(cardSource, /min-w-0 flex-1 truncate text-\[11px\] font-bold leading-5/, 'Tên tự cắt bằng dấu ba chấm để nhường chỗ cho khiên');

console.log('✅ Thẻ sản phẩm: không chip grade, giữ grade trong tên và tooltip, hàng cuối chỉ còn tên người bán + huy hiệu.');

// Explicit corners avoid overlapping responsive side-radius utilities resetting top-left.
assert.match(clean, /overflow-hidden rounded-tl-xl rounded-bl-xl bg-ink-50 sm:rounded-bl-none sm:rounded-tr-xl/);
assert.doesNotMatch(clean, /sm:rounded-l-none/);
assert.match(clean, /overflow-visible rounded-xl/, 'Verification tooltips remain unclipped by the card');
console.log('✓ Product image corners: top-left retained on desktop, mobile left corners and tooltip overflow preserved.');

assert.doesNotMatch(readFileSync(new URL('../components/public-product-card.tsx', import.meta.url), 'utf8'), /SaveProductButton|saveProduct/, 'Listing cards do not expose save controls');
const detailSource = readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(detailSource, /<SaveProductButton[^>]*iconOnly/, 'Product detail keeps its save heart');
console.log('✓ Listing cards omit save hearts; product detail retains its save control.');
