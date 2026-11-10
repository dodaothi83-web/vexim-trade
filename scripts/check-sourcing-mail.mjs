// Sourcing email is a link-only notice; buyer/staff free text stays on the portal.
// Historical mail timelines remain readable but no Reply-To is minted for new mail.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, console, Date,
      require: (id) => { assert.ok(id in mocks, `${file}: unexpected ${id}`); return mocks[id]; } });
  return mod.exports;
}
const sent = [], logged = [];
let ok = true;
const routing = load('../lib/rfq/reply-routing.ts', { '@/lib/config': { MAIL_DOMAIN: 'veximtrade.com' } });
const mail = load('../lib/sourcing/mail.ts', {
  '@/lib/config': { FROM_ADDRESS: 'Vexim <hello@veximtrade.com>' },
  '@/lib/email/send': { transport: async (m) => { sent.push(m); return ok
    ? { ok: true, status: 'sent', provider: 'resend', error: null }
    : { ok: false, status: 'failed', provider: 'resend', error: 'down' }; } },
  '@/lib/email/templates': { escapeHtml: (s) => String(s).replaceAll('<', '&lt;'), wrapPlainEmail: ({ body }) => body },
  '@/lib/rfq/reply-routing': routing,
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
});
const store = { addMessage: async (m) => { logged.push(m); return m; }, getBuyerByEmail: async () => ({ id: 'crm-b1' }) };
const request = { id: 'abcdef01-2345-4678-9abc-def012345678', buyer_email: 'buyer@acme.de',
  content: 'Need 2 x 20ft of black pepper 500 g/l <script>', status: 'new' };
await mail.sendSourcingAck(store, request, 'en');
assert.equal(sent[0].to[0], request.buyer_email);
assert.equal(sent[0].replyTo, undefined);
assert.match(sent[0].html, /\/buyer\/account\/sourcing\/abcdef01-/);
assert.doesNotMatch(sent[0].html + sent[0].text, /black pepper|500 g\/l|<script>/);
assert.equal(logged[0].thread_id, `sourcing-${request.id}`, 'Historical notification timeline stays readable');
assert.equal(logged[0].kind, 'auto');
assert.equal(logged[0].buyer_id, 'crm-b1');
await mail.sendSourcingAck(store, request, 'vi');
assert.match(sent[1].subject, /Cập nhật yêu cầu tìm nguồn/);
await mail.sendSourcingReply(store, request, 'Bạn cần bao nhiêu tấn mỗi tháng?', 'staff@vexim.vn');
assert.match(sent[2].html, /\/buyer\/account\/sourcing\/abcdef01-/);
assert.doesNotMatch(sent[2].html + sent[2].text, /Bạn cần bao nhiêu tấn|black pepper/i);
assert.equal(logged[2].kind, 'manual');
assert.equal(logged[2].created_by, 'staff@vexim.vn');
await mail.sendSourcingReply(store, request, 'We found two suppliers.', 'staff@vexim.vn');
assert.match(sent[3].subject, /Sourcing request update/);
ok = false;
const failed = await mail.sendSourcingReply(store, request, 'Check prices again', 'staff@vexim.vn');
assert.equal(failed.ok, false);
assert.equal(logged.at(-1).status, 'failed');
assert.equal(logged.at(-1).sent_at, null);
assert.ok(sent.every((m) => m.replyTo === undefined && !m.html.includes('mailto:')));
const route = fs.readFileSync(new URL('../app/api/buyer/sourcing/route.ts', import.meta.url), 'utf8');
assert.match(route, /else await sendSourcingAck\(store, saved/, 'New request receives a single acknowledgement');
const action = fs.readFileSync(new URL('../app/crm/sourcing/actions.ts', import.meta.url), 'utf8');
assert.match(action, /reply !== \(before\.buyer_reply \?\? ""\)\.trim\(\)/, 'Only changed replies notify');
assert.match(fs.readFileSync(new URL('../app/crm/sourcing/page.tsx', import.meta.url), 'utf8'), /<MessageTimeline title="Lịch sử email và thông báo \(chỉ đọc\)"/);
assert.match(fs.readFileSync(new URL('../app/crm/rfqs/[id]/page.tsx', import.meta.url), 'utf8'),
  /listMessagesForThreads\(\[sourcingThreadId\(linkedRequestId\)\]\)/, 'Linked RFQ retains the original sourcing history');
console.log('✅ Sourcing mail: link-only portal notices, no reply alias or free text in email, historical timeline and failure visibility.');
