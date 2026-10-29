// node --experimental-strip-types --no-warnings scripts/check-product-form-review-preparation.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as settings from '../lib/products/quantity-price-settings.ts';
const productId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', submissionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const supplierId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', categoryId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const initial = { status: 'ok', product: { id: productId, supplier_id: supplierId },
  submission: { id: submissionId, product_id: productId, supplier_id: supplierId, status: 'pending', payload: { category: 'cashew' }, quantity: {},
    image_selection: [{ source: 'staged', id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' }], image_snapshot: [{}] },
  category: { id: categoryId, slug: 'cashew', status: 'published', is_published: true, product_fields: [] },
  settings: { singleton: true, max_tiers: 4, max_price_ratio: 1.5, max_last_moq_ratio: 100, reminder_days: 30, stale_days: 90,
    offer_max_discount_percent: 30, offer_max_days: 60, offer_cooldown_days: 30, offer_price_lock_days: 30 },
  bounds: [{ category_id: categoryId, grade: 'W320', min_usd_per_kg: 6, max_usd_per_kg: 7 }], prices: [], names: [], published_images: [] };
let data = structuredClone(initial), seenValidation = null, imageResult = { ok: true }, validationResult = { ok: true, draft: {}, englishName: 'Cashew', warnings: [] }, calls = 0;
const db = { rpc: async () => { calls++; return { data, error: null }; } };
const mocks = { 'server-only': {}, '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320'] },
  '@/lib/products/quantity-price-settings': settings,
  '@/lib/products/product-form-review-validation': { validateProductFormForReview: (input) => { seenValidation = input; return validationResult; } },
  '@/lib/products/product-form-review-images': { verifyStagedReviewImages: async () => imageResult } };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-review-preparation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, FormData, Object, Array, Set, String, console: { error() {} }, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
} });
const prepare = exports.prepareProductFormReview;
assert.equal((await prepare(db, 'bad', submissionId, 'Cashew')).ok, false); assert.equal(calls, 0);
let result = await prepare(db, productId, submissionId, 'Cashew'); assert.equal(result.ok, true); assert.equal(result.context, data);
assert.equal(seenValidation.policy.gradeBounds.W320.minUsdPerKg, 6); assert.equal(seenValidation.imageCount, 1);
data = { status: 'legacy_grade_unmapped' }; assert.match((await prepare(db, productId, submissionId, 'Cashew')).message, /Giữ nguyên sản phẩm/);
data = structuredClone(initial); data.submission.supplier_id = productId; assert.equal((await prepare(db, productId, submissionId, 'Cashew')).ok, false);
data = structuredClone(initial); data.category.is_published = false; assert.equal((await prepare(db, productId, submissionId, 'Cashew')).ok, false);
data = structuredClone(initial); data.settings.max_price_ratio = 0.5; assert.equal((await prepare(db, productId, submissionId, 'Cashew')).ok, false);
data = structuredClone(initial); data.bounds.push({ ...data.bounds[0], grade: 'w320' }); assert.equal((await prepare(db, productId, submissionId, 'Cashew')).ok, false);
data = structuredClone(initial); data.bounds[0].max_usd_per_kg = 5; assert.equal((await prepare(db, productId, submissionId, 'Cashew')).ok, false);
data = structuredClone(initial); imageResult = { ok: false, reason: 'existing_media_unverified' };
assert.match((await prepare(db, productId, submissionId, 'Cashew')).message, /Ảnh cũ/);
imageResult = { ok: true }; validationResult = { ok: false, message: 'Tên có grade' };
assert.equal((await prepare(db, productId, submissionId, 'Cashew')).message, 'Tên có grade');
console.log('Review preparation: coherent context, policy, snapshot validation and fail-closed media checks passed');
