// node scripts/check-audit-pages.mjs — database-free workflow regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const text = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/verification-actions.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
const auditor = { uid: 'reviewer-1', email: 'reviewer@example.com', role: 'admin' };
let requireSecondReviewer = false;
let lastAudit = null;
let row = {
  id: 'review-3', supplier_id: 'supplier-1', target_level: 3, status: 'submitted', inspector_id: 'inspector-2',
  shipment_ref: 'SHIP-123', shipped_on: '2026-10-10',
  checklist: { order_matched: true, shipping_proof: true, delivery_proof: true }, checklist_notes: {},
};
const records = [
  { target_level: 1, status: 'approved' }, { target_level: 2, status: 'approved' }, row,
];
const media = [];
const store = {
  getVerification: async () => row,
  listVerifications: async () => records,
  listMedia: async () => media,
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
  '@/lib/verification': {
    auditHref: () => '/crm/suppliers/supplier-1/audit/deliveries',
    auditItems: (level) => level === 3 ? ['order_matched', 'shipping_proof', 'delivery_proof'].map((key) => ({ key })) : [],
    inVnBounds: (lat, lng) => lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110,
  },
};
vm.runInNewContext(js, { exports, require: (name) => { assert.ok(name in mocks, `Unknown import ${name}`); return mocks[name]; }, console, FormData, Date }, { filename: 'verification-actions.ts' });
const form = new FormData(); form.set('id', row.id);
await assert.rejects(exports.approveVerificationAction(form), /chứng từ giao hàng/);
media.push({ kind: 'video', status: 'checked', storage_path: null });
await assert.rejects(exports.approveVerificationAction(form), /chứng từ giao hàng/);
media.push({ kind: 'document', status: 'unverified', storage_path: 'verifications/review-3/bl.pdf' });
await assert.rejects(exports.approveVerificationAction(form), /chứng từ giao hàng/);
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
const selfApprovalSql = fs.readFileSync(new URL('../supabase/migrations/20261017_temporary_self_verification_approval.sql', import.meta.url), 'utf8');
assert.match(selfApprovalSql, /drop constraint if exists verifications_four_eyes/);
const formUi = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/audit-form.tsx', import.meta.url), 'utf8');
const pageUi = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/page.tsx', import.meta.url), 'utf8');
assert.match(formUi, /\(!requireSecondReviewer \|\| !selfReview\)/, 'Admin must see review buttons in temporary mode');
assert.match(formUi, /Bạn đang xác nhận bản kiểm của chính mình/, 'Self review must be visibly marked');
assert.match(pageUi, /!requireSecondReviewer \|\| current\.inspector_id !== session\.uid/, 'Evidence UI must use the same policy');
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
