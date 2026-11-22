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
  '@/lib/products/price-display': { priceAmountText: (value) => String(value), priceCurrencySymbol: () => '$' },
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
assert.match(cardSource, /border-t border-ink-100 pt-1\.5 sm:mt-auto sm:pt-2\.5/, 'Đáy thẻ có đường kẻ phía trên nhà cung cấp');
assert.ok(cardSource.includes("flex min-w-0 items-center gap-1.5 sm:gap-2"),
  'Tên người bán và huy hiệu nằm chung một hàng, không xuống dòng');
assert.match(cardSource, /min-w-0 flex-1 truncate text-\[10px\] font-bold leading-4/, 'Tên tự cắt bằng dấu ba chấm để nhường chỗ cho khiên');

console.log('✅ Thẻ sản phẩm: không chip grade, giữ grade trong tên và tooltip, hàng cuối chỉ còn tên người bán + huy hiệu.');

// Explicit corners avoid overlapping responsive side-radius utilities resetting top-left.
assert.match(clean, /overflow-hidden rounded-tl-xl rounded-bl-xl bg-ink-50 sm:rounded-bl-none sm:rounded-tr-xl/);
assert.doesNotMatch(clean, /sm:rounded-l-none/);
assert.match(clean, /overflow-visible rounded-xl/, 'Verification tooltips remain unclipped by the card');
console.log('✓ Product image corners: top-left retained on desktop, mobile left corners and tooltip overflow preserved.');

// Thẻ ngang trên điện thoại: ảnh vuông không bị cắt, phần chữ thu gọn để vừa chiều cao ảnh
// (tiêu đề 2 dòng, giá nhỏ hơn, MOQ/Lead time nhỏ hơn hai cỡ, nhà cung cấp + khiên nhỏ hơn).
// Từ sm (thẻ dọc) giữ nguyên kích thước cũ.
const markup = render({ imagePath: 'products/a.webp' });
const thumbColumn = markup.match(/<article[^>]*>\s*<div class="([^"]+)"/)?.[1] ?? '';
assert.match(thumbColumn, /\bw-\[40%\]/, 'Cột ảnh 40% để ảnh vuông đủ cao cho phần chữ');
assert.match(thumbColumn, /\bself-stretch\b/, 'Không để hở trắng dưới ảnh nếu chữ cao hơn');
assert.match(markup, /class="relative aspect-square h-full w-full overflow-hidden[^"]*sm:h-auto/, 'Khung ảnh vuông');
assert.match(markup, /<img[^>]*class="h-full w-full object-cover"/, 'Ảnh phủ kín khung, đồng nhất mọi thẻ');
const titleClass = markup.match(/<h3[^>]*class="([^"]+)"/)?.[1] ?? '';
assert.match(titleClass, /(^|\s)line-clamp-2(\s|$)/, 'Điện thoại: tiêu đề hai dòng rồi dấu …');
assert.match(titleClass, /sm:line-clamp-3/, 'Thẻ dọc không chứng nhận vẫn ba dòng');
assert.match(titleClass, /text-\[13px\][^"]*leading-4[^"]*sm:text-sm sm:leading-5/);
assert.doesNotMatch(render({ imagePath: 'products/a.webp', certificates: ['HACCP'] }).match(/<h3[^>]*class="([^"]+)"/)?.[1] ?? '', /line-clamp-3/, 'Có chứng nhận: hai dòng ở mọi cỡ');
assert.match(markup, /text-\[15px\] font-extrabold leading-\[18px\][^"]*sm:text-\[16px\] sm:leading-6/, 'Giá nhỏ hơn trên điện thoại, giữ cỡ cũ từ sm');
assert.equal(markup.match(/<dt class="text-\[9px\][^"]*sm:text-\[10px\] sm:leading-4"/g)?.length, 2, 'Nhãn MOQ / Lead time 10→9px');
assert.equal(markup.match(/<dd[^>]*class="truncate text-\[11px\][^"]*sm:text-\[13px\] sm:leading-5"/g)?.length, 2, 'Giá trị MOQ / Lead time 13→11px');
assert.match(markup, /text-\[10px\] font-bold leading-4 text-(?:brand-700|ink-800)[^"]*sm:text-xs sm:leading-5/, 'Tên nhà cung cấp nhỏ hơn trên điện thoại');
assert.match(markup, /class="flex shrink-0 sm:inline"/, 'Hàng khiên chỉ cao đúng cỡ khiên, không ăn line-height 24px');
assert.match(cardSource, /variant="marketplace" shortTooltips dense/, 'Khiên 16px trên thẻ ngang');
assert.match(readFileSync(new URL('../components/verification-tier.tsx', import.meta.url), 'utf8'), /dense \? "h-4 w-4 sm:h-5 sm:w-5"/);
assert.match(markup, /max-sm:justify-between/, 'Ảnh cao hơn chữ: khoảng dư chia đều, không dồn một chỗ');
assert.match(markup, /class="border-t border-ink-100 pt-1\.5 sm:mt-auto sm:pt-2\.5"/, 'Thẻ dọc: hàng nhà cung cấp bám đáy thẻ');
const multiGrade = render({ imagePath: 'products/a.webp', price: null, gradeRows: [
  { grade: 'W240', priceMin: 6.1, priceMax: 6.4, priceText: '$6.1–6.4/kg' }, { grade: 'W320', priceMin: 5.8, priceMax: 6, priceText: '$5.8–6/kg' }] });
assert.match(multiGrade, /<span class="text-\[10px\] font-medium text-ink-500 sm:hidden">· 2 grades<\/span>/, 'Điện thoại: "N grades" đứng cạnh giá');
assert.match(multiGrade, /<p class="truncate[^"]*max-sm:hidden"><span class="max-sm:hidden">2 grades<\/span><\/p>/, 'Thẻ dọc: "N grades" vẫn ở dòng riêng như cũ');
console.log('✓ Mobile horizontal card: square image (not cropped), title 2 lines, smaller price/MOQ/lead time/supplier/shields to fit the image height.');

assert.doesNotMatch(readFileSync(new URL('../components/public-product-card.tsx', import.meta.url), 'utf8'), /SaveProductButton|saveProduct/, 'Listing cards do not expose save controls');
const detailSource = readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(detailSource, /<SaveProductButton[^>]*iconOnly/, 'Product detail keeps its save heart');
console.log('✓ Listing cards omit save hearts; product detail retains its save control.');
