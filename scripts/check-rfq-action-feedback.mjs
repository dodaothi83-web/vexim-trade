// node scripts/check-rfq-action-feedback.mjs
// Trang chi tiết RFQ: soạn email trong hộp thoại lớn; mọi nút lưu/gửi báo "đang lưu" và kết quả,
// và không làm mất chữ đã nhập khi lưu lỗi.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const page = read('app/crm/rfqs/[id]/page.tsx');
assert.match(page, /<ComposeEmailDialog action=\{composeMatchEmailAction\}/, 'Soạn email mở hộp thoại, không phải ô nhỏ thả xuống');
assert.doesNotMatch(page, /<form action=\{composeMatchEmailAction\}/);
for (const action of ['updateMatchQuoteAction', 'updateMatchStatusAction', 'addMatchAction', 'addRfqNoteAction', 'uploadRfqAttachmentAction', 'updateRfqStatusFormAction']) {
  assert.match(page, new RegExp(`<ActionForm action=\\{${action}\\}`), `${action} báo trạng thái đang lưu và kết quả`);
}
assert.doesNotMatch(page, /<Button type="submit"/, 'Không còn nút lưu im lặng trên trang');

const form = read('components/action-form.tsx');
const dialog = read('components/compose-email-dialog.tsx');
// Prop `action` của form làm React tự xoá chữ đã nhập sau mỗi lần chạy, kể cả khi lỗi.
for (const [name, src] of [['action-form', form], ['compose-email-dialog', dialog]]) {
  assert.doesNotMatch(src, /<form[^>]*\saction=\{/, `${name}: gửi bằng onSubmit để giữ chữ khi lỗi`);
  assert.match(src, /onSubmit=/);
}
assert.match(form, /event\.preventDefault\(\)/);
assert.match(form, /Đang lưu…/);
assert.match(dialog, /showModal\(\)/, 'Hộp thoại thật, có nền mờ và phím Esc');
assert.match(dialog, /Đang gửi…/);
assert.match(dialog, /role="alert"/, 'Lỗi gửi hiện ngay trong hộp thoại');
assert.match(read('components/confirm-submit-button.tsx'), /disabled=\{pending\}/, 'Nút có xác nhận cũng khoá khi đang gửi');
console.log('✅ RFQ detail feedback: email dialog, pending/saved/error states, typed text kept on error.');
