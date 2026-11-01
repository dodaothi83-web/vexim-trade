// node --experimental-strip-types --no-warnings scripts/check-email-bounce-suppression.mjs
// Khi Resend báo bounce cứng hoặc người nhận tố thư rác, địa chỉ đó phải bị ghi
// vào danh sách ngừng gửi, tài khoản nhà cung cấp dùng địa chỉ đó phải bị tắt, và
// tầng gửi thư phải từ chối gửi tiếp. Bounce tạm thì chỉ ghi nhận, không cắt.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterSuppressedRecipients,
  normalizeEmail,
  planDelivery,
  suppressionFromWebhookEvent,
} from '../lib/email/suppression.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// 1. Hộp thư không tồn tại: Permanent. Không có kiểu bounce cũng coi là hỏng hẳn.
const permanent = suppressionFromWebhookEvent({
  your: 'ignored',
  type: 'email.bounced',
  data: { to: ['Supplier@Example.COM'], email_id: 'em_1', bounce: { type: 'Permanent', subType: 'General', message: 'mailbox not found' } },
});
assert.equal(permanent?.reason, 'hard_bounce');
assert.deepEqual(permanent?.emails, ['supplier@example.com'], 'Địa chỉ được viết thường trước khi ghi');
assert.equal(permanent?.detail.subType, 'General');
assert.equal(permanent?.detail.emailId, 'em_1');

const undetermined = suppressionFromWebhookEvent({ type: 'email.bounced', data: { to: ['a@b.co'], bounce: { type: 'Undetermined' } } });
assert.equal(undetermined?.reason, 'hard_bounce', 'Không xác định được thì vẫn cắt, vì địa chỉ đang không nhận được thư');
const noType = suppressionFromWebhookEvent({ type: 'email.bounced', data: { to: ['a@b.co'], bounce: {} } });
assert.equal(noType?.reason, 'hard_bounce', 'Bounce thiếu kiểu không được bỏ qua');

// 2. Hộp thư đầy hoặc máy chủ bận: Transient, chỉ ghi nhận.
assert.equal(
  suppressionFromWebhookEvent({ type: 'email.bounced', data: { to: ['busy@b.co'], bounce: { type: 'Transient', message: 'mailbox full' } } }),
  null,
  'Bounce tạm không được cắt địa chỉ của người nhận thật',
);

// 3. Báo cáo thư rác và trường hợp Resend tự chặn.
assert.equal(suppressionFromWebhookEvent({ type: 'email.complained', data: { to: ['buyer@b.co'] } })?.reason, 'complaint');
assert.equal(suppressionFromWebhookEvent({ type: 'email.suppressed', data: { to: ['x@b.co'], suppressed: { type: 'Bounce', message: 'suppressed' } } })?.reason, 'provider_suppressed');

// 4. Sự kiện khác, thiếu người nhận, hoặc địa chỉ rỗng: không làm gì.
assert.equal(suppressionFromWebhookEvent({ type: 'email.delivered', data: { to: ['a@b.co'] } }), null);
assert.equal(suppressionFromWebhookEvent({ type: 'email.bounced', data: { to: [] } }), null);
assert.equal(suppressionFromWebhookEvent({ type: 'email.bounced', data: { to: ['', '  '] } }), null, 'Chuỗi rỗng không được thành một dòng trong cơ sở dữ liệu');
assert.equal(suppressionFromWebhookEvent(null), null);
assert.equal(suppressionFromWebhookEvent({ type: 42 }), null);
assert.deepEqual(
  suppressionFromWebhookEvent({ type: 'email.complained', data: { to: ['A@b.co', 'a@B.co', 'c@b.co'] } })?.emails,
  ['a@b.co', 'c@b.co'],
  'Một sự kiện có nhiều người nhận thì ghi hết, không trùng',
);
assert.equal(normalizeEmail('  X@Y.Z '), 'x@y.z');

// 5. Lọc người nhận: chỉ bỏ đúng địa chỉ bị chặn, cc/bcc cũng phải lọc.
const filtered = filterSuppressedRecipients(
  { to: ['ok@b.co', 'bounced@b.co'], cc: ['Bounced@b.co'], bcc: ['hidden@b.co'] },
  new Set(['bounced@b.co']),
);
assert.deepEqual(filtered.to, ['ok@b.co']);
assert.deepEqual(filtered.cc, []);
assert.deepEqual(filtered.bcc, ['hidden@b.co']);
assert.deepEqual(filtered.skipped, ['bounced@b.co'], 'Địa chỉ bị bỏ phải được báo lại, không im lặng');
assert.deepEqual(filterSuppressedRecipients({ to: [] }, new Set()).to, []);

// 6. Quyết định gửi: chặn hẳn khi không còn ai nhận, nếu không thì bỏ địa chỉ bị chặn.
const allBlocked = planDelivery({ to: ['bounced@b.co'] }, new Set(['bounced@b.co']));
assert.equal(allBlocked.blocked, true);
assert.match(allBlocked.reason ?? '', /^Địa chỉ bounced@b\.co đã bị đánh dấu không gửi được \(bounce hoặc báo cáo thư rác\); thư bị bỏ qua\.$/,
  'Lý do bỏ thư phải nêu đúng địa chỉ, không im lặng');
assert.equal(planDelivery({ to: ['ok@b.co'] }, new Set()).blocked, false, 'Không có địa chỉ bị chặn thì gửi bình thường');
const partial = planDelivery({ to: ['ok@b.co', 'bounced@b.co'], cc: ['cc@b.co'] }, new Set(['bounced@b.co']));
assert.equal(partial.blocked, false);
assert.deepEqual(partial.mail.to, ['ok@b.co'], 'Thư vẫn tới người nhận còn tốt');
assert.deepEqual(partial.mail.cc, ['cc@b.co']);
assert.deepEqual(partial.skipped, ['bounced@b.co']);
const onlyCcBlocked = planDelivery({ to: ['ok@b.co'], cc: ['bounced@b.co'] }, new Set(['bounced@b.co']));
assert.equal(onlyCcBlocked.blocked, false, 'Chỉ cc bị chặn thì thư chính vẫn đi');
assert.deepEqual(onlyCcBlocked.mail.cc, []);

// 7. Cơ sở dữ liệu: bảng ngừng gửi, hàm ghi, và chỉ tắt tài khoản nhà cung cấp.
const migration = read('supabase/migrations/20261104_email_bounce_suppression.sql');
assert.match(migration, /create table if not exists public\.email_suppressions/i);
assert.match(migration, /email\s+text primary key/i, 'Khoá chính là địa chỉ đã chuẩn hoá');
assert.match(migration, /check \(email = lower\(btrim\(email\)\)/, 'Không cho ghi địa chỉ chưa viết thường');
assert.match(migration, /reason in \('hard_bounce', 'complaint', 'provider_suppressed', 'manual'\)/);
assert.match(migration, /enable row level security/i);
assert.match(migration, /record_email_suppression/);
assert.match(migration, /update public\.app_users set is_active = false/);
assert.match(migration, /role = 'supplier'/, 'Không được tắt tài khoản nội bộ vì một cú bounce');
assert.match(migration, /user\.deactivated_email_bounce/, 'Việc tắt tài khoản phải để lại dấu vết kiểm toán');
assert.match(migration, /clear_email_suppression/, 'Phải có đường gỡ để gửi lại sau khi hộp thư được sửa');

// 8. Webhook: xử lý bounced/complained/suppressed trước nhánh email.received.
const webhook = read('app/api/webhooks/resend/route.ts');
const bounceAt = webhook.indexOf('email.bounced');
const receivedAt = webhook.indexOf('event.type !== "email.received"');
assert.ok(bounceAt > 0, 'Webhook phải có nhánh cho email.bounced');
assert.ok(receivedAt > 0);
assert.ok(bounceAt < receivedAt, 'Nhánh bounce phải đứng trước nhánh thư đến, nếu không sự kiện bị bỏ qua');
assert.match(webhook, /email\.complained/);
assert.match(webhook, /email\.suppressed/);
assert.match(webhook, /recordSuppressions\(/);
assert.match(webhook, /suppressionFromWebhookEvent\(/);
assert.ok(!/vòng đời gửi \(sent\/delivered\/bounced\.\.\.\) chưa xử lý/.test(webhook), 'Bình luận cũ nói bounce chưa xử lý phải được gỡ');

// 9. Tầng gửi thư: chặn trước khi gọi Resend, và báo lý do rõ ràng.
const send = read('lib/email/send.ts');
const guardAt = send.indexOf('await suppressedEmails(');
const providerAt = send.indexOf('resend.emails.send(');
assert.ok(guardAt > 0, 'transport phải hỏi danh sách ngừng gửi');
assert.ok(guardAt < providerAt, 'Kiểm tra ngừng gửi phải chạy trước lệnh gọi Resend');
assert.match(send, /planDelivery\(mail, suppressed\)/, 'transport phải dùng đúng quyết định đã kiểm');
assert.match(send, /error: plan\.reason/);
assert.match(read('lib/email/suppression.ts'), /đã bị đánh dấu không gửi được \(bounce hoặc báo cáo thư rác\); thư bị bỏ qua\./);
assert.match(send, /await suppressedEmails\(\[\.\.\.recipients, \.\.\.\(mail\.cc \?\? \[\]\), \.\.\.\(mail\.bcc \?\? \[\]\)\]\)/, 'cc và bcc cũng phải được kiểm tra');

// 10. Lớp cửa hàng: lỗi đọc bảng không được làm chết đường thư (fail open).
const store = read('lib/email/suppression-store.ts');
assert.match(store, /export async function suppressedEmails/);
assert.match(store, /return new Set\(\);/, 'Đọc lỗi thì coi như không có địa chỉ nào bị chặn');
assert.match(store, /"record_email_suppression"/);
assert.match(store, /"clear_email_suppression"/);

// 11. Trang quản trị: xem được danh sách và có đường gửi lại.
const page = read('app/crm/settings/email-suppressions/page.tsx');
assert.match(page, /session\.role !== "admin"/, 'Chỉ quản trị viên được xem danh sách');
assert.match(page, /listSuppressions\(\)/);
assert.match(page, /"Hộp thư không tồn tại"/, 'Lý do phải hiện bằng tiếng Việt, không phải mã');
assert.match(page, /AllowResendButton/, 'Phải có nút cho gửi lại');
const pageActions = read('app/crm/settings/email-suppressions/actions.ts');
assert.match(pageActions, /clearSuppression\(/);
assert.match(pageActions, /action: "email_suppression.cleared"/, 'Gỡ chặn cũng phải để lại dấu vết kiểm toán');
assert.match(read('app/crm/settings/page.tsx'), /\/crm\/settings\/email-suppressions/, 'Trang cài đặt phải dẫn tới danh sách');

console.log('check-email-bounce-suppression: ok');
