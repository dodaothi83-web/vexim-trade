// node --experimental-strip-types --no-warnings scripts/check-product-form-model.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as pricing from '../lib/products/quantity-pricing.ts';
import { entry } from './quantity-v2-test-utils.mjs';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-model.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, TextEncoder, Number, JSON, require: (key) => {
  if (key === 'zod') return { z };
  if (key === '@/lib/products/quantity-entry') return entry;
  throw Error(`Unexpected import ${key}`);
} });
const { parseProductFormDraft: parse, validateProductFormSubmission: validate } = exports;
const draft = {
  name: 'Nhân điều', category: 'cashew', grade: 'W320', customGrade: false,
  spec: '', rawMaterialRegion: '', inputMaterialOrigin: '', incoterm: 'FOB', incotermPlace: 'Cát Lái',
  unit: 'kg', tiers: [{ quantity: '1,000', price: '6,40' }, { quantity: '5,000', price: '6.00' }],
  pricePubliclyVisible: true, priceConsent: true, paymentTerms: '', oem: false, odm: false, samples: false,
  packaging: '', exportPort: '', leadTimeDays: '', monthlyCapacityKg: '', description: 'Nhân điều trắng',
  descriptionDetail: '', attributes: {}, attributePool: '',
};
const context = { categoryValid: true, imageCount: 1, standardGrades: ['W320'],
  policy: { ...pricing.DEFAULT_QUANTITY_PRICING_POLICY, gradeBounds: { W320: { minUsdPerKg: 6, maxUsdPerKg: 7 } } } };
const check = (patch = {}, ctx = {}) => validate({ ...draft, ...patch }, { ...context, ...ctx });
assert.ok(parse(draft));
let result = check();
assert.equal(result.errors.length, 0); assert.equal(result.warnings.length, 0);
assert.equal(result.quantity.tiers[0].quantityGrams, 1_000_000);
assert.equal(result.quantity.tiers[0].priceCentsPerUnit, 640);
const incomplete = { ...draft, name: '', category: '', grade: '', incoterm: '', incotermPlace: '', tiers: [], description: '', priceConsent: false };
assert.ok(parse(incomplete), 'Incomplete drafts are valid for storage');
result = validate(incomplete, { ...context, categoryValid: false, imageCount: 0 });
for (const code of ['name', 'category', 'images', 'grade', 'incoterm', 'incoterm_place', 'tier_count', 'consent', 'description_or_spec'])
  assert.ok(result.errors.some((item) => item.code === code), `Submit must report ${code}`);
assert.ok(!parse({ ...draft, unit: 'bag' })); assert.ok(!parse({ ...draft, tiers: Array(5).fill(draft.tiers[0]) }));
assert.ok(!parse({ ...draft, malicious: true })); assert.ok(!parse({ ...draft, name: 'x'.repeat(181) }));
assert.ok(!parse({ ...draft, attributes: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), 'x'])) }));
result = check({ grade: 'AA-custom', customGrade: true, name: 'Nhân điều AA-custom' });
assert.ok(result.errors.some((item) => item.field === 'name' && item.code === 'name_vi_grade'));
result = check({ grade: 'AA-custom', customGrade: true, tiers: [{ quantity: '1', price: '1' }] });
assert.equal(result.errors.length, 0); assert.equal(result.warnings.length, 0);
result = check({ unit: 'mt', tiers: [{ quantity: '1', price: '6401.00' }] });
assert.equal(result.quantity.tiers[0].priceCentsPerUnit, 640100); assert.equal(result.quantity.tiers[0].unitWeightGrams, 1_000_000);
result = check({ tiers: [{ quantity: '100', price: '9.00' }] });
assert.equal(result.errors.length, 0); assert.equal(result.warnings[0].code, 'grade_price_outlier');
result = check({ tiers: [{ quantity: '1', price: '6' }, { quantity: '1', price: '7' }] });
assert.ok(result.errors.some((item) => item.code === 'quantity_order')); assert.ok(result.errors.some((item) => item.code === 'price_order'));
assert.ok(!check({ pricePubliclyVisible: false, priceConsent: false }).errors.some((item) => item.code === 'consent'));
assert.ok(check({}, { imageCount: 9 }).errors.some((item) => item.code === 'images'));
assert.ok(check({}, { policy: null }).errors.some((item) => item.code === 'missing_policy'));
for (const value of ['0', '-1', '1,5', '1000.2', '1,00', '1000000001']) assert.ok(check({ monthlyCapacityKg: value }).errors.some((item) => item.code === 'capacity'));
for (const value of ['', '1', '5,000', '1000000000']) assert.ok(!check({ monthlyCapacityKg: value }).errors.some((item) => item.code === 'capacity'));
for (const value of ['0', '1.5', '3651', '-1']) assert.ok(check({ leadTimeDays: value }).errors.some((item) => item.code === 'lead_time'));
assert.ok(!check({ description: '', spec: 'Loại nhân trắng' }).errors.some((item) => item.code === 'description_or_spec'));
console.log('Product form model: incomplete drafts, submit-only rules, exact units and five sections passed');
