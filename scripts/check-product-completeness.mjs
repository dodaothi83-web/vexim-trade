// node --experimental-strip-types --no-warnings scripts/check-product-completeness.mjs
//
// Độ hoàn thiện hồ sơ sản phẩm (Phase 1, chỉ đọc): thang điểm, mục còn thiếu,
// quy tắc ảnh chia sẻ cho người mua, và ba chỗ hiển thị trong cổng/CRM.
// Không gửi email nhắc: nhắc chỉ nằm trong giao diện.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { isExpired } from '../lib/media/readiness.ts';

const source = readFileSync(new URL('../lib/products/completeness.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, {
  exports,
  require(id) {
    assert.equal(id, '@/lib/media/readiness', 'completeness chỉ được phụ thuộc quy tắc tệp hết hạn');
    return { isExpired };
  },
}, { filename: 'completeness.ts' });

const { productCompleteness, completenessSummary, COMPLETENESS_ITEMS, COMPLETENESS_TOTAL } = exports;

/* 1. Trọng số cộng đúng 100 để điểm đọc như phần trăm. */
assert.equal(COMPLETENESS_TOTAL, 100, 'trọng số phải cộng lại thành 100');
assert.equal(COMPLETENESS_ITEMS.length, 15, '12 mục Phase 1 + 3 mục Phase 2');

/* 2. Hồ sơ trống: 0 điểm, mục bắt buộc đứng trước, gợi ý là ảnh thật. */
const empty = productCompleteness({}, []);
assert.equal(empty.score, 0);
assert.equal(empty.earned, 0);
assert.equal(empty.missing.length, COMPLETENESS_ITEMS.length);
assert.equal(empty.next.key, 'photo', 'ảnh thật là mục bắt buộc nặng nhất');
assert.ok(empty.missing.slice(0, 5).every((item) => item.required), 'mục bắt buộc xếp trước');
assert.equal(empty.missingByStep[1], 14, '11 mục Phase 1 ở bước 1 + 3 mục Phase 2');
assert.equal(empty.missingByStep[2], 1);
assert.match(completenessSummary(empty), /^Hồ sơ 0% · còn thiếu ảnh thật$/);

/* 3. Ảnh chỉ tính khi thật sự chia sẻ cho người mua, còn hạn, có tệp. */
const photoFacts = { name: 'Hạt điều', spec: 'W320', category: 'cashew' };
const internalOnly = productCompleteness(photoFacts, [{ kind: 'image', audience: 'internal', status: 'checked', expires_on: null, storage_path: 'p/a.jpg' }]);
assert.equal(internalOnly.done.includes('photo'), false, 'ảnh nội bộ không tính');
const expiredPhoto = productCompleteness(photoFacts, [{ kind: 'image', audience: 'buyer', status: 'checked', expires_on: '2020-01-01', storage_path: 'p/a.jpg' }]);
assert.equal(expiredPhoto.done.includes('photo'), false, 'ảnh hết hạn không tính');
const catalogueOnly = productCompleteness(photoFacts, [{ kind: 'catalogue', audience: 'buyer', status: 'checked', expires_on: null, storage_path: 'p/a.pdf' }]);
assert.equal(catalogueOnly.done.includes('photo'), false, 'catalogue không thay ảnh thật');
const sharedPhoto = productCompleteness(photoFacts, [{ kind: 'image', audience: 'buyer', status: 'unverified', expires_on: null, storage_path: 'p/a.jpg' }]);
assert.equal(sharedPhoto.done.includes('photo'), true, 'ảnh chia sẻ còn hạn được tính, kể cả chưa kiểm');
assert.equal(sharedPhoto.score, 16 + 10 + 9, 'điểm bằng đúng trọng số ảnh + danh mục + quy cách');

/* 4. MOQ, thời gian giao, tên tiếng Anh, mô tả chấp nhận nhiều dạng dữ liệu cũ. */
const shapes = productCompleteness({
  moq_qty: 500,
  lead_time_days: 0,
  name_i18n: { en: 'Cashew W320' },
  description_i18n: { en: 'Cashew kernels packed for export.' },
  reviewed_category_slug: 'cashew-kernels',
  ref_price: 6.4,
}, [{ kind: 'image', audience: 'buyer', status: 'checked', expires_on: null, storage_path: 'p/a.jpg' }]);
for (const key of ['photo', 'category', 'price', 'moq', 'lead_time', 'description', 'name_en']) {
  assert.ok(shapes.done.includes(key), `${key} phải được tính là đã có`);
}
assert.equal(productCompleteness({ moq: '500 kg' }, []).done.includes('moq'), true, 'MOQ dạng chữ vẫn tính');

/* 5. Đủ hết: 100 điểm, không còn mục thiếu, không có gợi ý. */
const full = productCompleteness({
  name: 'Hạt điều W320', display_name: 'Cashew W320 - Bình Phước', category: 'cashew-kernels',
  spec: 'W320, độ ẩm ≤ 5%', description: 'Hạt điều nhân trắng, đóng gói xuất khẩu.',
  ref_price: 6.4, moq_qty: 1000, packaging: 'Túi 22,68 kg, 1 container 20ft',
  lead_time_days: 21, payment_terms: '30% đặt cọc, phần còn lại trước khi giao',
  monthly_capacity: '300 tấn', export_port: 'Cát Lái',
  keywords: ['cashew', 'w320'], sample_price_usd: 0, package_type: 'bao', package_weight_kg: 22.68,
}, [{ kind: 'image', audience: 'buyer', status: 'checked', expires_on: null, storage_path: 'p/a.jpg' }]);
assert.equal(full.score, 100);
assert.equal(full.missing.length, 0);
assert.equal(full.next, null);
assert.match(completenessSummary(full), /Hồ sơ đủ 100\/100 mục/);

/* 6. Điểm là tổng trọng số thật, không phải đếm số mục. */
const partial = productCompleteness({ category: 'cashew-kernels', ref_price: 6.4, spec: 'W320' }, []);
assert.equal(partial.score, 28);
assert.equal(partial.earned, 10 + 9 + 9);
assert.equal(partial.next.key, 'photo');

/* 6b. Phase 2: từ khoá, giá mẫu (kể cả 0) và kích thước kiện. */
const phase2 = productCompleteness({ keywords: ['cashew'], sample_price_usd: 0, package_type: 'bao' }, []);
for (const key of ['keywords', 'sample_price', 'package_measure']) {
  assert.ok(phase2.done.includes(key), `${key} phải được tính là đã có`);
}
const noPhase2 = productCompleteness({ keywords: [], sample_price_usd: null, package_type: '  ' }, []);
for (const key of ['keywords', 'sample_price', 'package_measure']) {
  assert.ok(noPhase2.missing.some((item) => item.key === key), `${key} trống thì vẫn nhắc`);
}
const weightSum = COMPLETENESS_ITEMS.reduce((sum, item) => sum + item.weight, 0);
assert.equal(weightSum, 100, 'trọng số Phase 1 + Phase 2 vẫn cộng lại thành 100');

/* 7. Nhắc chỉ trong cổng/CRM: module thuần, không email, không CSDL. */
assert.doesNotMatch(source, /notify|@\/lib\/email|resend/i, 'không gửi email nhắc ở Phase 1');
assert.doesNotMatch(source, /server-only|@\/lib\/db|getStore/, 'thang đo phải thuần, dùng được ở client');
const copyLines = source.split('\n').filter((line) => /\b(label|hint):/.test(line));
for (const line of copyLines) assert.doesNotMatch(line, /\bbuyer\b|\bNCC\b/, 'chuỗi hiển thị dùng "người mua"/"nhà cung cấp"');

/* 8. Ba chỗ hiển thị dùng chung một nguồn. */
const editor = readFileSync(new URL('../app/supplier/portal/products/product-editor.tsx', import.meta.url), 'utf8');
const storefront = readFileSync(new URL('../app/supplier/portal/products/product-storefront.tsx', import.meta.url), 'utf8');
const crmList = readFileSync(new URL('../app/crm/products/page.tsx', import.meta.url), 'utf8');
for (const [name, file] of [['editor', editor], ['storefront', storefront], ['CRM list', crmList]]) {
  assert.match(file, /productCompleteness/, `${name} phải dùng productCompleteness`);
}
assert.match(editor, /Độ hoàn thiện hồ sơ/, 'editor có khối độ hoàn thiện');
const asideStart = editor.indexOf('<aside className="space-y-3 lg:sticky');
const qualityCardAt = editor.indexOf('aria-label="Độ hoàn thiện hồ sơ"', asideStart);
const previewCardAt = editor.indexOf('relative aspect-square', asideStart);
assert.ok(asideStart > -1 && qualityCardAt > asideStart && previewCardAt > qualityCardAt,
  'thẻ điểm chất lượng đứng trước thẻ ảnh sản phẩm xem trước');
assert.doesNotMatch(editor, /Chỉ để nhắc thêm/, 'thẻ điểm chất lượng không còn câu nhắc "chỉ để nhắc thêm"');
assert.match(editor, /Bổ sung: \{completeness\.next\.label\}/, 'editor gọi tên mục cần bổ sung');
assert.match(editor, /scrollToSection\(completeness\.next!\.step === 2 \? "sec-media" : "sec-basic"\)/,
  'nút bổ sung cuộn tới đúng khối trên trang một-bước');
assert.doesNotMatch(editor, /Bổ sung ở bước/, 'không còn địa chỉ theo bước');
assert.match(storefront, /completenessSummary\(completeness\)/, 'thẻ sản phẩm trong cổng có câu nhắc');
assert.match(crmList, /completenessSummary/, 'CRM thấy cùng số liệu');

/* 9. Không phải cổng chặn đăng: cổng thật vẫn ở lib/media/readiness. */
// Nút gửi tự lưu trước, nhưng cổng thật vẫn ở server: tên, mô tả/quy cách, danh mục, ảnh.
assert.match(editor, /submitSupplierProductAction\(form\)/, 'gửi duyệt vẫn qua cổng thật ở server');
assert.doesNotMatch(editor, /completeness\.score\s*[<>=]+\s*100[^\n]*disabled/, 'không chặn nút theo điểm hoàn thiện');

console.log('✅ Độ hoàn thiện hồ sơ: trọng số 100, quy tắc ảnh, gợi ý đúng bước, nhắc chỉ trong cổng và CRM.');
