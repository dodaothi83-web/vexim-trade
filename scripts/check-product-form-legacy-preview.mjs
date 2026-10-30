// node --experimental-strip-types --no-warnings scripts/check-product-form-legacy-preview.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as pricing from '../lib/products/quantity-pricing.ts';
import { entry, revision } from './quantity-v2-test-utils.mjs';
function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
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
  '@/lib/products/product-form-model': model });
const preview = load('../lib/products/product-form-legacy-preview.ts', { '@/lib/products/product-form-legacy-clone-seed': clone,
  '@/lib/products/product-form-legacy-edit-seed': edit, '@/lib/products/product-form-model': model }).previewLegacyProductForms;
const product = { id: 'original', name: 'Hạt điều', specs: { grade_rows: [{ grade: 'W320', price_min: 5, price_max: 7, moq: '20 bao' },
  { grade: 'W240', price_min: 8, price_max: 9, moq: '5 tấn' }], moisture: '5%', old_spec: { value: 42 } },
  ref_price: 5, ref_price_max: 9, moq: '20 bao', unit: 'bao', monthly_capacity: '100 tấn', price_publicly_visible: true,
  incoterm: 'FOB', incoterm_place: 'Cát Lái', certifications: 'HACCP', images: ['original-image'], description: 'Mô tả' };
const input = { product, categorySlug: 'cashew', fields: [{ key: 'moisture' }], standardGrades: ['W320', 'W240'] };
const before = JSON.stringify(product), result = preview(input);
assert.equal(result.ok, true); assert.equal(result.candidates.length, 2);
assert.equal(result.candidates[0].grade, 'W320'); assert.equal(result.candidates[1].grade, 'W240');
for (const candidate of result.candidates) {
  assert.equal(candidate.draft.name, 'Hạt điều'); assert.equal(candidate.draft.attributes.moisture, '5%');
  assert.equal(candidate.draft.tiers.length, 1); assert.equal(candidate.draft.tiers[0].quantity, ''); assert.equal(candidate.draft.tiers[0].price, '');
  assert.equal(candidate.draft.pricePubliclyVisible, false); assert.equal(candidate.draft.priceConsent, false);
  assert.equal(candidate.draft.incoterm, ''); assert.equal(candidate.draft.incotermPlace, '');
  assert.equal(candidate.draft.monthlyCapacityKg, '');
}
assert.equal(result.candidates[0].originalRow.price_min, 5); assert.equal(result.candidates[1].originalRow.moq, '5 tấn');
assert.equal(result.unrepresentedMonthlyCapacity, '100 tấn'); assert.equal(result.requiresStaffCertificationReview, true);
assert.deepEqual(Array.from(result.unrepresentedSpecKeys), ['grade_rows', 'old_spec']);
assert.equal(JSON.stringify(product), before, 'Only prepare a comparison; never mutate the source');
const single = preview({ ...input, product: { ...product, specs: { grade: 'w320', grade_rows: [{ grade: 'W320', price_min: 5 }] } } });
assert.equal(single.ok, true); assert.equal(single.candidates.length, 1); assert.equal(single.candidates[0].draft.grade, 'W320');
assert.equal(single.candidates[0].draft.pricePubliclyVisible, false); assert.equal(single.candidates[0].draft.tiers[0].price, '');
const w180 = preview({ ...input, standardGrades: ['W180', 'W320'], product: { ...product,
  specs: { grade: 'W180', grade_rows: [{ grade: 'W180', moq_qty: 100, moq_unit: 'bag' }] } } });
assert.equal(w180.ok, true); assert.equal(w180.candidates[0].draft.grade, 'W180');
assert.equal(w180.candidates[0].draft.customGrade, false, 'W180 is standard when the matched category supplies it');
assert.equal(w180.candidates[0].draft.tiers[0].quantity, '');
for (const rows of [[{ grade: 'W320' }, { grade: 'w320' }], [{ grade: 'W320' }, null], [{ grade: 'W320' }, {}], [{ grade: 'W320' }, { grade: 'x'.repeat(81) }]])
  assert.equal(preview({ ...input, product: { ...product, specs: { grade_rows: rows } } }).ok, false);
assert.equal(preview({ ...input, product: { ...product, specs: { grade_rows: Array.from({ length: 31 }, (_, i) => ({ grade: `g${i}` })) } } }).reason, 'too_many_grades');
assert.equal(preview({ ...input, product: { ...product, name: 'x'.repeat(181) } }).reason, 'unrepresentable_fields');
assert.equal(preview({ ...input, categorySlug: '', product: { ...product, specs: {} } }).candidates[0].draft.category, '');
console.log('Legacy form preview: per-grade comparison, demo prices excluded, ambiguity and original data preserved');
