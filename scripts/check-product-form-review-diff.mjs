// node scripts/check-product-form-review-diff.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-review-diff.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, require: (key) => { throw Error(`Unexpected import ${key}`); } });
const before = { name: 'Hạt tiêu', category: 'pepper', grade: '500 g/L', customGrade: false, spec: 'Đen',
  rawMaterialRegion: '', inputMaterialOrigin: '', attributes: { moisture: '12%' }, incoterm: 'FOB', incotermPlace: 'Cát Lái',
  unit: 'mt', tiers: [{ quantity: '1', price: '1500' }], pricePubliclyVisible: true, priceConsent: true,
  paymentTerms: '', oem: false, odm: false, samples: false, packaging: '', exportPort: '', leadTimeDays: '', monthlyCapacityKg: '',
  description: 'Mô tả', descriptionDetail: '<p>Chi tiết</p>', attributePool: '' };
const after = { ...before, grade: 'Đặc biệt', customGrade: true, pricePubliclyVisible: false, priceConsent: false,
  tiers: [{ quantity: '1', price: '1600' }, { quantity: '3', price: '1500' }], attributes: { moisture: '12%', grade: 'unexpected' } };
const diff = exports.productFormReviewDiff(before, after);
const field = (label) => diff.find((row) => row.label === label);
assert.equal(field('Tên sản phẩm').changed, false); assert.equal(field('Grade').previous, '500 g/L');
assert.equal(field('Grade').submitted, 'Đặc biệt (tự nhập)'); assert.equal(field('Grade').changed, true);
assert.match(field('Bảng giá theo số lượng').submitted, /Mức 2: từ 3 tấn, USD 1500\/tấn/);
assert.equal(field('Công khai giá').previous, 'Có'); assert.equal(field('Công khai giá').submitted, 'Không');
assert.equal(field('Cam kết giá').previous, null, 'A reset in the prefill does not prove the old consent state');
assert.equal(exports.productFormReviewDiff(before, after, { baselineConsentKnown: true }).find((row) => row.label === 'Cam kết giá').previous, 'Có');
assert.match(field('Thuộc tính khác').submitted, /grade: unexpected/, 'Do not hide unexpected data from the reviewer');
const unknown = exports.productFormReviewDiff(null, after);
assert.ok(unknown.every((row) => row.previous === null && row.changed === null), 'Unknown legacy baseline is never guessed');
assert.equal(before.tiers.length, 1, 'Comparison does not mutate the source');
console.log('Review comparison: all form fields, tier units, custom grades and unknown legacy baseline passed');
