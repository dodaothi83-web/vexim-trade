// node scripts/check-approved-product-form-images.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const productId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', supplierId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const submissionId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', imageId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const row = { product_id: productId, submission_id: submissionId, media_id: imageId, position: 0 };
const media = [{ id: imageId, owner_type: 'product', product_id: productId, supplier_id: supplierId,
  kind: 'image', audience: 'buyer', status: 'unverified', storage_path: `product-form-images/${productId}/${imageId}.webp` }];
let rows = [row], publication = { submissionId, priceConsent: false }, error = null, calls = 0;
const db = { from(table) { assert.equal(table, 'product_form_published_images'); return {
  select(value) { assert.equal(value, 'product_id,submission_id,media_id,position'); return this; }, in() { return this; },
  async limit(value) { calls++; assert.equal(value, 401); return { data: rows, error }; },
}; } };
function load(file, mocks) {
  const exports = {}; const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Map, Set, Array, require: (key) => { if (!(key in mocks)) throw Error(key); return mocks[key]; } });
  return exports;
}
const select = load('../lib/products/product-form-published-images.ts', { '@/lib/media/readiness': { isExpired: (x) => x.status === 'expired' } });
const reader = load('../lib/products/approved-product-form-images.ts', { 'server-only': {},
  '@/lib/db/supabase': { getSupabaseClient: () => db }, '@/lib/products/product-form-published-images': select,
  '@/lib/products/approved-product-form-consent': { readApprovedFormPublications: async (candidates) => new Map(candidates.map((c) => [c.productId, publication])) },
}).readApprovedFormImages;
const candidate = { productId, supplierId, priceRevision: null, media };
let result = await reader([{ ...candidate, expectedSubmissionId: submissionId }]); assert.equal(result.get(productId)[0].id, imageId);
await assert.rejects(() => reader([{ ...candidate, expectedSubmissionId: null }]), /changed while reading/, 'Concurrent publication never mixes an older form with a newer gallery');
publication = null; rows = []; assert.equal((await reader([candidate])).get(productId), null, 'Legacy gallery remains unchanged');
rows = [row]; await assert.rejects(() => reader([candidate]), /without approved/, 'Concurrent approval never silently falls back');
publication = { submissionId: null, priceConsent: false }; await assert.rejects(() => reader([candidate]), /out of sync/);
publication = { submissionId, priceConsent: true }; rows = [{ ...row, submission_id: imageId }]; await assert.rejects(() => reader([candidate]), /reference/);
rows = [row]; error = new Error('missing'); await assert.rejects(() => reader([candidate]), /unavailable/); error = null;
await assert.rejects(() => reader([candidate, candidate]), /Duplicate/); assert.ok(calls > 0);
console.log('Approved form gallery reader: exact publication, consent-independent images, legacy and race failures passed');
