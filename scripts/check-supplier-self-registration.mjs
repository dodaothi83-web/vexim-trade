// node scripts/check-supplier-self-registration.mjs — isolated signup, ownership and role regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, mocks, extra = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: (key) => {
    if (key === 'server-only') return {};
    assert.ok(key in mocks, `Unexpected ${key} in ${path}`); return mocks[key];
  }, Request, Response, Headers, FormData, File, Date, URL, console: { error() {}, warn() {} }, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'mock' } }, ...extra }, { filename: path });
  return mod.exports;
}
const keys = ['business_license', 'food_safety', 'haccp_or_brc', 'product_certs', 'export_license'];
const policy = load('../lib/supplier-portal/policy.ts', { '@/lib/verification': { auditUploadKind: (level, key) => level === 1 && keys.includes(key) ? 'file' : null } });
const owner = { id: 'u1', email: 'owner@example.com', role: 'supplier', is_active: true, supplier_id: 's1' };
const doc = { id: 'v1', target_level: 1, supplier_id: 's1', status: 'in_progress' };
assert.equal(policy.canUploadOwnDocument(owner, doc, 'business_license'), true);
for (const denied of [
  [owner, { ...doc, target_level: 2 }, 'business_license'],
  [owner, { ...doc, supplier_id: 's2' }, 'business_license'],
  [owner, doc, 'shipping_proof'],
  [owner, { ...doc, status: 'approved' }, 'business_license'],
  [{ ...owner, is_active: false }, doc, 'business_license'],
  [{ ...owner, role: 'viewer' }, doc, 'business_license'],
]) assert.equal(policy.canUploadOwnDocument(...denied), false);

const state = { users: [{ email: 'admin@veximtrade.com', role: 'admin', is_active: true }], suppliers: [], reviews: [], requests: [], media: [], audit: [], authCalls: 0, deletedAuth: 0, notify: 0, schemaMissing: false, failRequest: false, confirmed: false };
const store = {
  mode: 'supabase',
  listUsers: async () => state.users,
  getUserByEmail: async (email) => state.users.find((u) => u.email === email) ?? null,
  listSupplierVerificationRequests: async () => { if (state.schemaMissing) throw Error('missing migration'); return state.requests; },
  createSupplier: async (input) => { const r = { ...input, id: 's1' }; state.suppliers.push(r); return r; },
  createUser: async (input) => { const r = { ...input, id: 'u1' }; state.users.push(r); return r; },
  createVerification: async (input) => { const r = { ...input, id: 'v1' }; state.reviews.push(r); return r; },
  createSupplierVerificationRequest: async (id, target_level) => {
    if (state.failRequest) throw Error('DB write failed');
    const r = { supplier_id: id, target_level, status: 'requested' }; state.requests.push(r); return r;
  },
  addAuditLog: async (entry) => { state.audit.push(entry); },
  deleteUser: async (id) => { state.users = state.users.filter((u) => u.id !== id); },
  deleteSupplier: async (id) => { state.suppliers = state.suppliers.filter((s) => s.id !== id); state.reviews = []; state.requests = []; state.media = []; },
};
const auth = { auth: {
  signUp: async () => { state.authCalls++; return { data: { user: { id: 'auth-1', identities: [{ id: 'identity' }], email_confirmed_at: state.confirmed ? 'now' : null }, session: state.confirmed ? {} : null }, error: null }; },
  admin: { deleteUser: async () => { state.deletedAuth++; } },
} };
const mocks = {
  'next/server': { NextResponse: { json: (data, opts) => Response.json(data, opts) } },
  '@/lib/db': { getStore: () => store },
  '@/lib/db/supabase': { getSupabaseAuthClient: () => auth, getSupabaseClient: () => ({ from: () => ({ select: () => ({ limit: async () => ({ error: state.schemaMissing ? Error('missing') : null }) }) }) }) },
  '@/lib/auth/session': { getSession: async () => null },
  '@/lib/auth/password': { passwordProblem: (p) => p.length < 8 ? 'short' : null },
  '@/lib/rfq/rate-limit': { rateLimit: () => ({ ok: true }) },
  '@/lib/media/storage': { deleteObject: async () => null },
  '@/lib/supplier-portal/evidence': {
    MAX_INITIAL_FILES: 5, validateInitialDocument: async () => ({ bytes: new Uint8Array([1]), mime: 'application/pdf', kind: 'document' }),
    saveDocumentEvidence: async ({ review, key, createdBy }) => { const row = { id: `m${state.media.length}`, owner_type: 'verification', supplier_id: review.supplier_id, verification_id: review.id, audience: 'internal', checklist_key: key, created_by: createdBy, storage_path: `verifications/${review.id}/test.pdf` }; state.media.push(row); return row; },
  },
  '@/lib/supplier-portal/policy': { INITIAL_DOCUMENT_KEYS: keys },
  '@/lib/supplier-portal/notify': { notifySupplierRegistration: async (_supplier, requested) => { state.notify++; assert.equal(requested.length, 2); return 'sent'; } },
  '@/lib/types': { L1_DOC_ITEMS: [{ key: 'business_license' }, { key: 'tax_certificate' }, { key: 'bank_letter' }] },
  '@/lib/site': { SITE_URL: 'https://example.com' },
};
const { POST } = load('../app/api/supplier-signup/route.ts', mocks);
const file = new File(['%PDF-1.7 TEST DOCUMENT'], 'license.pdf', { type: 'application/pdf' });
function form(email = 'owner@example.com') {
  const fd = new FormData();
  for (const [key, val] of Object.entries({ name: 'Example Trading Co', contact_name: 'Mr A', email, password: 'password123', phone: '0987654321', products: 'Cashew', supplier_type: 'trading', consent: 'yes', tax_number: '0012345', bank_account_number: '000123', 'request:2': 'yes', 'request:3': 'yes' })) fd.set(key, val);
  fd.set('doc:business_license', file);
  fd.set('status', 'published'); fd.set('verification_level', '3');
  return fd;
}
async function post(fd) {
  const response = await POST(new Request('https://example.com/api/supplier-signup', { method: 'POST', body: fd, headers: { 'x-forwarded-for': '203.0.113.1' } }));
  return { status: response.status, data: await response.json() };
}
state.schemaMissing = true;
assert.equal((await post(form())).status, 503);
assert.equal(state.authCalls, 0, 'Missing migration must not create an Auth account');
state.schemaMissing = false;
state.confirmed = true;
assert.equal((await post(form())).status, 503, 'Disabled email confirmation must fail closed');
assert.equal(state.deletedAuth, 1);
state.confirmed = false;
assert.equal((await post(form())).status, 200);
assert.equal(state.suppliers[0].status, 'draft');
assert.equal(state.suppliers[0].verification_level, 0, 'Forged publish/level fields ignored');
assert.equal(state.users.at(-1).role, 'supplier');
assert.equal(state.users.at(-1).supplier_id, 's1');
assert.equal(state.reviews.length, 1);
assert.equal(state.reviews[0].target_level, 1);
assert.equal(state.reviews[0].status, 'in_progress');
assert.equal(state.reviews[0].checklist.business_license, null, 'Upload does not mark review passed');
assert.deepEqual(state.requests.map((r) => r.target_level), [2, 3]);
assert.equal(state.media[0].audience, 'internal');
assert.equal(state.media[0].verification_id, 'v1');
assert.equal(state.notify, 1);
assert.equal((await post(form())).status, 409, 'Cannot claim an existing account');
assert.equal(state.authCalls, 2);
store.mode = 'local';
assert.equal((await post(form('other@example.com'))).status, 503);
assert.equal(state.authCalls, 2, 'No local public signup');
store.mode = 'supabase';
state.failRequest = true;
assert.equal((await post(form('other@example.com'))).status, 503);
assert.equal(state.suppliers.length, 0, 'Failed registration rolls back the draft supplier');
assert.equal(state.users.length, 1, 'Failed registration rolls back the linked account');
assert.equal(state.deletedAuth, 2, 'Failed registration removes the unconfirmed Auth account');

const authStore = { mode: 'local', getUserByEmail: async () => ({ ...owner, auth_provider: 'supabase', password_hash: 'legacy-hash' }) };
const authLogin = load('../lib/auth/authenticate.ts', {
  '@/lib/db': { getStore: () => authStore },
  '@/lib/db/supabase': { getSupabaseAuthClient: () => null },
  '@/lib/auth/password': { hashPassword: async () => 'hash', verifyPassword: async () => true },
});
assert.equal((await authLogin.authenticate(owner.email, 'password123')).ok, false, 'Suppliers must never use local password fallback');
const authStoreOnline = { ...authStore, mode: 'supabase' };
const authLoginUnconfirmed = load('../lib/auth/authenticate.ts', {
  '@/lib/db': { getStore: () => authStoreOnline },
  '@/lib/db/supabase': { getSupabaseAuthClient: () => ({ auth: { signInWithPassword: async () => ({ data: { user: { id: 'auth-1', email_confirmed_at: null } }, error: null }) } }) },
  '@/lib/auth/password': { hashPassword: async () => 'hash', verifyPassword: async () => true },
});
assert.equal((await authLoginUnconfirmed.authenticate(owner.email, 'password123')).ok, false, 'Unconfirmed supplier must not log in');

const portalState = { user: owner, review: doc, saved: 0 };
const upload = load('../app/api/supplier-portal/evidence/route.ts', {
  'next/server': { NextResponse: { json: (data, opts) => Response.json(data, opts) } },
  'next/cache': { revalidatePath() {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => ({
    user: portalState.user, review: portalState.review, supplier: { id: 's1' },
    store: { getVerification: async () => portalState.review, addAuditLog: async () => null },
  }) },
  '@/lib/supplier-portal/policy': policy,
  '@/lib/supplier-portal/evidence': { MAX_DOCUMENT_BYTES: 15 * 1024 * 1024,
    validateInitialDocument: async () => ({ bytes: new Uint8Array([1]), mime: 'application/pdf', kind: 'document' }),
    saveDocumentEvidence: async () => { portalState.saved++; return { id: 'm1' }; },
  },
});
async function uploadForm(key = 'business_license') {
  const fd = new FormData(); fd.set('checklistKey', key); fd.set('file', file);
  const response = await upload.POST(new Request('https://example.com/api/supplier-portal/evidence', { method: 'POST', body: fd }));
  return response.status;
}
assert.equal(await uploadForm(), 200);
portalState.review = { ...doc, target_level: 2 };
assert.equal(await uploadForm(), 403, 'Supplier cannot upload visit evidence');
portalState.review = { ...doc, supplier_id: 's2' };
assert.equal(await uploadForm(), 403, 'Supplier cannot upload for a foreign supplier');
portalState.review = doc;
assert.equal(await uploadForm('shipping_proof'), 403, 'Supplier cannot submit delivery evidence');
assert.equal(portalState.saved, 1);

const fileAsset = { audience: 'internal', owner_type: 'verification', checklist_key: 'business_license',
  verification_id: 'v1', created_by: owner.id, storage_path: 'verifications/v1/test.pdf' };
const mediaStore = { getMediaByPath: async () => fileAsset, getUser: async () => owner, getVerification: async () => doc };
const media = load('../app/api/media/file/[...path]/route.ts', {
  'next/server': { NextResponse: Response },
  '@/lib/db': { getStore: () => mediaStore },
  '@/lib/auth/session': { getSession: async () => ({ uid: owner.id, role: 'supplier', email: owner.email }) },
  '@/lib/auth/permissions': { hasPermission: () => false },
  '@/lib/media/storage': { getObject: async () => ({ data: new Uint8Array([37, 80, 68, 70]) }) },
  '@/lib/supplier-portal/policy': policy,
});
const fileRequest = new Request('https://example.com/api/media/file/verifications/v1/test.pdf');
const fileParams = { params: Promise.resolve({ path: ['verifications', 'v1', 'test.pdf'] }) };
assert.equal((await media.GET(fileRequest, fileParams)).status, 200);
fileAsset.created_by = 'someone-else';
assert.equal((await media.GET(fileRequest, fileParams)).status, 403, 'Supplier cannot read other uploads');
fileAsset.created_by = owner.id;
fileAsset.verification_id = 'v2';
mediaStore.getVerification = async () => ({ ...doc, target_level: 2 });
assert.equal((await media.GET(fileRequest, fileParams)).status, 403, 'Supplier cannot read factory/delivery files');

const contactSupplierId = '12345678-1234-1234-1234-123456789abc';
const contactRequest = { supplier_id: contactSupplierId, target_level: 3, status: 'requested' };
let denyContact = true;
let contactWrites = 0;
const requestActions = load('../app/crm/verifications/request-actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/db': { getStore: () => ({
    listSupplierVerificationRequests: async () => [contactRequest],
    markSupplierVerificationContacted: async () => { contactWrites++; contactRequest.status = 'contacted'; return contactRequest; },
    addAuditLog: async (entry) => { assert.equal(entry.action, 'verification.request.contact.l3'); },
  }) },
  '@/lib/auth/session': { guard: async () => denyContact ? { ok: false, message: 'denied' } : null,
    getSession: async () => ({ uid: 'staff-1', email: 'staff@example.com', role: 'sourcing' }) },
});
const contactForm = new FormData(); contactForm.set('supplier_id', contactSupplierId); contactForm.set('target_level', '3');
assert.equal((await requestActions.markVerificationRequestContactedAction(contactForm)).ok, false);
assert.equal(contactWrites, 0, 'Supplier cannot mark own request contacted');
denyContact = false;
assert.equal((await requestActions.markVerificationRequestContactedAction(contactForm)).ok, true);
assert.equal(contactWrites, 1);
assert.equal(contactRequest.status, 'contacted');

const roles = load('../lib/auth/permissions.ts', {});
for (const perm of ['suppliers.manage', 'suppliers.publish', 'verifications.inspect', 'verifications.approve', 'media.manage', 'media.internal', 'rfq.view']) {
  assert.equal(roles.hasPermission('supplier', perm), false, `Supplier must not get ${perm}`);
}
const schema = fs.readFileSync(new URL('../supabase/migrations/20261017_supplier_self_registration.sql', import.meta.url), 'utf8');
assert.match(schema, /supplier_id uuid references public\.suppliers/);
assert.match(schema, /target_level in \(2,3\)/);
assert.match(schema, /supplier_verification_requests enable row level security/);
const crmlayout = fs.readFileSync(new URL('../app/crm/layout.tsx', import.meta.url), 'utf8');
assert.match(crmlayout, /session\.role === "supplier"/);
console.log('✅ Supplier self-registration: migration, email confirmation, rollback, draft mapping, L1-only evidence, requests and isolated role.');
