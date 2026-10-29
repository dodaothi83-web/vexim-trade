// node --experimental-strip-types --no-warnings scripts/check-product-form-clone.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { entry } from './quantity-v2-test-utils.mjs';
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
const clone = load('../lib/products/product-form-clone.ts', { '@/lib/products/product-form-model': model }).cloneProductFormForDifferentGrade;
const source = { name: 'Hồ tiêu đen', category: 'pepper', grade: '500 g/L', customGrade: false,
  spec: 'Khô', rawMaterialRegion: 'Gia Lai', inputMaterialOrigin: 'Việt Nam', incoterm: 'FOB', incotermPlace: 'Cát Lái',
  unit: 'mt', tiers: [{ quantity: '1', price: '1500.00' }, { quantity: '5', price: '1400.00' }],
  pricePubliclyVisible: true, priceConsent: true, paymentTerms: 'T/T', oem: false, odm: false, samples: true,
  packaging: 'Bao dệt', exportPort: 'Cát Lái', leadTimeDays: '14', monthlyCapacityKg: '50,000', description: 'Hồ tiêu',
  descriptionDetail: '<p>Chi tiết</p>', attributes: { moisture: '12%' }, attributePool: '[]' };
const snapshot = JSON.stringify(source);
const draft = clone(source);
assert.ok(draft); assert.equal(draft.name, source.name); assert.equal(draft.spec, source.spec);
assert.equal(draft.category, source.category); assert.equal(draft.descriptionDetail, source.descriptionDetail);
assert.equal(draft.packaging, source.packaging); assert.equal(draft.incoterm, source.incoterm);
assert.equal(draft.grade, ''); assert.equal(draft.customGrade, false); assert.equal(draft.tiers.length, 1);
assert.equal(draft.tiers[0].quantity, ''); assert.equal(draft.tiers[0].price, '');
assert.equal(draft.pricePubliclyVisible, false); assert.equal(draft.priceConsent, false);
draft.attributes.moisture = 'changed'; assert.equal(source.attributes.moisture, '12%');
assert.equal(JSON.stringify(source), snapshot, 'Cloning does not mutate the original');
assert.equal(clone({ ...source, unit: 'bag' }), null); assert.equal(clone(null), null);
console.log('Different-grade draft: copies form data privately, resets grade, tiers and consent without touching the original');
