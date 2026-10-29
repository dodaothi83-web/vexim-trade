// node --experimental-strip-types --no-warnings scripts/check-product-form-translation-action.mjs
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
const productId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', submissionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const supplierId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', userId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const draft = { name: 'Nhân điều', category: 'cashew', grade: 'Special A', customGrade: true,
  spec: '', rawMaterialRegion: '', inputMaterialOrigin: '', incoterm: 'FOB', incotermPlace: 'Cát Lái',
  unit: 'mt', tiers: [{ quantity: '1', price: '6401' }], pricePubliclyVisible: true, priceConsent: true,
  paymentTerms: '', oem: false, odm: false, samples: true, packaging: '', exportPort: '', leadTimeDays: '', monthlyCapacityKg: '',
  description: 'Nhân điều Việt Nam', descriptionDetail: '', attributes: {}, attributePool: '[]' };
let role = 'admin', active = true, status = 'pending', payload = draft, categoryPublished = true, productSupplier = supplierId, translateCalls = 0;
let duringTranslation = () => {};
const db = { from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() {
  return { data: { status, payload, id: submissionId, product_id: productId, supplier_id: supplierId }, error: null };
} }) };
const store = { getUser: async () => ({ id: userId, role, email: 'staff@example.com', is_active: active }),
  getProduct: async () => ({ id: productId, supplier_id: productSupplier }),
  getCategoryBySlug: async () => ({ id: 'cat', status: 'published', is_published: categoryPublished, grades: ['W320'] }) };
const action = load('../app/crm/products/product-form-translation-actions.ts', {
  '@/lib/auth/session': { getSession: async () => ({ uid: userId, role, email: 'staff@example.com' }) },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: store },
  '@/lib/products/grade-pricing': { standardGradesForCategory: (cat) => cat.grades },
  '@/lib/products/product-form-model': model, '@/lib/products/quantity-pricing': pricing,
  '@/lib/products/product-form-translation': { suggestProductFormTranslation: async () => {
    translateCalls++; duringTranslation(); return { ok: true, translation: { name: 'Cashew Special A' } };
  } },
}).suggestProductFormEnglishNameAction;
let result = await action(productId, submissionId); assert.equal(result.ok, true); assert.equal(result.nameNeedsEdit, true);
assert.equal(result.submissionId, submissionId); assert.equal(result.sourceName, draft.name); assert.equal(translateCalls, 1);
role = 'supplier'; assert.equal((await action(productId, submissionId)).ok, false); assert.equal(translateCalls, 1); role = 'admin';
active = false; assert.equal((await action(productId, submissionId)).ok, false); active = true;
status = 'approved'; assert.equal((await action(productId, submissionId)).ok, false); status = 'pending';
duringTranslation = () => { status = 'approved'; }; assert.equal((await action(productId, submissionId)).ok, false); status = 'pending';
duringTranslation = () => { payload = { ...draft, name: 'Changed' }; }; assert.equal((await action(productId, submissionId)).ok, false); payload = draft;
duringTranslation = () => { active = false; }; assert.equal((await action(productId, submissionId)).ok, false); active = true;
duringTranslation = () => { productSupplier = userId; }; assert.equal((await action(productId, submissionId)).ok, false); productSupplier = supplierId;
duringTranslation = () => { categoryPublished = false; }; assert.equal((await action(productId, submissionId)).ok, false); categoryPublished = true;
duringTranslation = () => {}; assert.equal((await action('bad', submissionId)).ok, false);
console.log('Form translation action: staff authorization, pending snapshot, current category and no write passed');
