// node scripts/check-product-form-published-images.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const productId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', supplierId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const submission = 'cccccccc-cccc-cccc-cccc-cccccccccccc', first = 'dddddddd-dddd-dddd-dddd-dddddddddddd', second = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-published-images.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Set, require: (key) => {
  if (key === '@/lib/media/readiness') return { isExpired: (asset) => asset.status === 'expired' }; throw Error(key);
} });
const project = exports.selectPublishedFormImages;
const media = [first, second].map((id) => ({ id, owner_type: 'product', product_id: productId, supplier_id: supplierId,
  kind: 'image', audience: 'buyer', status: 'unverified', storage_path: `product-form-images/${productId}/${id}.webp` }));
const refs = [second, first].map((id, position) => ({ product_id: productId, submission_id: submission, media_id: id, position }));
const input = { productId, supplierId, approvedSubmissionId: submission, refs, media };
assert.deepEqual(Array.from(project(input), (asset) => asset.id), [second, first], 'Manifest order wins over legacy media ordering');
assert.equal(project({ ...input, approvedSubmissionId: null, refs: [] }), null, 'Legacy gallery stays untouched');
assert.throws(() => project({ ...input, approvedSubmissionId: null }), /without approved/);
assert.throws(() => project({ ...input, refs: [] }), /manifest/);
assert.throws(() => project({ ...input, refs: [{ ...refs[0], submission_id: first }] }), /reference/);
assert.throws(() => project({ ...input, refs: [{ ...refs[0], position: 1 }] }), /reference/);
assert.throws(() => project({ ...input, refs: [refs[0], { ...refs[1], media_id: second }] }), /reference/);
assert.throws(() => project({ ...input, media: [media[0]] }), /missing/);
assert.throws(() => project({ ...input, media: [media[0], media[1], media[1]] }), /ambiguous/);
for (const change of [{ audience: 'internal' }, { status: 'expired' }, { kind: 'document' }, { product_id: supplierId }, { supplier_id: productId }, { storage_path: '' }])
  assert.throws(() => project({ ...input, media: [media[0], { ...media[1], ...change }] }), /unavailable/);
assert.throws(() => project({ ...input, media: [media[0], { ...media[1], storage_path: media[0].storage_path }] }), /unavailable/);
console.log('Published form images: legacy fallback, ordered approved references and fail-closed ownership passed');
