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
  '@/components/verified-badge': { VerifiedBadge: ({ levels }) => React.createElement('span', { 'data-verified-badge': levels.join(',') }) },
  '@/components/brand/vexim-icons': new Proxy({}, { get: () => icon }),
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
// Đáy thẻ: đường kẻ ở trên, rồi nhà cung cấp và nhãn "Verified L1" trên đúng một hàng.
assert.match(cardSource, /border-t border-ink-100 pt-1\.5 sm:mt-auto sm:pt-2"/, 'Đáy thẻ có đường kẻ phía trên nhà cung cấp');
assert.ok(cardSource.includes("flex min-w-0 items-center gap-1.5 sm:gap-2"),
  'Tên người bán và huy hiệu nằm chung một hàng, không xuống dòng');
assert.match(cardSource, /min-w-0 flex-1 truncate text-\[11px\] font-bold leading-4/, 'Tên tự cắt bằng dấu ba chấm để nhường chỗ cho nhãn xác minh');

console.log('✅ Thẻ sản phẩm: không chip grade, giữ grade trong tên và tooltip, hàng cuối chỉ còn tên người bán + huy hiệu.');

// Explicit corners avoid overlapping responsive side-radius utilities resetting top-left.
assert.match(clean, /overflow-hidden rounded-tl-xl rounded-bl-xl bg-ink-50 sm:rounded-bl-none sm:rounded-tr-xl/);
assert.doesNotMatch(clean, /sm:rounded-l-none/);
assert.match(clean, /overflow-visible rounded-xl/, 'Verification tooltips remain unclipped by the card');
console.log('✓ Product image corners: top-left retained on desktop, mobile left corners and tooltip overflow preserved.');

// Thẻ ngang trên điện thoại: ảnh vuông không bị cắt, phần chữ thu gọn để vừa chiều cao ảnh
// (tiêu đề 2 dòng, giá nhỏ hơn, MOQ · Lead time một dòng, nhà cung cấp + nhãn "Verified L1").
// Thẻ gọn 2026-11-24: mọi cỡ màn tiêu đề tối đa hai dòng, chứng nhận đè góc dưới ảnh, chữ nhỏ nhất 11px.
const markup = render({ imagePath: 'products/a.webp' });
const thumbColumn = markup.match(/<article[^>]*>\s*<div class="([^"]+)"/)?.[1] ?? '';
assert.match(thumbColumn, /\bw-\[40%\]/, 'Cột ảnh 40% để ảnh vuông đủ cao cho phần chữ');
assert.match(thumbColumn, /\bself-stretch\b/, 'Không để hở trắng dưới ảnh nếu chữ cao hơn');
assert.match(markup, /class="relative aspect-square h-full w-full overflow-hidden[^"]*sm:h-auto/, 'Khung ảnh vuông');
assert.match(markup, /<img[^>]*class="h-full w-full object-cover"/, 'Ảnh phủ kín khung, đồng nhất mọi thẻ');
const titleClass = markup.match(/<h3[^>]*class="([^"]+)"/)?.[1] ?? '';
assert.match(titleClass, /(^|\s)line-clamp-2(\s|$)/, 'Điện thoại: tiêu đề hai dòng rồi dấu …');
assert.doesNotMatch(titleClass, /line-clamp-3/, 'Thẻ dọc cũng chỉ hai dòng, giá thẳng hàng giữa các thẻ');
assert.match(markup, /<div class="flex min-h-8 flex-col sm:min-h-10">/, 'Luôn giữ đúng hai dòng tiêu đề');
assert.match(titleClass, /text-\[13px\][^"]*leading-4[^"]*sm:text-sm sm:leading-5/);
assert.doesNotMatch(render({ imagePath: 'products/a.webp', certificates: ['HACCP'] }).match(/<h3[^>]*class="([^"]+)"/)?.[1] ?? '', /line-clamp-3/, 'Có chứng nhận: hai dòng ở mọi cỡ');
assert.match(markup, /text-\[15px\] font-extrabold leading-\[18px\][^"]*sm:text-\[16px\] sm:leading-6/, 'Giá nhỏ hơn trên điện thoại, giữ cỡ cũ từ sm');
const terms = markup.match(/<dl class="mt-1 flex min-w-0 items-center[^"]*whitespace-nowrap[^"]*">(.*?)<\/dl>/)?.[1] ?? '';
assert.match(terms, /<dt[^>]*>MOQ<\/dt><dd[^>]*>1 MT<\/dd>.*·.*<span class="sr-only">Lead time<\/span><\/dt><dd[^>]*>19 days<\/dd>/, 'MOQ · Lead time trên một dòng');
assert.match(terms, /<dt class="shrink-0 text-\[11px\]/, 'Nhãn MOQ tối thiểu 11px');
assert.equal(terms.match(/<dd[^>]*class="[^"]*text-\[11px\][^"]*sm:text-\[13px\] sm:leading-5"/g)?.length, 2, 'Giá trị MOQ / Lead time 11px, 13px từ sm');
assert.match(markup, /text-\[11px\] font-bold leading-4 text-(?:brand-700|ink-800)[^"]*sm:text-xs sm:leading-5/, 'Tên nhà cung cấp tối thiểu 11px');
assert.match(markup, /data-verified-badge="1"/, 'Nhãn "Verified L1" nhận đúng các bước đã duyệt');
assert.doesNotMatch(cardSource, /VerificationPips/, 'Thẻ sản phẩm không còn ba khiên');
assert.doesNotMatch(render({ imagePath: 'products/a.webp', test: true }), /data-verified-badge="1"/, 'Dữ liệu thử không hiện cấp xác minh');
assert.match(markup, /max-sm:justify-between/, 'Ảnh cao hơn chữ: khoảng dư chia đều, không dồn một chỗ');
assert.match(markup, /class="border-t border-ink-100 pt-1\.5 sm:mt-auto sm:pt-2"/, 'Thẻ dọc: hàng nhà cung cấp bám đáy thẻ');
const multiGrade = render({ imagePath: 'products/a.webp', price: null, gradeRows: [
  { grade: 'W240', priceMin: 6.1, priceMax: 6.4, priceText: '$6.1–6.4/kg' }, { grade: 'W320', priceMin: 5.8, priceMax: 6, priceText: '$5.8–6/kg' }] });
assert.match(multiGrade, /<span class="text-\[10px\] font-medium text-ink-500 sm:hidden">· 2 grades<\/span>/, 'Điện thoại: "N grades" đứng cạnh giá');
assert.match(multiGrade, /<p class="truncate[^"]*max-sm:hidden"><span class="max-sm:hidden">2 grades<\/span><\/p>/, 'Thẻ dọc: "N grades" vẫn ở dòng riêng như cũ');
// Mọi cỡ màn: nhãn chứng nhận đè góc dưới ảnh (không tốn dòng trong cột chữ), tránh ô Compare ở góc trên phải.
const twoCerts = render({ imagePath: 'products/a.webp', certificates: ['ISO 22000', 'HACCP'] });
const overlayRe = /<div class="pointer-events-none absolute inset-x-1\.5 bottom-1\.5 z-10[^"]*sm:bottom-2"[^>]*>(.*?)<\/div>/;
const overlay = twoCerts.match(overlayRe)?.[1] ?? '';
assert.ok(overlay.includes('ISO 22000') && overlay.includes('HACCP'), 'Hai chứng nhận: cả hai nằm trên ảnh');
assert.doesNotMatch(overlay, /max-sm:hidden|sm:hidden/, 'Hai chứng nhận: hiện cả hai ở mọi cỡ');
assert.doesNotMatch(twoCerts, /mb-1 flex h-5 min-w-0/, 'Không còn dòng nhãn trên tiêu đề');
assert.equal(twoCerts.match(/aria-label="Certificates: ISO 22000, HACCP"/g)?.length, 1, 'Một bản duy nhất cho mọi cỡ màn');
const manyCerts = render({ imagePath: 'products/a.webp', certificates: ['ISO 22000', 'HACCP', 'BRC', 'Organic'] });
const manyOverlay = manyCerts.match(overlayRe)?.[1] ?? '';
assert.match(manyOverlay, /class="[^"]*max-sm:hidden"[^>]*>HACCP</, 'Điện thoại: chứng nhận thứ hai ẩn');
assert.match(manyOverlay, /sm:hidden">\+3</, 'Điện thoại: nhãn đầu + "+3"');
assert.match(manyOverlay, />BRC<.*max-sm:hidden">\+1</, 'Từ sm: ba nhãn + "+1"');
assert.doesNotMatch(manyOverlay, />Organic</, 'Chứng nhận thứ tư gộp vào "+N"');
assert.doesNotMatch(render({ imagePath: 'products/a.webp' }), /absolute inset-x-1\.5 bottom-1\.5/, 'Không chứng nhận thì không có lớp đè');
console.log('✓ Compact card: square image (not cropped), title 2 lines everywhere, certificates on the image, MOQ · lead time on one line, "Verified L1" badge.');

// Nhãn "Verified L1": khiên có số cấp, bảng chi tiết liệt kê đủ ba bước.
const badgeSource = readFileSync(new URL('../components/verified-badge.tsx', import.meta.url), 'utf8');
assert.match(badgeSource, /if \(tier === 0\) return null/, 'Chưa có bước nào duyệt: không hiện nhãn');
assert.match(badgeSource, /VERIFICATION_DISPLAY_ORDER\.map/, 'Bảng chi tiết liệt kê cả ba bước');
assert.match(badgeSource, /"Approved" : "Not approved"/);
assert.match(badgeSource, /label: verificationCheckLabel\(level, l2Scope, on\)/, 'Bước chưa duyệt dùng tên chuẩn, không hiện "L3 review"');
assert.match(badgeSource, /aria-expanded=\{open\}/, 'Chạm để mở trên điện thoại');
assert.match(badgeSource, /addEventListener\("pointerdown"/, 'Chạm ra ngoài để đóng');
assert.match(badgeSource, /event\.key === "Escape"/, 'Esc để đóng');
assert.match(badgeSource, /href="\/how-we-verify"/);
// Màu pill theo cấp (chủ dự án duyệt 24/11/2026): L1 xanh ngọc, L2 xanh dương, L3 hổ phách.
assert.match(badgeSource, /1: \{ color: "#0F766E", bg: "#F0FDFA", border: "#99F6E4" \}/, 'L1 xanh ngọc');
assert.match(badgeSource, /2: \{ color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" \}/, 'L2 xanh dương');
assert.match(badgeSource, /3: \{ color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" \}/, 'L3 hổ phách');
assert.match(badgeSource, /rounded-full border/, 'Dạng pill có viền mảnh');
assert.match(cardSource, /relative z-20 flex min-w-0 items-center/, 'Hàng nhà cung cấp nằm trên link phủ thẻ: chạm nhãn không mở sản phẩm');
console.log('✓ Verified badge: tier shield, three checks with status, tap/escape handling, link to How we verify.');

assert.doesNotMatch(readFileSync(new URL('../components/public-product-card.tsx', import.meta.url), 'utf8'), /SaveProductButton|saveProduct/, 'Listing cards do not expose save controls');
const detailSource = readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(detailSource, /<SaveProductButton[^>]*iconOnly/, 'Product detail keeps its save heart');
console.log('✓ Listing cards omit save hearts; product detail retains its save control.');
