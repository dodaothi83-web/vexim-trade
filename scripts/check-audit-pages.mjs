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
const auditor = { uid: 'reviewer-1', email: 'reviewer@example.com', role: 'reviewer' };
let requireSecondReviewer = true;
let lastAudit = null;
let lastMediaLookup = null;
let row = {
  id: 'review-3', supplier_id: 'supplier-1', target_level: 3, status: 'submitted', inspector_id: 'inspector-2',
  shipment_ref: 'SHIP-123', shipped_on: '2026-10-10',
  checklist: { order_matched: true, shipping_proof: true, delivery_proof: true }, checklist_notes: {},
};
const docKeys = ['business_license', 'tax_certificate', 'bank_letter', 'food_safety', 'haccp_or_brc', 'product_certs', 'export_license'];
const coreDocKeys = ['business_license', 'food_safety', 'haccp_or_brc'];
const docItems = docKeys.map((key) => ({ key, required: key === 'tax_certificate', core: coreDocKeys.includes(key) }));
const records = [
  { target_level: 1, status: 'approved' }, { target_level: 2, status: 'approved' }, row,
];
const media = [];
let mediaBlocked = null;
let dbFourEyes = false;
let dbFailure = null;
let mailThrows = false;
let revalidateThrows = false;
let dbChecklistConstraint = false;
const store = {
  getVerification: async () => row,
  listVerifications: async () => records,
  listMedia: async (ownerType, ownerId) => { lastMediaLookup = [ownerType, ownerId]; return media; },
  getMedia: async (id) => media.find((m) => m.id === id),
  updateMedia: async (id, patch) => {
    if (dbChecklistConstraint) throw new Error('updateMedia: violates check constraint "media_checklist_key_ck"');
    const asset = media.find((m) => m.id === id); Object.assign(asset, patch); return asset;
  },
  updateVerification: async (_id, patch) => {
    if (dbFailure) throw new Error(dbFailure);
    if (dbFourEyes && patch.status === 'approved' && patch.approved_by === row.inspector_id) {
      throw new Error('updateVerification: new row for relation "verifications" violates check constraint "verifications_four_eyes"');
    }
    Object.assign(row, patch); return row;
  },
  addAuditLog: async (entry) => { lastAudit = entry; },
  getSupplier: async () => ({ verification_level: 2 }),
};
const mocks = {
  'next/cache': { revalidatePath: () => { if (revalidateThrows) throw new Error('invariant: static generation store missing'); } },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': {
    guard: async (permission) => permission === 'verifications.approve' && !['admin', 'reviewer'].includes(auditor.role) ? { message: 'Bạn không có quyền xét duyệt' } : null,
    getSession: async () => auditor,
  },
  '@/lib/verification-policy': { requireSecondVerificationReviewer: () => requireSecondReviewer },
  '@/lib/supplier-portal/notify': {
    notifySupplierDecision: async () => { if (mailThrows) throw new Error('resend: socket hang up'); return 'sent'; },
    notifyStaffVerificationSubmission: async () => { if (mailThrows) throw new Error('resend: socket hang up'); return 'sent'; },
  },
  '@/lib/verification-evidence': evidence,
  '@/lib/media/verification-access': { verificationMediaEditError: async () => mediaBlocked },
  '@/lib/types': { L1_DOC_ITEMS: docItems },
  '@/lib/verification': {
    auditHref: () => '/crm/suppliers/supplier-1/audit/deliveries',
    auditItems: (level) => level === 3 ? ['order_matched', 'shipping_proof', 'delivery_proof'].map((key) => ({ key })) : level === 2 ? ['factory_gate', 'pest_control'].map((key) => ({ key })) : docItems,
    requiredAuditItems: (level) => level === 1 ? docItems.filter((item) => item.required) : [],
    coreDocsVerified: (checklist) => coreDocKeys.some((key) => checklist?.[key] === true),
    auditUploadKind: (level, key) => level === 1 ? (['business_license', 'food_safety', 'haccp_or_brc', 'product_certs', 'export_license'].includes(key) ? 'file' : null) : level === 2 ? (['factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area', 'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control'].includes(key) ? 'image' : null) : (['shipping_proof', 'delivery_proof'].includes(key) ? 'file' : null),
    inVnBounds: (lat, lng) => lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110,
  },
};
vm.runInNewContext(js, { exports, require: (name) => { assert.ok(name in mocks, `Unknown import ${name}`); return mocks[name]; }, console: { error: () => {}, warn: () => {}, log: () => {} }, FormData, Date, Error }, { filename: 'verification-actions.ts' });
const form = new FormData(); form.set('id', row.id);
assert.match((await exports.approveVerificationAction(form)).message, /chứng từ vận chuyển\/giao nhận/);
media.push({ kind: 'video', status: 'checked', storage_path: null });
assert.match((await exports.approveVerificationAction(form)).message, /chứng từ vận chuyển\/giao nhận/);
media.push({ kind: 'document', status: 'unverified', storage_path: 'verifications/review-3/bl.pdf' });
assert.match((await exports.approveVerificationAction(form)).message, /chứng từ vận chuyển\/giao nhận/);
media[1].status = 'checked';
auditor.uid = row.inspector_id;
const selfReview = await exports.approveVerificationAction(form);
assert.equal(selfReview.ok, false, 'Self review is refused without throwing');
assert.match(selfReview.message, /không được tự duyệt/);
auditor.uid = 'reviewer-1';
auditor.role = 'sourcing';
const noPermission = await exports.approveVerificationAction(form);
assert.equal(noPermission.ok, false, 'Missing permission is refused without throwing');
assert.match(noPermission.message, /không có quyền xét duyệt/);
auditor.role = 'reviewer';
records.splice(0, 2); // Delivery history has no factory or document prerequisite.
const approved = await exports.approveVerificationAction(form);
assert.equal(approved.ok, true);
assert.equal(row.status, 'approved');
assert.equal(records.length, 1);
assert.notEqual(row.inspector_id, row.approved_by, 'Independent approver must differ from inspector');
assert.equal(lastAudit.after.self_approved, false);
assert.equal(lastAudit.actor_id, auditor.uid);
// Lỗi phụ chạy sau khi CSDL đã ghi (email, revalidate) không được biến một lần
// duyệt đã lưu thành trang lỗi 500 ở production (React #441).
Object.assign(row, { status: 'submitted', approved_by: null, approved_at: null });
dbFailure = 'updateVerification: new row for relation "verifications" violates check constraint "verification_summary_publish_ck"';
const dbRejected = await exports.approveVerificationAction(form);
assert.equal(dbRejected.ok, false, 'A rejected write returns a message, never a thrown action');
assert.match(dbRejected.message, /Chưa lưu được quyết định duyệt/);
assert.equal(row.status, 'submitted', 'A rejected write leaves the review pending');
dbFailure = "updateVerification: Could not find the 'bank_account_number' column of 'verifications' in the schema cache";
const migrationMissing = await exports.approveVerificationAction(form);
assert.match(migrationMissing.message, /chạy migration/, 'Schema-cache failures tell staff to run the migration');
dbFailure = 'updateVerification: JSON object requested, multiple (or no) rows returned';
const writeBlocked = await exports.approveVerificationAction(form);
assert.match(writeBlocked.message, /RLS chặn ghi/, 'A zero-row update points at RLS instead of a React digest');
dbFailure = null;
mailThrows = true;
const mailWarned = await exports.approveVerificationAction(form);
assert.equal(mailWarned.ok, true, 'A mail failure cannot undo a saved approval');
assert.match(mailWarned.message, /Email NCC chưa gửi được/);
assert.equal(row.status, 'approved');
mailThrows = false;
Object.assign(row, { status: 'submitted', approved_by: null, approved_at: null });
revalidateThrows = true;
const revalidateWarned = await exports.approveVerificationAction(form);
assert.equal(revalidateWarned.ok, true, 'A revalidate failure cannot 500 an approval');
assert.equal(row.status, 'approved');
revalidateThrows = false;
Object.assign(row, { status: 'submitted', approved_by: null, approved_at: null });
const lockedEdit = await exports.updateVerificationChecklistAction(form);
assert.equal(lockedEdit.ok, false, 'Editing an approved review is refused without throwing');
assert.match(lockedEdit.message, /đã.*duyệt/);
Object.assign(row, { status: 'submitted', approved_by: null, approved_at: null });
// Optional data is never a submission/approval gate for factory or delivery.
Object.assign(row, { status: 'in_progress', approved_by: null, target_level: 3, checklist: {}, shipment_ref: null, shipped_on: null });
const emptyForm = new FormData(); emptyForm.set('id', row.id); emptyForm.set('status', 'submitted');
assert.equal((await exports.updateVerificationChecklistAction(emptyForm)).ok, true, 'Delivery can submit without filling every field');
media.splice(0, media.length, { kind: 'image', storage_path: 'verifications/review-3/unrelated.jpg' });
assert.equal((await exports.approveVerificationAction(form)).ok, false, 'Unrelated image cannot establish delivery history');
Object.assign(media[0], { id: 'shipping-photo', owner_type: 'verification', verification_id: row.id, supplier_id: row.supplier_id, checklist_key: null });
assert.equal((await exports.assignVerificationEvidenceAction('shipping-photo', 'factory_gate')).ok, false, 'Cannot attach factory key to delivery review');
dbChecklistConstraint = true;
const unmigrated = await exports.assignVerificationEvidenceAction('shipping-photo', 'shipping_proof');
assert.equal(unmigrated.ok, false);
assert.match(unmigrated.message, /20261017_factory_delivery_inline_evidence\.sql/, 'Missing migration must give actionable feedback');
assert.equal(media[0].checklist_key, null, 'Failed assignment must not mutate the file');
dbChecklistConstraint = false;
assert.equal((await exports.assignVerificationEvidenceAction('shipping-photo', 'shipping_proof')).ok, true, 'Old delivery image can be assigned to shipping row');
assert.equal((await exports.approveVerificationAction(form)).ok, true, 'Photo of linked shipping proof qualifies without mandatory fields');
Object.assign(row, { target_level: 2, status: 'in_progress', approved_by: null, checklist: {}, visit_date: null, visit_address: null, visit_lat: null, visit_lng: null });
assert.equal((await exports.updateVerificationChecklistAction(emptyForm)).ok, true, 'Factory can submit without GPS/date/9 checklist answers');
media.splice(0);
assert.equal((await exports.approveVerificationAction(form)).ok, false, 'Factory needs a scoped photo for approval');
media.push({ kind: 'image', storage_path: 'verifications/review-3/certificate.jpg', checklist_key: 'documents_original' });
assert.equal((await exports.approveVerificationAction(form)).ok, false, 'Photo of a certificate is not a facility photo');
Object.assign(media[0], { id: 'factory-photo', owner_type: 'verification', verification_id: row.id, supplier_id: row.supplier_id, checklist_key: null });
assert.equal((await exports.assignVerificationEvidenceAction('factory-photo', 'shipping_proof')).ok, false, 'Cannot attach delivery key to factory review');
assert.equal((await exports.assignVerificationEvidenceAction('factory-photo', 'factory_gate')).ok, true, 'Unassigned factory photo can be attached to the gate row without moving it');
assert.equal((await exports.assignVerificationEvidenceAction('factory-photo', 'photos_taken')).ok, false, 'Legacy L2 key no longer accepts new attachments');
assert.equal((await exports.approveVerificationAction(form)).ok, true, 'Facility photo qualifies without all checklist answers');
// An already uploaded scan selected under the "Ảnh" tab must count as L1 evidence.
// The supplier's general library must never be consulted as a fallback.
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
// Nộp duyệt chỉ cần mã số thuế đã ghi; giấy xác minh chính do người kiểm ghi khi đối chiếu.
assert.equal((await exports.updateVerificationChecklistAction(incomplete)).ok, true, 'Submission does not need every document row');
assert.equal((await exports.approveVerificationAction(form)).ok, false, 'Approval needs one core document marked pass');
Object.assign(row, { status: 'in_progress', approved_by: null });
incomplete.set('check:business_license', 'yes');
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
assert.equal(row.checklist.food_safety, null, 'A trader can leave food-safety certificate empty');
assert.equal(row.checklist.product_certs, 'not_applicable');
assert.equal(row.checklist.export_license, null);
const optionalApproved = await exports.approveVerificationAction(form);
assert.equal(optionalApproved.ok, true, 'Business registration, two numbers and optional certificates pass only after separate approval');
Object.assign(row, { status: 'in_progress', approved_by: null });
incomplete.set('check:haccp_or_brc', 'not_applicable');
incomplete.set('check:food_safety', 'not_applicable');
assert.equal((await exports.updateVerificationChecklistAction(incomplete)).ok, true);
assert.equal(row.checklist.haccp_or_brc, 'not_applicable', 'Traders can explicitly mark HACCP N/A');
assert.equal(row.checklist.food_safety, 'not_applicable', 'Traders can explicitly mark food-safety certificate N/A');
assert.equal((await exports.approveVerificationAction(form)).ok, true, 'N/A on both certificates must not block separate approval');
Object.assign(row, { status: 'in_progress', approved_by: null });
incomplete.set('check:food_safety', 'no');
assert.equal((await exports.updateVerificationChecklistAction(incomplete)).ok, true);
assert.equal((await exports.approveVerificationAction(form)).ok, true, 'Optional failure is recorded but does not certify that document or block the company review');
Object.assign(row, { status: 'in_progress', approved_by: null });
incomplete.set('check:business_license', 'no');
assert.equal((await exports.updateVerificationChecklistAction(incomplete)).ok, true);
assert.equal((await exports.approveVerificationAction(form)).ok, false, 'A failed business registration cannot be approved');
// Một trong ba giấy xác minh chính là đủ: nhà máy chỉ có HACCP vẫn duyệt được bước giấy tờ.
Object.assign(row, { status: 'in_progress', approved_by: null });
incomplete.delete('check:business_license');
incomplete.set('check:haccp_or_brc', 'yes');
assert.equal((await exports.updateVerificationChecklistAction(incomplete)).ok, true, 'HACCP alone can be submitted');
assert.equal((await exports.approveVerificationAction(form)).ok, true, 'One of the three core documents is enough');
incomplete.set('check:business_license', 'yes');
Object.assign(row, { status: 'in_progress', approved_by: null });
incomplete.set('tax_number', '12-34');
assert.match((await exports.updateVerificationChecklistAction(incomplete)).message, /chỉ được nhập chữ số/);
assert.equal(row.tax_number, '0123456789', 'Invalid identifier must not mutate saved review');
incomplete.set('tax_number', '');
assert.match((await exports.updateVerificationChecklistAction(incomplete)).message, /Hãy nhập mã số thuế/);
Object.assign(row, { status: 'submitted', tax_number: null });
assert.match((await exports.approveVerificationAction(form)).message, /Cần nhập mã số thuế/, 'Older submitted reviews must be returned to add number');
// Buyer-facing summaries require a separate human decision after the review is approved.
Object.assign(row, { status: 'submitted', target_level: 3 });
const summaryForm = new FormData(); summaryForm.set('id', row.id); summaryForm.set('mode', 'publish'); summaryForm.set('summary', 'One shipment record reviewed.'); summaryForm.set('confirmed', 'yes');
assert.equal((await exports.updateVerificationPublicSummaryAction(summaryForm)).ok, false, 'No publication while review is submitted');
row.status = 'approved';
auditor.role = 'sourcing';
assert.match((await exports.updateVerificationPublicSummaryAction(summaryForm)).message, /không có quyền xét duyệt/, 'Only a reviewer can publish');
auditor.role = 'admin';
summaryForm.delete('confirmed');
assert.equal((await exports.updateVerificationPublicSummaryAction(summaryForm)).ok, false, 'Separate manual confirmation is required');
summaryForm.set('confirmed', 'yes'); summaryForm.set('summary', 'Call +84912345678');
assert.equal((await exports.updateVerificationPublicSummaryAction(summaryForm)).ok, false, 'Block obvious contact leakage');
summaryForm.set('summary', 'One delivery record reviewed; this is not all export history.');
assert.equal((await exports.updateVerificationPublicSummaryAction(summaryForm)).ok, true);
assert.ok(row.public_summary_published_at);
assert.equal(row.public_summary_i18n.en, summaryForm.get('summary'));
assert.match(lastAudit.action, /summary.publish/);
summaryForm.set('mode', 'draft'); summaryForm.set('summary', 'New private draft');
assert.equal((await exports.updateVerificationPublicSummaryAction(summaryForm)).ok, true);
assert.equal(row.public_summary_published_at, null, 'Editing a published summary hides it until approved again');
summaryForm.set('mode', 'publish'); summaryForm.set('summary', 'New vetted summary');
await exports.updateVerificationPublicSummaryAction(summaryForm);
summaryForm.set('mode', 'hide');
assert.equal((await exports.updateVerificationPublicSummaryAction(summaryForm)).ok, true);
assert.equal(row.public_summary_published_at, null, 'Reviewer can withdraw a public summary');
const separationSql = fs.readFileSync(new URL('../supabase/migrations/20261018_review_lead_role.sql', import.meta.url), 'utf8');
assert.match(separationSql, /add constraint verifications_four_eyes/);
const formUi = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/audit-form.tsx', import.meta.url), 'utf8');
const pageUi = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/page.tsx', import.meta.url), 'utf8');
assert.match(formUi, /!requireSecondReviewer \|\| !selfReview/, 'Review button requires another inspector');
assert.match(formUi, /canInspect &&/, 'Reviewer cannot edit evidence');
assert.ok(!pageUi.includes('<MediaManager'), 'All audit steps render evidence inline');
assert.ok(!pageUi.includes('unlocked') && !pageUi.includes('LockKeyhole'), 'Every review page is reachable independently');
const panelUi = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/verification-panel.tsx', import.meta.url), 'utf8');
assert.ok(!panelUi.includes('approvedLevel'), 'Review panel does not infer previous checks from a highest level');
const approvalSource = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/verification-actions.ts', import.meta.url), 'utf8');
assert.ok(!approvalSource.includes('target_level - 1'), 'Delivery approval has no factory prerequisite');
// Email + revalidate chạy sau khi đã ghi CSDL: phải đi qua softEffect, không được
// await trần (await trần = throw = HTTP 500/React #441 dù quyết định đã lưu).
assert.ok(!/await (notifySupplierDecision|notifyStaffVerificationSubmission)\(/.test(approvalSource),
  'Reviewer mail must never be awaited bare');
assert.ok(!/^\s*refreshAudit\(/m.test(approvalSource), 'Revalidation must never be awaited bare');
assert.match(approvalSource, /softEffect\("email duyệt gửi NCC"/);
// guard() cũng có thể lỗi (phiên hỏng, CSDL đọc không được) nên phải nằm TRONG try,
// nếu không thì một lần duyệt vẫn trả về 500 dù mọi phần khác đã "mềm".
const bareGuard = 'if (gate) return { ok: false, message: gate.message ?? "Tài khoản của bạn không có quyền thực hiện thao tác này." };\n  let committed = false;';
assert.ok(!approvalSource.includes(bareGuard), 'Approve/return guard must run inside try');
assert.equal(approvalSource.split('let committed = false;\n  try {').length - 1, 3,
  'Checklist, approve and return all wrap their whole body');
const certificateSource = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/certificate-actions.ts', import.meta.url), 'utf8');
assert.match(certificateSource, /Chưa quét lại được chứng nhận/, 'Certificate rescan reports failures as a message');
assert.match(certificateSource, /Chưa đổi được trạng thái hiển thị/, 'Certificate visibility reports failures as a message');
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
  '@/lib/supplier-portal/notify': { notifySupplierDecision: async () => 'sent', notifyStaffVerificationSubmission: async () => 'sent' },
})[name] }, { filename: 'verification-access.ts' });
assert.equal(await access.verificationMediaEditError({ status: 'in_progress' }), null);
assert.match(await access.verificationMediaEditError({ status: 'submitted', inspector_id: 'inspector-2' }), /chờ duyệt/);
permissionRole = 'admin';
assert.match(await access.verificationMediaEditError({ status: 'submitted', inspector_id: 'inspector-2' }), /trả về/);
assert.match(await access.verificationMediaEditError({ status: 'submitted', inspector_id: 'reviewer-1' }), /trả về/);
assert.match(await access.verificationMediaEditError({ status: 'submitted', inspector_id: 'reviewer-1' }), /trả về/);
assert.match(await access.verificationMediaEditError({ status: 'approved' }), /khóa/);
permissionRole = 'sale';
assert.match(await access.verificationMediaEditError({ status: 'in_progress' }), /không có quyền/);
const mediaRoute = fs.readFileSync(new URL('../app/api/media/upload/route.ts', import.meta.url), 'utf8');
assert.ok(mediaRoute.includes('verificationMediaEditError(v)'), 'Upload must check review status');
for (const action of ['addMediaLinkAction', 'updateMediaAction', 'deleteMediaAction']) {
  const src = fs.readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
  assert.ok(src.slice(src.indexOf(`export async function ${action}`), src.indexOf('export async function', src.indexOf(`export async function ${action}`) + 1) + 500).includes('verificationMediaEditError'), `${action} must restrict evidence changes`);
}
console.log('✅ Delivery evidence, independent reviewer approval, media locks and migrations.');
