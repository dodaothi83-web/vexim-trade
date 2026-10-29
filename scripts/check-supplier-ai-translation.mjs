// node --experimental-strip-types --no-warnings scripts/check-supplier-ai-translation.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/products/quantity-pricing.ts';

function compile(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, console, process, Date, FormData, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`);
    return mocks[key];
  } });
  return exports;
}
let configured = true, current = false, aiName = 'Cashew kernels', throwAi = false, writes = 0, audits = 0;
let product = { id: '22222222-2222-2222-2222-222222222222', name: 'Nhân điều', updated_at: 'v1', supplier_review_status: 'pending', ready_for_buyer: false };
const store = { getProduct: async () => product, updateProduct: async (_id, patch) => { writes++; return product = { ...product, ...patch }; }, addAuditLog: async () => { audits++; } };
const translation = {
  productTranslationState: () => ({ current }), translationConfigured: () => configured,
  translateProductContent: async () => { if (throwAi) throw Error('AI unavailable'); return { translation: { name: aiName }, model: 'test' }; },
  productTranslationPatch: (value) => ({ name_i18n: { en: value.name }, translation_meta: { origin: 'ai' } }),
};
const service = compile('../lib/ai/product-translation-service.ts', { 'server-only': {}, '@/lib/ai/translate-content': translation, '@/lib/products/quantity-pricing': pricing });
const invoke = (options) => service.ensureProductEnglishTranslation(store, product.id, { id: 'staff', email: 'staff@example.com' }, undefined, options);
let result = await invoke({ forbiddenGrades: ['W320'], saveIfUnchanged: async (loaded, patch) => { assert.equal(loaded.updated_at, 'v1'); return { ...loaded, ...patch }; } });
assert.equal(result.status, 'translated'); assert.equal(result.product.name_i18n.en, 'Cashew kernels'); assert.equal(writes, 0); assert.equal(audits, 1);
aiName = 'Cashew kernels W320';
result = await invoke({ forbiddenGrades: ['W320'], saveIfUnchanged: async () => { throw Error('must not save invalid name'); } });
assert.equal(result.status, 'failed'); assert.match(result.message, /grade/); assert.equal(audits, 1);
aiName = 'Cashew kernels';
result = await invoke({ forbiddenGrades: ['W320'], saveIfUnchanged: async () => null });
assert.equal(result.status, 'failed'); assert.match(result.message, /đã thay đổi/); assert.equal(writes, 0);
configured = false; result = await invoke(); assert.equal(result.status, 'unconfigured');
configured = true; throwAi = true; result = await invoke(); assert.equal(result.status, 'failed'); assert.equal(writes, 0);
throwAi = false; current = true; result = await invoke(); assert.equal(result.status, 'current'); assert.equal(writes, 0);
product = { ...product, name_i18n: { en: 'Cashew W320' } };
result = await invoke({ forbiddenGrades: ['W320'] }); assert.equal(result.status, 'failed'); assert.match(result.message, /grade/);

let staffPatch = null;
const crmStore = { getProduct: async () => ({ ...product, category: 'cashew' }), getCategoryBySlug: async () => ({ slug: 'cashew' }), updateProduct: async (_id, patch) => { staffPatch = patch; return { ...product, ...patch }; }, addAuditLog: async () => {} };
const crm = compile('../app/crm/products/[slug]/edit/review-actions.ts', {
  'next/cache': { revalidatePath() {} }, '@/lib/auth/session': { guard: async () => null, getSession: async () => ({ uid: 'staff', email: 'staff@example.com' }) },
  '@/lib/db': { getStore: () => crmStore }, '@/lib/db/supabase': {}, '@/lib/supplier-portal/category-proposals': {}, '@/lib/crm/badges': {}, '@/lib/supplier-portal/notify': {},
  '@/lib/ai/product-translation-service': service, '@/lib/ai/translate-content': { productTranslationPatch: (value) => ({ name_i18n: { en: value.name } }) },
  '@/lib/products/product-description': { sanitizeProductDescriptionForSave: (value) => value }, '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320'] }, '@/lib/products/quantity-pricing': pricing,
  '@/lib/media/readiness': {}, '@/lib/public/product-selection': {}, '@/lib/public/supplier-seo': {},
});
const form = new FormData(); form.set('product_id', product.id); form.set('name_en', 'Cashew kernels W320');
result = await crm.saveProductEnglishAction(form); assert.equal(result.ok, false); assert.match(result.message, /grade/); assert.equal(staffPatch, null);
form.set('name_en', 'Vietnamese cashew kernels'); result = await crm.saveProductEnglishAction(form);
assert.equal(result.ok, true); assert.equal(staffPatch.name_i18n.en, 'Vietnamese cashew kernels');
console.log('Supplier AI translation: configured/failure, grade validation, guarded writes and staff edits passed');
