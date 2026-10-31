// node --experimental-strip-types --no-warnings scripts/check-product-extras.mjs
//
// Phase 2 hồ sơ sản phẩm: từ khoá tìm kiếm, giá mẫu và đóng gói có cấu trúc.
// Kiểm tra phần thuần (lib/products/product-extras.ts), migration, form cổng,
// cách đọc/ghi có dự phòng và chỗ hiển thị trong CRM.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import {
  EMPTY_PRODUCT_EXTRAS,
  MAX_PRODUCT_KEYWORDS,
  PRODUCT_EXTRAS_COLUMNS,
  packagingSummary,
  productExtrasFromForm,
  sanitizeKeywords,
  extrasHint,
} from '../lib/products/product-extras.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/* 1. Từ khoá: chuẩn hoá, bỏ dấu, bỏ trùng, tối đa 3, bỏ từ quá ngắn. */
assert.deepEqual(sanitizeKeywords('cashew, W320, Vietnam'), ['cashew', 'w320', 'vietnam']);
assert.deepEqual(sanitizeKeywords(['Hạt điều', 'CASHEW', 'cashew']), ['hat dieu', 'cashew'],
  'bỏ dấu tiếng Việt và bỏ trùng');
assert.equal(sanitizeKeywords('aa, bb, cc, dd, ee').length, MAX_PRODUCT_KEYWORDS, 'tối đa 3 từ khoá');
assert.deepEqual(sanitizeKeywords(''), []);
assert.deepEqual(sanitizeKeywords(null), [], 'ô trống không tạo từ khoá rỗng');
assert.deepEqual(sanitizeKeywords('cashew\nw320;vietnam'), ['cashew', 'w320', 'vietnam'], 'nhận cả xuống dòng và chấm phẩy');
assert.equal(sanitizeKeywords('x'.repeat(80))[0].length <= 40, true, 'cắt từ khoá quá dài');
assert.deepEqual(sanitizeKeywords('  ,, '), [], 'chỉ dấu phẩy thì không có từ khoá');

/* 2. Đọc từ form: kiểm tra số, giữ dữ liệu cũ khi form không gửi trường. */
const form = (values) => ({
  get: (name) => (name in values ? values[name] : null),
  present: (name) => name in values,
});
const submitted = form({
  keywords: 'cashew, w320',
  sample_price_usd: '5,5',
  package_type: 'bao',
  package_weight_kg: '22.68',
  package_size: '60x40x40 cm',
  units_per_carton: '20',
});
const parsed = productExtrasFromForm(submitted.get, submitted.present);
assert.deepEqual(parsed.keywords, ['cashew', 'w320']);
assert.equal(parsed.sample_price_usd, 5.5, 'nhận dấu phẩy thập phân');
assert.equal(parsed.package_weight_kg, 22.68);
assert.equal(parsed.units_per_carton, 20);
assert.equal(parsed.package_size, '60x40x40 cm');

const legacySubmitted = form({ sample_price_usd: '' });
const legacyForm = productExtrasFromForm(legacySubmitted.get, legacySubmitted.present,
  { keywords: ['cashew'], package_type: 'bao', package_weight_kg: 25 });
assert.deepEqual(legacyForm.keywords, ['cashew'], 'form không có ô từ khoá thì giữ nguyên từ khoá đã lưu');
assert.equal(legacyForm.package_weight_kg, 25, 'giữ nguyên khối lượng kiện đã lưu');
assert.equal(legacyForm.sample_price_usd, null, 'ô giá mẫu để trống nghĩa là xoá giá mẫu');

const zeroSubmitted = form({ sample_price_usd: '0' });
const zeroSample = productExtrasFromForm(zeroSubmitted.get, zeroSubmitted.present);
assert.equal(zeroSample.sample_price_usd, 0, 'giá mẫu 0 là hợp lệ (tặng mẫu)');

for (const [values, message] of [
  [{ sample_price_usd: 'năm đô' }, /Giá mẫu phải là số/],
  [{ sample_price_usd: '-2' }, /Giá mẫu không được âm/],
  [{ sample_price_usd: '9999999' }, /Giá mẫu quá lớn/],
  [{ package_weight_kg: '0' }, /Khối lượng mỗi kiện phải lớn hơn 0/],
  [{ units_per_carton: '1,5x' }, /Số đơn vị mỗi thùng phải là số/],
]) {
  const bad = form(values);
  assert.throws(() => productExtrasFromForm(bad.get, bad.present), message);
}

/* 3. Câu mô tả đóng gói và gợi ý còn thiếu. */
assert.equal(packagingSummary(EMPTY_PRODUCT_EXTRAS), '');
assert.match(packagingSummary({ package_type: 'bao', package_weight_kg: 25 }), /^bao 25 kg/);
assert.match(packagingSummary({ package_weight_kg: 22.68 }), /kg\/kiện/);
assert.match(packagingSummary({ units_per_carton: 20 }), /20 đơn vị\/thùng/);
assert.match(extrasHint(EMPTY_PRODUCT_EXTRAS) ?? '', /từ khoá/i);
assert.match(extrasHint({ keywords: ['cashew'], package_type: 'bao', package_weight_kg: 25, sample_price_usd: 5 }) ?? '', /^$/,
  'đủ dữ liệu thì không nhắc');

/* 4. Migration: chỉ thêm cột, không đổi dữ liệu cũ. */
const migrationPath = 'supabase/migrations/20261072_product_keywords_sample_price_packaging.sql';
assert.ok(existsSync(new URL(`../${migrationPath}`, import.meta.url)), 'thiếu file migration Phase 2');
const migration = read(migrationPath);
for (const column of PRODUCT_EXTRAS_COLUMNS) {
  assert.match(migration, new RegExp(`add column if not exists ${column}\\b`), `migration thiếu cột ${column}`);
}
assert.doesNotMatch(migration, /\bupdate\s+supplier_products\b/i, 'không backfill dữ liệu cũ');
assert.doesNotMatch(migration, /\bdelete\s+from\b/i, 'không xoá dữ liệu');
assert.match(migration, /drop constraint if exists/, 'chạy lại được nhiều lần');

/* 5. Ghi có dự phòng: thiếu cột thì báo việc cần làm, không nuốt dữ liệu. */
const store = read('lib/db/supabase.ts');
assert.match(store, /PRODUCT_EXTRAS_COLUMNS/, 'store dùng chung danh sách cột Phase 2');
assert.match(store, /missingProductExtrasColumn/, 'có nhánh nhận diện cột chưa tồn tại');
assert.match(store, /withoutEmptyProductExtras/, 'chỉ bỏ cột đang rỗng khi thử lại');
assert.match(store, /productExtrasMigrationRequired/, 'có thông báo thay thế khi giá trị thật không lưu được');
assert.doesNotMatch(store, /Báo người phụ trách kỹ thuật[^"]*migration/i, 'thông báo cho người dùng không lộ chi tiết kỹ thuật');

/* 6. Form cổng và server action dùng chung một cách đọc. */
const editor = read('app/supplier/portal/products/product-editor.tsx');
for (const name of ['keywords', 'sample_price_usd', 'package_type', 'package_weight_kg', 'package_size', 'units_per_carton']) {
  assert.match(editor, new RegExp(`name="${name}"`), `form 3 bước thiếu ô ${name}`);
}
assert.match(editor, /data-form-section="sec-price"/, 'giá mẫu nằm trong khối giá');
assert.match(editor, /data-form-section="sec-shipping"/, 'các ô đóng gói nằm trong khối đóng gói & giao hàng');
assert.match(editor, /data-form-section="sec-basic"/, 'từ khoá nằm trong khối tên & từ khoá');
const actions = read('app/supplier/portal/product-actions.ts');
assert.match(actions, /productExtrasFromForm\(/, 'server action kiểm tra lại dữ liệu Phase 2');
assert.match(actions, /\.\.\.extras,/, 'giá trị Phase 2 được ghi cùng sản phẩm');

/* 7. CRM thấy được dữ liệu mới. */
const crm = read('app/crm/products/[slug]/edit/page.tsx');
assert.match(crm, /Từ khoá và đóng gói/, 'trang sửa sản phẩm trong CRM hiển thị từ khoá và đóng gói');
assert.match(crm, /packagingSummary/, 'CRM dùng chung câu mô tả đóng gói');

/* 8. Văn phong: chuỗi mới dùng "người mua", không lộ từ nội bộ. */
const moduleSource = read('lib/products/product-extras.ts');
for (const line of moduleSource.split('\n').filter((l) => /\b(hint|label)\b/.test(l) && /["']/.test(l))) {
  assert.doesNotMatch(line, /\bbuyer\b|\bNCC\b/, 'chuỗi hiển thị dùng "người mua"/"nhà cung cấp"');
}

console.log('✅ Phase 2 hồ sơ sản phẩm: từ khoá, giá mẫu, đóng gói có cấu trúc, ghi có dự phòng và hiển thị CRM.');
