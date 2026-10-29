// node --experimental-strip-types --no-warnings scripts/check-product-form-legacy-edit-seed.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as pricing from '../lib/products/quantity-pricing.ts';
import { entry, revision } from './quantity-v2-test-utils.mjs';
function load(path, mocks) {
  const exports = {}; const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Number, JSON, TextEncoder, Set, Array, require: (key) => { if (!(key in mocks)) throw Error(key); return mocks[key]; } });
  return exports;
}
const grades = { nonGradeProductFields: (fields) => fields.filter(({ key }) => !['grade', 'product_type'].includes(key.trim().toLowerCase())) };
const model = load('../lib/products/product-form-model.ts', { zod: { z }, '@/lib/products/quantity-entry': entry });
const seed = load('../lib/products/product-form-seed.ts', { '@/lib/products/grade-pricing': grades, '@/lib/products/product-form-model': model,
  '@/lib/products/quantity-revision-v2': revision, '@/lib/products/quantity-pricing': pricing });
const clone = load('../lib/products/product-form-legacy-clone-seed.ts', { '@/lib/products/grade-pricing': grades,
  '@/lib/products/product-form-model': model, '@/lib/products/product-form-seed': seed });
const edit = load('../lib/products/product-form-legacy-edit-seed.ts', { '@/lib/products/product-form-legacy-clone-seed': clone,
  '@/lib/products/product-form-model': model }).seedLegacyProductFormEdit;
const product = { id: 'original', name: 'Hạt điều', specs: { grade: 'w320', moisture: '5%', grade_rows: [{ grade: 'W320', price_min: 5, price_max: 7 }], old_spec: 1 },
  ref_price: 5, ref_price_max: 7, moq: '20 bao', unit: 'bao', monthly_capacity: '100 tấn', price_publicly_visible: true,
  incoterm: 'FOB', incoterm_place: 'Cát Lái', certifications: 'HACCP', images: ['real-photo'], description: 'Mô tả' };
const input = { product, categorySlug: 'cashew', fields: [{ key: 'moisture' }], standardGrades: ['W320', 'W240'] };
const before = JSON.stringify(input), result = edit(input);
assert.equal(result.ok, true); assert.equal(result.draft.grade, 'W320'); assert.equal(result.draft.customGrade, false);
assert.equal(result.draft.tiers[0].quantity, ''); assert.equal(result.draft.tiers[0].price, ''); assert.equal(result.draft.unit, 'kg');
assert.equal(result.draft.pricePubliclyVisible, true); assert.equal(result.draft.priceConsent, false);
assert.equal(result.draft.monthlyCapacityKg, ''); assert.equal(result.unrepresentedMonthlyCapacity, '100 tấn');
assert.deepEqual(Array.from(result.unrepresentedSpecKeys), ['grade_rows', 'old_spec']); assert.equal(result.requiresStaffCertificationReview, true);
assert.equal(JSON.stringify(input), before, 'Never mutate the indexed listing or its media');
assert.equal(edit({ ...input, product: { ...product, specs: { grade_rows: [{grade:'W320'},{grade:'W240'}] } } }).reason, 'multiple_grades');
assert.equal(edit({ ...input, product: { ...product, specs: { grade: 'W320', grade_rows: [{grade:'W240'}] } } }).reason, 'ambiguous_grade');
assert.equal(edit({ ...input, product: { ...product, specs: { grade_rows: 'unknown' } } }).reason, 'ambiguous_grade');
for (const specs of [{ grade: ['W320'] }, { grade_rows: [null] }, { grade_rows: [{}] }, { grade_rows: [{ grade: '' }] }])
  assert.equal(edit({ ...input, product: { ...product, specs } }).reason, 'ambiguous_grade');
assert.equal(edit({ ...input, product: { ...product, specs: { grade: 'x'.repeat(81) } } }).reason, 'unrepresentable_fields');
let custom = edit({ ...input, product: { ...product, specs: { grade: 'Special', product_type: 'Whole' }, price_publicly_visible: undefined, monthly_capacity: '1000' } });
assert.equal(custom.draft.customGrade, true); assert.equal(custom.draft.grade, 'Special'); assert.equal(custom.draft.monthlyCapacityKg, '');
assert.equal(custom.unrepresentedMonthlyCapacity, '1000', 'A bare legacy number does not prove kg');
assert.equal(custom.legacyPriceVisibilityUnknown, true); assert.deepEqual(Array.from(custom.unrepresentedSpecKeys), ['product_type']);
assert.equal(edit({ ...input, standardGrades: ['W320','w320'] }).reason, 'ambiguous_grade');
console.log('Legacy edit seed: no guessed prices, capacity or multi-grade conversion, original preserved');
