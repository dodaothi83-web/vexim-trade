// node scripts/check-inline-audit-evidence.mjs — checklist media upload / required-policy regression.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/types.ts', import.meta.url), 'utf8');
const itemSection = source.slice(source.indexOf('export const L1_DOC_ITEMS = ['), source.indexOf('] as const;', source.indexOf('export const L1_DOC_ITEMS = [')));
assert.equal((itemSection.match(/required: true/g) || []).length, 1, 'Only the tax number is a recorded requirement');
assert.equal((itemSection.match(/required: false/g) || []).length, 6);
const actual = {};
vm.runInNewContext(ts.transpileModule(itemSection + '\n];', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: actual });
const L1_DOC_ITEMS = actual.L1_DOC_ITEMS;
assert.equal(L1_DOC_ITEMS.length, 7);
assert.equal(L1_DOC_ITEMS.find((item) => item.key === 'haccp_or_brc').required, false, 'Traders must not need HACCP to submit');
assert.equal(L1_DOC_ITEMS.find((item) => item.key === 'food_safety').required, false, 'Traders may not hold food-safety certificates either');
assert.equal(JSON.stringify(L1_DOC_ITEMS.filter((item) => item.core).map((item) => item.key)),
  JSON.stringify(['business_license']), 'Only business registration belongs to business verification');
assert.equal(L1_DOC_ITEMS.find((item) => item.key === 'tax_certificate').required, true, 'Tax number is still recorded');
const types = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: types });
const policy = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/verification.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: policy, require: (path) => path === './types' ? types : null });
assert.equal(policy.auditItems(1).map((item) => item.key).join(','), 'business_license,tax_certificate,bank_letter');
assert.equal(policy.auditUploadKind(1, 'business_license'), 'file');
for (const key of ['food_safety', 'haccp_or_brc', 'product_certs', 'export_license']) {
  assert.equal(policy.auditUploadKind(1, key), null, `${key} stays in the separate certificate flow`);
}
assert.equal(policy.requiredAuditItems(1).map((item) => item.key).join(','), 'tax_certificate');
assert.equal(policy.requiredAuditItems(2).length, 0);
assert.equal(policy.requiredAuditItems(3).length, 0);
for (const [level, key, expected] of [[2, 'factory_gate', 'image'], [2, 'pest_control', 'image'], [3, 'shipping_proof', 'file'], [3, 'delivery_proof', 'file'], [2, 'photos_taken', null], [2, 'documents_original', null], [3, 'order_matched', null], [3, 'factory_gate', null]]) {
  assert.equal(policy.auditUploadKind(level, key), expected, `Upload policy: ${level}/${key}`);
}
// Danh mục L2 của người kiểm phải là CHÍNH danh mục 9 ảnh của cổng NCC tự gửi.
assert.deepEqual(policy.auditItems(2).map((i) => i.key), types.L2_FACTORY_PHOTO_ITEMS.map((i) => i.key), 'Staff L2 checklist shares the supplier 9-photo standard');
assert.equal(policy.auditItems(2).length, 9);
assert.equal(types.LEGACY_L2_VISIT_ITEMS.length, 9, 'Legacy L2 catalog kept for historical rows');
assert.ok(!policy.auditItems(2).some((i) => types.LEGACY_L2_VISIT_KEYS.includes(i.key)), 'New checklist must not reuse legacy keys');

let level = 1;
let blocked = null;
let inserted = null;
let dbConstraint = false;
const verification = () => ({ id: 'ver-1', supplier_id: 'sup-1', target_level: level, status: 'in_progress' });
const store = {
  getVerification: async () => verification(),
  getSupplier: async () => ({ id: 'sup-1' }),
  getProduct: async () => null,
  createMedia: async (input) => {
    if (dbConstraint) throw new Error('createMedia: violates check constraint "media_checklist_key_ck"');
    inserted = input; return { ...input, id: 'media-1' };
  },
  addAuditLog: async () => {},
};
const mocks = {
  'next/server': { NextResponse: { json: (data, options = {}) => Response.json(data, { status: options.status || 200 }) } },
  'node:crypto': { randomUUID: () => 'media-1' },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { guard: async () => null, getSession: async () => ({ uid: 'admin-1', email: 'admin@test.local' }) },
  '@/lib/media/validate': { extensionFor: () => 'jpg', validateUpload: () => ({ ok: true, mime: 'image/jpeg' }) },
  '@/lib/media/storage': { putObject: async () => {}, deleteObject: async () => {} },
  '@/lib/media/verification-access': { verificationMediaEditError: async () => blocked },
  '@/lib/types': { L1_DOC_ITEMS },
  '@/lib/verification': { auditUploadKind: policy.auditUploadKind },
  '@/lib/certificate-service': {
    isL1CertificateKey: (k) => ['food_safety', 'haccp_or_brc', 'product_certs', 'export_license'].includes(k),
    defaultCertificateLabelForKey: () => 'Giấy chứng nhận',
    ingestCertificateScan: async () => ({}),
  },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/api/media/upload/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, require: (name) => { assert.ok(name in mocks, `Unknown import ${name}`); return mocks[name]; }, console: { error: () => {} }, File, Uint8Array, Number, Error }, { filename: 'upload-route.ts' });
function request(ownerType, key, kind = 'image') {
  const form = new FormData();
  form.set('ownerType', ownerType);
  form.set('ownerId', ownerType === 'supplier' ? 'sup-1' : 'ver-1');
  form.set('kind', kind);
  if (key) form.set('checklistKey', key);
  form.set('files', new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'scan.jpg', { type: 'image/jpeg' }));
  return new Request('https://test.local/api/media/upload', { method: 'POST', body: form });
}
assert.equal((await exports.POST(request('supplier', 'business_license'))).status, 400, 'Cannot bind supplier-library file to checklist');
assert.equal((await exports.POST(request('verification', 'invented'))).status, 400, 'Forged checklist key rejected');
for (const key of ['tax_certificate', 'bank_letter']) {
  assert.equal((await exports.POST(request('verification', key))).status, 400, `${key} only accepts numeric entry, not a new attachment`);
}
for (const key of ['food_safety', 'haccp_or_brc', 'product_certs', 'export_license']) {
  assert.equal((await exports.POST(request('verification', key))).status, 400, `${key} is kept out of business-review attachments`);
}
level = 2;
assert.equal((await exports.POST(request('verification', 'business_license'))).status, 400, 'Cannot bind factory file to legal checklist');
assert.equal((await exports.POST(request('verification', 'factory_gate'))).status, 200, 'Factory gate row accepts its own photo');
assert.equal(inserted.checklist_key, 'factory_gate');
assert.equal((await exports.POST(request('verification', 'factory_gate', 'document'))).status, 400, 'Photo row rejects PDF/document kind');
assert.equal((await exports.POST(request('verification', 'photos_taken'))).status, 400, 'Legacy L2 key is no longer an upload row');
level = 3;
assert.equal((await exports.POST(request('verification', 'shipping_proof'))).status, 200, 'Delivery evidence is scoped to shipping row');
assert.equal(inserted.checklist_key, 'shipping_proof');
assert.equal((await exports.POST(request('verification', 'factory_gate'))).status, 400, 'Factory photo key cannot be forged on delivery review');
dbConstraint = true;
const rejected = await exports.POST(request('verification', 'shipping_proof'));
assert.equal(rejected.status, 400);
assert.match((await rejected.json()).results[0].message, /20261017_factory_delivery_inline_evidence\.sql/, 'Missing migration must not show raw DB error');
dbConstraint = false;
level = 1;
blocked = 'Đã duyệt';
assert.equal((await exports.POST(request('verification', 'business_license'))).status, 403, 'Approved verification evidence locked');
blocked = null;
const ok = await exports.POST(request('verification', 'business_license'));
assert.equal(ok.status, 200);
assert.equal(inserted.owner_type, 'verification');
assert.equal(inserted.verification_id, 'ver-1');
assert.equal(inserted.supplier_id, 'sup-1');
assert.equal(inserted.audience, 'internal');
assert.equal(inserted.checklist_key, 'business_license');
inserted = null;
assert.equal((await exports.POST(request('verification', null))).status, 200);
assert.equal(inserted.checklist_key, undefined, 'Legacy/general uploads omit new column for compatibility');

const migration = readFileSync(new URL('../supabase/migrations/20261017_audit_checklist_evidence.sql', import.meta.url), 'utf8');
assert.match(migration, /add column if not exists checklist_key text/);
assert.match(migration, /owner_type = 'verification' and verification_id is not null/);
const extended = readFileSync(new URL('../supabase/migrations/20261017_factory_delivery_inline_evidence.sql', import.meta.url), 'utf8');
for (const key of ['business_license', 'photos_taken', 'documents_original', 'shipping_proof', 'delivery_proof']) assert.ok(extended.includes(`'${key}'`), `Migration retains or adds ${key}`);
assert.match(extended, /drop constraint if exists media_checklist_key_ck/);
const ui = readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/audit-form.tsx', import.meta.url), 'utf8');
assert.match(ui, /checklistKey/);
assert.match(ui, /assignVerificationEvidenceAction/);
assert.match(ui, /Bắt buộc đạt/);
assert.match(ui, /Không áp dụng/);
assert.match(ui, /deleteMediaAction/, 'Inline evidence must retain delete capability');
assert.match(ui, /addMediaLinkAction/, 'Old video links can still be added');
assert.match(ui, /scanDocuments\(createdIds\.slice\(0, 6\), true/, 'Upload triggers consented scan of new files');
assert.match(ui, /inputMode="numeric" pattern="\[0-9\]\*"/, 'Numeric-only input preserves leading zeroes');
const page = readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/page.tsx', import.meta.url), 'utf8');
assert.ok(!page.includes('<MediaManager'), 'All three audit steps must manage evidence inline');
for (const input of ['visit_date', 'visit_address', 'visit_lat', 'visit_lng', 'shipment_ref', 'shipped_on']) {
  assert.ok(ui.includes(`name="${input}"`), `${input} has an inline input`);
}
assert.match(ui, /auditUploadKind\(v\.target_level/, 'Photo and document rows use step-specific uploads');
const publicSupplier = readFileSync(new URL('../app/(public)/suppliers/[slug]/page.tsx', import.meta.url), 'utf8') +
  readFileSync(new URL('../components/public/supplier-storefront.tsx', import.meta.url), 'utf8');
assert.ok(!publicSupplier.includes('Food-safety / HACCP'), 'A verification badge must not claim every trader has HACCP');
assert.match(publicSupplier, /Issuer authentication is a separate check/, 'Explain issuer/holder scope to buyers');
const numbersSql = readFileSync(new URL('../supabase/migrations/20261017_document_numeric_identifiers.sql', import.meta.url), 'utf8');
for (const field of ['tax_number', 'bank_account_number']) assert.match(numbersSql, new RegExp(`add column if not exists ${field} text`));
console.log('✅ Three audit steps: inline scoped uploads, optional L2/L3 forms, evidence keys and migration guards.');
