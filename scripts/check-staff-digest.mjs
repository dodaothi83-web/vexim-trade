// node --experimental-strip-types --no-warnings scripts/check-staff-digest.mjs
// Email tổng hợp buổi sáng cho nhân viên (28/11/2026): admin nhận bản đầy đủ, kinh doanh chỉ phần mình phụ trách,
// thứ Hai đến thứ Sáu từ 8 giờ, mỗi người một thư mỗi ngày, không có việc thì không gửi.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../lib/crm/staff-digest-core.ts';
import * as inactivity from '../lib/supplier-portal/inactivity-core.ts';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const DAY = 86_400_000;
// Thứ Tư 25/11/2026 08:30 giờ Việt Nam = 01:30 UTC.
const WED_830 = Date.parse('2026-11-25T01:30:00Z');

/* ---------- 1. Lịch và ngày ---------- */
assert.equal(core.vnDate(Date.parse('2026-11-24T18:00:00Z')), '2026-11-25', '01:00 giờ VN đã là ngày mới');
assert.deepEqual({ ...core.vnYesterdayRange(WED_830) }, { from: '2026-11-23T17:00:00.000Z', to: '2026-11-24T17:00:00.000Z', day: '2026-11-24' });
assert.equal(core.digestWindowOpen(WED_830), true);
assert.equal(core.digestWindowOpen(Date.parse('2026-11-25T00:30:00Z')), false, '7:30 sáng chưa gửi');
assert.equal(core.digestWindowOpen(Date.parse('2026-11-28T02:00:00Z')), false, 'Thứ Bảy không gửi');
assert.equal(core.digestWindowOpen(Date.parse('2026-11-29T02:00:00Z')), false, 'Chủ nhật không gửi');
assert.equal(core.digestKey('u1', WED_830), 'u1:2026-11-25');

/* ---------- 2. Nội dung ---------- */
const content = {
  recipientName: 'Hoa', scope: 'admin', origin: 'https://www.veximtrade.com',
  todo: [{ label: 'Sản phẩm chờ kiểm nội dung', count: 3, href: '/crm/products?view=pending' }, { label: 'Đợt kiểm chờ duyệt', count: 0, href: '/crm/verifications' },
    { label: 'Yêu cầu tìm nguồn chờ tiếp nhận', count: 1, href: '/crm/sourcing' }, { label: 'Giấy chứng nhận chờ duyệt', count: 2, href: '/crm/certificates' }],
  watch: [{ label: 'Nhà cung cấp từ 7 ngày không vào cổng', count: 4, href: '/crm/suppliers', detail: 'A (12 ngày), B (9 ngày)' }],
  yesterday: [{ label: 'RFQ mới', value: 2 }, { label: 'Lượt xem trang công khai', value: null }, { label: 'Nhà cung cấp mới đăng ký', value: 0 }],
};
const mail = core.buildDigestEmail(content);
assert.equal(mail.subject, 'Việc hôm nay trên Vexim: 3 sản phẩm chờ kiểm nội dung, 1 yêu cầu tìm nguồn chờ tiếp nhận và 1 việc khác');
assert.match(mail.text, /^Chào Hoa,/);
assert.match(mail.text, /Việc cần làm\n- 3 sản phẩm chờ kiểm nội dung: https:\/\/www\.veximtrade\.com\/crm\/products\?view=pending/);
assert.doesNotMatch(mail.text, /đợt kiểm chờ duyệt/, 'Mục bằng 0 thì không hiện');
assert.match(mail.text, /Cần để ý\n- 4 nhà cung cấp từ 7 ngày không vào cổng \(A \(12 ngày\), B \(9 ngày\)\)/);
assert.match(mail.text, /Hôm qua\n- RFQ mới: 2\n- Nhà cung cấp mới đăng ký: 0/);
assert.doesNotMatch(mail.text, /Lượt xem trang công khai/, 'Số liệu không đọc được thì bỏ, không ghi 0');
assert.match(mail.text, /Việc gấp như RFQ mới hay chat bị bỏ quên vẫn có email riêng/);
const watchOnly = core.buildDigestEmail({ ...content, todo: [], yesterday: [] });
assert.equal(watchOnly.subject, 'Vexim hôm nay: 4 nhà cung cấp từ 7 ngày không vào cổng');
const sale = core.buildDigestEmail({ ...content, scope: 'sale', recipientName: null, yesterday: [] });
assert.match(sale.text, /^Chào bạn,\n\nĐây là việc của các nhà cung cấp và người mua bạn đang phụ trách\./);
assert.doesNotMatch(sale.text, /Hôm qua/, 'Bản kinh doanh không có số liệu toàn sàn');
assert.equal(core.digestHasContent({ todo: [{ count: 0 }], watch: [] }), false);
const xss = core.buildDigestEmail({ ...content, watch: [{ label: 'X', count: 1, href: '/crm', detail: '<img src=x>' }] });
assert.doesNotMatch(xss.html, /<img src=x>/);
for (const m of [mail, watchOnly, sale]) {
  assert.doesNotMatch(`${m.subject}\n${m.text}`, /[—–→←·•…“”‘’]|\p{Extended_Pictographic}/u, 'Không ký tự máy');
  assert.doesNotMatch(`${m.subject}\n${m.text}`, /chúng tôi|Kính gửi|Trân trọng|quý khách/i);
}

/* ---------- 3. Gửi với kho giả ---------- */
function load(file, mocks) {
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console: { ...console, error() {} }, Date, Promise, Map, Set, Math, Number, JSON, String, Intl,
    require: (id) => { assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id]; } });
  return module.exports;
}
let presence = {};
const mod = load('../lib/crm/staff-digest.ts', {
  'server-only': {},
  '@/lib/auth/scope': { ownerScopeOf: (u) => (u.role === 'sale' ? (u.name ?? '').trim() || '__no_owner__' : null), isOwnedBy: (o, s) => s === null || (o ?? '').toLowerCase() === s.toLowerCase() },
  '@/lib/chat/presence': { presenceKey: { supplier: (id) => `supplier:${id}` }, readPresence: async (_s, keys) => Object.fromEntries(keys.filter((k) => presence[k]).map((k) => [k, presence[k]])) },
  '@/lib/chat/core': { unansweredNeedsStaff: (c) => !!c.needs_staff },
  '@/lib/chat/support-core': { supportHasUnread: (c) => !!c.unread },
  '@/lib/config': { SERVICE_FROM_ADDRESS: 'Vexim Trade <hello@veximtrade.com>' },
  '@/lib/db': { getStore: () => { throw new Error('inject'); } },
  '@/lib/email/send': { transport: async () => { throw new Error('inject'); } },
  '@/lib/email/templates': { wrapPlainEmail: ({ body }) => body },
  '@/lib/public/supplier-seo': { isSyntheticSupplier: (s) => !!s.is_demo },
  '@/lib/rfq/channel': { rfqChannel: (r) => r.channel, UNCLAIMED_RFQ_STATUSES: ['new'] },
  '@/lib/supplier-portal/inactivity-core': inactivity,
  '@/lib/supplier-portal/notify': { notificationOrigin: () => 'https://www.veximtrade.com' },
  '@/lib/supplier-portal/onboarding': { portalApproved: (s) => s.onboarding_status === 'approved' },
  './staff-digest-core': core,
});
const audit = [];
const counts = { suppliers: 0, products: 3, reviews: 0, submissions: 0, certificates: 1 };
const state = {
  users: [
    { id: 'admin1', role: 'admin', name: 'Hoa', email: 'Hoa@Vexim.vn', is_active: true },
    { id: 'old', role: 'admin', name: 'Cũ', email: 'old@vexim.vn', is_active: false },
    { id: 'sale1', role: 'sale', name: 'Minh', email: 'minh@vexim.vn', is_active: true },
    { id: 'sale2', role: 'sale', name: 'Tú', email: 'tu@vexim.vn', is_active: true },
    { id: 'ed', role: 'editor', name: 'E', email: 'e@vexim.vn', is_active: true },
    { id: 'sup', role: 'supplier', name: 'S', email: 's@x.com', is_active: true },
  ],
  suppliers: [
    { id: 's1', name: 'Một', onboarding_status: 'approved', owner_user_id: 'sale1', created_at: '2026-11-24T03:00:00Z' },
    { id: 's2', name: 'Hai', onboarding_status: 'approved', owner_user_id: null, created_at: '2026-10-01T00:00:00Z' },
  ],
  buyers: [{ owner: 'Minh', stage: 'qualified', next_action_date: '2026-11-25' }, { owner: 'Minh', stage: 'lead', next_action_date: null }, { owner: 'Khác', stage: 'lead' }],
};
presence = { 'supplier:s1': new Date(WED_830 - 10 * DAY).toISOString(), 'supplier:s2': new Date(WED_830 - DAY).toISOString() };
const store = {
  listUsers: async () => state.users,
  listSuppliers: async () => state.suppliers,
  listStaffDigestSends: async (since) => audit.filter((a) => a.created_at >= since),
  addAuditLog: async (e) => { audit.push({ ...e, created_at: new Date(WED_830).toISOString() }); return e; },
  countSupplierAccountsPending: async (scope) => (scope ? 0 : counts.suppliers),
  countProductsPendingReview: async (scope) => (scope ? (scope.includes('s1') ? 1 : 0) : counts.products),
  countReviewsAwaitingApproval: async () => counts.reviews,
  countSubmissionsPendingReview: async () => counts.submissions,
  countCertificatesPendingReview: async () => counts.certificates,
  listPendingRfqRouting: async () => [{ channel: 'sourcing', status: 'new' }],
  listSupportConversations: async () => [{ unread: true }],
  listChatConversations: async () => [{ supplier_id: 's1', needs_staff: true, last_message_at: '2026-11-24T05:00:00Z' }],
  listSupplierServiceRequests: async () => [],
  listProducts: async () => [{ supplier_id: 's2', supplier_review_status: 'approved', price_valid_until: '2026-11-20' }],
  listMessages: async () => [{ status: 'failed', created_at: new Date(WED_830 - 3_600_000).toISOString() }],
  listRfqs: async () => [{ created_at: '2026-11-24T04:00:00Z' }, { created_at: '2026-11-20T04:00:00Z' }],
  listMessagesOfKind: async () => [{ status: 'sent', sent_at: '2026-11-24T02:00:00Z' }],
  listBuyers: async () => state.buyers,
};
const sent = [];
const send = async (m) => { sent.push(m); return { ok: true, status: 'sent', provider: 'resend', error: null }; };
// Không có Supabase trong bài kiểm tra: tìm nguồn và lượt xem đọc lỗi thì bỏ, không làm hỏng thư.
const r = await mod.runStaffDigest({ store, send, now: new Date(WED_830), origin: 'https://www.veximtrade.com' });
assert.equal(r.sent, 2, 'Admin đang hoạt động và kinh doanh có người được giao');
assert.equal(r.skipped, 1, 'Kinh doanh chưa được giao ai thì không nhận');
const admin = sent.find((m) => m.to[0] === 'hoa@vexim.vn');
assert.ok(admin, 'Gửi admin bằng email chữ thường');
assert.match(admin.text, /- 3 sản phẩm chờ kiểm nội dung/);
assert.match(admin.text, /- 1 người mua đang chờ trả lời chat/);
assert.match(admin.text, /- 1 người mua chờ nhà cung cấp trả lời quá 48 giờ/);
assert.match(admin.text, /- 1 nhà cung cấp từ 7 ngày không vào cổng \(Một \(10 ngày\)\)/);
assert.match(admin.text, /- 1 sản phẩm có giá sắp hết hoặc đã hết hiệu lực \(1 sản phẩm đã quá hạn giá\)/);
assert.match(admin.text, /- 1 email gửi lỗi trong 24 giờ qua/);
assert.match(admin.text, /- RFQ mới: 1\n- Cuộc chat có tin mới: 1\n- Email tự động đã gửi cho nhà cung cấp: 1/);
assert.match(admin.text, /- Nhà cung cấp mới đăng ký: 1/);
const saleMail = sent.find((m) => m.to[0] === 'minh@vexim.vn');
assert.match(saleMail.text, /- 1 việc hẹn với người mua đến hạn/);
assert.match(saleMail.text, /- 1 người mua mới chưa xử lý/);
assert.match(saleMail.text, /- 1 sản phẩm của bạn chờ kiểm nội dung/);
assert.match(saleMail.text, /- 1 nhà cung cấp từ 7 ngày không vào cổng \(Một/);
assert.doesNotMatch(saleMail.text, /Hai|email gửi lỗi|Hôm qua/, 'Không thấy nhà cung cấp của người khác hay số liệu toàn sàn');
assert.ok(!sent.some((m) => ['old@vexim.vn', 'e@vexim.vn', 's@x.com', 'tu@vexim.vn'].includes(m.to[0])));
assert.deepEqual(audit.map((a) => a.entity_id).sort().join(), 'admin1:2026-11-25,sale1:2026-11-25');
const again = await mod.runStaffDigest({ store, send, now: new Date(WED_830 + 3_600_000), origin: 'https://www.veximtrade.com' });
assert.equal(again.sent, 0, 'Cron chạy mỗi giờ: mỗi người một thư mỗi ngày');
assert.equal((await mod.runStaffDigest({ store, send, now: new Date('2026-11-28T03:00:00Z') })).sent, 0, 'Thứ Bảy không gửi');
const broken = await mod.runStaffDigest({ store: { ...store, listStaffDigestSends: async () => { throw new Error('down'); } }, send, now: new Date(WED_830 + DAY) });
assert.equal(broken.sent, 0); assert.ok(broken.error, 'Không đọc được dấu đã gửi: bỏ cả lượt');
// Ngày không có việc: không gửi
audit.length = 0; sent.length = 0;
Object.assign(counts, { products: 0, certificates: 0 });
const quiet = { ...store, countProductsPendingReview: async () => 0, listPendingRfqRouting: async () => [], listSupportConversations: async () => [], listChatConversations: async () => [],
  listProducts: async () => [], listMessages: async () => [], listBuyers: async () => [] };
presence = { 'supplier:s1': new Date(WED_830).toISOString(), 'supplier:s2': new Date(WED_830).toISOString() };
assert.equal((await mod.runStaffDigest({ store: quiet, send, now: new Date(WED_830) })).sent, 0, 'Không có việc thì không gửi');

/* ---------- 4. Nối vào hệ thống ---------- */
assert.match(read('../app/api/cron/rfq-sla/route.ts'), /staffDigest = await runStaffDigest\(\{ store \}\)/);
for (const f of ['../lib/db/local.ts', '../lib/db/supabase.ts']) assert.match(read(f), /async listStaffDigestSends\(sinceIso\)/, f);
assert.match(read('../scripts/check-email-copy.mjs'), /lib\/crm\/staff-digest-core\.ts/);

console.log('✅ Staff digest: weekdays from 8:00 VN, one per person per day, admin full queue + watch + yesterday, sales scoped to own suppliers/buyers, nothing to do means no email.');
