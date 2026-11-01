// node scripts/check-supplier-verification-progress.mjs
// Dải tiến độ xác minh trên trang tổng quan và “Trang của tôi” phải nói đúng dữ liệu:
// không tự cấp huy hiệu khi mới tải tệp, không lộ dữ liệu NCC khác, mỗi bước một trạng thái.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, {
    module: mod, exports: mod.exports, process, console, Date, Map, Set, Object,
    require: (key) => {
      if (key === 'server-only') return {};
      assert.ok(key in mocks, `Unexpected ${key} in ${path}`);
      return mocks[key];
    },
  }, { filename: path });
  return mod.exports;
}

const types = load('../lib/types.ts');
const policy = load('../lib/supplier-portal/policy.ts', {
  '@/lib/types': types,
  '@/lib/verification': { auditUploadKind: () => null },
});
const scope = load('../lib/l2-scope.ts');
const { buildVerificationProgress } = load('../lib/supplier-portal/verification-progress.ts', {
  '@/lib/types': types,
  '@/lib/l2-scope': scope,
  './policy': policy,
});

const supplierId = 'sup-1';
const empty = { supplierId, supplierType: 'manufacturer', reviews: [], submissions: [], requests: [], documents: [] };
const review = (over = {}) => ({
  id: 'v1', supplier_id: supplierId, target_level: 1, status: 'in_progress', return_reason: null,
  created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z', ...over,
});
const submission = (over = {}) => ({
  id: 'sub-2', supplier_id: supplierId, target_level: 2, status: 'draft', review_note: null,
  created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z', ...over,
});
const item = (submissionId, key) => ({ submission_id: submissionId, checklist_key: key, media_id: 'm-1', storage_path: 'p-1' });
const doc = (key, createdBy = 'usr-1') => ({ storage_path: 'p-1', checklist_key: key, created_by: createdBy });

// 1. Chưa có dữ liệu: cả ba bước “chưa bắt đầu”, bước tiếp theo là giấy tờ.
const none = buildVerificationProgress(empty);
assert.equal(none.approvedCount, 0);
assert.equal(none.currentLevel, 1);
assert.equal(none.percent, 0);
assert.equal(none.steps.map((s) => s.state).join(','), 'not_started,not_started,not_started');
assert.match(none.headline, /Bước tiếp theo: Kiểm tra giấy tờ/);
assert.equal(none.steps[0].href, '/supplier/portal/documents');
assert.equal(none.steps[1].href, '/supplier/portal/verification/factory', 'L2 có trang riêng');
assert.equal(none.steps[2].href, '/supplier/portal/verification/export', 'L3 có trang riêng');

// 2. L1 được trả hồ sơ: NCC thấy đúng lý do và màu cảnh báo, không phải “chờ duyệt”.
const returned = buildVerificationProgress({ ...empty, reviews: [review({ status: 'returned', return_reason: 'Ảnh giấy phép bị mờ' })] });
assert.equal(returned.steps[0].state, 'action');
assert.equal(returned.steps[0].tone, 'rose');
assert.match(returned.steps[0].note, /Ảnh giấy phép bị mờ/);
assert.equal(returned.steps[0].status, 'Cần bổ sung');
assert.match(returned.headline, /đang chờ bạn xử lý/);

// 3. L1 đã duyệt: phần trăm và bước hiện tại chuyển sang L2.
const l1Done = buildVerificationProgress({ ...empty, reviews: [review({ status: 'approved' })] });
assert.equal(l1Done.steps[0].state, 'approved');
assert.equal(l1Done.approvedCount, 1);
assert.equal(l1Done.percent, 33);
assert.equal(l1Done.currentLevel, 2);
assert.equal(l1Done.steps[0].statusEn, 'Approved');
assert.equal(l1Done.steps[0].metric, 'Hồ sơ đã được duyệt', 'Bước đã duyệt không hiện “Chưa có giấy tờ”');
const l1Dated = buildVerificationProgress({ ...empty, reviews: [review({ status: 'approved', approved_at: '2026-10-21T03:00:00Z' })] });
assert.equal(l1Dated.steps[0].metric, 'Duyệt ngày 21/10/2026');

// 4. Hồ sơ tự gửi L2 đang chờ xét: không phải huy hiệu, nhưng đúng trạng thái chờ.
const photos = types.L2_FACTORY_PHOTO_ITEMS.map((photo) => item('sub-2', photo.key));
const l2Pending = buildVerificationProgress({
  ...empty,
  submissions: [submission({ status: 'pending_review' })],
  submissionItems: { 'sub-2': photos },
});
assert.equal(l2Pending.steps[1].state, 'reviewing');
assert.equal(l2Pending.steps[1].status, 'Chờ duyệt');
assert.equal(l2Pending.steps[1].metric, 'Đã tải 9/9 ảnh');
assert.equal(l2Pending.steps[1].statusEn, 'Under review');
assert.equal(l2Pending.approvedCount, 0, 'Nộp đủ ảnh không tự thành huy hiệu');
assert.equal(l2Pending.currentLevel, 1, 'Bước 1 còn trống nên vẫn là bước cần làm trước');
assert.match(l2Pending.headline, /Bước tiếp theo: Kiểm tra giấy tờ/);

// 5. Một chứng từ L3 đủ để nộp; chưa phải được duyệt.
const l3Draft = buildVerificationProgress({
  ...empty,
  submissions: [submission({ id: 'sub-3', target_level: 3 })],
  submissionItems: { 'sub-3': [item('sub-3', 'bill_of_lading')] },
});
assert.equal(l3Draft.steps[2].state, 'action');
assert.equal(l3Draft.steps[2].metric, 'Đã tải 1 loại chứng từ');
assert.match(l3Draft.steps[2].note, /nộp cho nhân viên kiểm tra/);
assert.equal(l3Draft.approvedCount, 0);
const l3Empty = buildVerificationProgress({ ...empty, submissions: [submission({ id: 'sub-3', target_level: 3 })] });
assert.match(l3Empty.steps[2].note, /ít nhất một chứng từ/);

// 6. Yêu cầu kiểm định đã được liên hệ: nói rõ là liên hệ lên kế hoạch, vẫn mời tự nộp.
const contacted = buildVerificationProgress({ ...empty, requests: [{ supplier_id: supplierId, target_level: 2, status: 'contacted' }] });
assert.equal(contacted.steps[1].state, 'action');
assert.equal(contacted.steps[1].status, 'Đã ghi nhận liên hệ');
assert.match(contacted.steps[1].note, /lên kế hoạch/);

// 7. Hai bước đã duyệt: 67%, bước còn lại là lịch sử giao hàng.
const twoDone = buildVerificationProgress({ ...empty, reviews: [review({ status: 'approved' }), review({ id: 'v2', target_level: 2, status: 'approved' })] });
assert.equal(twoDone.approvedCount, 2);
assert.equal(twoDone.percent, 67);
assert.equal(twoDone.currentLevel, 3);
const allDone = buildVerificationProgress({
  ...empty,
  reviews: [1, 2, 3].map((level) => review({ id: `v${level}`, target_level: level, status: 'approved' })),
});
assert.equal(allDone.approvedCount, 3);
assert.equal(allDone.percent, 100);
assert.equal(allDone.currentLevel, null);
assert.match(allDone.headline, /Đủ ba bước xác minh/);

// 8. Đợt kiểm đã duyệt thắng hồ sơ nháp mới hơn: không hạ huy hiệu đã có.
const approvedWins = buildVerificationProgress({
  ...empty,
  reviews: [review({ id: 'v2', target_level: 2, status: 'approved' })],
  submissions: [submission({ status: 'returned', updated_at: '2026-10-22T00:00:00Z' })],
});
assert.equal(approvedWins.steps[1].state, 'approved');

// 9. Chỉ dữ liệu của đúng NCC: đợt kiểm, hồ sơ và tệp của doanh nghiệp khác không lọt vào.
const foreign = buildVerificationProgress({
  ...empty,
  reviews: [review({ supplier_id: 'sup-2', status: 'approved' })],
  submissions: [submission({ id: 'sub-x', supplier_id: 'sup-2', status: 'pending_review' })],
  submissionItems: { 'sub-x': photos },
  requests: [{ supplier_id: 'sup-2', target_level: 3, status: 'contacted' }],
  documents: [doc('business_license', 'usr-2'), doc('food_safety', 'usr-2')],
  userId: 'usr-1',
});
assert.equal(foreign.approvedCount, 0);
assert.equal(foreign.steps.map((s) => s.state).join(','), 'not_started,not_started,not_started');
assert.match(foreign.steps[0].metric, /Chưa có GCN ĐKKD/);

// 10. Đếm giấy tờ L1 theo mục (không đếm trùng tệp) và chỉ tệp của chính tài khoản.
const docs = buildVerificationProgress({
  ...empty,
  documents: [doc('business_license'), doc('business_license'), doc('food_safety', 'usr-2')],
  userId: 'usr-1',
});
assert.equal(docs.steps[0].state, 'action');
assert.equal(docs.steps[0].metric, 'Đã tải GCN ĐKKD');
assert.equal(docs.steps[0].action, 'Tải giấy tờ');
const certificateOnly = buildVerificationProgress({ ...empty, documents: [doc('food_safety')] });
assert.equal(certificateOnly.steps[0].state, 'not_started', 'Quality certificates do not count as business registration');
assert.equal(certificateOnly.steps[0].metric, 'Chưa có GCN ĐKKD');

// 11. Nhãn tiếng Anh đủ để “Trang của tôi” không trộn ngôn ngữ.
for (const step of none.steps) {
  assert.ok(step.titleEn && step.statusEn && step.metricEn && step.actionEn, `Bước ${step.level} có nhãn tiếng Anh`);
}
assert.equal(none.steps[1].actionEn, 'Start step 2');

console.log('✅ Verification progress: đúng thứ tự bước, đúng trạng thái, không tự cấp huy hiệu, tách dữ liệu NCC.');

// Loại hình quyết định đúng luồng; lịch sử nhà máy không được chuyển thành đối tác.
const partner = buildVerificationProgress({ ...empty, supplierType: 'trading',
  reviews: [review({ target_level: 2, status: 'approved', l2_scope: null })],
  submissions: [submission({ l2_scope: 'partner_contract' })],
  submissionItems: { 'sub-2': [item('sub-2', 'partner_factory_contract')] },
});
assert.notEqual(partner.steps[1].state, 'approved', 'Duyệt nhà máy cũ không là duyệt đối tác');
assert.match(partner.steps[1].title, /đối tác/i);
assert.match(partner.steps[1].metric, /hợp đồng/i);
const missingType = buildVerificationProgress({ ...empty, supplierType: null, reviews: [review({ target_level: 2, status: 'approved' })] });
assert.doesNotMatch(missingType.steps[1].description, /9 ảnh|Chín ảnh|nhà máy/i, 'Không mặc định nội dung nhà máy khi chưa rõ loại hình');
assert.match(missingType.steps[1].description, /loại hình/i);
assert.notEqual(missingType.steps[1].state, 'approved');
assert.match(missingType.steps[1].note, /loại hình/i);
