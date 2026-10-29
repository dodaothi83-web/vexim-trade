// node --experimental-strip-types --no-warnings scripts/check-product-form-approved-seed.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { entry, revision } from './quantity-v2-test-utils.mjs';
function load(file, mocks) {
  const exports = {}, code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Number, JSON, Object, TextEncoder, require(key) { if (!(key in mocks)) throw Error(key); return mocks[key]; } });
  return exports;
}
const model = load('../lib/products/product-form-model.ts', { zod: { z }, '@/lib/products/quantity-entry': entry });
const seed = load('../lib/products/product-form-approved-seed.ts', { '@/lib/products/product-form-model': model,
  '@/lib/products/quantity-entry': entry, '@/lib/products/quantity-revision-v2': revision }).seedFromLinkedApprovedForm;
const productId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', supplierId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const priceId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', submissionId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const timestamp = '2026-10-29T10:20:30.123456+00:00';
const payload = { name: 'Nhân điều', category: 'cashew-kernels', grade: 'W320', customGrade: false,
  spec: 'Mẫu', rawMaterialRegion: '', inputMaterialOrigin: '', incoterm: 'FOB', incotermPlace: 'Cảng', unit: 'kg',
  tiers: [{ quantity: '1,000', price: '6,40' }, { quantity: '5,000', price: '6.00' }], pricePubliclyVisible: true, priceConsent: true,
  paymentTerms: '', oem: false, odm: false, samples: false, packaging: '', exportPort: '', leadTimeDays: '', monthlyCapacityKg: '50,000',
  description: '', descriptionDetail: '', attributes: {}, attributePool: '[]' };
const tiers = [{ version: 2, unit: 'kg', customGrade: false, quantityGrams: 1000000, unitWeightGrams: 1000, priceCentsPerUnit: 640 },
  { version: 2, unit: 'kg', customGrade: false, quantityGrams: 5000000, unitWeightGrams: 1000, priceCentsPerUnit: 600 }];
const args = { product: { id: productId, supplier_id: supplierId, updated_at: timestamp },
  priceRevision: { id: priceId, product_id: productId, status: 'approved', grade: 'W320', incoterm: 'FOB', tiers },
  submission: { id: submissionId, product_id: productId, supplier_id: supplierId, status: 'approved', approved_price_revision_id: priceId,
    approved_product_updated_at: timestamp, payload, quantity: { grade: 'W320', incoterm: 'FOB', tiers } } };
const before = JSON.stringify(args); const restored = seed(args);
assert.equal(restored.ok, true); assert.equal(restored.draft.monthlyCapacityKg, '50,000'); assert.equal(restored.draft.priceConsent, false);
assert.equal(restored.draft.pricePubliclyVisible, true); assert.equal(JSON.stringify(args), before, 'Never mutate approved rows');
assert.equal(seed({ ...args, submission: { ...args.submission, approved_price_revision_id: submissionId } }).reason, 'invalid_link');
assert.equal(seed({ ...args, submission: { ...args.submission, supplier_id: productId } }).reason, 'invalid_link');
assert.equal(seed({ ...args, priceRevision: { ...args.priceRevision, status: 'pending' } }).reason, 'invalid_link');
assert.equal(seed({ ...args, product: { ...args.product, updated_at: '2026-10-29T10:20:30.123457+00:00' } }).reason, 'product_changed');
assert.equal(seed({ ...args, submission: { ...args.submission, approved_product_updated_at: null } }).reason, 'product_changed');
assert.equal(seed({ ...args, submission: { ...args.submission, quantity: { ...args.submission.quantity, incoterm: 'CIF' } } }).reason, 'invalid_snapshot');
assert.equal(seed({ ...args, submission: { ...args.submission, payload: { ...payload, monthlyCapacityKg: '5 tấn' } } }).reason, 'invalid_snapshot');
assert.equal(seed({ ...args, submission: { ...args.submission, payload: { ...payload, priceConsent: false } } }).reason, 'invalid_snapshot');
assert.equal(seed({ ...args, submission: { ...args.submission, payload: { ...payload, tiers: [{ quantity: '1,000', price: '6.41' }] } } }).reason, 'invalid_snapshot');
console.log('Linked approved-form seed: exact revision, microsecond baseline, kg capacity and fresh consent passed');
