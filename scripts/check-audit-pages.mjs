// node scripts/check-audit-pages.mjs — database-free workflow regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const text = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/verification-actions.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const evidenceJs = ts.transpileModule(fs.readFileSync(new URL('../lib/verification-evidence.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const evidence = {};
vm.runInNewContext(evidenceJs, { exports: evidence }, { filename: 'verification-evidence.ts' });
assert.equal(evidence.hasDocumentAuditEvidence([{ kind: 'video', storage_path: null }]), false);
assert.equal(evidence.hasDocumentAuditEvidence([{ kind: 'image', storage_path: 'verifications/review-1/license.jpg' }]), true);
assert.equal(evidence.hasDocumentAuditEvidence([{ kind: 'document', storage_path: 'verifications/review-1/license.pdf' }]), true);
assert.equal(evidence.hasDocumentAuditEvidence([{ kind: 'certificate', storage_path: 'verifications/review-1/cert.png' }]), true);
assert.equal(evidence.hasDocumentAuditEvidence([{ kind: 'image', storage_path: null }]), false);
const exports = {};
const auditor = { uid: 'reviewer-1', email: 'reviewer@example.com', role: 'admin' };
let requireSecondReviewer = false;
let lastAudit = null;
let lastMediaLookup = null;
let row = {
  id: 'review-3', supplier_id: 'supplier-1', target_level: 3, status: 'submitted', inspector_id: 'inspector-2',
  shipment_ref: 'SHIP-123', shipped_on: '2026-10-10',
  checklist: { order_matched: true, shipping_proof: true, delivery_proof: true }, checklist_notes: {},
};
const docKeys = ['business_license', 'tax_certificate', 'bank_letter', 'food_safety', 'haccp_or_brc', 'product_certs', 'export_license'];
const docItems = docKeys.map((key, i) => ({ key, required: i < 4 }));
const records = [
  { target_level: 1, status: 'approved' }, { target_level: 2, status: 'approved' }, row,
];
const media = [];
let mediaBlocked = null;
const store = {
  getVerification: async () => row,
  listVerifications: async () => records,
  listMedia: async (ownerType, ownerId) => { lastMediaLookup = [ownerType, ownerId]; return media; },
  getMedia: async (id) => media.find((m) => m.id === id),
  updateMedia: async (id, patch) => { const asset = media.find((m) => m.id === id); Object.assign(asset, patch); return asset; },
  updateVerification: async (_id, patch) => { Object.assign(row, patch); return row; },
  addAuditLog: async (entry) => { lastAudit = entry; },
  getSupplier: async () => ({ verification_level: 2 }),
};
const mocks = {
  'next/cache': { revalidatePath: () => {} },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': {
    guard: async (permission) => permission === 'verifications.approve' && auditor.role !== 'admin' ? { message: 'Bạn không có quyền xét duyệt' } : null,
    getSession: async () => auditor,
  },
  '@/lib/verification-policy': { requireSecondVerificationReviewer: () => requireSecondReviewer },
  '@/lib/verification-evidence': evidence,
  '@/lib/media/verification-access': { verificationMediaEditError: async () => mediaBlocked },
  '@/lib/types': { L1_DOC_ITEMS: docItems },
  '@/lib/verification': {
    auditHref: () => '/crm/suppliers/supplier-1/audit/deliveries',
    auditItems: (level) => level === 3 ? ['order_matched', 'shipping_proof', 'delivery_proof'].map((key) => ({ key })) : docItems,
    requiredAuditItems: (level) => level === 3 ? ['order_matched', 'shipping_proof', 'delivery_proof'].map((key) => ({ key })) : docItems.filter((item) => item.required),
    inVnBounds: (lat, lng) => lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110,
  },
};
vm.runInNewContext(js, { exports, require: (name) => { assert.ok(name in mocks, `Unknown import ${name}`); return mocks[name]; }, console, FormData, Date }, { filename: 'verification-actions.ts' });
const form = new FormData(); form.set('id', row.id);
assert.match((await exports.approveVerificationAction(form)).message, /chứng từ giao hàng/);
media.push({ kind: 'video', status: 'checked', storage_path: null });
assert.match((await exports.approveVerificationAction(form)).message, /chứng từ giao hàng/);
media.push({ kind: 'document', status: 'unverified', storage_path: 'verifications/review-3/bl.pdf' });
assert.match((await exports.approveVerificationAction(form)).message, /chứng từ giao hàng/);
media[1].status = 'checked';
auditor.uid = row.inspector_id;
requireSecondReviewer = true;
await assert.rejects(exports.approveVerificationAction(form), /không được tự duyệt/);
requireSecondReviewer = false;
auditor.role = 'sourcing';
await assert.rejects(exports.approveVerificationAction(form), /không có quyền xét duyệt/);
auditor.role = 'admin';
const approved = await exports.approveVerificationAction(form);
assert.equal(approved.ok, true);
assert.equal(row.status, 'approved');
assert.equal(row.inspector_id, row.approved_by, 'Self approval must retain both identities');
assert.equal(lastAudit.after.self_approved, true, 'Self approval must be explicit in audit log');
assert.equal(lastAudit.actor_id, auditor.uid);
await assert.rejects(exports.updateVerificationChecklistAction(form), /đã.*duyệt/);
Object.assign(row, { status: 'submitted', approved_by: null, approved_at: null });
auditor.uid = 'reviewer-1';
requireSecondReviewer = true;
const independentlyApproved = await exports.approveVerificationAction(form);
assert.equal(independentlyApproved.ok, true, 'Independent reviewer still works when policy is restored');
assert.equal(lastAudit.after.self_approved, false);
// An already uploaded scan selected under the "Ảnh" tab must count as L1 evidence.
// The supplier's general library must never be consulted as a fallback.
records.splice(0, 1); // remove earlier approved level-one fixture
Object.assign(row, {
  target_level: 1, status: 'submitted', approved_by: null,
  tax_number: '00123456789', bank_account_number: '0001234567',
  checklist: Object.fromEntries(docKeys.map((key) => [key, true])),
});
media.splice(0);
const missing = await exports.approveVerificationAction(form);
assert.equal(missing.ok, false, 'Supplier-wide documents must not satisfy an empty verification');
assert.deepEqual(lastMediaLookup, ['verification', row.id], 'No supplier-library fallback');
assert.match(missing.message, /kho chung NCC/);
media.push({ kind: 'video', storage_path: null, external_url: 'https://example.com' });
assert.equal((await exports.approveVerificationAction(form)).ok, false, 'A video link is not a legal document');
media.push({ id: 'photo-1', owner_type: 'verification', verification_id: row.id, supplier_id: row.supplier_id, kind: 'image', storage_path: 'verifications/review-3/license.jpg', status: 'unverified' });
mediaBlocked = 'Đợt kiểm đã được duyệt';
assert.equal((await exports.assignVerificationEvidenceAction('photo-1', 'business_license')).ok, false, 'Evidence mutations must respect audit permissions');
mediaBlocked = null;
media[1].supplier_id = 'other-supplier';
assert.equal((await exports.assignVerificationEvidenceAction('photo-1', 'business_license')).ok, false, 'Reject mismatched supplier ownership');
media[1].supplier_id = row.supplier_id;
assert.equal((await exports.assignVerificationEvidenceAction('photo-1', 'business_license')).ok, true);
assert.equal(media[1].checklist_key, 'business_license', 'File linked to an item without moving it');
assert.equal(lastAudit.before.checklist_key, null, 'Audit records old assignment even with mutable local store');
assert.equal(lastAudit.after.checklist_key, 'business_license');
assert.equal((await exports.assignVerificationEvidenceAction('photo-1', null)).ok, true);
assert.equal(media[1].checklist_key, null, 'Unassign does not delete file');
assert.equal(lastAudit.before.checklist_key, 'business_license');
assert.equal((await exports.assignVerificationEvidenceAction('photo-1', 'forged-key')).ok, false);
assert.equal((await exports.assignVerificationEvidenceAction('photo-1', 'tax_certificate')).ok, false, 'Number-only rows cannot accept new file assignments');
const documentApproved = await exports.approveVerificationAction(form);
assert.equal(documentApproved.ok, true, 'Photo of a document from this verification qualifies');
assert.equal(row.status, 'approved');
Object.assign(row, { status: 'in_progress', checklist: {}, checklist_notes: { tax_certificate: 'Ghi chú cũ cần giữ' }, approved_by: null });
const incomplete = new FormData(); incomplete.set('id', row.id); incomplete.set('status', 'submitted');
await assert.rejects(exports.updateVerificationChecklistAction(incomplete), /mục bắt buộc/);
for (const key of ['business_license', 'food_safety']) incomplete.set(`check:${key}`, 'yes');
incomplete.set('check:product_certs', 'not_applicable');
incomplete.set('tax_number', '0123456789');
incomplete.set('bank_account_number', '000987654321');
const submitted = await exports.updateVerificationChecklistAction(incomplete);
assert.equal(submitted.ok, true, 'Three checked documents plus two numeric identifiers allow submission');
assert.equal(row.tax_number, '0123456789', 'Leading zeroes must survive');
assert.equal(row.bank_account_number, '000987654321');
assert.equal(row.checklist.tax_certificate, true);
assert.equal(row.checklist.bank_letter, true);
assert.equal(row.checklist_notes.tax_certificate, 'Ghi chú cũ cần giữ', 'Number-only rows must not erase legacy notes');
assert.equal(row.checklist.haccp_or_brc, null, 'A trader can leave HACCP empty');
assert.equal(row.checklist.product_certs, 'not_applicable');
assert.equal(row.checklist.export_license, null);
const optionalApproved = await exports.approveVerificationAction(form);
assert.equal(optionalApproved.ok, true, 'Two document checks, two numbers and optional HACCP pass only after separate approval');
Object.assign(row, { status: 'in_progress', approved_by: null });
incomplete.set('check:haccp_or_brc', 'not_applicable');
assert.equal((await exports.updateVerificationChecklistAction(incomplete)).ok, true);
assert.equal(row.checklist.haccp_or_brc, 'not_applicable', 'Traders can explicitly mark factory certificate N/A');
assert.equal((await exports.approveVerificationAction(form)).ok, true, 'N/A must not block separate approval');
Object.assign(row, { status: 'in_progress', approved_by: null });
incomplete.set('check:food_safety', 'no');
assert.equal((await exports.updateVerificationChecklistAction(incomplete)).ok, true);
assert.equal((await exports.approveVerificationAction(form)).ok, false, 'Food safety remains required even with optional HACCP');
Object.assign(row, { status: 'in_progress', approved_by: null });
incomplete.set('tax_number', '12-34');
assert.match((await exports.updateVerificationChecklistAction(incomplete)).message, /chỉ được nhập chữ số/);
assert.equal(row.tax_number, '0123456789', 'Invalid identifier must not mutate saved review');
incomplete.set('tax_number', '');
assert.match((await exports.updateVerificationChecklistAction(incomplete)).message, /Hãy nhập mã số thuế/);
Object.assign(row, { status: 'submitted', tax_number: null });
assert.match((await exports.approveVerificationAction(form)).message, /Cần nhập mã số thuế/, 'Older submitted reviews must be returned to add number');
const selfApprovalSql = fs.readFileSync(new URL('../supabase/migrations/20261017_temporary_self_verification_approval.sql', import.meta.url), 'utf8');
assert.match(selfApprovalSql, /drop constraint if exists verifications_four_eyes/);
const formUi = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/audit-form.tsx', import.meta.url), 'utf8');
const pageUi = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/page.tsx', import.meta.url), 'utf8');
assert.match(formUi, /\(!requireSecondReviewer \|\| !selfReview\)/, 'Admin must see review buttons in temporary mode');
assert.match(formUi, /Bạn đang xác nhận bản kiểm của chính mình/, 'Self review must be visibly marked');
assert.match(pageUi, /!requireSecondReviewer \|\| current\.inspector_id !== session\.uid/, 'Evidence UI must use the same policy');
assert.match(pageUi, /defaultKind=\{step\.level === 2 \? "image" : "document"\}/, 'Document tab should be selected for legal evidence');
assert.match(formUi, /ok: result\.ok/, 'Expected validation failure must display on the audit page');
const sql = fs.readFileSync(new URL('../supabase/migrations/20261017_delivery_history_audit.sql', import.meta.url), 'utf8');
for (const field of ['shipment_ref', 'shipped_on', 'shipment_destination']) assert.ok(sql.includes(`add column if not exists ${field}`));
const accessJs = ts.transpileModule(fs.readFileSync(new URL('../lib/media/verification-access.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const access = {};
let permissionRole = 'sourcing';
vm.runInNewContext(accessJs, { exports: access, require: (name) => ({
  '@/lib/auth/session': { getSession: async () => ({ role: permissionRole, uid: 'reviewer-1' }) },
  '@/lib/auth/permissions': { hasPermission: (role, permission) => role === 'admin' || role === 'sourcing' && permission !== 'verifications.approve' },
  '@/lib/verification-policy': { requireSecondVerificationReviewer: () => requireSecondReviewer },
})[name] }, { filename: 'verification-access.ts' });
assert.equal(await access.verificationMediaEditError({ status: 'in_progress' }), null);
assert.match(await access.verificationMediaEditError({ status: 'submitted', inspector_id: 'inspector-2' }), /chờ duyệt/);
permissionRole = 'admin';
assert.equal(await access.verificationMediaEditError({ status: 'submitted', inspector_id: 'inspector-2' }), null);
assert.match(await access.verificationMediaEditError({ status: 'submitted', inspector_id: 'reviewer-1' }), /khác người kiểm/);
requireSecondReviewer = false;
assert.equal(await access.verificationMediaEditError({ status: 'submitted', inspector_id: 'reviewer-1' }), null);
assert.match(await access.verificationMediaEditError({ status: 'approved' }), /khóa/);
permissionRole = 'sale';
assert.match(await access.verificationMediaEditError({ status: 'in_progress' }), /không có quyền/);
const mediaRoute = fs.readFileSync(new URL('../app/api/media/upload/route.ts', import.meta.url), 'utf8');
assert.ok(mediaRoute.includes('verificationMediaEditError(v)'), 'Upload must check review status');
for (const action of ['addMediaLinkAction', 'updateMediaAction', 'deleteMediaAction']) {
  const src = fs.readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
  assert.ok(src.slice(src.indexOf(`export async function ${action}`), src.indexOf('export async function', src.indexOf(`export async function ${action}`) + 1) + 500).includes('verificationMediaEditError'), `${action} must restrict evidence changes`);
}
console.log('✅ Delivery evidence, temporary admin self-review, strict-mode rollback, media locks and migrations.');
