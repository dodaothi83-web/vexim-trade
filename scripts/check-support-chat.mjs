// node --experimental-strip-types --no-warnings scripts/check-support-chat.mjs
// Chat người mua ↔ đội Vexim (thay WhatsApp): quy tắc, quyền nhân viên kinh doanh, tự nhận
// xử lý, email báo đúng người, người mua không thấy email nội bộ, giao diện và migration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../lib/chat/core.ts';
import { hasPermission } from '../lib/auth/permissions.ts';

function load(file, mocks) {
  const out = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console: { ...console, error() {} }, Date, Promise, process, require: (id) => {
    if (id === '@/lib/brand/colors.json') return { default: { primary: '#123', surface: '#eee', muted: '#999' } };
    assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id];
  } });
  return module.exports;
}
const supportCore = load('../lib/chat/support-core.ts', { './core': core });

/* ---------- 1. Quy tắc thuần và quyền ---------- */
const now = Date.parse('2026-11-07T10:00:00Z');
const conv = { last_message_at: '2026-11-07T09:00:00Z', last_sender: 'buyer', buyer_last_read_at: '2026-11-07T09:00:00Z', staff_last_read_at: null };
assert.equal(supportCore.supportHasUnread(conv, 'staff'), true);
assert.equal(supportCore.supportHasUnread(conv, 'buyer'), false);
assert.equal(supportCore.supportHasUnread({ ...conv, staff_last_read_at: '2026-11-07T09:30:00Z' }, 'staff'), false);
const n = { buyer_last_read_at: null, staff_last_read_at: null, buyer_notified_at: null, staff_notified_at: null };
assert.equal(supportCore.supportShouldNotify(n, 'staff', now), true);
assert.equal(supportCore.supportShouldNotify({ ...n, staff_notified_at: '2026-11-07T09:50:00Z' }, 'staff', now), false, 'Một loạt tin chỉ một email');
assert.equal(supportCore.supportShouldNotify({ ...n, staff_notified_at: '2026-11-07T03:00:00Z' }, 'staff', now), true, 'Quá 6 giờ thì nhắc lại');
const burst = Array.from({ length: 20 }, (_, i) => ({ sender: 'buyer', created_at: new Date(now - i * 1000).toISOString() }));
assert.equal(supportCore.supportRateLimited(burst, 'buyer', now), true);
assert.equal(supportCore.supportRateLimited(burst, 'staff', now), false);
assert.equal(supportCore.cleanPagePath('/products/cashew/p1?x=1#top'), '/products/cashew/p1?x=1');
assert.equal(supportCore.cleanPagePath('https://evil.example/x'), null);
assert.equal(supportCore.cleanPagePath('//evil.example'), null);
assert.equal(supportCore.staffDisplayName('Nguyễn Văn Dung'), 'Dung', 'Người mua chỉ thấy tên gọi');
assert.equal(core.CHAT_MAX_LENGTH, 4000);
// Kinh doanh và Quản trị trả lời được; Chỉ xem đọc được; Kiểm duyệt và nhà cung cấp không vào.
for (const role of ['admin', 'sale']) { assert.equal(hasPermission(role, 'support.manage'), true, role); assert.equal(hasPermission(role, 'support.view'), true, role); }
assert.equal(hasPermission('viewer', 'support.view'), true);
assert.equal(hasPermission('viewer', 'support.manage'), false);
for (const role of ['reviewer', 'supplier', 'sourcing']) assert.equal(hasPermission(role, 'support.view'), false, role);

/* ---------- 2. Dịch vụ với kho giả ---------- */
const conversations = [], messages = [], sent = [];
let seq = 0;
const users = { 'u-dung': { id: 'u-dung', name: 'Nguyễn Văn Dung', email: 'dung@veximtrade.com', is_active: true } };
const store = {
  getSupportConversationByBuyer: async (email) => conversations.find((c) => c.buyer_email === email) ?? null,
  getSupportConversation: async (id) => conversations.find((c) => c.id === id) ?? null,
  createSupportConversation: async (email) => { const c = { id: `c${++seq}`, buyer_email: email, assigned_to: null, last_message_at: null, last_message_preview: null, last_sender: null, buyer_last_read_at: null, staff_last_read_at: null, buyer_notified_at: null, staff_notified_at: null, created_at: new Date().toISOString() }; conversations.push(c); return c; },
  updateSupportConversation: async (id, patch) => Object.assign(conversations.find((c) => c.id === id), patch),
  listSupportMessages: async (id) => messages.filter((m) => m.conversation_id === id),
  addSupportMessage: async (input) => { const m = { ...input, id: `m${++seq}`, created_at: new Date(Date.now() + seq).toISOString() }; messages.push(m); return m; },
  getUser: async (id) => users[id] ?? null,
  getBuyerUserByEmail: async () => ({ company_name: 'Acme GmbH' }),
  getBuyerByEmail: async () => ({ id: 'b-1', company: 'Acme GmbH' }),
};
const support = load('../lib/chat/support.ts', {
  'server-only': {},
  '@/lib/config': { FROM_ADDRESS: 'Vexim <hello@veximtrade.com>', SERVICE_FROM_ADDRESS: 'Vexim <service@veximtrade.com>', MAIL_DOMAIN: 'veximtrade.com' },
  '@/lib/email/send': { transport: async (m) => { sent.push(m); return { ok: true, status: 'sent' }; } },
  '@/lib/email/templates': { escapeHtml: (s) => String(s).replaceAll('<', '&lt;'), wrapPlainEmail: ({ body }) => body },
  '@/lib/supplier-portal/notify': { notificationOrigin: () => 'https://www.veximtrade.com' },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  './core': core,
  './support-core': supportCore,
});

const first = await support.postBuyerSupportMessage({ store, buyerEmail: 'buyer@acme.de', body: 'Hi, can you help me find a pepper supplier?', pagePath: '/products/pepper/p2' });
assert.equal(conversations.length, 1, 'Tin đầu tạo cuộc trò chuyện');
assert.equal(first.message.page_path, '/products/pepper/p2', 'Lưu trang người mua đang xem');
assert.equal(sent[0].to[0], 'hello@veximtrade.com', 'Chưa ai nhận thì báo hộp thư chung');
assert.match(sent[0].html, /\/crm\/support\?c=c1/);
await support.postBuyerSupportMessage({ store, buyerEmail: 'buyer@acme.de', body: 'Grade 500 g/l, 2 containers.' });
assert.equal(conversations.length, 1, 'Mỗi người mua chỉ một cuộc');
assert.equal(sent.length, 1, 'Tin thứ hai chưa ai đọc thì không gửi email thêm');
const staffView = await support.supportConversationViews(store, conversations);
assert.equal(staffView[0].unread, true);
assert.equal(staffView[0].buyerLabel, 'Acme GmbH');
assert.equal(staffView[0].buyerCrmId, 'b-1');

await support.postStaffSupportMessage({ store, conversation: conversations[0], staff: { id: 'u-dung', name: 'Nguyễn Văn Dung', email: 'dung@veximtrade.com' }, body: 'Sure, we have 3 checked pepper suppliers.' });
assert.equal(conversations[0].assigned_to, 'u-dung', 'Trả lời cuộc chưa ai nhận là tự nhận');
const buyerMail = sent.at(-1);
assert.deepEqual([...buyerMail.to], ['buyer@acme.de']);
assert.match(buyerMail.html, /\?support=1/, 'Email mở thẳng khung chat');
assert.doesNotMatch(buyerMail.html + buyerMail.text, /dung@veximtrade\.com/, 'Người mua không thấy email nội bộ');
const buyerMsgs = support.supportMessageViews(messages, 'buyer');
assert.equal(buyerMsgs.at(-1).author, 'Dung · Vexim Trade');
assert.equal(buyerMsgs[0].pagePath, null, 'Người mua không cần thấy dấu trang');
assert.doesNotMatch(JSON.stringify(buyerMsgs), /dung@veximtrade|Nguyễn Văn/);
const staffMsgs = support.supportMessageViews(messages, 'staff');
assert.equal(staffMsgs.at(-1).author, 'Nguyễn Văn Dung', 'Nhân viên thấy đồng nghiệp nào đã trả lời');
assert.equal(staffMsgs[0].pagePath, '/products/pepper/p2');

// Đã nhận xử lý: tin mới của người mua báo đúng người phụ trách.
conversations[0].staff_last_read_at = new Date(Date.now() + 1e6).toISOString();
await support.postBuyerSupportMessage({ store, buyerEmail: 'buyer@acme.de', body: 'Great, thanks!' });
assert.deepEqual([...sent.at(-1).to], ['dung@veximtrade.com']);
await assert.rejects(support.postBuyerSupportMessage({ store, buyerEmail: 'buyer@acme.de', body: '   ' }), /empty/);

/* ---------- 3. API, giao diện, migration ---------- */
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
assert.match(read('app/api/support/route.ts'), /sameOrigin\(request\)/);
assert.match(read('app/api/support/route.ts'), /chatViewer\("buyer"\)/, 'Chỉ người mua đã xác minh email');
assert.match(read('app/api/crm/support/[id]/route.ts'), /requirePermission\("support\.manage"\)/, 'Trả lời cần quyền support.manage');
assert.match(read('app/api/crm/support/[id]/route.ts'), /requirePermission\("support\.view"\)/);
assert.match(read('app/api/crm/support/route.ts'), /requirePermission\("support\.view"\)/);
assert.match(read('app/crm/support/page.tsx'), /requirePagePermission\("support\.view"/);
const rail = read('components/marketplace-rail.tsx');
assert.doesNotMatch(rail, /wa\.me|whatsapp/i, 'Không còn WhatsApp');
assert.match(rail, /<SupportChat/);
assert.match(rail, /\/api\/support\?peek=1/);
assert.equal(fs.existsSync(new URL('../components/whatsapp-chat-button.tsx', import.meta.url)), false);
assert.match(read('components/sidebar.tsx'), /href: "\/crm\/support".*perm: "support\.view"/);
assert.match(read('app/crm/layout.tsx'), /pendingSupport/);
const migration = read('supabase/migrations/20261111_vexim_support_chat.sql');
assert.match(migration, /support_conversations_buyer_key/);
assert.match(migration, /revoke all on table public\.support_messages from public, anon, authenticated/);

console.log('✅ Chat với Vexim: quy tắc, quyền Kinh doanh/Quản trị/Chỉ xem, tự nhận xử lý, email báo đúng người, không lộ email nội bộ, bỏ WhatsApp, migration.');
