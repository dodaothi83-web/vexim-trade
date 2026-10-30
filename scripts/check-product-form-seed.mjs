// node --experimental-strip-types --no-warnings scripts/check-product-form-seed.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { entry, revision } from './quantity-v2-test-utils.mjs';
import * as pricing from '../lib/products/quantity-pricing.ts';
function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Number, JSON, TextEncoder, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`);
    return mocks[key];
  } });
  return exports;
}
const model = load('../lib/products/product-form-model.ts', { zod: { z }, '@/lib/products/quantity-entry': entry });
const seed = load('../lib/products/product-form-seed.ts', {
  '@/lib/products/grade-pricing': { nonGradeProductFields: (fields) => fields.filter(({ key }) => !['grade', 'product_type'].includes(key)) },
  '@/lib/products/product-form-model': model,
  '@/lib/products/quantity-revision-v2': revision,
  '@/lib/products/quantity-pricing': pricing,
});
const original = {
  id: 'product-1', name: 'Hồ tiêu đen', spec: 'Độ ẩm thấp', specs: { grade: '500 g/L', moisture: '12%', old_data: { untouched: true } },
  raw_material_region: 'Gia Lai', input_material_origin: 'Việt Nam', incoterm_place: 'Cát Lái',
  price_publicly_visible: true, payment_terms: 'T/T', oem: true, odm: false, samples: true,
  packaging: 'Bao', export_port: 'Cát Lái', lead_time_days: 15, monthly_capacity: '5,000',
  description: 'Hồ tiêu đen Việt Nam', description_detail: '<p>Nội dung chi tiết</p>', certifications: 'HACCP',
};
const price = { product_id: original.id, status: 'approved', grade: '500 g/L', incoterm: 'FOB', tiers: [
  { version: 2, unit: 'mt', customGrade: false, unitWeightGrams: 1000000, quantityGrams: 1234567, priceCentsPerUnit: 640100 },
  { version: 2, unit: 'mt', customGrade: false, unitWeightGrams: 1000000, quantityGrams: 2234567, priceCentsPerUnit: 630000 },
] };
const args = { product: original, categorySlug: 'pepper', priceRevision: price, fields: [{ key: 'grade' }, { key: 'moisture' }] };
const snapshot = JSON.stringify(args);
let result = seed.seedProductFormFromApproved(args);
assert.equal(result.ok, true);
assert.equal(result.draft.grade, '500 g/L'); assert.equal(result.draft.unit, 'mt');
assert.equal(result.draft.tiers[0].quantity, '1.234567'); assert.equal(result.draft.tiers[0].price, '6401.00');
assert.equal(result.draft.attributes.moisture, '12%'); assert.equal(result.draft.attributes.grade, undefined);
assert.equal(result.draft.priceConsent, false); assert.equal(result.draft.descriptionDetail, '<p>Nội dung chi tiết</p>');
assert.equal(result.draft.monthlyCapacityKg, '', 'Approved pricing alone does not prove capacity unit');
assert.equal(result.unrepresentedMonthlyCapacity, '5,000');
assert.equal(JSON.stringify(args), snapshot, 'A seed must never mutate the public product or its revision');
assert.ok(model.parseProductFormDraft(seed.emptyProductFormDraft()));
assert.equal(seed.seedProductFormFromApproved({ ...args, priceRevision: null }).reason, 'legacy_pricing');
for (const bad of [{ ...price, status: 'pending' }, { ...price, product_id: 'other' }, { ...price, tiers: [] }, { ...price, grade: '' }])
  assert.equal(seed.seedProductFormFromApproved({ ...args, priceRevision: bad }).reason, 'invalid_price_revision');
for (const rows of [[{ grade: '500 g/L' }, { grade: '550 g/L' }], 'not an array']) {
  assert.equal(seed.seedProductFormFromApproved({ ...args, product: { ...original, specs: { ...original.specs, grade_rows: rows } } }).reason, 'multiple_grades');
}
assert.equal(seed.seedProductFormFromApproved({ ...args, product: { ...original, name: 'x'.repeat(181) } }).reason, 'unrepresentable_fields');
result = seed.seedProductFormFromApproved({ ...args, priceRevision: { ...price, grade: 'Special', tiers: price.tiers.map((row) => ({ ...row, customGrade: true })) } });
assert.equal(result.ok, true); assert.equal(result.draft.customGrade, true);
console.log('Product form seed: approved v2 only, exact units, fresh consent, and legacy safety guards passed');
