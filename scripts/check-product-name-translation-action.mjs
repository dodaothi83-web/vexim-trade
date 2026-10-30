// node scripts/check-product-name-translation-action.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let enabled = true, db = true, approved = true, authorized = true, limited = false, calls = [], supplier = 'supplier-a', user = 'user-a';
let during = () => {};
const access = async () => authorized ? { user: { id: user }, supplier: { id: supplier } } : null;
const mocks = {
  '@/lib/db/supabase': { getSupabaseClient: () => db ? {} : null, supabaseStore: {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: access },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => approved },
  '@/lib/products/product-form-staging-access': { isProductFormEnabled: () => enabled },
  '@/lib/ai/product-name-rate-limit': { checkProductNameTranslationLimit: async (key) => { assert.equal(key, 'supplier:supplier-a'); return !limited; } },
  '@/lib/ai/product-name-translation': { translateProductName: async (...args) => { calls.push(args); during(); return 'Cashew Kernels'; } },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/product-form-name-translation-action.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, console: { error() {} }, require: (key) => { if (!(key in mocks)) throw Error(key); return mocks[key]; } });
const action = exports.translateSupplierProductNameAction;
assert.equal((await action('  Nhân điều  ')).englishName, 'Cashew Kernels');
assert.equal(calls.length, 1); assert.equal(calls[0].length, 1); assert.equal(calls[0][0], 'Nhân điều');
assert.equal((await action('ab')).ok, false); assert.equal((await action('x'.repeat(181))).ok, false);
assert.equal((await action({ name: 'Nhân điều', price: '100' })).ok, false);
enabled = false; assert.equal((await action('Nhân điều')).ok, false); enabled = true;
db = false; assert.equal((await action('Nhân điều')).ok, false); db = true;
authorized = false; assert.equal((await action('Nhân điều')).ok, false); authorized = true;
approved = false; assert.equal((await action('Nhân điều')).ok, false); approved = true;
limited = true; assert.equal((await action('Nhân điều')).ok, false); limited = false;
assert.equal(calls.length, 1, 'Invalid or unauthorized requests never reach AI');
during = () => { authorized = false; }; assert.equal((await action('Nhân điều')).ok, false); authorized = true;
during = () => { supplier = 'supplier-b'; }; assert.equal((await action('Nhân điều')).ok, false); supplier = 'supplier-a';
during = () => { user = 'user-b'; }; assert.equal((await action('Nhân điều')).ok, false); user = 'user-a';
during = () => { approved = false; }; assert.equal((await action('Nhân điều')).ok, false); approved = true;
console.log('Supplier name translation: authorization, limit, title-only input and post-AI reauthorization passed');
