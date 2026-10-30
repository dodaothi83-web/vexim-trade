// node --experimental-strip-types --no-warnings scripts/check-product-form-legacy-clone-seed.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as pricing from '../lib/products/quantity-pricing.ts';
import { entry, revision } from './quantity-v2-test-utils.mjs';
function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Number, JSON, TextEncoder, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
  } });
  return exports;
}
const grades = { nonGradeProductFields: (fields) => fields.filter(({ key }) => !['grade', 'product_type'].includes(key.trim().toLowerCase())) };
const model = load('../lib/products/product-form-model.ts', { zod: { z }, '@/lib/products/quantity-entry': entry });
const seed = load('../lib/products/product-form-seed.ts', { '@/lib/products/grade-pricing': grades, '@/lib/products/product-form-model': model,
  '@/lib/products/quantity-revision-v2': revision, '@/lib/products/quantity-pricing': pricing });
const clone = load('../lib/products/product-form-legacy-clone-seed.ts', { '@/lib/products/grade-pricing': grades,
  '@/lib/products/product-form-model': model, '@/lib/products/product-form-seed': seed }).seedLegacyCloneFromProduct;
const product = { id: 'original', name: 'Hồ tiêu đen', category: 'pepper', spec: 'Quy cách', specs: { grade: '500 g/L', moisture: '12%',
  grade_rows: [{ grade: '500 g/L', price_min: 1500, price_max: 1600 }, { grade: '550 g/L', price_min: 1800, price_max: 1900 }], old_data: { unknown: true } },
  ref_price: 1500, ref_price_max: 1900, moq: '1 MT', unit: 'MT', incoterm: 'FOB', incoterm_place: 'Cát Lái',
  price_publicly_visible: true, monthly_capacity: '100k', raw_material_region: 'Gia Lai', input_material_origin: 'Việt Nam',
  lead_time_days: 15, description: 'Tiêu Việt Nam', description_detail: '<p>Chi tiết</p>', packaging: 'Bao',
  certifications: 'HACCP', certifications_i18n: { en: 'HACCP' }, images: ['existing'] };
const args = { product, categorySlug: 'pepper', fields: [{ key: 'grade' }, { key: 'moisture' }] };
const original = JSON.stringify(args), result = clone(args);
assert.equal(result.ok, true); assert.equal(result.draft.name, product.name); assert.equal(result.draft.incoterm, 'FOB');
assert.equal(result.draft.attributes.moisture, '12%'); assert.equal(result.draft.attributes.grade, undefined);
assert.equal(result.draft.grade, ''); assert.equal(result.draft.customGrade, false); assert.equal(result.draft.unit, 'kg');
assert.equal(result.draft.tiers[0].quantity, ''); assert.equal(result.draft.tiers[0].price, '');
assert.equal(result.draft.pricePubliclyVisible, false); assert.equal(result.draft.priceConsent, false);
assert.equal(result.draft.monthlyCapacityKg, '', 'Do not interpret a legacy capacity as kg');
assert.equal(result.unrepresentedMonthlyCapacity, '100k', 'Keep the original text for staff review');
const bareCapacity = clone({ ...args, product: { ...product, monthly_capacity: '5000' } });
assert.equal(bareCapacity.draft.monthlyCapacityKg, ''); assert.equal(bareCapacity.unrepresentedMonthlyCapacity, '5000');
assert.deepEqual(Array.from(result.unrepresentedSpecKeys), ['old_data']); assert.equal(result.requiresStaffCertificationCopy, true);
assert.equal(JSON.stringify(args), original, 'Legacy product, grades, prices and photos are untouched');
assert.equal(clone({ ...args, product: { ...product, name: 'x'.repeat(181) } }).reason, 'unrepresentable_fields');
assert.equal(clone({ ...args, product: { ...product, specs: [] } }).reason, 'unrepresentable_fields');
assert.equal(clone({ ...args, product: { ...product, specs: { moisture: 12 } } }).reason, 'unrepresentable_fields');
console.log('Legacy clone draft: multi-grade common fields without price guesses, source mutation or silent metadata loss passed');
