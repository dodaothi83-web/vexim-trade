// Local integration regression: real draft parser/sanitizer/session and mocked RPC/storage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { loadProductDescription } from './product-description-test-utils.mjs';

function load(path, mocks = {}, globals = {}) {
  const exports = {};
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, { exports, console, TextEncoder, ...globals, require: (id) => {
    if (!(id in mocks)) throw new Error(`Unexpected import ${id} in ${path}`);
    return mocks[id];
  } });
  return exports;
}
const { description } = loadProductDescription();
const browser = load('components/products/product-description-browser.ts', { '@/lib/products/product-description': description });
const { parseProductFormDraft, productFormDraftStructureError } = load('lib/products/product-form-model.ts', {
  zod: { z }, '@/lib/products/quantity-entry': {},
});
const { ProductFormSession } = load('lib/products/product-form-session.ts');
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const productId = '11111111-1111-1111-1111-111111111111';
let rpcCalls = [], uploads = [], errorAfterRpc = false;
const db = { async rpc(name, args) {
  rpcCalls.push({ name, args });
  if (errorAfterRpc) { errorAfterRpc = false; throw new Error('simulated lost response'); }
  return { data: { status: 'saved', product_id: productId, revision: name === 'create_product_form_draft' ? 1 : 2 }, error: null };
} };
const actions = load('app/supplier/portal/product-form-draft-actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => ({ supplier: { id: supplier } }) },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  '@/lib/products/product-form-model': { parseProductFormDraft, productFormDraftStructureError },
  '@/lib/products/product-description': description,
  '@/lib/products/product-form-image-selection': {},
  '@/lib/products/product-form-staging-access': { isProductFormEnabled: () => true },
}, { console: { error() {} } });
const empty = { name: 'Sản phẩm mẫu', category: 'cashew-kernels', grade: '', customGrade: false,
  spec: '', rawMaterialRegion: '', inputMaterialOrigin: '', incoterm: '', incotermPlace: '', unit: 'kg',
  tiers: [{ quantity: '', price: '' }], pricePubliclyVisible: false, priceConsent: false, paymentTerms: '',
  oem: false, odm: false, samples: false, packaging: '', exportPort: '', leadTimeDays: '', monthlyCapacityKg: '',
  description: '', descriptionDetail: '', attributes: {}, attributePool: '[]' };
assert.ok(parseProductFormDraft(empty), 'The normal incomplete new form has a valid draft shape');
// Two price tiers, consent, OEM, a simple detailed paragraph and optional
// delivery data reproduce the shape seen in the report, with synthetic values.
const completed = { ...empty, grade: 'W180', incoterm: 'FOB', incotermPlace: 'Cảng', spec: 'Quy cách',
  rawMaterialRegion: 'Việt Nam', inputMaterialOrigin: 'Việt Nam',
  tiers: [{ quantity: '100', price: '5.00' }, { quantity: '200', price: '4.00' }],
  pricePubliclyVisible: true, priceConsent: true, paymentTerms: 'T/T', oem: true, packaging: 'Thùng',
  leadTimeDays: '15', monthlyCapacityKg: '1,000', description: 'Mô tả sản phẩm',
  descriptionDetail: '<p>Một đoạn mô tả chi tiết sản phẩm.</p>', attributes: {}, attributePool: '[]' };
assert.ok(parseProductFormDraft(completed), 'A fully filled synthetic form also passes structural validation');
assert.ok(parseProductFormDraft({ ...completed, name: '' }), 'An empty name does not block saving a draft');
assert.equal(productFormDraftStructureError(completed), null);
const tooLongPrice = { ...completed, tiers: [{ quantity: '1,000', price: '9'.repeat(33) }] };
assert.match(productFormDraftStructureError(tooLongPrice), /Giá theo số lượng/);
assert.doesNotMatch(productFormDraftStructureError(tooLongPrice), /99999/, 'Diagnostics never echo form contents');
assert.match(productFormDraftStructureError({ ...completed, unexpected: 'PRIVATE_VALUE' }), /không hợp lệ/);
assert.doesNotMatch(productFormDraftStructureError({ ...completed, unexpected: 'PRIVATE_VALUE' }), /PRIVATE_VALUE/);
for (const html of ['', '<p></p>', '<p><br></p>', '<p>&nbsp;</p>']) {
  const value = browser.sanitizeProductDescriptionInBrowser(html);
  assert.equal(value, '', 'Empty editor markup must match the canonical server value');
  assert.equal(description.sanitizeProductDescriptionForSave(value), value);
}
const rich = browser.sanitizeProductDescriptionInBrowser('<p><strong>Cà phê</strong><br>Việt Nam</p>');
assert.equal(description.sanitizeProductDescriptionForSave(rich), rich, 'Nonempty formatted content is preserved');
assert.doesNotMatch(browser.sanitizeProductDescriptionInBrowser('<p>Safe<script>alert(1)</script></p>'), /script|alert/);
let request = 0;
const operations = {
  newRequestId: () => `00000000-0000-4000-8000-${String(++request).padStart(12, '0')}`,
  create: actions.createProductFormDraftAction, save: actions.saveProductFormDraftAction,
  async upload(id, revision, file) { uploads.push({ id, revision, file }); return { ok: true, revision: revision + 1,
    image: { id: 'image-1', source: 'staged', url: '/private/image-1' } }; },
  async submit() { throw Error('not called'); }, async setImages() { throw Error('not called'); },
};
const image = { name: 'image.png', type: 'image/png', size: 100 };
let failure = await actions.createProductFormDraftAction(operations.newRequestId(), tooLongPrice);
assert.equal(failure.rejectedBeforeCreate, true); assert.match(failure.message, /Giá theo số lượng/);
failure = await actions.createProductFormDraftAction(operations.newRequestId(), { ...completed, descriptionDetail: `<p>${'a'.repeat(6001)}</p>` });
assert.equal(failure.rejectedBeforeCreate, true); assert.match(failure.message, /Mô tả chi tiết/);
assert.equal(rpcCalls.length, 0, 'Structural and description rejections do not reach the RPC');
let session = new ProductFormSession(operations, { productId: null, revision: 0, value: completed, images: [] });
let result = await session.upload(completed, [image]);
assert.equal(result.ok, true, 'A fully filled synthetic form can start an upload');
assert.equal(rpcCalls.length, 1); assert.equal(uploads.length, 1);
rpcCalls = []; uploads = [];
session = new ProductFormSession(operations, { productId: null, revision: 0, value: empty, images: [] });
result = await session.upload(empty, [image]);
assert.equal(result.ok, true, 'An incomplete but valid new draft can start an upload');
assert.equal(rpcCalls.length, 1); assert.equal(uploads.length, 1);
rpcCalls = []; uploads = [];
session = new ProductFormSession(operations, { productId: null, revision: 0, value: empty, images: [] });
result = await session.upload({ ...empty, descriptionDetail: '<p></p>' }, [image]);
assert.equal(result.ok, false, 'A noncanonical draft is rejected before RPC');
assert.equal(rpcCalls.length, 0); assert.equal(uploads.length, 0);
result = await session.upload(empty, [image]);
assert.equal(result.ok, true, 'A corrected preflight rejection is retried with the current value');
assert.equal(rpcCalls.length, 1); assert.equal(rpcCalls[0].args.p_payload.descriptionDetail, '');
assert.equal(uploads.length, 1); assert.equal(uploads[0].revision, 1);

rpcCalls = []; uploads = []; errorAfterRpc = true;
session = new ProductFormSession(operations, { productId: null, revision: 0, value: empty, images: [] });
result = await session.upload(empty, [image]); assert.equal(result.ok, false);
assert.equal(uploads.length, 0);
const changed = { ...empty, name: 'Sản phẩm mẫu đã chỉnh' };
result = await session.upload(changed, [image]); assert.equal(result.ok, true);
assert.equal(rpcCalls.length, 3, 'Retry original create, then save changed value');
assert.equal(rpcCalls[0].args.p_request_id, rpcCalls[1].args.p_request_id);
assert.equal(JSON.stringify(rpcCalls[0].args.p_payload), JSON.stringify(rpcCalls[1].args.p_payload),
  'An uncertain RPC result preserves the original idempotency payload');
assert.equal(rpcCalls[2].name, 'save_product_form_draft_checked');
assert.equal(rpcCalls[2].args.p_payload.name, changed.name);
assert.equal(uploads.length, 1); assert.equal(uploads[0].revision, 2);

let attempts = 0;
const afterUncertainty = { ...operations, async create() {
  attempts++;
  return attempts === 1 ? { ok: false, message: 'unknown RPC outcome' } :
    { ok: false, rejectedBeforeCreate: true, message: 'new validator rejected retry' };
} };
session = new ProductFormSession(afterUncertainty, { productId: null, revision: 0, value: empty, images: [] });
assert.equal((await session.upload(empty, [image])).ok, false);
result = await session.upload(changed, [image]);
assert.equal(result.ok, false); assert.equal(session.snapshot().requiresReload, true,
  'A later preflight rejection cannot rule out an earlier uncertain creation');
assert.equal((await session.upload(changed, [image])).ok, false);
assert.equal(attempts, 2, 'Do not start another create when a previous one might have succeeded');
console.log('Product form upload regression: empty detail, preflight correction and uncertain-create idempotency passed');
