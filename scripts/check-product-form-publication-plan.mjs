// node --experimental-strip-types --no-warnings scripts/check-product-form-publication-plan.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { entry, revision } from './quantity-v2-test-utils.mjs';
import * as pricing from '../lib/products/quantity-pricing.ts';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-publication-plan.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mocks = { '@/lib/products/quantity-pricing': pricing, '@/lib/products/quantity-entry': entry,
  '@/lib/products/quantity-revision-v2': revision, '@/lib/products/product-description': { sanitizeProductDescriptionForSave: (s) => s.includes('<script') ? '' : s } };
vm.runInNewContext(code, { exports, Object, JSON, Number, structuredClone, require: (key) => { if (!(key in mocks)) throw Error(key); return mocks[key]; } });
const plan = exports.planProductFormPublication;
const draft = { name: 'Nhân điều', category: 'cashew-kernels', grade: 'W320', customGrade: false, spec: 'Mẫu',
  rawMaterialRegion: 'Bình Dương', inputMaterialOrigin: 'Việt Nam', incoterm: 'FOB', incotermPlace: 'Cát Lái', unit: 'mt',
  tiers: [{ quantity: '1.234567', price: '6401.00' }, { quantity: '2.234567', price: '6300.00' }],
  pricePubliclyVisible: true, priceConsent: true, paymentTerms: 'T/T', oem: true, odm: false, samples: true,
  packaging: 'Bao', exportPort: 'Cát Lái', leadTimeDays: '20', monthlyCapacityKg: '50,000',
  description: 'Mô tả giả', descriptionDetail: '<p>Chi tiết</p>', attributes: { moisture: '5%' }, attributePool: '[]' };
const tiers = [{ version: 2, unit: 'mt', customGrade: false, unitWeightGrams: 1000000, quantityGrams: 1234567, priceCentsPerUnit: 640100 },
  { version: 2, unit: 'mt', customGrade: false, unitWeightGrams: 1000000, quantityGrams: 2234567, priceCentsPerUnit: 630000 }];
const product = { name_i18n: { en: 'Old title', fr: 'Titre précédent' }, monthly_capacity: null,
  specs: { grade: 'W320', grade_rows: [{ grade: 'W320', old_price: 9 }], old_data: { nested: 'preserve' }, lead_time: { value: 20, unit: 'days' } },
  certifications: 'HACCP' };
const input = { product, validated: { ok: true, draft, englishName: 'Cashew kernels', warnings: [] },
  quantity: { grade: 'W320', incoterm: 'FOB', tiers } };
const before = JSON.stringify(input), result = plan(input);
assert.equal(result.ok, true); assert.equal(result.patch.name_i18n.fr, 'Titre précédent');
assert.equal(result.patch.name_i18n.en, 'Cashew kernels'); assert.equal(result.patch.monthly_capacity, '50000 kg');
assert.equal(result.patch.unit, 'MT'); assert.equal(result.patch.moq, '1.234567 MT');
assert.equal(result.moqRequiresTextFallback, true); assert.equal(result.patch.moq_qty, null); assert.equal(result.patch.moq_unit, null);
assert.equal(result.patch.ref_price, 6300); assert.equal(result.patch.ref_price_max, 6401);
assert.equal(result.patch.specs.lead_time.unit, 'days'); assert.equal(result.patch.specs.lead_time.value, 20);
assert.equal(result.patch.specs.grade_rows[0].old_price, 9); assert.equal(result.patch.specs.old_data.nested, 'preserve');
assert.equal('certifications' in result.patch, false, 'Staff-only certifications are not overwritten');
result.patch.specs.old_data.nested = 'changed elsewhere'; assert.equal(JSON.stringify(input), before, 'Inputs and nested legacy data stay untouched');
assert.equal(plan({ ...input, product: { ...product, monthly_capacity: '100 boxes' } }).reason, 'legacy_capacity_unmapped', 'New kg must not erase legacy units');
assert.equal(plan({ ...input, product: { ...product, monthly_capacity: '50000 kg' } }).ok, true, 'Exact unchanged capacity is preserved');
assert.equal(plan({ ...input, product: { ...product, specs: { ...product.specs, lead_time: { value: 2, unit: 'weeks' } } } }).reason,
  'legacy_lead_time_unmapped', 'Unmapped legacy lead time must not be erased');
assert.equal(plan({ ...input, product: { ...product, specs: { grade: 'W240' } } }).reason, 'legacy_grade_unmapped');
assert.equal(plan({ ...input, product: { ...product, specs: { grade: { value: 'W320' } } } }).reason, 'legacy_grade_unmapped');
assert.equal(plan({ ...input, product: { ...product, specs: { grade_rows: [{ grade: 'W240' }] } } }).reason, 'legacy_grade_unmapped');
assert.equal(plan({ ...input, product: { ...product, specs: { grade_rows: [{ grade: 'W320' }, { grade: 'W240' }] } } }).reason, 'legacy_grade_unmapped');
assert.equal(plan({ ...input, validated: { ...input.validated, englishName: 'Cashew W320' } }).reason, 'invalid_snapshot');
assert.equal(plan({ ...input, validated: { ...input.validated, draft: { ...draft, attributes: { grade_rows: 'overwrite' } } } }).reason, 'invalid_snapshot');
assert.equal(plan({ ...input, validated: { ...input.validated, draft: { ...draft, priceConsent: false } } }).reason, 'invalid_snapshot');
assert.equal(plan({ ...input, quantity: { ...input.quantity, incoterm: 'CIF' } }).reason, 'invalid_snapshot');
const exact = plan({ ...input, validated: { ...input.validated, draft: { ...draft, tiers: [{ quantity: '1.25', price: '6401' }] } },
  quantity: { grade: 'W320', incoterm: 'FOB', tiers: [{ ...tiers[0], quantityGrams: 1250000 }] } });
assert.equal(exact.ok, true); assert.equal(exact.moqRequiresTextFallback, false); assert.equal(exact.patch.moq_qty, 1.25);
assert.equal(exact.patch.moq_unit, 'mt'); assert.equal(exact.patch.ref_price_max, null);
console.log('Publication plan: exact units, legacy guards, preserved fields and non-mutating patch passed');
