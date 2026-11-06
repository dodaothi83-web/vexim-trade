// node --experimental-strip-types --no-warnings scripts/check-chat-notify.mjs
// Email báo tin nhắn: chờ 10 phút, bỏ qua khi người nhận online, gộp nhiều cuộc vào một thư,
// nhắc đúng một lần sau 24 giờ, không gửi trùng khi hai lần quét chạy cùng lúc, gửi lỗi thì thử lại.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../lib/chat/core.ts';

const T0 = Date.parse('2026-11-07T08:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60_000, HOUR = 60 * MIN;

/* ---------- 1. Quy tắc thuần ---------- */
const base = { lastMessageAt: iso(T0), fromOtherSide: true, readAt: null, notifiedAt: null, remindedAt: null };
assert.equal(core.notificationDue(base, false, T0 + 5 * MIN), null, 'Chưa đủ 10 phút');
assert.equal(core.notificationDue(base, false, T0 + 10 * MIN), 'first');
assert.equal(core.notificationDue(base, true, T0 + 60 * MIN), null, 'Người nhận đang online thì không gửi');
assert.equal(core.notificationDue({ ...base, readAt: iso(T0 + MIN) }, false, T0 + HOUR), null, 'Đã đọc thì không gửi');
assert.equal(core.notificationDue({ ...base, fromOtherSide: false }, false, T0 + HOUR), null, 'Tin của chính mình không báo');
const notified = { ...base, notifiedAt: iso(T0 + 10 * MIN) };
assert.equal(core.notificationDue(notified, false, T0 + 20 * HOUR), null, 'Đã báo, chưa tới 24 giờ');
assert.equal(core.notificationDue(notified, false, T0 + 25 * HOUR), 'reminder');
assert.equal(core.notificationDue({ ...notified, remindedAt: iso(T0 + 25 * HOUR) }, false, T0 + 80 * HOUR), null, 'Nhắc đúng một lần');
assert.equal(core.notificationDue({ ...notified, lastMessageAt: iso(T0 + 2 * HOUR), readAt: iso(T0 + HOUR) }, false, T0 + 2 * HOUR + 11 * MIN), 'first', 'Đã đọc rồi có tin mới thì là đợt mới');

/* ---------- 2. Bộ quét với kho giả ---------- */
function load(file, mocks) {
  const out = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console: { ...console, error() {} }, Date, Promise, process, require: (id) => {
    if (id === '@/lib/brand/colors.json') return { default: { primary: '#123', surface: '#eee', muted: '#999' } };
    assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id];
  } });
  return module.exports;
}
const chats = [], supports = [], sent = [];
let presenceMap = {}, failSend = false;
const store = {
  listChatConversations: async () => chats,
  listSupportConversations: async () => supports,
  getChatPresence: async (keys) => Object.fromEntries(keys.filter((k) => presenceMap[k]).map((k) => [k, presenceMap[k]])),
  claimChatNotification: async (table, id, column, expected, next) => {
    const row = (table === 'chat_conversations' ? chats : supports).find((c) => c.id === id);
    if (!row || (row[column] ?? null) !== expected) return false;
    row[column] = next; return true;
  },
  listUsers: async () => [
    { id: 'u-sup', is_active: true, role: 'supplier', supplier_id: 's1', email: 'Owner@Mekong.vn' },
    { id: 'u-dung', is_active: true, role: 'sale', email: 'dung@veximtrade.com' },
  ],
  getSupplier: async (id) => ({ id, name: 'Mekong Agri', display_name: 'Mekong Agri', email: 'contact@mekong.vn' }),
};
const notify = load('../lib/chat/notify.ts', {
  'server-only': {}, 'next/server': { after: () => { throw new Error('outside request'); } },
  '@/lib/config': { FROM_ADDRESS: 'Vexim <hello@veximtrade.com>', SERVICE_FROM_ADDRESS: 'Vexim <service@veximtrade.com>' },
  '@/lib/email/send': { transport: async (m) => { if (failSend) return { ok: false, status: 'failed' }; sent.push(m); return { ok: true, status: 'sent' }; } },
  '@/lib/email/templates': { escapeHtml: (s) => String(s).replaceAll('<', '&lt;'), wrapPlainEmail: ({ body }) => body },
  '@/lib/supplier-portal/notify': { notificationOrigin: () => 'https://www.veximtrade.com' },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  './core': core,
  './presence': load('../lib/chat/presence.ts', {}),
  './service': { buyerLabel: async () => 'Acme GmbH', supplierName: (s) => s.display_name },
  './support': { deskInbox: () => 'hello@veximtrade.com' },
});
const chat = (id, extra) => ({ id, buyer_email: 'buyer@acme.de', supplier_id: 's1', product_name: 'Cashew W320', last_message_preview: 'Price for 1 container? <b>',
  last_message_at: iso(T0), last_sender: 'buyer', buyer_last_read_at: iso(T0), supplier_last_read_at: null, buyer_notified_at: null, supplier_notified_at: null,
  buyer_reminded_at: null, supplier_reminded_at: null, created_at: iso(T0), ...extra });
chats.push(chat('c1'), chat('c2', { product_name: 'Pepper 500 g/l', buyer_email: 'other@buyer.com' }));

assert.equal((await notify.runChatNotifications(store, T0 + 5 * MIN)).claimed, 0, 'Chưa đủ 10 phút thì chưa gửi');
presenceMap = { 'supplier:s1': iso(T0 + 11 * MIN) };
assert.equal((await notify.runChatNotifications(store, T0 + 12 * MIN)).claimed, 0, 'Nhà cung cấp đang online thì không gửi');
presenceMap = {};

await notify.runChatNotifications(store, T0 + 15 * MIN);
assert.equal(sent.length, 1, 'Hai cuộc của cùng nhà cung cấp gộp vào một thư');
assert.deepEqual([...sent[0].to], ['owner@mekong.vn']);
assert.match(sent[0].subject, /2 cuộc trò chuyện/);
assert.match(sent[0].html, /Cashew W320/); assert.match(sent[0].html, /Pepper 500 g\/l/);
assert.match(sent[0].html, /\/supplier\/portal\/messages\?c=c1/);
assert.match(sent[0].html, /&lt;b>/, 'Nội dung được thoát HTML');
assert.doesNotMatch(sent[0].html + sent[0].text + sent[0].subject, /buyer@acme\.de|other@buyer\.com/, 'Không lộ email người mua');

assert.equal((await notify.runChatNotifications(store, T0 + 3 * HOUR)).claimed, 0, 'Đã báo, chưa đọc: không gửi lại trước 24 giờ');
await notify.runChatNotifications(store, T0 + 25 * HOUR);
assert.equal(sent.length, 2);
assert.match(sent[1].subject, /^Nhắc:/, 'Sau 24 giờ nhắc một lần');
await notify.runChatNotifications(store, T0 + 60 * HOUR);
assert.equal(sent.length, 2, 'Nhắc xong thì dừng');

// Nhà cung cấp trả lời c1: người mua nhận thư; cùng lúc đội Vexim trả lời người mua đó → một thư gộp.
Object.assign(chats[0], { last_sender: 'supplier', last_message_at: iso(T0 + 61 * HOUR), supplier_last_read_at: iso(T0 + 61 * HOUR), last_message_preview: 'USD 6.2/kg FOB' });
supports.push({ id: 's-1', buyer_email: 'buyer@acme.de', assigned_to: 'u-dung', last_message_at: iso(T0 + 61 * HOUR), last_sender: 'staff', last_message_preview: 'We found 2 suppliers.',
  buyer_last_read_at: iso(T0), staff_last_read_at: iso(T0 + 61 * HOUR), buyer_notified_at: null, staff_notified_at: null, created_at: iso(T0) });
await notify.runChatNotifications(store, T0 + 61 * HOUR + 11 * MIN);
const buyerMail = sent.at(-1);
assert.deepEqual([...buyerMail.to], ['buyer@acme.de']);
assert.match(buyerMail.html, /Mekong Agri/); assert.match(buyerMail.html, /Vexim Trade team/);
assert.match(buyerMail.html, /\/buyer\/account\/messages\?c=c1/); assert.match(buyerMail.html, /\?support=1/);
assert.doesNotMatch(buyerMail.html + buyerMail.text, /dung@veximtrade\.com|owner@mekong/i, 'Người mua không thấy email nội bộ hay nhà cung cấp');

// Người mua nhắn Vexim: đã có người phụ trách thì báo đúng người; chưa ai nhận thì báo hộp thư chung.
Object.assign(supports[0], { last_sender: 'buyer', last_message_at: iso(T0 + 70 * HOUR), buyer_last_read_at: iso(T0 + 70 * HOUR), last_message_preview: 'Thanks!' });
supports.push({ id: 's-2', buyer_email: 'new@buyer.com', assigned_to: null, last_message_at: iso(T0 + 70 * HOUR), last_sender: 'buyer', last_message_preview: 'Hello',
  buyer_last_read_at: iso(T0 + 70 * HOUR), staff_last_read_at: null, buyer_notified_at: null, staff_notified_at: null, created_at: iso(T0) });
const before = sent.length;
await notify.runChatNotifications(store, T0 + 70 * HOUR + 11 * MIN);
const staffMails = sent.slice(before);
assert.deepEqual(staffMails.map((m) => m.to[0]).sort(), ['dung@veximtrade.com', 'hello@veximtrade.com']);
assert.ok(staffMails.every((m) => /\/crm\/support/.test(m.html)));

// Gửi lỗi: trả mốc lại, lần quét sau gửi được.
chats.push(chat('c3', { last_message_at: iso(T0 + 80 * HOUR), supplier_id: 's1' }));
failSend = true;
const failedRun = await notify.runChatNotifications(store, T0 + 80 * HOUR + 11 * MIN);
assert.equal(failedRun.failed, 1);
assert.equal(chats[2].supplier_notified_at, null, 'Gửi lỗi thì trả lại mốc cũ');
failSend = false;
assert.equal((await notify.runChatNotifications(store, T0 + 80 * HOUR + 15 * MIN)).emails, 1, 'Lần sau gửi lại được');

// Hai lần quét cùng lúc: mỗi cuộc chỉ được báo một lần.
chats.push(chat('c4', { last_message_at: iso(T0 + 90 * HOUR), supplier_id: 's1' }));
const beforeRace = sent.length;
const [r1, r2] = await Promise.all([notify.runChatNotifications(store, T0 + 90 * HOUR + 11 * MIN), notify.runChatNotifications(store, T0 + 90 * HOUR + 11 * MIN)]);
assert.ok(r1.claimed + r2.claimed >= 1);
assert.equal(sent.slice(beforeRace).filter((m) => /messages\?c=c4/.test(m.html)).length, 1, 'Không gửi trùng khi hai lần quét chạy cùng lúc');

// Chưa chạy migration cột nhắc: email đầu vẫn chạy, lần nhắc bị bỏ qua, không lỗi.
const brokenStore = { ...store, claimChatNotification: async (table, id, column, expected, next) => {
  if (column.endsWith('_reminded_at')) throw new Error('column does not exist');
  return store.claimChatNotification(table, id, column, expected, next);
} };
await notify.runChatNotifications(brokenStore, T0 + 200 * HOUR);

/* ---------- 3. Nối dây ---------- */
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
for (const f of ['lib/chat/service.ts', 'lib/chat/support.ts']) assert.doesNotMatch(read(f), /transport\(/, `${f}: không gửi email ngay khi có tin`);
assert.match(read('app/api/cron/chat-notify/route.ts'), /CRON_SECRET/);
for (const f of ['app/api/chat/route.ts', 'app/api/support/route.ts', 'app/api/crm/support/route.ts']) assert.match(read(f), /scheduleChatNotifications\(/, `${f}: kích hoạt bộ quét`);
assert.match(read('supabase/migrations/20261113_chat_notify_reminders.sql'), /add column if not exists supplier_reminded_at/);

console.log('✅ Email báo tin: chờ 10 phút, bỏ qua khi online, gộp theo người nhận, nhắc một lần sau 24 giờ, không gửi trùng, gửi lỗi thì thử lại.');
