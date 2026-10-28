// Không cần Supabase/OpenAI: chạy server action duyệt L1 với store giả lập trong RAM.
// Mục tiêu: mọi lỗi CSDL/bên thứ ba đều trả về { ok: false, message } đọc được,
// không bao giờ ném lỗi (ném lỗi trong server action = HTTP 500 + mã React lạ trên production).
// Run: node scripts/check-verification-decision-resilience.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const l2Scope = {};
new Function('exports', ts.transpileModule(fs.readFileSync(new URL('../lib/l2-scope.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(l2Scope);

const source = ts.transpileModule(
  fs.readFileSync(new URL('../app/crm/suppliers/[slug]/verification-actions.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
).outputText;

const admin = { uid: '11111111-2222-4333-8444-555555555555', email: 'reviewer@example.com', role: 'admin' };
const baseReview = () => ({
  id: 'review-l1', supplier_id: 'sup-1', target_level: 1, status: 'submitted',
  inspector_id: '99999999-8888-4777-8666-555555555555',
  checklist: { business_license: true, food_safety: true, tax_certificate: true, bank_letter: true },
  checklist_notes: {}, tax_number: '0101234567', bank_account_number: '0123456789',
  return_reason: null, public_summary_i18n: {},
});

let review = baseReview();
let updateError = null;
let guardError = null;
let sessionError = null;
let mailError = null;
let revalidateError = null;
let supplierStatus = "published";
let supplierReadError = false;
let selfApprovedColumnMissing = false;
const updates = [];
const mails = [];
const auditLogs = [];
let staffMails = 0;

const store = {
  getVerification: async (id) => (id === review.id ? review : null),
  listVerifications: async (supplierId) => (supplierId === review.supplier_id ? [review] : []),
  listMedia: async () => [{ kind: 'document', storage_path: 'verifications/review-l1/bl.pdf', checklist_key: 'business_license' }],
  updateVerification: async (id, patch) => {
    if (updateError) throw updateError;
    if (selfApprovedColumnMissing && 'self_approved' in patch) {
      throw new Error("Could not find the 'self_approved' column of 'verifications' in the schema cache");
    }
    updates.push({ id, patch });
    review = { ...review, ...patch };
    return review;
  },
  addAuditLog: async (entry) => { auditLogs.push(entry); },
  getSupplier: async () => { if (supplierReadError) throw new Error('read failed'); return { id: 'sup-1', slug: 'ncc-a', status: supplierStatus }; },
  getUser: async () => ({ id: admin.uid, email: admin.email, name: 'Reviewer', role: 'admin', is_active: true }),
};

const mocks = {
  'next/cache': {
    revalidatePath: () => { if (revalidateError) throw revalidateError; },
  },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': {
    getSession: async () => { if (sessionError) throw sessionError; return admin; },
    guard: async () => { if (guardError) throw guardError; return null; },
  },
  '@/lib/verification': {
    auditHref: (id, level) => `/crm/suppliers/${id}/audit/${({ 1: 'documents', 2: 'factory', 3: 'deliveries' })[level]}`,
    auditItems: () => [],
    auditUploadKind: () => 'file',
    coreDocsVerified: () => true,
    requiredAuditItems: (level) => (level === 1
      ? [{ key: 'business_license' }, { key: 'food_safety' }, { key: 'tax_certificate' }]
      : [{ key: 'plant_photos' }]),
  },
  '@/lib/l2-scope': l2Scope,
  '@/lib/verification-policy': {
    canSelfApproveVerification: (role) => ['admin', 'reviewer'].includes(role),
  },
  '@/lib/crm/badges': { refreshCrmBadges: () => {} },
  '@/lib/verification-evidence': { hasDocumentAuditEvidence: () => true, hasDeliveryAuditEvidence: () => true },
  '@/lib/media/verification-access': { verificationMediaEditError: async () => null },
  '@/lib/supplier-portal/notify': {
    notifyStaffVerificationSubmission: async () => { staffMails++; return 'sent'; },
    notifySupplierDecision: async (input) => {
      if (mailError) throw mailError;
      mails.push(input);
      return 'sent';
    },
  },
  '@/lib/types': {},
};

const exported = {};
const run = new Function('exports', 'require', 'console', 'FormData', `${source}\n`);
run(exported, (name) => {
  assert.ok(name in mocks, `Unexpected import ${name}`);
  return mocks[name];
}, { error: () => {}, warn: () => {}, log: () => {} }, FormData);

const fd = (fields) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
};

/** Gọi action và biến lỗi ném ra thành dữ liệu, để khẳng định "không có lỗi ném ra". */
async function safe(call, what) {
  try {
    return await call();
  } catch (error) {
    assert.fail(`${what} ném lỗi ra ngoài (sẽ thành HTTP 500): ${error?.message ?? error}`);
  }
}

const approve = (id = review.id, confirmSelf = false) => safe(
  () => exported.approveVerificationAction(fd(confirmSelf ? { id, confirm_evidence_review: 'yes', confirm_self_review: 'yes' } : { id, confirm_evidence_review: 'yes' })),
  'duyệt bước kiểm',
);
const sendBack = (id = review.id, reason = 'Ảnh mờ, cần chụp lại giấy phép') =>
  safe(() => exported.returnVerificationAction(fd({ id, reason })), 'trả về bổ sung');
const submit = () => safe(
  () => exported.updateVerificationChecklistAction(fd({ id: review.id, status: 'submitted' })),
  'nộp bản kiểm',
);

function reset() {
  review = baseReview();
  admin.role = 'admin';
  updateError = null; guardError = null; sessionError = null; mailError = null; revalidateError = null;
  selfApprovedColumnMissing = false; supplierStatus = "published"; supplierReadError = false;
  updates.length = 0; mails.length = 0; auditLogs.length = 0; staffMails = 0;
}

/* 1. Đường thành công: lưu quyết định, gửi email, không ném lỗi. */
reset();
let result = await approve();
assert.equal(result.ok, true, 'duyệt hợp lệ phải thành công');
assert.match(result.message, /Đã duyệt L1; hồ sơ doanh nghiệp đang công khai/);
assert.equal(updates.length, 1);
assert.equal(updates[0].patch.status, 'approved');
assert.equal(updates[0].patch.approved_by, admin.uid, 'ghi đúng người duyệt cho quyết định độc lập');
assert.ok(updates[0].patch.approved_at, 'ghi thời điểm duyệt');
assert.equal(mails.length, 1);

/* Legacy, locked portal and read failures do not report a false publication. */
reset(); supplierStatus = 'draft'; result = await approve();
assert.equal(result.ok, true); assert.match(result.message, /hồ sơ chưa công khai/);
reset(); supplierReadError = true; result = await approve();
assert.equal(result.ok, true); assert.match(result.message, /chưa đọc lại được trạng thái/);
for (const [code, hint] of [['L1_AUTO_PUBLICATION_PORTAL_NOT_APPROVED', /mở quyền cổng/], ['L1_AUTO_PUBLICATION_PROFILE_INCOMPLETE', /hồ sơ cần đủ/], ['L1_AUTO_PUBLICATION_TEST_PROFILE', /demo hoặc thử nghiệm/]]) {
  reset(); updateError = new Error(code); result = await approve();
  assert.equal(result.ok, false); assert.match(result.message, hint); assert.equal(review.status, 'submitted');
}

/* 2. CSDL thiếu cột (hay gặp khi production chưa chạy migration): trả lỗi mềm + gợi ý. */
reset();
updateError = new Error("Could not find the 'approved_by' column of 'verifications' in the schema cache");
result = await approve();
assert.equal(result.ok, false);
assert.match(result.message, /Chưa lưu được quyết định duyệt/);
assert.match(result.message, /migration/, 'phải gợi ý chạy migration');
assert.equal(review.status, 'submitted', 'bản kiểm vẫn ở trạng thái chờ duyệt');

/* 3. UPDATE khớp 0 dòng (RLS chặn ghi): nói rõ khoá máy chủ không có quyền ghi. */
reset();
updateError = new Error('PGRST116: JSON object requested, multiple (or no) rows returned');
result = await approve();
assert.equal(result.ok, false);
assert.match(result.message, /RLS/);

/* 4. Ràng buộc tương thích CSDL: thông báo đúng hướng xử lý. */
reset();
updateError = new Error('new row for relation "verifications" violates check constraint "verifications_four_eyes"');
result = await approve();
assert.equal(result.ok, false);
assert.match(result.message, /người duyệt khác người kiểm/);

/* 4b. Khi schema cũ chưa cho trưởng kiểm duyệt tự duyệt thì hướng dẫn migration mới. */
reset();
admin.role = 'reviewer';
review.inspector_id = admin.uid;
updateError = new Error('Only an active admin can self-approve a verification');
result = await approve(review.id, true);
assert.equal(result.ok, false);
assert.match(result.message, /20261049_review_lead_and_sourcing_hold/);
assert.equal(review.status, 'submitted');

/* 5. Lỗi phiên đăng nhập trước khi ghi: vẫn là thông báo, không phải trang lỗi. */
reset();
sessionError = new Error('JWT expired');
guardError = new Error('session store unavailable');
result = await approve();
assert.equal(result.ok, false);
assert.match(result.message, /Chưa lưu được quyết định duyệt/);
assert.equal(updates.length, 0);

/* 6. Lỗi sau khi đã ghi (revalidate/email): quyết định vẫn tính là đã lưu. */
reset();
revalidateError = new Error('Invariant: static generation store missing');
mailError = new Error('SMTP 535 auth failed');
result = await approve();
assert.equal(result.ok, true, 'đã ghi CSDL thì không được báo thất bại');
assert.match(result.message, /Email NCC chưa gửi được/);

/* 7. Trả về bổ sung cũng không được ném lỗi. */
reset();
updateError = new Error('connection terminated unexpectedly');
result = await sendBack();
assert.equal(result.ok, false);
assert.match(result.message, /Chưa trả về được/);
reset();
result = await sendBack();
assert.equal(result.ok, true);
assert.equal(updates[0].patch.status, 'returned');
assert.equal(updates[0].patch.return_reason.length > 0, true);

/* 8. Chưa nộp: thông báo nghiệp vụ, không phải lỗi hệ thống. */
reset();
review.status = 'in_progress';
result = await approve();
assert.equal(result.ok, false);
assert.match(result.message, /Chỉ xét duyệt đợt đã nộp/);
assert.equal(updates.length, 0, 'không ghi gì khi chưa đủ điều kiện duyệt');

/* 9. Giấy tờ do NCC tự tải lên: inspector_id = null. Đợt này VẪN duyệt được,
   nhưng phải xác nhận tự đối chiếu; hồ sơ ghi self_approved thay vì giả vờ có
   hai người. Trước đây trường hợp này bị chặn vĩnh viễn. */
reset();
review.inspector_id = null;
result = await approve();
assert.equal(result.ok, false, 'chưa xác nhận thì chưa duyệt');
assert.match(result.message, /đối chiếu/);
assert.equal(updates.length, 0);
result = await approve(review.id, true);
assert.equal(result.ok, true, 'xác nhận rồi thì người duyệt duyệt được');
assert.equal(updates[0].patch.self_approved, true, 'hồ sơ ghi rõ một người vừa đối chiếu vừa duyệt');
assert.equal(updates[0].patch.approved_by, admin.uid);

/* 10. Review lead can complete the inspection after explicit confirmation. */
reset();
review.inspector_id = admin.uid;
admin.role = 'reviewer';
result = await approve();
assert.equal(result.ok, false, 'requires single-person confirmation');
result = await approve(review.id, true);
assert.equal(result.ok, true, 'review lead may self-approve after confirmation');
assert.equal(updates[0].patch.self_approved, true);
assert.equal(auditLogs[0].after.evidence_review_confirmed, true);

/* 10b. Admin can self-approve only after an explicit confirmation; the decision
   remains visibly marked as single-person instead of hiding who decided. */
reset();
review.inspector_id = admin.uid;
result = await approve();
assert.equal(result.ok, false, 'admin self-approval still requires confirmation');
assert.match(result.message, /xác nhận/);
assert.equal(updates.length, 0);
result = await approve(review.id, true);
assert.equal(result.ok, true, 'confirmed admin self-approval is allowed');
assert.equal(updates[0].patch.self_approved, true);
assert.equal(updates[0].patch.approved_by, admin.uid);
assert.equal(review.status, 'approved');
assert.equal(auditLogs[0].after.self_approved, true, 'audit log preserves the admin override');
assert.equal(auditLogs[0].after.inspector_id, admin.uid);
assert.equal(auditLogs[0].after.approved_by, admin.uid);

/* 10c. Review lead completes the whole inspection without waiting. */
reset();
admin.role = 'reviewer';
review.inspector_id = admin.uid;
result = await approve();
assert.equal(result.ok, false, 'reviewer also confirms the evidence re-check');
assert.match(result.message, /xác nhận/);
result = await approve(review.id, true);
assert.equal(result.ok, true, 'reviewer can inspect and approve in one workflow');
assert.equal(updates[0].patch.self_approved, true);
assert.equal(updates[0].patch.approved_by, admin.uid);
assert.equal(auditLogs[0].after.self_approved, true);

/* 11. Missing self_approved column fails closed: the audit migration is required. */
reset();
selfApprovedColumnMissing = true;
result = await approve(review.id, true);
assert.equal(result.ok, false);
assert.match(result.message, /migration/);
assert.equal(review.status, 'submitted');

/* 12. A self-sufficient inspector does not generate a redundant reviewer email. */
reset();
admin.role = 'reviewer';
review.status = 'in_progress';
result = await submit();
assert.equal(result.ok, true);
assert.match(result.message, /duyệt ngay/);
assert.equal(staffMails, 0, 'no reviewer wait/email for the single-person workflow');
reset();
admin.role = 'viewer';
review.status = 'in_progress';
result = await submit();
assert.equal(result.ok, true);
assert.equal(staffMails, 1, 'independent review still notifies the review queue');

reset();
console.log('✅ Duyệt/trả về bước kiểm tra luôn trả về thông báo, không ném lỗi 500.');
