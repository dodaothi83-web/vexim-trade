// node scripts/check-supplier-self-registration.mjs — account-first signup, first company form and manual gate.
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
const categoryProposals = load('../lib/supplier-portal/category-proposals.ts', {});
const categories = [
  { id: 'c1', slug: 'cashew', parent_id: null, name_i18n: { vi: 'Hạt điều' }, status: 'published', is_published: true, sort_order: 1 },
  { id: 'c2', slug: 'rice', parent_id: null, name_i18n: { vi: 'Gạo' }, status: 'published', is_published: true, sort_order: 2 },
  { id: 'c3', slug: 'secret', parent_id: null, name_i18n: { vi: 'Nháp' }, status: 'draft', is_published: false, sort_order: 3 },
];
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

const state = { users: [{ email: 'admin@veximtrade.com', role: 'admin', is_active: true }], suppliers: [], reviews: [], requests: [], media: [], audit: [], authCalls: 0, lastRedirect: null, deletedAuth: 0, notify: 0, schemaMissing: false, failRequest: false, confirmed: false, failUser: false, failClaim: false };
const store = {
  mode: 'supabase',
  listUsers: async () => state.users,
  listCategories: async () => categories,
  getUser: async (id) => state.users.find((u) => u.id === id) ?? null,
  getUserByEmail: async (email) => state.users.find((u) => u.email === email) ?? null,
  listSupplierVerificationRequests: async (id) => state.requests.filter((r) => r.supplier_id === id),
  createSupplier: async (input) => { const r = { ...input, id: `s${state.suppliers.length + 1}` }; state.suppliers.push(r); return r; },
  createUser: async (input) => { if (state.failUser) throw Error('DB write failed'); const r = { ...input, id: `u${state.users.length}` }; state.users.push(r); return r; },
  claimSupplierForUser: async (userId, supplierId) => {
    const u = await store.getUser(userId);
    if (state.failClaim || !u || u.supplier_id) return false;
    u.supplier_id = supplierId; return true;
  },
  createVerification: async (input) => { const r = { ...input, id: `v${state.reviews.length + 1}` }; state.reviews.push(r); return r; },
  listVerifications: async (id) => state.reviews.filter((r) => r.supplier_id === id),
  listMedia: async (_type, id) => state.media.filter((m) => m.verification_id === id),
  updateVerification: async (id, patch) => Object.assign(state.reviews.find((r) => r.id === id), patch),
  getSupplier: async (id) => state.suppliers.find((r) => r.id === id) ?? null,
  updateSupplier: async (id, patch) => Object.assign(state.suppliers.find((r) => r.id === id), patch),
  createSupplierVerificationRequest: async (id, target_level) => {
    if (state.failRequest) throw Error('DB write failed');
    const r = { supplier_id: id, target_level, status: 'requested' }; state.requests.push(r); return r;
  },
  addAuditLog: async (entry) => { state.audit.push(entry); },
  deleteUser: async (id) => { state.users = state.users.filter((u) => u.id !== id); },
  deleteSupplier: async (id) => { state.suppliers = state.suppliers.filter((s) => s.id !== id); state.reviews = state.reviews.filter((r) => r.supplier_id !== id); state.requests = state.requests.filter((r) => r.supplier_id !== id); },
};
const auth = { auth: {
  signUp: async ({ options }) => { state.authCalls++; state.lastRedirect = options.emailRedirectTo; return { data: { user: { id: 'auth-1', identities: [{ id: 'identity' }], email_confirmed_at: state.confirmed ? 'now' : null }, session: state.confirmed ? {} : null }, error: null }; },
  admin: { deleteUser: async () => { state.deletedAuth++; } },
} };
const profileInput = load('../lib/supplier-portal/profile-input.ts', {});
const profileEvidence = load('../lib/supplier-portal/profile-evidence.ts', {
  '@/lib/supplier-portal/evidence': {
    MAX_INITIAL_FILES: 5, validateInitialDocument: async () => ({ bytes: new Uint8Array([1]), mime: 'application/pdf', kind: 'document' }),
    saveDocumentEvidence: async ({ review, key, createdBy }) => { const row = { id: `m${state.media.length}`, owner_type: 'verification', supplier_id: review.supplier_id, verification_id: review.id, audience: 'internal', checklist_key: key, created_by: createdBy, storage_path: `verifications/${review.id}/test.pdf` }; state.media.push(row); return row; },
  },
  '@/lib/supplier-portal/policy': { INITIAL_DOCUMENT_KEYS: keys },
  '@/lib/types': { L1_DOC_ITEMS: [{ key: 'business_license' }, { key: 'tax_certificate' }, { key: 'bank_letter' }] },
});
const mocks = {
  'next/server': { NextResponse: { json: (data, opts) => Response.json(data, opts) } },
  '@/lib/db': { getStore: () => store },
  '@/lib/db/supabase': { getSupabaseAuthClient: () => auth, getSupabaseClient: () => ({ from: () => ({ select: () => ({ limit: async () => ({ error: state.schemaMissing ? Error('missing') : null }) }) }) }) },
  '@/lib/auth/session': { getSession: async () => null },
  '@/lib/auth/password': { passwordProblem: (p) => p.length < 8 ? 'short' : null },
  '@/lib/rfq/rate-limit': { rateLimit: () => ({ ok: true }) },
  '@/lib/supplier-portal/profile-input': profileInput,
  '@/lib/supplier-portal/category-proposals': categoryProposals,
  '@/lib/supplier-portal/profile-evidence': profileEvidence,
  '@/lib/supplier-portal/notify': { notifySupplierRegistration: async (_supplier, requested) => { state.notify++; assert.equal(requested.length, 1); return 'sent'; } },
  '@/lib/site': { SITE_URL: 'https://example.com' },
};
const signupEnv = { SUPABASE_SERVICE_ROLE_KEY: 'mock', NODE_ENV: 'production' };
const { POST } = load('../app/api/supplier-signup/route.ts', mocks, { process: { env: signupEnv } });
const onboarding = load('../lib/supplier-portal/onboarding.ts', {});
const file = new File(['%PDF-1.7 TEST DOCUMENT'], 'license.pdf', { type: 'application/pdf' });
function form(email = 'owner@example.com') {
  const fd = new FormData();
  for (const [key, val] of Object.entries({ name: 'Example Trading Co', contact_name: 'Mr A', email, password: 'password123', phone: '0987654321', products: 'Cashew', supplier_type: 'trading', intro_source: 'Cashew processing and export', website: 'https://example.com', founded_year: '2012', employees: '42', capacity_per_month: '200 MT', ports: 'Hai Phong, Da Nang', consent: 'yes', information_accuracy: 'yes', tax_number: '0012345', bank_account_number: '000123', 'request:3': 'yes' })) fd.set(key, val);
  fd.append('requested_category_slugs', 'cashew');
  fd.set('doc:business_license', file);
  fd.set('status', 'published'); fd.set('verification_level', '3');
  return fd;
}
async function post(fd) {
  const response = await POST(new Request('https://example.com/api/supplier-signup', { method: 'POST', body: fd, headers: { 'x-forwarded-for': '203.0.113.1' } }));
  return { status: response.status, data: await response.json() };
}
function accountForm(email = 'owner@example.com') {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ name: 'Mr A', email, password: 'password123', consent: 'yes' })) fd.set(key, value);
  return fd;
}
for (const bad of ['http://localhost:3000/login', 'https://localhost:3000/login', 'https://localhost./login', 'https://127.0.0.2/login', 'https://[::1]/login', 'http://example.com/login', 'https://example.com/other', 'https://example.com/login?next=//evil.com']) {
  signupEnv.SUPPLIER_SIGNUP_REDIRECT_URL = bad;
  assert.equal((await post(accountForm())).status, 503, `Deployed signup must reject unsafe confirmation redirect: ${bad}`);
  assert.equal(state.authCalls, 0, 'Invalid redirect cannot send confirmation email or create Auth user');
}
signupEnv.SUPPLIER_SIGNUP_REDIRECT_URL = 'https://staging.example.com/login';
state.schemaMissing = true;
assert.equal((await post(accountForm())).status, 503);
assert.equal(state.authCalls, 0, 'Missing migration must not create Auth identity');
state.schemaMissing = false;
const weak = accountForm(); weak.set('password', '123');
assert.equal((await post(weak)).status, 400);
assert.equal(state.authCalls, 0);
state.confirmed = true;
assert.equal((await post(accountForm())).status, 503, 'Disabled email confirmation must fail closed');
assert.equal(state.deletedAuth, 1);
state.confirmed = false;
assert.equal((await post(accountForm())).status, 200);
assert.equal(state.lastRedirect, 'https://staging.example.com/login', 'Staging confirmation URL must be passed to Supabase explicitly');
delete signupEnv.SUPPLIER_SIGNUP_REDIRECT_URL;
assert.equal(state.users.at(-1).role, 'supplier');
assert.equal(state.users.at(-1).supplier_id, null, 'Signup creates only a login; first business form creates the page');
assert.equal(state.suppliers.length, 0);
assert.equal(state.reviews.length, 0);
assert.equal(state.notify, 0, 'Staff notified on completed business form, not empty account creation');
assert.equal((await post(accountForm())).status, 409, 'Duplicate email cannot claim another account');

const access = load('../lib/supplier-portal/access.ts', {
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { getSession: async () => ({ uid: 'u1', email: 'owner@example.com', role: 'supplier' }) },
  './policy': { ownsDocumentReview: () => false },
});
assert.equal((await access.supplierAccountAccess()).user.supplier_id, null);
assert.equal(await access.supplierPortalAccess(), null, 'Unlinked account cannot access supplier portal actions');
let accountEnabled = true;
const profile = load('../app/api/supplier-portal/profile/route.ts', {
  'next/server': { NextResponse: { json: (data, opts) => Response.json(data, opts) } },
  'next/cache': { revalidatePath() {} },
  '@/lib/supplier-portal/access': { supplierAccountAccess: async () => accountEnabled ? { user: state.users[1], store } : null },
  '@/lib/supplier-portal/onboarding': onboarding,
  '@/lib/supplier-portal/profile-input': profileInput,
  '@/lib/supplier-portal/category-proposals': categoryProposals,
  '@/lib/supplier-portal/profile-evidence': profileEvidence,
  '@/lib/supplier-portal/notify': mocks['@/lib/supplier-portal/notify'],
  '@/lib/ai/supplier-translation-service': {
    ensureSupplierProfileEnglish: async (storeArg, id) => {
      const s = await storeArg.getSupplier(id);
      if (s?.intro_source && !s.summary_i18n?.en) await storeArg.updateSupplier(id, { summary_i18n: { en: s.intro_source } });
      return { status: 'translated', supplier: s };
    },
  },
});
async function submitProfile(fd) {
  const response = await profile.POST(new Request('https://example.com/api/supplier-portal/profile', { method: 'POST', body: fd }));
  return { status: response.status, data: await response.json() };
}
accountEnabled = false;
assert.equal((await submitProfile(form())).status, 403, 'Only a signed-in supplier may create its first business page');
accountEnabled = true;
const forgedVisit = form(); forgedVisit.set('request:2', 'yes');
assert.equal((await submitProfile(forgedVisit)).status, 400, 'Trader cannot request a factory visit even by forging FormData');
const factoryForm = form(); factoryForm.set('supplier_type', 'manufacturer'); factoryForm.set('request:2', 'yes');
assert.equal(JSON.stringify(profileInput.parseSupplierProfile(factoryForm).requested), JSON.stringify([2, 3]), 'Factory may request both follow-ups');
const forgedCategory = form(); forgedCategory.set('requested_category_slugs', 'secret');
assert.equal((await submitProfile(forgedCategory)).status, 400, 'No unpublished category in first business form');
const missingAccuracy = form(); missingAccuracy.delete('information_accuracy');
assert.equal((await submitProfile(missingAccuracy)).status, 400, 'Profile requires the product information truthfulness confirmation');
assert.equal(state.suppliers.length, 0, 'Reject invalid profile before creating supplier page');
state.failClaim = true;
assert.equal((await submitProfile(form())).status, 409, 'Concurrent claim fails closed');
assert.equal(state.suppliers.length, 0, 'Unclaimed draft is cleaned up');
state.failClaim = false;
state.failRequest = true;
assert.equal((await submitProfile(form())).status, 503, 'Failed evidence leaves a private linked draft for retry');
assert.equal(state.suppliers.length, 1);
assert.equal(state.suppliers[0].onboarding_status, 'not_started');
assert.equal(state.users[1].supplier_id, 's1');
assert.equal(await access.supplierPortalAccess() !== null, true, 'Linked draft is available only to limited account access');
state.failRequest = false;
assert.equal((await submitProfile(form())).status, 200);
assert.equal(state.suppliers.length, 1, 'Retry never creates a second supplier page');
assert.equal(state.suppliers[0].status, 'draft');
assert.equal(state.suppliers[0].verification_level, 0, 'Forged publish/level fields ignored');
assert.equal(state.suppliers[0].onboarding_status, 'pending');
assert.equal(JSON.stringify(state.suppliers[0].requested_category_slugs), JSON.stringify(['cashew']));
assert.equal(state.suppliers[0].categories_reviewed_at ?? null, null);
assert.equal(state.suppliers[0].supplier_type, 'trading');
assert.equal(state.suppliers[0].intro_source, 'Cashew processing and export', 'Supplier story is stored as the original introduction');
assert.equal(state.suppliers[0].summary_i18n.en, 'Cashew processing and export', 'English introduction is derived from the supplier story');
assert.equal(state.suppliers[0].website, 'https://example.com');
assert.equal(state.suppliers[0].employees, 42);
assert.equal(JSON.stringify(state.suppliers[0].ports), JSON.stringify(['Hai Phong', 'Da Nang']));
assert.equal(state.reviews.length, 1);
assert.equal(state.reviews[0].status, 'in_progress');
assert.equal(state.reviews[0].checklist.business_license, null, 'Document upload never passes review');
assert.equal(state.requests.length, 1);
assert.equal(state.requests[0].target_level, 3);
assert.equal(state.media[0].audience, 'internal');
assert.equal(state.notify, 1, 'Notify staff after business profile submission');
assert.equal(onboarding.portalApproved(state.suppliers[0]), false);
assert.equal((await submitProfile(form())).status, 409, 'Pending profile cannot resubmit');
state.suppliers[0].onboarding_status = 'changes_requested';
const forgedCorrectionVisit = form(); forgedCorrectionVisit.set('request:2', 'yes');
assert.equal((await submitProfile(forgedCorrectionVisit)).status, 400);
const otherCategory = form(); otherCategory.delete('requested_category_slugs'); otherCategory.set('requested_category_other', 'Macca tách vỏ');
assert.equal((await submitProfile(otherCategory)).status, 400, 'Cannot open a free-text category');
assert.equal(state.suppliers[0].requested_category_other, null);
assert.equal((await submitProfile(form())).status, 200, 'Returned profile can reselect a Vexim category');
assert.equal(state.suppliers[0].onboarding_status, 'pending');
assert.equal(state.reviews.length, 1);
assert.equal(state.requests.length, 1);
store.mode = 'local';
assert.equal((await post(accountForm('other@example.com'))).status, 503, 'No local public signup');
assert.equal((await submitProfile(form())).status, 503, 'No local public business form');
store.mode = 'supabase';
state.failUser = true;
assert.equal((await post(accountForm('other@example.com'))).status, 503);
assert.equal(state.suppliers.length, 1, 'Failed account creation does not create a supplier');
assert.equal(state.deletedAuth, 2, 'Failed account creation cleans up unconfirmed Auth identity');
state.failUser = false;

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
const authLoginConfirmed = load('../lib/auth/authenticate.ts', {
  '@/lib/db': { getStore: () => ({ mode: 'supabase', getUserByEmail: async () => ({ ...owner, supplier_id: null }) }) },
  '@/lib/db/supabase': { getSupabaseAuthClient: () => ({ auth: { signInWithPassword: async () => ({ data: { user: { id: 'auth-1', email_confirmed_at: 'now' } }, error: null }) } }) },
  '@/lib/auth/password': { hashPassword: async () => 'hash', verifyPassword: async () => true },
});
assert.equal((await authLoginConfirmed.authenticate(owner.email, 'password123')).ok, true, 'Confirmed unlinked supplier can enter locked dashboard');

const portalState = { user: owner, review: doc, supplier: { id: 's1', onboarding_status: 'pending' }, saved: 0 };
const upload = load('../app/api/supplier-portal/evidence/route.ts', {
  'next/server': { NextResponse: { json: (data, opts) => Response.json(data, opts) } },
  'next/cache': { revalidatePath() {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => ({
    user: portalState.user, review: portalState.review, supplier: portalState.supplier,
    store: { getVerification: async () => portalState.review, addAuditLog: async () => null },
  }) },
  '@/lib/supplier-portal/policy': policy,
  '@/lib/supplier-portal/onboarding': onboarding,
  '@/lib/supplier-portal/evidence': { MAX_DOCUMENT_BYTES: 15 * 1024 * 1024,
    validateInitialDocument: async () => ({ bytes: new Uint8Array([1]), mime: 'application/pdf', kind: 'document' }),
    saveDocumentEvidence: async () => { portalState.saved++; return { id: 'm1' }; },
  },
  '@/lib/certificate-service': {
    isL1CertificateKey: (k) => ['food_safety', 'haccp_or_brc', 'product_certs', 'export_license'].includes(k),
    defaultCertificateLabelForKey: () => 'Giấy chứng nhận',
    ingestCertificateScan: async () => ({}),
  },
});
async function uploadForm(key = 'business_license') {
  const fd = new FormData(); fd.set('checklistKey', key); fd.set('file', file);
  const response = await upload.POST(new Request('https://example.com/api/supplier-portal/evidence', { method: 'POST', body: fd }));
  return response.status;
}
assert.equal(await uploadForm(), 403, 'Pending account cannot use upload API');
portalState.supplier.onboarding_status = 'approved';
assert.equal(await uploadForm(), 200);
portalState.review = { ...doc, target_level: 2 };
assert.equal(await uploadForm(), 403, 'Supplier cannot upload visit evidence');
portalState.review = { ...doc, supplier_id: 's2' };
assert.equal(await uploadForm(), 403, 'Supplier cannot upload for a foreign supplier');
portalState.review = doc;
assert.equal(await uploadForm('shipping_proof'), 403, 'Supplier cannot submit delivery evidence');
assert.equal(portalState.saved, 1);

const fileAsset = { audience: 'internal', supplier_id: 's1', owner_type: 'verification', checklist_key: 'business_license',
  verification_id: 'v1', created_by: owner.id, storage_path: 'verifications/v1/test.pdf' };
const mediaStore = { getMediaByPath: async () => fileAsset, getUser: async () => owner, getSupplier: async () => portalState.supplier, getVerification: async () => doc };
const media = load('../app/api/media/file/[...path]/route.ts', {
  'next/server': { NextResponse: Response },
  '@/lib/db': { getStore: () => mediaStore },
  '@/lib/auth/session': { getSession: async () => ({ uid: owner.id, role: 'supplier', email: owner.email }) },
  '@/lib/auth/permissions': { hasPermission: () => false },
  '@/lib/media/storage': { getObject: async () => ({ data: new Uint8Array([37, 80, 68, 70]) }) },
  '@/lib/supplier-portal/policy': policy,
  '@/lib/supplier-portal/onboarding': onboarding,
});
const fileRequest = new Request('https://example.com/api/media/file/verifications/v1/test.pdf');
const fileParams = { params: Promise.resolve({ path: ['verifications', 'v1', 'test.pdf'] }) };
portalState.supplier.onboarding_status = 'pending';
assert.equal((await media.GET(fileRequest, fileParams)).status, 403, 'Pending account cannot fetch file');
portalState.supplier.onboarding_status = 'approved';
assert.equal((await media.GET(fileRequest, fileParams)).status, 200);
fileAsset.created_by = 'someone-else';
assert.equal((await media.GET(fileRequest, fileParams)).status, 403, 'Supplier cannot read other uploads');
fileAsset.created_by = owner.id;
fileAsset.verification_id = 'v2';
mediaStore.getVerification = async () => ({ ...doc, target_level: 2 });
assert.equal((await media.GET(fileRequest, fileParams)).status, 403, 'Supplier cannot read factory/delivery files');

const staffSupplierId = '12345678-1234-1234-1234-123456789abc';
const staffSupplier = { ...state.suppliers[0], id: staffSupplierId };
let denyApproval = true;
const decisionMails = [];
const decisions = load('../app/crm/suppliers/[slug]/onboarding-actions.ts', {
  '@/lib/supplier-portal/notify': { notifySupplierDecision: async (input) => { decisionMails.push(input); return 'sent'; } },
  'next/cache': { revalidatePath() {} },
  '@/lib/db': { getStore: () => ({ getSupplier: async () => staffSupplier,
    getUserByEmail: async (email) => email === staffSupplier.email ? { ...owner, supplier_id: staffSupplierId } : null,
    getUserBySupplierId: async (supplierId) => supplierId === staffSupplierId ? { ...owner, supplier_id: staffSupplierId } : null,
    listVerifications: async () => state.reviews,
    updateSupplier: async (_id, patch) => Object.assign(staffSupplier, patch),
    addAuditLog: async (entry) => { state.audit.push(entry); },
  }) },
  '@/lib/auth/session': { guard: async () => denyApproval ? { message: 'denied' } : null,
    getSession: async () => ({ uid: 'staff-1', email: 'staff@example.com', role: 'sourcing' }) },
});
const approval = new FormData(); approval.set('supplier_id', staffSupplierId); approval.set('decision', 'approved');
assert.equal((await decisions.decideSupplierOnboardingAction(approval)).ok, false);
assert.equal(staffSupplier.onboarding_status, 'pending');
denyApproval = false;
const returnForm = new FormData(); returnForm.set('supplier_id', staffSupplierId);
returnForm.set('decision', 'changes_requested'); returnForm.set('note', 'Bổ sung địa chỉ cơ sở');
await decisions.decideSupplierOnboardingAction(returnForm);
assert.equal(staffSupplier.onboarding_status, 'changes_requested');
assert.equal(staffSupplier.onboarding_note, 'Bổ sung địa chỉ cơ sở');
assert.equal(decisionMails.at(-1).decision, 'onboarding_changes_requested');
assert.equal(onboarding.canSubmitProfile(staffSupplier), true);
assert.equal((await decisions.decideSupplierOnboardingAction(approval)).ok, false);
staffSupplier.onboarding_status = 'pending';
staffSupplier.tax_id = null;
assert.equal((await decisions.decideSupplierOnboardingAction(approval)).ok, false, 'Incomplete profile cannot be approved');
staffSupplier.tax_id = '0012345';
assert.equal((await decisions.decideSupplierOnboardingAction(approval)).ok, true);
assert.equal(onboarding.portalApproved(staffSupplier), true);
assert.equal(decisionMails.at(-1).decision, 'onboarding_approved');
assert.equal(staffSupplier.status, 'draft', 'Account approval cannot publish supplier');
assert.equal(state.reviews[0].status, 'in_progress', 'Account approval cannot approve document check');
assert.equal((await decisions.decideSupplierOnboardingAction(approval)).ok, false, 'No duplicate approval');
assert.equal(staffSupplier.requested_category_slugs[0], 'cashew', 'Chosen Vexim category is retained without a second staff category approval');
const staffDetail = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(staffDetail, /SupplierCategoryControls/, 'Duplicate supplier-category approval panel was removed');
const gateSchema = fs.readFileSync(new URL('../supabase/migrations/20261017_supplier_onboarding_gate.sql', import.meta.url), 'utf8');
assert.match(gateSchema, /onboarding_status = 'pending'/);
assert.doesNotMatch(gateSchema, /onboarding_status = 'approved'/);
const portalPage = fs.readFileSync(new URL('../app/supplier/portal/page.tsx', import.meta.url), 'utf8');
assert.ok(portalPage.indexOf('if (!portalApproved(supplier))') < portalPage.indexOf('store.listSupplierRfqInvitations'), 'Pending portal cannot load dashboard data');

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
console.log('✅ Supplier onboarding: account first, dashboard business form, email confirmation, staff gate, scoped evidence and permissions.');
