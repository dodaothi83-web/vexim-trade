// node scripts/check-inline-audit-evidence.mjs — checklist media upload / required-policy regression.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/types.ts', import.meta.url), 'utf8');
const itemSection = source.slice(source.indexOf('export const L1_DOC_ITEMS = ['), source.indexOf('] as const;', source.indexOf('export const L1_DOC_ITEMS = [')));
assert.equal((itemSection.match(/required: true/g) || []).length, 4);
assert.equal((itemSection.match(/required: false/g) || []).length, 3);
const actual = {};
vm.runInNewContext(ts.transpileModule(itemSection + '\n];', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: actual });
const L1_DOC_ITEMS = actual.L1_DOC_ITEMS;
assert.equal(L1_DOC_ITEMS.length, 7);
assert.equal(L1_DOC_ITEMS.find((item) => item.key === 'haccp_or_brc').required, false, 'Traders must not need HACCP to submit');
assert.equal(L1_DOC_ITEMS.find((item) => item.key === 'food_safety').required, true, 'Other document policy remains unchanged');

let level = 1;
let blocked = null;
let inserted = null;
const verification = () => ({ id: 'ver-1', supplier_id: 'sup-1', target_level: level, status: 'in_progress' });
const store = {
  getVerification: async () => verification(),
  getSupplier: async () => ({ id: 'sup-1' }),
  getProduct: async () => null,
  createMedia: async (input) => { inserted = input; return { ...input, id: 'media-1' }; },
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
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/api/media/upload/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, require: (name) => { assert.ok(name in mocks, `Unknown import ${name}`); return mocks[name]; }, console, File, Uint8Array, Number }, { filename: 'upload-route.ts' });
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
level = 2;
assert.equal((await exports.POST(request('verification', 'business_license'))).status, 400, 'Cannot bind factory file to legal checklist');
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
assert.match(page, /step\.level !== 1 && <div/, 'L1 must not render a second media card');
const publicSupplier = readFileSync(new URL('../app/(public)/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
assert.ok(!publicSupplier.includes('Food-safety / HACCP'), 'A verification badge must not claim every trader has HACCP');
assert.match(publicSupplier, /confirm the certificate holder/, 'Explain issuer/holder scope to buyers');
const numbersSql = readFileSync(new URL('../supabase/migrations/20261017_document_numeric_identifiers.sql', import.meta.url), 'utf8');
for (const field of ['tax_number', 'bank_account_number']) assert.match(numbersSql, new RegExp(`add column if not exists ${field} text`));
console.log('✅ Four required/three optional L1 items (HACCP optional), inline evidence and immediate optional AI scan.');
