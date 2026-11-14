// node --experimental-strip-types --no-warnings scripts/check-certificate-rejection.mjs
// Từ chối chứng nhận: lý do lưu tách khỏi ghi chú nội bộ, nhà cung cấp đọc câu dễ hiểu (vi/en),
// có email + lối tải lại, CRM không xoá giấy, giấy bị từ chối hiện trên trang Giấy tờ.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as r from '../lib/certificate-rejection.ts';

assert.equal(r.encodeRejectionReason('duplicate'), 'duplicate');
assert.equal(r.encodeRejectionReason('random'), null, 'Mã lạ bị từ chối');
assert.equal(r.encodeRejectionReason('other', '   '), null, 'Lý do khác không được để trống');
assert.equal(r.encodeRejectionReason('other', ' Giấy   sai tên \n công ty '), 'other:Giấy sai tên công ty');
assert.equal(r.encodeRejectionReason('other', 'x'.repeat(400)).length, 6 + r.REJECTION_OTHER_MAX, 'Cắt ở 300 ký tự (khớp ràng buộc CSDL)');
assert.match(r.supplierRejectionMessage('holder_without_contract', 'vi'), /Tải kèm hợp đồng/);
assert.match(r.supplierRejectionMessage('holder_without_contract', 'en'), /contract or authorisation/);
assert.equal(r.supplierRejectionMessage('other:Giấy sai tên công ty', 'en'), 'Giấy sai tên công ty', 'Câu khác gửi nguyên văn');
assert.match(r.supplierRejectionMessage(null, 'vi'), /Tải lại bản đúng/, 'Thiếu lý do (chưa chạy migration) vẫn có câu hướng dẫn');
assert.equal(r.staffRejectionLabel('other:abc'), 'Khác: abc');

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const actions = read('app/crm/suppliers/[slug]/audit/[step]/certificate-actions.ts');
const reject = actions.slice(actions.indexOf('export async function rejectCertificateAction'), actions.indexOf('export async function reopenCertificateAction'));
assert.match(reject, /guard\("suppliers\.publish"\)/, 'Chỉ người có quyền duyệt đăng mới từ chối');
assert.match(reject, /review_status: "rejected"/);
assert.match(reject, /decision: "certificate_rejected"/, 'Gửi email cho nhà cung cấp');
assert.match(reject, /addAuditLog/, 'Ghi nhật ký');
assert.doesNotMatch(reject, /deleteCertificate|deleteObject/, 'Từ chối không xoá giấy hay tệp');
assert.match(reject, /cert\.review_status === "approved"/, 'Không từ chối giấy đã duyệt');
const notify = read('lib/supplier-portal/notify.ts');
assert.match(notify, /certificate_rejected: \{ title: `Chứng nhận chưa được duyệt: \$\{name\}`/);
assert.match(notify, /documents\?replace=\$\{encodeURIComponent\(input\.entityId \?\? ""\)\}#chung-nhan/, 'Nút email mở đúng ô tải lại');
assert.match(notify, /cta: "Tải lại chứng nhận"/);
const page = read('app/supplier/portal/documents/page.tsx');
assert.match(page, /review_status === "rejected" && !certificate\.superseded_by_certificate_id/, 'Trang Giấy tờ hiện giấy bị từ chối');
assert.match(page, /initialCertificateId=\{replaceId/, 'Ô tải lại chọn sẵn giấy cần thay');
const route = read('app/api/supplier-portal/certificates/route.ts');
assert.match(route, /renewalSource\?\.review_status === "rejected"/, 'Tải bản thay thì giấy bị từ chối rời danh sách ngay');
const ui = read('app/crm/suppliers/[slug]/audit/[step]/certificate-row-controls.tsx');
assert.match(ui, /Câu này được gửi nguyên văn cho nhà cung cấp/, 'Nhân viên biết câu Khác được gửi nguyên văn');
assert.match(ui, /reopenCertificateAction/, 'Có Bỏ từ chối khi bấm nhầm');
console.log('✅ Từ chối chứng nhận: lý do riêng cho nhà cung cấp (vi/en), email + tải lại, không xoá, có bỏ từ chối.');
