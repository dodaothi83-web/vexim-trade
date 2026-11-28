// node --experimental-strip-types --no-warnings scripts/check-supplier-inactivity.mjs
// Nhà cung cấp lâu không vào cổng (28/11/2026): số ngày chưa vào trong CRM, khối nhãn hoạt động trong cổng,
// thư nhắc tự động sau 5 và 14 ngày (rồi thôi tới khi họ vào lại), văn phong tự nhiên, không gửi trùng.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../lib/supplier-portal/inactivity-core.ts';
import * as activity from '../lib/public/supplier-activity.ts';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const DAY = 86_400_000;
// Thứ Tư 25/11/2026, 09:00 giờ Việt Nam.
const NOW = Date.parse('2026-11-25T02:00:00Z');
const ago = (days, extraMs = 0) => new Date(NOW - days * DAY - extraMs).toISOString();

/* ---------- 1. Số ngày và chữ cho CRM ---------- */
assert.equal(core.daysSinceSeen(ago(0, 3_600_000), NOW), 0);
assert.equal(core.daysSinceSeen(ago(6, 60_000), NOW), 6);
assert.equal(core.daysSinceSeen(null, NOW), null);
assert.equal(core.lastSeenText(0), 'Hôm nay');
assert.equal(core.lastSeenText(1), 'Hôm qua');
assert.equal(core.lastSeenText(6), '6 ngày chưa vào');
assert.equal(core.lastSeenText(null), 'Chưa vào lần nào');
assert.equal(core.lastSeenAgo(6), '6 ngày trước');
assert.deepEqual([core.lastSeenTone(3), core.lastSeenTone(7), core.lastSeenTone(30), core.lastSeenTone(null)].join(), 'ok,warn,bad,bad');

/* ---------- 2. Lịch thư nhắc ---------- */
const due = (lastSeenAt, sentAt = [], otherReminderAt = null, nowMs = NOW) => core.inactivityReminderDue({ lastSeenAt, sentAt, otherReminderAt, nowMs });
assert.equal(due(ago(4)), null, 'Chưa đủ 5 ngày');
assert.equal(due(ago(5)), 0, 'Đủ 5 ngày: thư 1');
assert.equal(due(ago(9), [ago(4)]), null, 'Đã gửi thư 1, chưa đủ 14 ngày');
assert.equal(due(ago(14), [ago(9)]), 1, 'Đủ 14 ngày: thư 2');
assert.equal(due(ago(40), [ago(26), ago(19)]), null, 'Đủ 2 thư một đợt thì thôi');
assert.equal(due(ago(20), [ago(2)]), null, 'Vắng lâu từ trước: thư 2 vẫn cách thư 1 ít nhất 7 ngày');
assert.equal(due(ago(20), [ago(8)]), 1);
assert.equal(due(ago(6), [ago(30), ago(20)]), 0, 'Vào lại rồi vắng tiếp: đợt mới');
assert.equal(due(null), null, 'Chưa từng có mốc: không đoán, không gửi');
assert.equal(due(ago(6), [], ago(1)), null, 'Vừa nhận thư nhắc hồ sơ: không dồn hai thư');
assert.equal(due(ago(6), [], ago(4)), 0);
assert.equal(core.inactivityRunsToday(Date.parse('2026-11-30T02:00:00Z')), false, 'Thứ Hai đã có email báo cáo tuần');
assert.equal(core.inactivityRunsToday(NOW), true);

/* ---------- 3. Thư và bộ quét với kho giả ---------- */
function load(file, mocks) {
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console: { ...console, error() {} }, Date, Promise, Map, Set, Math, Number, JSON, String,
    require: (id) => { assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id]; } });
  return module.exports;
}
const escapeHtml = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let presence = {};
const mod = load('../lib/supplier-portal/inactivity.ts', {
  'server-only': {},
  '@/lib/chat/presence': { presenceKey: { supplier: (id) => `supplier:${id}` }, readPresence: async (_s, keys) => Object.fromEntries(keys.filter((k) => presence[k]).map((k) => [k, presence[k]])) },
  '@/lib/chat/core': { hasUnread: (c, side) => c.last_sender !== side && (!c.supplier_last_read_at || c.supplier_last_read_at < c.last_message_at) },
  '@/lib/config': { SERVICE_FROM_ADDRESS: 'Vexim Trade <hello@veximtrade.com>' },
  '@/lib/db': { getStore: () => { throw new Error('inject store'); } },
  '@/lib/email/send': { transport: async () => { throw new Error('inject send'); } },
  '@/lib/email/templates': { escapeHtml, wrapPlainEmail: ({ title, body }) => `<h1>${escapeHtml(title)}</h1>${body}` },
  '@/lib/public/supplier-activity': activity,
  '@/lib/public/supplier-seo': { isSyntheticSupplier: (s) => !!s.is_demo },
  './inactivity-core': core,
  './notify': { notificationOrigin: () => 'https://www.veximtrade.com' },
  './onboarding': { portalApproved: (s) => s.onboarding_status === 'approved' },
  './reminders': { SUPPLIER_REMINDER_KIND: 'supplier_reminder' },
});

const supplier = { id: 's1', name: 'CÔNG TY TNHH HẠT ĐIỀU BÌNH PHƯỚC', display_name: 'Hạt điều Bình Phước', trade_name: null, contact_name: 'Lan', onboarding_status: 'approved', status: 'published' };
const first = mod.buildInactivityEmail({ supplier, origin: 'https://www.veximtrade.com',
  facts: { days: 6, step: 0, unreadChats: 2, views7d: 14, published: true, publicLabel: 'Active this week' } });
assert.equal(first.subject, '2 người mua đang chờ bạn trả lời trên Vexim Trade');
assert.match(first.text, /^Chào Lan,/);
assert.match(first.text, /Đã 6 ngày bạn chưa vào cổng nhà cung cấp của Hạt điều Bình Phước/);
assert.match(first.text, /Có 2 người mua đã nhắn tin và đang chờ bạn trả lời/);
assert.match(first.text, /14 lượt xem trong 7 ngày qua/);
assert.match(first.text, /Hiện hồ sơ đang ghi "Active this week"\. Chỉ cần mở cổng là nhãn đổi lại thành "Active today"/);
assert.match(first.text, /Đọc tin nhắn: https:\/\/www\.veximtrade\.com\/supplier\/portal\/messages/);
assert.match(first.text, /Vexim Trade$/);
const quiet = mod.buildInactivityEmail({ supplier: { ...supplier, contact_name: null }, origin: 'https://x',
  facts: { days: 5, step: 0, unreadChats: 0, views7d: 0, published: true, publicLabel: 'Active this week' } });
assert.equal(quiet.subject, 'Đã 5 ngày bạn chưa vào Vexim Trade');
assert.match(quiet.text, /^Chào bạn,/);
assert.doesNotMatch(quiet.text, /lượt xem|người mua đã nhắn/, 'Không có số liệu thì không nói');
const viewed = mod.buildInactivityEmail({ supplier, origin: 'https://x', facts: { days: 5, step: 0, unreadChats: 0, views7d: 9, published: true, publicLabel: 'Active this week' } });
assert.equal(viewed.subject, 'Hồ sơ Hạt điều Bình Phước có 9 lượt xem trong 7 ngày qua');
const last = mod.buildInactivityEmail({ supplier, origin: 'https://x', facts: { days: 31, step: 1, unreadChats: 0, views7d: null, published: true, publicLabel: null } });
assert.equal(last.subject, 'Hạt điều Bình Phước đã 31 ngày chưa cập nhật trên Vexim Trade');
assert.match(last.text, /nhãn hoạt động đã ẩn vì quá 30 ngày/);
assert.match(last.text, /thư nhắc cuối của đợt này/);
const unpublished = mod.buildInactivityEmail({ supplier, origin: 'https://x', facts: { days: 5, step: 0, unreadChats: 0, views7d: 0, published: false, publicLabel: null } });
assert.doesNotMatch(unpublished.text, /hồ sơ công khai/, 'Hồ sơ chưa công khai thì không nói về nhãn');
const xss = mod.buildInactivityEmail({ supplier: { ...supplier, display_name: '<b>X</b>' }, origin: 'https://x', facts: { days: 5, step: 0, unreadChats: 0, views7d: 0, published: false, publicLabel: null } });
assert.doesNotMatch(xss.html, /<b>X<\/b>/, 'Tên doanh nghiệp được escape');
for (const mail of [first, quiet, viewed, last]) {
  const all = `${mail.subject}\n${mail.text}`;
  assert.doesNotMatch(all, /[—–→←·•…“”‘’]|\p{Extended_Pictographic}/u, 'Không ký tự máy');
  assert.doesNotMatch(all, /chúng tôi|Kính gửi|Trân trọng|quý khách|Anh\/Chị|kính mong/i, 'Không giọng máy');
}

// Bộ quét: kho giả
const state = { suppliers: [], users: [], messages: [], chats: [] };
const store = {
  listSuppliers: async () => state.suppliers,
  listUsers: async () => state.users,
  listMessagesOfKind: async (kind) => state.messages.filter((m) => m.kind === kind),
  listChatConversations: async ({ supplierId }) => state.chats.filter((c) => c.supplier_id === supplierId),
  addMessage: async (m) => { state.messages.push({ ...m, id: `m${state.messages.length}`, created_at: m.sent_at ?? new Date(NOW).toISOString() }); },
};
const sent = [];
const send = async (mail) => { sent.push(mail); return { ok: true, status: 'sent', provider: 'resend', error: null }; };
state.suppliers = [supplier, { ...supplier, id: 's2', name: 'B', display_name: 'B' }, { ...supplier, id: 'demo', is_demo: true }, { ...supplier, id: 's4', onboarding_status: 'submitted' }];
state.users = [{ role: 'supplier', supplier_id: 's1', email: 'Lan@Example.com', is_active: true }, { role: 'supplier', supplier_id: 'demo', email: 'demo@x.com', is_active: true },
  { role: 'supplier', supplier_id: 's4', email: 's4@x.com', is_active: true }, { role: 'supplier', supplier_id: 's1', email: 'old@x.com', is_active: false }];
state.chats = [{ supplier_id: 's1', last_sender: 'buyer', last_message_at: ago(3), supplier_last_read_at: null }, { supplier_id: 's1', last_sender: 'supplier', last_message_at: ago(8), supplier_last_read_at: ago(8) }];
presence = { 'supplier:s1': ago(6), 'supplier:s2': ago(2), 'supplier:demo': ago(20), 'supplier:s4': ago(20) };
const run = (nowMs) => mod.sendSupplierInactivityReminders({ store, send, now: new Date(nowMs), origin: 'https://www.veximtrade.com', readViews: async () => 3 });

let r = await run(NOW);
assert.equal(r.sent, 1, 'Chỉ nhà cung cấp đã mở cổng, không phải hồ sơ thử, vắng đủ 5 ngày');
assert.deepEqual(sent[0].to.join(), 'lan@example.com', 'Gửi tài khoản đang hoạt động của chính nhà cung cấp');
assert.equal(sent[0].subject, '1 người mua đang chờ bạn trả lời trên Vexim Trade');
assert.match(sent[0].text, /3 lượt xem/);
assert.equal(state.messages[0].thread_id, 'supplier-inactivity-s1');
r = await run(NOW + 3_600_000);
assert.equal(r.sent, 1 - 1, 'Chạy lại cùng ngày không gửi trùng');
r = await run(NOW + 8 * DAY);
assert.equal(r.sent, 1, 'Đủ 14 ngày vắng: thư 2');
assert.match(sent[1].text, /thư nhắc cuối/);
r = await run(NOW + 20 * DAY);
assert.equal(r.sent, 0, 'Sau thư 2 thì thôi');
presence['supplier:s1'] = new Date(NOW + 21 * DAY).toISOString();
r = await run(NOW + 27 * DAY + 3_600_000); // thứ Ba (thứ Hai có báo cáo tuần)
assert.equal(r.sent, 1, 'Vào lại rồi vắng 5 ngày: đợt mới');
assert.equal(sent.length, 3);
const failing = await mod.sendSupplierInactivityReminders({ store: { ...store, listMessagesOfKind: async () => { throw new Error('db down'); } }, send, now: new Date(NOW) });
assert.equal(failing.sent, 0, 'Không đọc được nhật ký thư thì bỏ cả lượt, không gửi trùng');
assert.ok(failing.error);

/* ---------- 4. Nối vào hệ thống ---------- */
assert.match(read('../lib/supplier-portal/reminders.ts'), /thread_id && !message\.thread_id\.startsWith\("supplier-reminder-"\)\) continue/, 'Thư nhắc hồ sơ không tính thư vắng mặt vào thời gian chờ của nó');
assert.match(read('../app/api/cron/rfq-sla/route.ts'), /await sendSupplierInactivityReminders\(\{ store \}\)/);
assert.match(read('../app/api/cron/supplier-reminders/route.ts'), /await sendSupplierInactivityReminders\(\)/);
assert.match(read('../scripts/check-email-copy.mjs'), /lib\/supplier-portal\/inactivity\.ts/, 'Thư vắng mặt nằm trong bài kiểm tra văn phong thư');
const table = read('../components/supplier-table.tsx');
assert.match(table, /Truy cập gần nhất/);
assert.match(table, /lastSeenText\(days\)/);
assert.match(read('../app/crm/suppliers/page.tsx'), /presenceKey\.supplier\(s\.id\)/);
assert.match(read('../app/crm/suppliers/[slug]/page.tsx'), /Truy cập gần nhất: \$\{lastSeenAgo\(daysSinceSeen\(seenAt\)\)\}/);
const portal = read('../app/supplier/portal/page.tsx');
assert.match(portal, /data-testid="portal-activity-label"/);
assert.match(portal, /\{publishedProfile && <section/, 'Khối nhãn chỉ hiện khi hồ sơ đã công khai');
const overview = read('../lib/i18n/portal/overview.ts');
for (const t of ['Nhãn hoạt động của bạn', 'Your activity label', 'Mỗi ngày mở cổng một lần']) assert.ok(overview.includes(t), t);
assert.deepEqual(Object.keys(activity.SUPPLIER_ACTIVITY_LABELS).join(), 'online,day,week,month', 'Trang công khai giữ 4 mốc');

console.log('✅ Supplier inactivity: CRM days since last visit, portal activity panel, reminders at 5 and 14 days then stop until they return, natural copy, no duplicates.');
