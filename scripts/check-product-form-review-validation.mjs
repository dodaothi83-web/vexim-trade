// node --experimental-strip-types --no-warnings scripts/check-product-form-review-validation.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as pricing from '../lib/products/quantity-pricing.ts';
import { entry, revision } from './quantity-v2-test-utils.mjs';
function load(path, mocks) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, { exports, JSON, Number, TextEncoder, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
  } });
  return exports;
}
const model = load('../lib/products/product-form-model.ts', { zod: { z }, '@/lib/products/quantity-entry': entry });
const validate = load('../lib/products/product-form-review-validation.ts', {
  'server-only': {}, '@/lib/products/product-form-model': model,
  '@/lib/products/product-description': { sanitizeProductDescriptionForSave: (value) => value.includes('<script>') ? '' : value },
  '@/lib/products/quantity-pricing': pricing, '@/lib/products/quantity-revision-v2': revision,
}).validateProductFormForReview;
const payload = { name: 'Nhân điều', category: 'cashew', grade: 'Special A', customGrade: true,
  spec: '', rawMaterialRegion: '', inputMaterialOrigin: '', incoterm: 'FOB', incotermPlace: 'Cát Lái',
  unit: 'mt', tiers: [{ quantity: '1.234567', price: '6401.00' }], pricePubliclyVisible: true, priceConsent: true,
  paymentTerms: '', oem: false, odm: false, samples: true, packaging: '', exportPort: '', leadTimeDays: '', monthlyCapacityKg: '',
  description: 'Nhân điều Việt Nam', descriptionDetail: '', attributes: {}, attributePool: '[]' };
const quantity = { tiers: [{ priceCentsPerUnit: 640100, unitWeightGrams: 1000000, quantityGrams: 1234567,
  customGrade: true, unit: 'mt', version: 2 }], incoterm: 'FOB', grade: 'Special A' };
const input = { payload, quantity, englishName: 'Vietnamese cashew kernels', categoryValid: true, imageCount: 1,
  standardGrades: ['W320', 'W240'], policy: pricing.DEFAULT_QUANTITY_PRICING_POLICY };
let result = validate(input); assert.equal(result.ok, true); assert.equal(result.englishName, 'Vietnamese cashew kernels');
assert.equal(validate({ ...input, englishName: 'Cashew Special A' }).ok, false, 'Selected custom grade must not enter the English title');
assert.equal(validate({ ...input, englishName: 'Cashew W240' }).ok, false, 'Any standard grade is forbidden in English title');
assert.equal(validate({ ...input, englishName: '' }).ok, false); assert.equal(validate({ ...input, englishName: 'x'.repeat(181) }).ok, false);
assert.equal(validate({ ...input, quantity: { ...quantity, grade: 'W320' } }).ok, false);
assert.equal(validate({ ...input, quantity: { ...quantity, tiers: [{ ...quantity.tiers[0], priceCentsPerUnit: 640101 }] } }).ok, false);
assert.equal(validate({ ...input, quantity: { ...quantity, extra: true } }).ok, false);
assert.equal(validate({ ...input, payload: { ...payload, descriptionDetail: '<script>x</script>' } }).ok, false);
assert.equal(validate({ ...input, imageCount: 0 }).ok, false); assert.equal(validate({ ...input, categoryValid: false }).ok, false);
assert.equal(validate({ ...input, payload: { ...payload, priceConsent: false } }).ok, false);
const std = { ...payload, grade: 'W320', customGrade: false, tiers: [{ quantity: '1', price: '1000' }] };
const stdQuantity = { grade: 'W320', incoterm: 'FOB', tiers: [{ version: 2, unit: 'mt', customGrade: false,
  quantityGrams: 1000000, unitWeightGrams: 1000000, priceCentsPerUnit: 100000 }] };
result = validate({ ...input, payload: std, quantity: stdQuantity, policy: { ...input.policy, gradeBounds: { W320: { minUsdPerKg: 6, maxUsdPerKg: 7 } } } });
assert.equal(result.ok, true); assert.equal(result.warnings[0].code, 'grade_price_outlier', 'Outliers warn staff but do not block');
console.log('Form review validation: exact quantity snapshot, current rules, safe HTML, custom-grade names and warnings passed');
