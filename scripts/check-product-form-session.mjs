// node scripts/check-product-form-session.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-session.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, JSON, Number });
const { ProductFormSession } = exports;
const draft = { name: '', tiers: [{ quantity: '', price: '' }], descriptionDetail: '' };
const changed = { ...draft, name: 'Nhân điều' };
const id = 'product-1';
let calls = [], firstLost = false, saveFail = false, submitFail = false, uploadFailAt = -1, nextUpload = 0, rev = 0;
let hold, release;
const operations = {
  newRequestId: () => 'request-1',
  async create(request, value) { calls.push(['create', request, JSON.stringify(value)]); if (firstLost) { firstLost = false; throw Error('lost response'); } rev = 1; return { ok: true, id, revision: rev }; },
  async save(productId, revision, value) { calls.push(['save', productId, revision, JSON.stringify(value)]); if (saveFail) return { ok: false, message: 'changed' }; return { ok: true, id, revision: ++rev }; },
  async submit(productId, revision) { calls.push(['submit', productId, revision]); if (hold) await hold; return submitFail ? { ok: false, message: 'not ready' } : { ok: true, message: 'submitted' }; },
  async upload(productId, revision, file) { const n = nextUpload++; calls.push(['upload', productId, file.name, revision]); return n === uploadFailAt ? { ok: false, message: 'upload failed' } : { ok: true, revision: ++rev, image: { id: `img-${n}`, url: `/image/${n}`, source: 'staged' } }; },
  async setImages(productId, revision, images) { calls.push(['setImages', productId, revision, images]); return { ok: true, revision: ++rev }; },
};
const createSession = (initial = {}) => new ProductFormSession(operations, { productId: null, revision: 0, value: draft, images: [], ...initial });
let session = createSession();
assert.ok(session.isDirty(draft));
let result = await session.save(draft);
assert.equal(result.ok, true); assert.equal(result.revision, 1); assert.equal(session.isDirty(draft), false);
assert.equal((await session.save(draft)).ok, true); assert.equal(calls.filter((c) => c[0] === 'save').length, 0, 'Saving an unchanged draft creates no new revision');
result = await session.save(changed); assert.equal(result.revision, 2); assert.equal(session.isDirty(changed), false);
assert.equal((await session.submit(changed)).ok, true); assert.deepEqual(calls.at(-1), ['submit', id, 2]);
assert.equal(session.snapshot().submitted, true); assert.equal((await session.save(changed)).ok, false);

calls = []; rev = 0; firstLost = true; session = createSession();
result = await session.save(draft); assert.equal(result.ok, false);
result = await session.save(changed); assert.equal(result.ok, true); assert.equal(result.revision, 2);
assert.equal(calls[0][1], calls[1][1]); assert.equal(calls[0][2], calls[1][2], 'Retry uses the exact original create payload');
assert.equal(calls[2][3], JSON.stringify(changed), 'Edits after a lost response are saved only after creation resolves');

calls = []; rev = 0; session = createSession();
const image = (name, type = 'image/png', size = 10) => ({ name, type, size });
assert.equal((await session.upload(draft, [image('bad.pdf', 'application/pdf')])).ok, false); assert.equal(calls.length, 0);
assert.equal((await session.upload(draft, Array(9).fill(image('x.png')))).ok, false); assert.equal(calls.length, 0);
nextUpload = 0; uploadFailAt = 1;
result = await session.upload(draft, [image('one.png'), image('two.png')]); assert.equal(result.ok, false); assert.match(result.message, /Đã tải 1 ảnh/);
assert.equal(session.snapshot().images.length, 1); assert.equal(session.snapshot().productId, id);
assert.deepEqual(calls.map((c) => c[0]), ['create', 'upload', 'upload']);
uploadFailAt = -1; result = await session.upload(draft, [image('three.png')]); assert.equal(result.ok, true);
assert.equal(result.uploaded, 1); assert.equal(session.snapshot().images.length, 2);
assert.equal(session.snapshot().revision, 3, 'Each upload advances the draft revision');
const [one, two] = session.snapshot().images;
assert.equal((await session.selectImages(draft, [two, one])).ok, true);
assert.equal(session.snapshot().images[0].id, two.id);
assert.equal((await session.selectImages(draft, [two])).ok, true);
assert.equal(session.snapshot().availableImages.length, 2, 'Removing only changes the private selection');
assert.equal((await session.selectImages(draft, [two, one])).ok, true, 'A removed image can be restored');
assert.equal((await session.selectImages(draft, [two, two])).ok, false);
assert.equal((await session.selectImages(draft, [{ ...one, id: 'unknown' }])).ok, false);

calls = []; rev = 4; saveFail = true;
session = createSession({ productId: id, revision: 4, value: draft });
result = await session.submit(changed); assert.equal(result.ok, false); assert.equal(calls.some((c) => c[0] === 'submit'), false);
saveFail = false; submitFail = true; result = await session.submit(changed); assert.equal(result.ok, false); assert.equal(session.snapshot().submitted, false);
submitFail = false; hold = new Promise((resolve) => { release = resolve; });
const inFlight = session.submit(changed);
await Promise.resolve(); assert.equal((await session.save(changed)).ok, false, 'Concurrent requests are rejected');
release(); assert.equal((await inFlight).ok, true); hold = null;

calls = []; session = createSession();
const stale = { ...operations, create: async () => ({ ok: true, id, revision: 2 }) };
const staleSession = new ProductFormSession(stale, { productId: null, revision: 0, value: draft, images: [] });
assert.equal((await staleSession.save(draft)).ok, false); assert.equal(staleSession.snapshot().productId, id);
assert.equal(staleSession.snapshot().requiresReload, true); assert.equal((await staleSession.save(draft)).ok, false);
let attempts = 0;
const uncertainOps = { ...operations, upload: async () => { attempts++; throw Error('connection reset'); } };
const uncertain = new ProductFormSession(uncertainOps, { productId: id, revision: 1, value: draft, images: [] });
assert.equal((await uncertain.upload(draft, [image('one.png')])).ok, false);
assert.equal(uncertain.snapshot().requiresReload, true);
assert.equal((await uncertain.upload(draft, [image('one.png')])).ok, false);
assert.equal(attempts, 1, 'An uncertain upload must be reloaded before retrying');
console.log('Product form session: incomplete drafts, retries, revision CAS, uploads and submission sequencing passed');
