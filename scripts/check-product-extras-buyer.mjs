// node --experimental-strip-types --no-warnings scripts/check-product-extras-buyer.mjs
//
// Đợt A+B (30/10/2026): đưa dữ liệu Phase 2 ra trang người mua và cho từ khoá
// thật sự tìm được. Kiểm tra phần thuần (đóng gói/giá mẫu tiếng Anh, gắn chứng
// nhận theo sản phẩm, xếp hạng tìm kiếm, gợi ý tìm kiếm theo danh mục) và các
// chỗ nối để không ai vô tình hạ cổng công bố.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  packageTypeEnglish,
  packagingSummaryEnglish,
  samplePriceEnglish,
} from '../lib/public/product-extras-display.ts';
import { approvedProductCertificateIds } from '../lib/public/product-certificate-links.ts';
import { categoryKeywordSearches, CATEGORY_KEYWORD_LIMIT } from '../lib/public/category-searches.ts';
import { compareSearchRelevance, productSearchRelevance } from '../lib/public/search-ranking.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/* 1. Đóng gói: số liệu có cấu trúc, tiếng Anh, không đẩy nguyên văn tiếng Việt lên trang buyer. */
assert.equal(
  packagingSummaryEnglish({ package_type: 'bao', package_weight_kg: 25, package_size: '60x40x40 cm', units_per_carton: 20 }),
  '25 kg bag · 60x40x40 cm · 20 units/carton',
);
assert.equal(packageTypeEnglish('Thùng carton'), 'carton', 'bỏ dấu và chuẩn hoá chữ thường');
assert.equal(packageTypeEnglish('bao jumbo'), 'jumbo bag');
assert.equal(packageTypeEnglish('Bao PP'), 'pp woven bag');
assert.equal(packageTypeEnglish('bao lưới'), null, 'từ tiếng Việt chưa biết thì bỏ hẳn, không hiện nguyên văn');
assert.equal(packageTypeEnglish('Sack'), 'sack', 'nhà cung cấp đã gõ tiếng Anh thì giữ');
assert.equal(packageTypeEnglish(''), null);
assert.equal(packageTypeEnglish(null), null);
assert.equal(packagingSummaryEnglish({ package_type: 'bao lưới', package_weight_kg: 25 }), '25 kg per package',
  'mất phần loại kiện nhưng vẫn giữ khối lượng');
assert.equal(packagingSummaryEnglish({ package_weight_kg: 22.68 }), '22.68 kg per package');
assert.equal(packagingSummaryEnglish({ package_type: 'bao' }), 'Bag', 'chỉ có loại kiện thì viết hoa đầu câu');
assert.equal(packagingSummaryEnglish({ units_per_carton: 1000 }), '1,000 units/carton');
assert.equal(packagingSummaryEnglish({}), '', 'chưa khai gì thì không hiện dòng trống');
assert.equal(packagingSummaryEnglish({ package_weight_kg: 0, units_per_carton: 0 }), '', 'không nhận số 0 là dữ liệu thật');

/* 2. Giá mẫu: đúng đơn vị tiền, không tự đổi 0 thành "miễn phí". */
assert.equal(samplePriceEnglish({ sample_price_usd: 5 }), 'USD 5.00 per sample');
assert.equal(samplePriceEnglish({ sample_price_usd: 12.5 }), 'USD 12.50 per sample');
assert.equal(samplePriceEnglish({ sample_price_usd: 0 }), 'USD 0.00 per sample');
assert.equal(samplePriceEnglish({ sample_price_usd: null }), null);
assert.equal(samplePriceEnglish({}), null);
assert.equal(samplePriceEnglish({ sample_price_usd: -1 }), null);

/* 3. Chứng nhận theo sản phẩm: chỉ danh sách nhân viên đã duyệt gắn. */
const certRows = [
  { id: 'c-approved', supplier_id: 'sup-1', approved_product_ids: ['p-1'] },
  { id: 'c-only-requested', supplier_id: 'sup-1', requested_product_ids: ['p-1'] },
  { id: 'c-other-product', supplier_id: 'sup-1', approved_product_ids: ['p-2'] },
  { id: 'c-other-supplier', supplier_id: 'sup-2', approved_product_ids: ['p-1'] },
  { id: 'c-broken', supplier_id: 'sup-1', approved_product_ids: 'p-1' },
  { id: 'c-null', supplier_id: 'sup-1', approved_product_ids: null },
];
const linked = approvedProductCertificateIds(certRows, 'sup-1', 'p-1');
assert.deepEqual([...linked], ['c-approved'], 'chỉ chứng nhận đã duyệt gắn cho đúng sản phẩm của đúng nhà cung cấp');
assert.equal(approvedProductCertificateIds(certRows, '', 'p-1').size, 0);
assert.equal(approvedProductCertificateIds(certRows, 'sup-1', '').size, 0);
assert.equal(approvedProductCertificateIds([], 'sup-1', 'p-1').size, 0);

/* 4. Từ khoá tham gia tìm kiếm nhưng không thành mã quy cách. */
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
const find = (query, { product = '', grade = '', structuredGrade = grade, category = '', keywords = '', supplier = '' }) =>
  productSearchRelevance(
    norm(query).trim().split(/\s+/).filter(Boolean),
    {
      product: norm(product), grade: norm(grade), structuredGrade: norm(structuredGrade),
      category: norm(category), keywords: norm(keywords), supplier: norm(supplier),
    },
  );
const keywordOnly = find('durian', { product: 'Fruit mix', keywords: 'durian, frozen' });
assert.ok(keywordOnly, 'từ khoá giúp sản phẩm xuất hiện trong tìm kiếm');
assert.deepEqual(keywordOnly, { productCodes: 0, coreTokens: 1, wholeCoreTokens: 0 },
  'từ khoá chỉ nâng độ phủ, không được tính là khớp trọn từ của tên sản phẩm');
assert.equal(find('durian', { product: 'Fruit mix' }), null, 'không có từ khoá thì không khớp');
const supplierOnly = find('durian', { product: 'Fruit mix', supplier: 'Durian Export' });
assert.ok(compareSearchRelevance(keywordOnly, supplierOnly) < 0, 'từ khoá của sản phẩm mạnh hơn tên nhà cung cấp');
const nameMatch = find('durian', { product: 'Durian ri6', grade: 'RI6' });
const keywordMatch = find('durian', { product: 'Fruit mix', keywords: 'durian' });
assert.ok(compareSearchRelevance(nameMatch, keywordMatch) < 0, 'tên sản phẩm vẫn mạnh hơn từ khoá');
const spoofed = find('w320', { product: 'Cashew W240', grade: 'W240', keywords: 'w320' });
assert.equal(spoofed, null ?? spoofed);
assert.ok(spoofed, 'từ khoá không làm mất kết quả vốn đã khớp nhờ tên');
assert.equal(spoofed.productCodes, 0, 'mã trong từ khoá không được tính là mã quy cách của sản phẩm');
assert.deepEqual(find('hat dieu', { product: 'Cashew', keywords: 'hat dieu' }),
  { productCodes: 0, coreTokens: 2, wholeCoreTokens: 0 }, 'từ khoá đã bỏ dấu vẫn khớp truy vấn tiếng Việt');
assert.equal(find('w320', { product: 'Cashew', grade: 'W240', keywords: 'w320' }).productCodes, 0,
  'grade lệch quy cách vẫn không bị từ khoá "sửa" thành khớp');

/* 5. Gợi ý tìm kiếm theo danh mục. */
const suggestions = categoryKeywordSearches([
  { keywords: ['cashew', 'w320', 'vietnam'] },
  { keywords: ['cashew', 'w240'] },
  { keywords: ['vietnam'] },
  { keywords: [] },
  {},
], { categoryName: 'Cashew nuts' });
assert.deepEqual(suggestions, ['vietnam', 'w320', 'w240'],
  'từ khoá trùng tên danh mục bị bỏ, còn lại xếp theo số sản phẩm dùng rồi tới thứ tự xuất hiện');
assert.equal(categoryKeywordSearches([{ keywords: ['ab', 'ok'] }], {}).includes('ab'), false, 'bỏ từ khoá quá ngắn');
assert.equal(categoryKeywordSearches([{ keywords: ['bbb', 'aaa', 'ccc', 'ddd', 'eee', 'fff', 'ggg', 'hhh'] }], {}).length,
  CATEGORY_KEYWORD_LIMIT, 'tối đa 6 chip');
assert.deepEqual(categoryKeywordSearches([], { categoryName: 'Cashew' }), [], 'không có sản phẩm thì không có chip');
assert.deepEqual(categoryKeywordSearches([{ keywords: ['Cashew'] }], { categoryName: 'cashew nuts' }), [],
  'so khớp tên danh mục không phân biệt hoa thường');

/* 6. Nối vào trang người mua: chỉ hiện khi có dữ liệu, không mở cổng công bố. */
const detail = read('app/(public)/products/[slug]/[productId]/page.tsx');
assert.match(detail, /packagingSummaryEnglish/, 'trang buyer dùng đóng gói có cấu trúc');
assert.match(detail, /structuredPackaging \|\| detailedPackaging \|\| enPackaging/,
  'có đóng gói có cấu trúc thì ưu tiên, chưa có thì giữ mô tả cũ');
assert.match(detail, /\{samplePrice && <Spec label="Sample price"/, 'giá mẫu chỉ hiện khi có số');
assert.match(detail, /productCertificates\.length > 0/, 'không có chứng nhận đã gắn thì không hiện khối');
assert.match(detail, /hasCertification/, 'structured data có chứng nhận');
assert.match(detail, /approvedProductCertificateIds/, 'chỉ dùng danh sách gắn đã được duyệt');
assert.doesNotMatch(detail, /requested_product_ids/, 'trang buyer không bao giờ đọc yêu cầu gắn của nhà cung cấp');
assert.doesNotMatch(detail, /"@type": "Offer"/, 'không khai Offer cho giá tham khảo');
assert.match(detail, /pushProperty\("Packaging", structuredPackaging\)/, 'đóng gói vào additionalProperty');
assert.match(detail, /pushProperty\("Sample price", samplePrice\)/, 'giá mẫu vào additionalProperty');
assert.match(detail, /Valid until:/, 'chứng nhận hiện hạn dùng');
assert.match(detail, /Issuer:/, 'chứng nhận hiện đơn vị cấp');

const certificates = read('lib/public/certificates.ts');
assert.match(certificates, /export function publicProductCertificates/);
assert.match(certificates, /publicSupplierCertificates\(supplierId, certificates, media, today\)\s*\n?\s*\.filter/,
  'lọc theo sản phẩm SAU khi đã áp bộ lọc công khai của hồ sơ nhà cung cấp');
assert.match(certificates, /approvedProductCertificateIds/);

const searchPage = read('app/(public)/search/page.tsx');
assert.match(searchPage, /keywords: searchText\(product\.keywords \?\? \[\]\)/, 'trang tìm kiếm đưa từ khoá vào xếp hạng');

const catalog = read('lib/public/product-catalog.ts');
assert.match(catalog, /keywords: Array\.isArray\(p\.keywords\)/, 'thẻ sản phẩm công khai mang theo từ khoá');
assert.doesNotMatch(catalog, /product-extras/, 'product-catalog không import thêm module (script kiểm tra nạp bằng require map riêng)');

const categoryPage = read('app/(public)/products/[slug]/page.tsx');
assert.match(categoryPage, /categoryKeywordSearches\(products, \{ categoryName \}\)/, 'chip gợi ý dựng từ từ khoá thật');
assert.match(categoryPage, /\/search\?q=\$\{encodeURIComponent\(keyword\)\}&cat=\$\{encodeURIComponent\(cat\.slug\)\}/,
  'chip trỏ về trang tìm kiếm đúng danh mục');

console.log('✅ Product extras to buyers: English packaging/sample price, product-linked certificates, keyword search and category suggestions.');
