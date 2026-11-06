// node --experimental-strip-types --no-warnings scripts/check-chat.mjs
// Chat người mua ↔ nhà cung cấp (thay luồng email của Ask supplier): nội dung, chống spam,
// chưa đọc, giới hạn email báo tin mới, quyền xem, không lộ email người mua cho nhà cung cấp.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../lib/chat/core.ts';

/* ---------- 1. Quy tắc thuần ---------- */
assert.deepEqual({ ...core.cleanChatBody('  hello \r\n world  ') }, { ok: true, body: 'hello\n world' });
assert.equal(core.cleanChatBody('   ').ok, false);
assert.equal(core.cleanChatBody('x'.repeat(4001)).error, 'too_long');
const now = Date.parse('2026-11-06T10:00:00Z');
const burst = Array.from({ length: 20 }, (_, i) => ({ sender: 'buyer', created_at: new Date(now - i * 1000).toISOString() }));
assert.equal(core.chatRateLimited(burst, 'buyer', now), true, '20 tin trong 10 phút là chạm trần');
assert.equal(core.chatRateLimited(burst, 'supplier', now), false, 'Trần tính riêng từng bên');
assert.equal(core.chatRateLimited(burst.map((m) => ({ ...m, created_at: new Date(now - 11 * 60_000).toISOString() })), 'buyer', now), false);
const conv = { last_message_at: '2026-11-06T09:00:00Z', last_sender: 'buyer', buyer_last_read_at: '2026-11-06T09:00:00Z', supplier_last_read_at: null };
assert.equal(core.hasUnread(conv, 'supplier'), true);
assert.equal(core.hasUnread(conv, 'buyer'), false, 'Tin của chính mình không phải chưa đọc');
assert.equal(core.hasUnread({ ...conv, supplier_last_read_at: '2026-11-06T09:30:00Z' }, 'supplier'), false);
const notify = { buyer_last_read_at: null, supplier_last_read_at: null, buyer_notified_at: null, supplier_notified_at: null };
assert.equal(core.shouldNotify(notify, 'supplier', now), true, 'Tin đầu luôn báo');
assert.equal(core.shouldNotify({ ...notify, supplier_notified_at: '2026-11-06T09:50:00Z' }, 'supplier', now), false, 'Chưa đọc lần báo trước thì không gửi thêm');
assert.equal(core.shouldNotify({ ...notify, supplier_notified_at: '2026-11-06T09:50:00Z', supplier_last_read_at: '2026-11-06T09:55:00Z' }, 'supplier', now), true, 'Đã đọc rồi thì tin mới được báo');
assert.equal(core.shouldNotify({ ...notify, supplier_notified_at: '2026-11-06T03:00:00Z' }, 'supplier', now), true, 'Quá 6 giờ thì nhắc lại');
assert.equal(core.tooManyNewConversations(Array.from({ length: 20 }, () => ({ created_at: '2026-11-06T09:00:00Z' })), now), true);

/* ---------- 2. Dịch vụ với kho giả ---------- */
function load(file, mocks) {
  const out = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console: { ...console, error() {} }, Date, Promise, require: (id) => {
    if (id === '@/lib/brand/colors.json') return { default: { primary: '#123', surface: '#eee', muted: '#999' } };
    assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id];
  } });
  return module.exports;
}
const conversations = [], messages = [], sent = [];
let seq = 0;
const store = {
  findChatConversation: async (email, sid) => conversations.find((c) => c.buyer_email === email && c.supplier_id === sid) ?? null,
  getChatConversation: async (id) => conversations.find((c) => c.id === id) ?? null,
  createChatConversation: async (input) => { const c = { ...input, id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, created_at: new Date().toISOString(), last_message_at: null, last_sender: null, buyer_last_read_at: null, supplier_last_read_at: null, buyer_notified_at: null, supplier_notified_at: null }; conversations.push(c); return c; },
  updateChatConversation: async (id, patch) => Object.assign(conversations.find((c) => c.id === id), patch),
  listChatConversations: async ({ buyerEmail }) => conversations.filter((c) => !buyerEmail || c.buyer_email === buyerEmail),
  listChatMessages: async (id) => messages.filter((m) => m.conversation_id === id),
  addChatMessage: async (input) => { const m = { ...input, id: `m${++seq}`, created_at: new Date(Date.now() + seq).toISOString() }; messages.push(m); return m; },
  getSupplier: async (id) => ({ id, name: 'Mekong Agri', display_name: 'Mekong Agri', status: 'published', slug: 'mekong', email: 'contact@mekong.vn' }),
  listUsers: async () => [{ is_active: true, role: 'supplier', supplier_id: 's1', email: 'Owner@Mekong.vn' }, { is_active: true, role: 'supplier', supplier_id: 's2', email: 'other@x.vn' }],
  getBuyerUserByEmail: async () => ({ company_name: 'Acme GmbH' }),
  getBuyerByEmail: async () => null,
};
const records = { p1: { card: { name: 'Cashew W320' }, product: { id: 'p1', name: 'Cashew W320' }, supplier: { id: 's1' } } };
const chat = load('../lib/chat/service.ts', {
  'server-only': {},
  '@/lib/config': { FROM_ADDRESS: 'Vexim <hello@veximtrade.com>', SERVICE_FROM_ADDRESS: 'Vexim <service@veximtrade.com>' },
  '@/lib/email/send': { transport: async (m) => { sent.push(m); return { ok: true, status: 'sent' }; } },
  '@/lib/email/templates': { escapeHtml: (s) => String(s).replaceAll('<', '&lt;'), wrapPlainEmail: ({ body }) => body },
  '@/lib/public/product-catalog': { getPublicProductRecordsByIds: async (ids) => ids.map((id) => records[id]).filter(Boolean) },
  '@/lib/supplier-portal/notify': { notificationOrigin: () => 'https://www.veximtrade.com' },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  './core': core,
});

await assert.rejects(chat.startConversation({ store, buyerEmail: 'buyer@acme.de', productId: 'gone', body: 'Hi' }), /product_unavailable/, 'Không hỏi được sản phẩm không công khai');
const C1 = '00000000-0000-4000-8000-000000000001';
const first = await chat.startConversation({ store, buyerEmail: 'buyer@acme.de', productId: 'p1', body: 'Price for 1 container? <b>' });
assert.equal(first.supplier_id, 's1');
assert.equal(sent.length, 1, 'Tin đầu báo nhà cung cấp');
assert.deepEqual([...sent[0].to], ['owner@mekong.vn'], 'Gửi tới tài khoản cổng của đúng nhà cung cấp');
assert.doesNotMatch(sent[0].html + sent[0].text + sent[0].subject, /buyer@acme\.de/, 'Email cho nhà cung cấp không chứa email người mua');
assert.match(sent[0].subject, /Acme GmbH/, 'Nhà cung cấp thấy tên công ty người mua');
assert.match(sent[0].html, /&lt;b>/, 'Nội dung được thoát HTML');
assert.match(sent[0].html, new RegExp(`/supplier/portal/messages\\?c=${C1}`));
const again = await chat.startConversation({ store, buyerEmail: 'buyer@acme.de', productId: 'p1', body: 'And samples?' });
assert.equal(again.id, first.id, 'Hỏi lại cùng nhà cung cấp mở lại đúng cuộc cũ');
assert.equal(conversations.length, 1);
assert.equal(sent.length, 1, 'Nhà cung cấp chưa đọc thì tin thứ hai không gửi thêm email');
assert.equal(chat.conversationViews && conversations[0].last_sender, 'buyer');

// Quyền xem: chỉ người mua đó và nhà cung cấp đó.
await chat.ownedConversation(store, C1, { side: 'buyer', email: 'BUYER@acme.de' });
await chat.ownedConversation(store, C1, { side: 'supplier', supplierId: 's1' });
await assert.rejects(chat.ownedConversation(store, C1, { side: 'buyer', email: 'other@acme.de' }), /not_found/);
await assert.rejects(chat.ownedConversation(store, C1, { side: 'supplier', supplierId: 's2' }), /not_found/);

// Nhà cung cấp trả lời: người mua nhận email, nhà cung cấp coi như đã đọc.
await chat.postMessage({ store, conversation: conversations[0], sender: 'supplier', senderEmail: 'owner@mekong.vn', body: 'USD 6.2/kg FOB' });
assert.equal(sent.length, 2);
assert.equal(sent[1].to[0], 'buyer@acme.de');
assert.match(sent[1].html, new RegExp(`/buyer/account/messages\\?c=${C1}`));
const views = await chat.conversationViews(store, conversations, 'buyer');
assert.equal(views[0].unread, true, 'Người mua có tin chưa đọc');
assert.equal(views[0].counterpart, 'Mekong Agri');
const supplierViews = await chat.conversationViews(store, conversations, 'supplier');
assert.equal(supplierViews[0].unread, false);
assert.equal(supplierViews[0].counterpart, 'Acme GmbH');
assert.doesNotMatch(JSON.stringify(supplierViews), /buyer@acme\.de/, 'Danh sách của nhà cung cấp không có email người mua');
await chat.markConversationRead(store, conversations[0], 'buyer');
assert.equal((await chat.conversationViews(store, conversations, 'buyer'))[0].unread, false);
await assert.rejects(chat.postMessage({ store, conversation: conversations[0], sender: 'buyer', senderEmail: 'buyer@acme.de', body: '   ' }), /empty/);

/* ---------- 3. API và giao diện ---------- */
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
for (const f of ['app/api/chat/start/route.ts', 'app/api/chat/[id]/route.ts']) assert.match(read(f), /sameOrigin\(request\)/, `${f}: chặn gửi từ trang khác`);
assert.match(read('app/api/chat/[id]/route.ts'), /ownedConversation\(/, 'Đọc và gửi đều kiểm quyền sở hữu');
assert.match(read('lib/chat/viewer.ts'), /account\?\.verified_at/, 'Người mua phải xác minh email');
assert.match(read('lib/chat/viewer.ts'), /portalApproved\(access\.supplier\)/, 'Nhà cung cấp phải được duyệt cổng');
assert.match(read('app/supplier/portal/messages/page.tsx'), /<ChatWorkspace side="supplier"/);
assert.match(read('app/(public)/buyer/account/messages/page.tsx'), /<ChatWorkspace side="buyer"/);
assert.match(read('components/supplier-sidebar.tsx'), /\/supplier\/portal\/messages/);
const migration = read('supabase/migrations/20261110_supplier_chat.sql');
assert.match(migration, /chat_conversations_pair_key/);
assert.match(migration, /revoke all on table public\.chat_messages from public, anon, authenticated/);
console.log('✅ Chat: body/limits/unread/notify rules, one thread per buyer-supplier, scoped access, no buyer email to supplier, API guards, migration.');
