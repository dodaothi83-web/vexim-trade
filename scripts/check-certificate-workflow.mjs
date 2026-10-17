// node scripts/check-certificate-workflow.mjs — private submission, manual two-step review/publication, product chips.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, { exports: mod.exports, module: mod, require: (id) => {
    if (id === 'server-only') return {};
    assert.ok(id in mocks, `${file}: unexpected ${id}`); return mocks[id];
  }, FormData, File, Request, Response, Headers, URL, Date, Uint8Array, console, process }, { filename: file });
  return mod.exports;
}
const sid = '12345678-1234-1234-1234-123456789abc';
const pid = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
const cid = 'aabbccdd-eeee-ffff-aaaa-bbbbbbbbbbbb';
const mid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const user = { id: 'supplier-user', role: 'supplier', email: 'supplier@example.com', is_active: true, supplier_id: sid };
const supplier = { id: sid, name: 'Cashew Factory', onboarding_status: 'approved', status: 'published' };
const products = [{ id: pid, name: 'Cashew W320', supplier_id: sid }];
let cert = null;
let media = null;
let role = 'supplier';
let stored = null;
const logs = [];
const store = {
  listProductsBySupplier: async (id) => id === sid ? products : [],
  listCertificates: async (id) => id === sid && cert ? [cert] : [],
  getCertificate: async (id) => id === cert?.id ? cert : null,
  getMedia: async (id) => id === media?.id ? media : null,
  getMediaByPath: async (path) => path === media?.storage_path ? media : null,
  getSupplier: async (id) => id === sid ? supplier : null,
  getUser: async (id) => id === user.id ? user : null,
  createMedia: async (input) => { media = { ...input, id: mid }; return media; },
  deleteMedia: async () => { media = null; },
  updateMedia: async (_id, patch) => { media = { ...media, ...patch }; return media; },
  createCertificate: async (input) => { cert = { ...input, id: cid }; return cert; },
  updateCertificate: async (_id, patch) => { cert = { ...cert, ...patch }; return cert; },
  addAuditLog: async (entry) => { logs.push(entry); },
};
const onboarding = load('../lib/supplier-portal/onboarding.ts');
const storage = { putObject: async (p) => { stored = p; }, deleteObject: async () => { stored = null; }, getObject: async (p) => stored === p ? { data: new Uint8Array([0xff, 0xd8, 0xff]) } : null };
const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])], 'certificate.jpg', { type: 'image/jpeg' });
const submit = load('../app/api/supplier-portal/certificates/route.ts', {
  'next/server': { NextResponse: { json: (v, opts) => Response.json(v, opts) } },
  'node:crypto': { randomUUID: () => cid },
  'next/cache': { revalidatePath() {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => role === 'supplier' ? { store, supplier, user } : null },
  '@/lib/supplier-portal/onboarding': onboarding,
  '@/lib/media/validate': { validateUpload: (kind, bytes) => kind === 'certificate' && bytes[0] === 0xff ? { ok: true, mime: 'image/jpeg' } : { ok: false, message: 'bad file' }, extensionFor: () => 'jpg' },
  '@/lib/media/storage': storage,
  '@/lib/supplier-portal/notify': { notifySupplierCertificateSubmission: async () => 'sent' },
});
const make = (product = pid) => {
  const fd = new FormData();
  for (const [key, val] of Object.entries({ name: 'ISO 22000', holder_name: 'Cashew Factory', issuer: 'Auditor', scope_text: 'Processing cashew', valid_until: '2099-02-01' })) fd.set(key, val);
  fd.set('product_ids', product); fd.set('file', file); return fd;
};
let res = await submit.POST(new Request('https://example.com/api/supplier-portal/certificates', { method: 'POST', body: make() }));
assert.equal(res.status, 200); assert.equal(cert.review_status, 'pending'); assert.equal(cert.publicly_visible, false);
assert.deepEqual([...cert.requested_product_ids], [pid]);
assert.equal(media.owner_type, 'supplier'); assert.equal(media.audience, 'internal'); assert.equal(media.status, 'unverified');
assert.ok(stored?.startsWith(`suppliers/${sid}/certificates/`)); assert.ok(logs.some((l) => l.action === 'supplier.certificate_submitted'));
const original = { ...cert }, originalMedia = { ...media };
const selection = load('../lib/public/product-selection.ts', { '@/lib/public/category-assignment': { assignProductCategory() {} } });
const projection = load('../lib/public/certificates.ts', {
  '@/lib/media/readiness': { isExpired: (m) => m.status === 'expired' || m.expires_on < '2026-10-17' },
  '@/lib/public/product-selection': selection,
});
const labels = (c = cert, m = media, product = pid) => projection.publicCertificateLabels(sid, product, [c], [m], '2026-10-17');
assert.equal(labels().length, 0, 'Upload alone never earns a certificate label');
assert.equal(labels({ ...cert, review_status: 'approved', publicly_visible: true }).length, 0, 'Unchecked file does not count');
assert.equal(labels({ ...cert, review_status: 'approved', publicly_visible: true, approved_product_ids: [pid] }).length, 0, 'Supplier upload is unverified');
role = 'admin';
const actions = load('../app/crm/suppliers/[slug]/certificates/actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { guard: async () => role === 'admin' ? null : { message: 'denied' }, getSession: async () => ({ uid: 'staff', email: 'staff@example.com', role }) },
  '@/lib/media/readiness': { isExpired: (m) => m.status === 'expired' || m.expires_on < '2026-10-17' },
  '@/lib/media/storage': storage,
});
const actionForm = (decision, product = pid) => { const fd = new FormData(); fd.set('certificate_id', cid); fd.set('decision', decision); fd.set('confirmed_review', 'yes'); if (product) fd.set('product_ids', product); return fd; };
role = 'supplier';
assert.equal((await actions.reviewCertificateAction(actionForm('approved'))).ok, false, 'Supplier may not approve');
role = 'admin';
const unchecked = actionForm('approved'); unchecked.delete('confirmed_review');
assert.equal((await actions.reviewCertificateAction(unchecked)).ok, false, 'No automatic approval without human review acknowledgement');
assert.equal((await actions.reviewCertificateAction(actionForm('approved', 'ffffffff-ffff-ffff-ffff-ffffffffffff'))).ok, false, 'No foreign product');
assert.equal((await actions.reviewCertificateAction(actionForm('approved', ''))).ok, false, 'Must scope to a product');
const beforeProof = stored; stored = null;
assert.equal((await actions.reviewCertificateAction(actionForm('approved'))).ok, false, 'Missing storage object must not pass review');
stored = beforeProof;
assert.equal((await actions.reviewCertificateAction(actionForm('approved'))).ok, true);
assert.equal(cert.review_status, 'approved'); assert.equal(cert.publicly_visible, false); assert.equal(media.status, 'checked');
assert.equal(labels().length, 0, 'Review alone is not publication');
const publish = new FormData(); publish.set('certificate_id', cid); publish.set('visible', 'yes');
role = 'supplier'; assert.equal((await actions.publishCertificateAction(publish)).ok, false);
role = 'admin'; assert.equal((await actions.publishCertificateAction(publish)).ok, true);
assert.equal(labels().length, 1); assert.equal(labels(cert, media, 'ffffffff-ffff-ffff-ffff-ffffffffffff').length, 0);
assert.match(labels({ ...cert, name: 'ISO sales@factory.example' })[0].name, /\[contact via Vexim\]/, 'Public label redacts contacts');
assert.equal(labels({ ...cert, valid_until: '2020-01-01' }).length, 0, 'Expired certificates drop from buyer view automatically');
assert.equal(labels(cert, { ...media, audience: 'buyer' }).length, 0, 'File audience must remain private');
assert.equal(labels(cert, { ...media, supplier_id: 'foreign' }).length, 0, 'Wrong supplier file fails closed');
assert.equal(labels({ ...cert, approved_product_ids: [] }).length, 0, 'Product scope is mandatory');
publish.set('visible', 'no'); assert.equal((await actions.publishCertificateAction(publish)).ok, true);
assert.equal(labels().length, 0, 'Withdrawal immediately hides the label');
assert.ok(logs.some((l) => l.action === 'certificate.approved')); assert.ok(logs.some((l) => l.action === 'certificate.published'));

role = 'supplier'; cert = original; media = originalMedia;
res = await submit.POST(new Request('https://example.com/api/supplier-portal/certificates', { method: 'POST', body: make('ffffffff-ffff-ffff-ffff-ffffffffffff') }));
assert.equal(res.status, 403, 'Supplier cannot attach foreign product');
res = await submit.POST(new Request('https://example.com/api/supplier-portal/certificates', { method: 'POST', body: make() }));
assert.equal(res.status, 200, 'Supplier can submit a fresh copy without mutating an earlier decision');
const publicRoute = load('../app/public-media/[...path]/route.ts', {
  'next/server': { NextResponse: Response },
  '@/lib/media/storage': storage,
  '@/lib/db': { getStore: () => store },
  '@/lib/media/readiness': { isExpired: () => false },
  '@/lib/public/product-selection': { productReviewApproved: () => true, isTestOnlyProduct: () => false },
});
const publicGet = (path) => publicRoute.GET(new Request(`https://example.com/public-media/${path}`), { params: Promise.resolve({ path: path.split('/') }) });
assert.equal((await publicGet(media.storage_path)).status, 404, 'Certificate scan is never a public product/supplier image');
const photo = { ...media, kind: 'image', storage_path: `suppliers/${sid}/${mid}.jpg` };
media = photo;
assert.equal((await publicGet(photo.storage_path)).status, 404, 'Internal supplier photo URL is not public just by guessing the path');
media = { ...photo, audience: 'buyer' }; stored = photo.storage_path;
assert.equal((await publicGet(photo.storage_path)).status, 200, 'Chosen buyer-shareable supplier photo is visible');

const privateRoute = load('../app/api/media/file/[...path]/route.ts', {
  'next/server': { NextResponse: Response },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { getSession: async () => ({ uid: user.id, email: user.email, role: 'supplier' }) },
  '@/lib/auth/permissions': { hasPermission: () => false },
  '@/lib/media/storage': storage,
  '@/lib/supplier-portal/policy': { ownsDocumentReview: () => false },
  '@/lib/supplier-portal/onboarding': onboarding,
});
media = originalMedia; stored = originalMedia.storage_path;
const privateGet = () => privateRoute.GET(new Request(`https://example.com/api/media/file/${media.storage_path}`),
  { params: Promise.resolve({ path: media.storage_path.split('/') }) });
assert.equal((await privateGet()).status, 200, 'Owner can inspect own internal certificate');
media = { ...media, supplier_id: 'other' };
assert.equal((await privateGet()).status, 403, "Supplier cannot read another supplier's internal certificate");
media = originalMedia;
const migration = fs.readFileSync(new URL('../supabase/migrations/20261017_certificate_publication_and_odm.sql', import.meta.url), 'utf8');
assert.match(migration, /review_status text not null default 'unreviewed'/, 'Legacy certificates stay private');
assert.match(migration, /publicly_visible boolean not null default false/, 'Publication defaults off');
assert.match(migration, /revoke all on public.certificates from anon, authenticated/, 'Raw certificate records must be server-only');
assert.match(migration, /revoke all on public.media_assets from anon, authenticated/, 'Private media metadata must be server-only');
assert.match(migration, /sp\.odm/, 'Public whitelist view includes ODM for eligible products');
const form = fs.readFileSync(new URL('../components/product-form.tsx', import.meta.url), 'utf8');
const sellerForm = fs.readFileSync(new URL('../app/supplier/portal/products/product-editor.tsx', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../lib/public/product-catalog.ts', import.meta.url), 'utf8');
const detail = fs.readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(form, /set\("odm", e\.target\.checked\)/); assert.match(sellerForm, /name="odm"/);
assert.match(catalog, /odm: !!p\.odm/); assert.match(detail, /ProductTradeLabels oem=\{p\.oem\}/);
assert.ok(!detail.includes('p.certifications'), 'Self-declared free-text certification is NOT a reviewed buyer badge');
console.log('✅ Certificate submission is private; manual review and separate publication are required. Scope/expiry/owner guard labels; OEM/ODM/samples are self-stated.');
