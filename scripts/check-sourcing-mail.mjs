// node scripts/check-sourcing-mail.mjs
// Email cho yêu cầu tìm nguồn: xác nhận khi gửi, báo khi nhân viên phản hồi; đi qua bộ gửi chung,
// lưu vào mạch sourcing-{id}, Reply-To định tuyến về đúng yêu cầu.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTS(file, mocks) {
  const out = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console, Date, require: (id) => {
    if (id === '@/lib/brand/colors.json') return { default: JSON.parse(fs.readFileSync(new URL('../lib/brand/colors.json', import.meta.url), 'utf8')) };
    assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id];
  } });
  return module.exports;
}
const router = loadTS('../lib/rfq/reply-routing.ts', { '@/lib/config': { MAIL_DOMAIN: 'veximtrade.com' } });
const sent = [], logged = [];
let ok = true;
const mail = loadTS('../lib/sourcing/mail.ts', {
  '@/lib/config': { FROM_ADDRESS: 'Vexim <hello@veximtrade.com>' },
  '@/lib/email/privacy': { htmlToText: (h) => h.replace(/<[^>]+>/g, ' ') },
  '@/lib/email/send': { transport: async (m) => { sent.push(m); return ok ? { ok: true, status: 'sent', provider: 'resend', error: null } : { ok: false, status: 'failed', provider: 'resend', error: 'down' }; } },
  '@/lib/email/templates': { escapeHtml: (s) => String(s).replaceAll('<', '&lt;'), wrapPlainEmail: ({ body }) => body },
  '@/lib/rfq/reply-routing': router,
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
});
const store = { addMessage: async (m) => { logged.push(m); return m; }, getBuyerByEmail: async () => ({ id: 'crm-b1' }) };
const request = { id: 'abcdef01-2345-4678-9abc-def012345678', buyer_email: 'buyer@acme.de', content: 'Need 2 x 20ft of black pepper 500 g/l <script>', status: 'new' };

await mail.sendSourcingAck(store, request, 'en');
assert.equal(sent[0].to[0], 'buyer@acme.de');
assert.equal(sent[0].replyTo, router.sourcingReplyAddress(request.id), 'Người mua trả lời thì thư về đúng yêu cầu');
assert.match(sent[0].subject, /\[ABCDEF01\] We received your sourcing request/);
assert.match(sent[0].html, /\/buyer\/account\/sourcing\/abcdef01-/);
assert.doesNotMatch(sent[0].html, /<script>/, 'Nội dung người mua được thoát HTML');
assert.equal(logged[0].thread_id, `sourcing-${request.id}`);
assert.equal(logged[0].kind, 'auto');
assert.equal(logged[0].created_by, null);
assert.equal(logged[0].buyer_id, 'crm-b1');
await mail.sendSourcingAck(store, request, 'vi');
assert.match(sent[1].subject, /Vexim đã nhận yêu cầu tìm nguồn/);

await mail.sendSourcingReply(store, { ...request, status: 'needs_info' }, 'Bạn cần bao nhiêu tấn mỗi tháng?', 'staff@vexim.vn');
assert.match(sent[2].subject, /Vexim cần thêm thông tin/, 'Phản hồi tiếng Việt dùng khung tiếng Việt');
assert.match(sent[2].html, /Bạn cần bao nhiêu tấn/);
assert.equal(logged[2].kind, 'manual');
assert.equal(logged[2].created_by, 'staff@vexim.vn');
await mail.sendSourcingReply(store, { ...request, status: 'in_progress' }, 'We found two suppliers.', 'staff@vexim.vn');
assert.match(sent[3].subject, /Update on your sourcing request/);
ok = false;
const failed = await mail.sendSourcingReply(store, request, 'Hello again', 'staff@vexim.vn');
assert.equal(failed.ok, false);
assert.equal(logged.at(-1).status, 'failed', 'Thư gửi lỗi vẫn được ghi để nhân viên thấy');
assert.equal(logged.at(-1).sent_at, null);

const route = fs.readFileSync(new URL('../app/api/buyer/sourcing/route.ts', import.meta.url), 'utf8');
assert.match(route, /else await sendSourcingAck\(store, saved/, 'Chỉ gửi xác nhận cho yêu cầu mới, không gửi lại khi bấm gửi trùng');
const action = fs.readFileSync(new URL('../app/crm/sourcing/actions.ts', import.meta.url), 'utf8');
assert.match(action, /reply !== \(before\.buyer_reply \?\? ""\)\.trim\(\)/, 'Chỉ gửi email khi phản hồi mới hoặc đã sửa');
const page = fs.readFileSync(new URL('../app/crm/sourcing/page.tsx', import.meta.url), 'utf8');
assert.match(page, /Người mua đã trả lời/);
assert.match(page, /<MessageTimeline title="Thư với người mua"/);
assert.match(fs.readFileSync(new URL('../app/crm/rfqs/[id]/page.tsx', import.meta.url), 'utf8'), /listMessagesForThreads\(\[sourcingThreadId\(linkedRequestId\)\]\)/, 'RFQ liên kết hiện cả thư thời còn là yêu cầu tìm nguồn');
console.log('✅ Sourcing mail: ack and reply via shared transport, logged to sourcing thread, routed Reply-To, language, failures recorded.');
