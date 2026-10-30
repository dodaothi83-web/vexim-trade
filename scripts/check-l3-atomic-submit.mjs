// Exercise the real local/Supabase store CAS methods with in-memory state, not a real database.
// Run: node scripts/check-l3-atomic-submit.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as productExtras from '../lib/products/product-extras.ts';

const l2Scope = {};
new Function('exports', ts.transpileModule(fs.readFileSync(new URL('../lib/l2-scope.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(l2Scope);

const productSelection = { isTestOnlyProduct: () => false, productBelongsToCategory: () => false, productReviewApproved: () => false };
function loadStore(file, mocks, globals) {
  const code = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, Date, ...globals,
    require: (id) => { assert.ok(id in mocks, `Unexpected import: ${id}`); return mocks[id]; },
  }, { filename: file });
  return mod.exports;
}

const realTypes = loadStore('lib/types.ts', {}, {});
const realRules = loadStore('lib/verification-submission.ts', { 'node:crypto': crypto, '@/lib/types': realTypes }, {});

const localState = { buyers: [], suppliers: [], products: [], media: [], rfqs: [], sponsored_pushes: [],
  certificates: [], supplier_submissions: [], supplier_submission_items: [], audit_log: [], categories: [{ slug: 'nuts-kernels', status: 'published', is_published: true }] };
const config = { intro: '', seo_desc: '', spec_columns: [], spec_rows: [], buying_facts: [], faqs: [], filters: [], product_fields: [] };
const localMocks = {
  'node:crypto': crypto,
  'node:fs': { existsSync: () => false, mkdirSync() {}, writeFileSync() {} },
  'node:path': path,
  '@/lib/db/seed': { SEED_BUYERS: [], SEED_PRODUCTS: [], SEED_SUPPLIERS: [] },
  '@/lib/db/preview-seed': { PREVIEW_PEPPER_HARVEST: null, previewCategories: () => [], previewSeedRows: () => ({ suppliers: [], products: [] }) },
  '@/lib/db/demo-suppliers': { DEMO_SUPPLIERS: [] },
  '@/lib/l2-scope': l2Scope,
  '@/lib/types': realTypes,
  '@/lib/verification-submission': realRules,
  '@/lib/public/product-selection': productSelection,
  '@/lib/media/readiness': { isExpired: () => false },
  './category-seed': { CASHEW_CATEGORY_CONFIG: config, DEFAULT_CATEGORY_CONFIG: config, PEPPER_CATEGORY_CONFIG: config },
};
const localStore = loadStore('lib/db/local.ts', localMocks, {
  __veximLocal: localState, process: { cwd: () => '/virtual', env: {} },
}).localStore;

// A separate query builder per call emulates an atomic PostgREST conditional UPDATE.
let remoteRow;
const seenPredicates = [];
const fakeClient = { from(table) {
  assert.equal(table, 'supplier_submissions');
  let patch, id, statuses;
  return {
    update(value) { patch = value; return this; },
    eq(column, value) { if (column === 'id') id = value; else { assert.equal(column, 'status'); statuses = [value]; } return this; },
    in(column, values) { assert.equal(column, 'status'); statuses = [...values]; return this; },
    select() { return this; },
    async maybeSingle() {
      seenPredicates.push(statuses);
      if (!remoteRow || remoteRow.id !== id || !statuses.includes(remoteRow.status)) return { data: null, error: null };
      Object.assign(remoteRow, patch);
      return { data: { ...remoteRow }, error: null };
    },
  };
} };
const remoteStore = loadStore('lib/db/supabase.ts', {
  '@supabase/supabase-js': { createClient: () => fakeClient },
  '@/lib/public/product-selection': productSelection,
  '@/lib/products/product-extras': productExtras,
}, { process: { env: { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' } } }).supabaseStore;

for (const [name, store, reset] of [
  ['local', localStore, (row) => { localState.supplier_submissions = row ? [row] : []; }],
  ['Supabase', remoteStore, (row) => { remoteRow = row; }],
]) {
  for (const oldStatus of ['draft', 'returned']) {
    const row = { id: 'submission', status: oldStatus, review_note: 'original', flags: [] };
    reset(row);
    assert.equal(await store.updateEditableSubmission('other', { status: 'pending_review' }), null, `${name}: wrong id`);
    const outcomes = await Promise.all([
      store.updateEditableSubmission('submission', { status: 'pending_review', review_note: undefined }),
      store.updateEditableSubmission('submission', { status: 'pending_review', review_note: undefined }),
    ]);
    assert.equal(outcomes.filter(Boolean).length, 1, `${name}: exactly one competing submission wins`);
    assert.equal(row.status, 'pending_review');
    assert.equal(row.review_note, 'original', `${name}: undefined field must not overwrite data`);
    assert.equal(await store.updateEditableSubmission('submission', { status: 'pending_review' }), null);
  }
  // Factory submission requires the exact editable state seen before a scan.
  for (const expected of ['draft', 'returned']) {
    const other = expected === 'draft' ? 'returned' : 'draft';
    const row = { id: 'submission', status: other, flags: [] };
    reset(row);
    assert.equal(await store.updateEditableSubmission('submission', { status: 'pending_review' }, expected), null, `${name}: changed status ${expected} → ${other}`);
    assert.equal(row.status, other);
    assert.equal((await store.updateEditableSubmission('submission', { status: 'pending_review' }, other)).status, 'pending_review');
  }
  for (const status of ['pending_review', 'accepted']) {
    const row = { id: 'submission', status, flags: [] };
    reset(row);
    assert.equal(await store.updateEditableSubmission('submission', { status: 'pending_review' }), null, `${name}: locked state ${status}`);
    assert.equal(row.status, status);
  }
  reset(null);
  assert.equal(await store.updateEditableSubmission('submission', { status: 'pending_review' }), null);
}
// Real local adapter enforces the same file/status rules as the SQL trigger.
const draft = { id: 'l3', target_level: 3, status: 'draft', flags: [] };
localState.supplier_submissions = [draft];
localState.supplier_submission_items = [];
assert.equal(await localStore.updateEditableSubmission('l3', { status: 'pending_review' }), null, 'L3 cannot queue without evidence');
const add = (id) => localStore.createSubmissionItem({ id, submission_id: 'l3', supplier_id: 'supplier',
  checklist_key: 'other_export_evidence', media_id: `media-${id}`, storage_path: `submission/${id}.pdf` });
const a = await add('a'), b = await add('b'), c = await add('c');
await assert.rejects(add('d'), /L3_EVIDENCE_LIMIT/);
assert.equal((await localStore.updateEditableSubmission('l3', { status: 'pending_review' })).status, 'pending_review');
await assert.rejects(localStore.deleteSubmissionItem(a.id), /L3_SUBMISSION_LOCKED/);
await assert.rejects(add('d'), /L3_SUBMISSION_LOCKED/);
draft.status = 'returned';
await localStore.deleteSubmissionItem(a.id);
await localStore.deleteSubmissionItem(b.id);
await localStore.deleteSubmissionItem(c.id);
assert.equal(await localStore.updateEditableSubmission('l3', { status: 'pending_review' }), null, 'Deleting the last proof wins over a stale submit');
assert.equal(draft.status, 'returned');

assert.ok(seenPredicates.length > 0);
assert.ok(seenPredicates.every((statuses) => JSON.stringify(statuses) === JSON.stringify(['draft', 'returned']) || (statuses.length === 1 && ['draft', 'returned'].includes(statuses[0]))));
assert.ok(seenPredicates.some((statuses) => statuses.length === 1), 'Supabase compares the exact expected status');
console.log('✅ L3 atomic submit: real local and Supabase adapters restrict updates to editable states (Supabase mocked).');

// Local factory submissions mirror the structural and lock rules; AI can only
// update advisory fields after submission, never the underlying evidence.
localState.suppliers.push({ id: 'factory-supplier', supplier_type: 'manufacturer', name: 'Factory' });
const factoryCase = await localStore.createSubmission({ supplier_id: 'factory-supplier', target_level: 2, status: 'draft', l2_scope: 'factory' });
await localStore.updateEditableSubmission(factoryCase.id, { verification_code: 'VX-L2-ABCD-EFGH', code_issued_at: new Date().toISOString() }, 'draft');
await assert.rejects(localStore.updateEditableSubmission(factoryCase.id, { status: 'pending_review' }, 'draft'), /L2_FACTORY_PHOTOS_REQUIRED/);
const factoryItems = [];
for (const spec of realTypes.L2_FACTORY_PHOTO_ITEMS) {
  factoryItems.push(await localStore.createSubmissionItem({ submission_id: factoryCase.id, supplier_id: 'factory-supplier',
    checklist_key: spec.key, media_id: `media-${spec.key}`, storage_path: `photos/${spec.key}.jpg`,
    flags: spec.key === 'factory_gate' ? [{ flag: 'code_missing', source: 'ai', severity: 'hard' }] : [] }));
}
assert.equal((await localStore.updateEditableSubmission(factoryCase.id, { status: 'pending_review' }, 'draft')).status, 'pending_review');
await assert.rejects(localStore.deleteSubmissionItem(factoryItems[0].id), /L2_FACTORY_LOCKED/);
await assert.rejects(localStore.updateSubmissionItem(factoryItems[0].id, { storage_path: 'replacement.jpg' }), /L2_FACTORY_LOCKED/);
await assert.rejects(localStore.createSubmissionItem({ submission_id: factoryCase.id, supplier_id: 'factory-supplier', checklist_key: 'factory_gate' }), /L2_FACTORY_LOCKED/);
assert.equal((await localStore.updateSubmissionItem(factoryItems[0].id, { ai_verdict: 'fail' })).ai_verdict, 'fail');
await localStore.updateSubmission(factoryCase.id, { status: 'returned' });
await localStore.deleteSubmissionItem(factoryItems[0].id);
await assert.rejects(localStore.updateEditableSubmission(factoryCase.id, { status: 'pending_review' }, 'returned'), /L2_FACTORY_PHOTOS_REQUIRED/);
console.log('✅ Local L2 factory: enough evidence, advisory AI and locked submissions.');

// Local partner cases mirror PostgreSQL: ownership, lock, approval and snapshot guards.
localState.suppliers.push({ id: 'trader', supplier_type: 'trading', name: 'Trader' });
const partnerCase = await localStore.createSubmission({ supplier_id: 'trader', target_level: 2, status: 'draft', l2_scope: 'partner_contract' });
await assert.rejects(localStore.createVerification({ supplier_id: 'trader', target_level: 2, status: 'approved', l2_scope: 'partner_contract' }), /L2_PARTNER_APPROVAL_REQUIRES_REVIEW/);
await assert.rejects(localStore.createMedia({ owner_type: 'submission', submission_id: partnerCase.id, supplier_id: 'other', audience: 'internal', kind: 'document', checklist_key: 'partner_factory_contract', storage_path: 'contract.pdf' }), /L2_PARTNER_PRIVATE_EVIDENCE/);
const partnerMedia = await localStore.createMedia({ owner_type: 'submission', submission_id: partnerCase.id, supplier_id: 'trader', audience: 'internal', status: 'unverified', kind: 'document', checklist_key: 'partner_factory_contract', storage_path: 'contract.pdf' });
const partnerItem = await localStore.createSubmissionItem({ submission_id: partnerCase.id, supplier_id: 'trader', checklist_key: 'partner_factory_contract', media_id: partnerMedia.id, storage_path: 'contract.pdf' });
assert.equal((await localStore.updateEditableSubmission(partnerCase.id, { status: 'pending_review' })).status, 'pending_review');
await assert.rejects(localStore.updateMedia(partnerMedia.id, { audience: 'buyer' }), /L3_SUBMISSION_LOCKED/);
await assert.rejects(localStore.deleteMedia(partnerMedia.id), /L3_SUBMISSION_LOCKED/);
await assert.rejects(localStore.updateSubmissionItem(partnerItem.id, { storage_path: 'other.pdf' }), /L3_SUBMISSION_LOCKED/);
const partnerReview = await localStore.createVerification({ supplier_id: 'trader', target_level: 2, status: 'in_progress', l2_scope: 'partner_contract' });
await assert.rejects(localStore.updateVerification(partnerReview.id, { status: 'approved' }), /L2_PARTNER_SCOPE_CONFIRM_REQUIRED/);
const copy = await localStore.createMedia({ owner_type: 'verification', verification_id: partnerReview.id, supplier_id: 'trader', audience: 'internal', status: 'checked', kind: 'document', checklist_key: 'partner_factory_contract', storage_path: 'contract.pdf' });
await localStore.updateVerification(partnerReview.id, { checklist: { partner_identity_confirmed: true, partner_scope_confirmed: true }, status: 'submitted' });
await localStore.updateVerification(partnerReview.id, { status: 'approved' });
await assert.rejects(localStore.updateMedia(copy.id, { audience: 'buyer' }), /L2_PARTNER_REVIEW_LOCKED/);
await assert.rejects(localStore.updateVerification(partnerReview.id, { l2_scope: 'factory' }), /VERIFICATION_SCOPE_IMMUTABLE/);
console.log('✅ Local L2 parity: private contract, immutable scope, locked queue and explicit approval.');
