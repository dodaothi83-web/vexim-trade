// node --experimental-strip-types --no-warnings scripts/check-product-form-translation.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as pricing from '../lib/products/quantity-pricing.ts';
import { entry } from './quantity-v2-test-utils.mjs';
function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, JSON, Number, TextEncoder, console: { error() {} }, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
  } });
  return exports;
}
const model = load('../lib/products/product-form-model.ts', { zod: { z }, '@/lib/products/quantity-entry': entry });
let configured = true, translatedName = 'Vietnamese cashew kernels', detail = '', seen = null, throws = false;
const suggest = load('../lib/products/product-form-translation.ts', {
  'server-only': {}, '@/lib/products/product-form-model': model, '@/lib/products/quantity-pricing': pricing,
  '@/lib/products/product-description': { sanitizeProductDescriptionForSave: (s) => s.includes('<script>') ? '' : s },
  '@/lib/ai/translate-content': { translationConfigured: () => configured, translateProductContent: async (source) => {
    seen = source; if (throws) throw Error('network'); return { model: 'test', translation: { name: translatedName, description_detail: detail } };
  } },
}).suggestProductFormTranslation;
const draft = { name: 'Nhân điều', category: 'cashew', grade: 'Special A', customGrade: true,
  spec: 'Quy cách', rawMaterialRegion: 'Tây Nguyên', inputMaterialOrigin: '', incoterm: 'FOB', incotermPlace: 'Cát Lái',
  unit: 'mt', tiers: [{ quantity: '1.5', price: '6401' }], pricePubliclyVisible: true, priceConsent: true,
  paymentTerms: '', oem: false, odm: false, samples: true, packaging: '', exportPort: '', leadTimeDays: '', monthlyCapacityKg: '5,000',
  description: 'Nhân điều Việt Nam', descriptionDetail: '', attributes: {}, attributePool: '[]' };
let result = await suggest(draft, ['W320']);
assert.equal(result.ok, true); assert.equal(result.nameNeedsEdit, false); assert.equal(seen.name, draft.name);
assert.equal(seen.moq, '1.5 tấn'); assert.equal(seen.monthly_capacity, '5,000 kg');
assert.doesNotMatch(JSON.stringify(seen), /6401/, 'Prices are not sent for translation');
translatedName = 'Cashew Special A'; result = await suggest(draft, ['W320']); assert.equal(result.ok, true); assert.equal(result.nameNeedsEdit, true);
translatedName = 'Cashew W320'; result = await suggest(draft, ['W320']); assert.equal(result.nameNeedsEdit, true);
detail = '<script>bad</script>'; assert.equal((await suggest(draft, [])).reason, 'failed'); detail = '';
assert.equal((await suggest({ ...draft, descriptionDetail: '<script>bad</script>' }, [])).reason, 'invalid_draft');
configured = false; assert.equal((await suggest(draft, [])).reason, 'unconfigured');
configured = true; throws = true; assert.equal((await suggest(draft, [])).reason, 'failed');
console.log('Private form translation: no approved writes, no prices, custom-grade warning and safe HTML passed');
