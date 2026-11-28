// node --experimental-strip-types --no-warnings scripts/check-supplier-lifecycle-mail.mjs
// Hai thư theo mốc (28/11/2026): nhắc đăng sản phẩm đầu tiên (3 và 10 ngày sau khi mở cổng, rồi thôi)
// và báo hồ sơ đã lên sàn (một lần, khi công khai lần đầu). Văn phong tự nhiên, không gửi trùng.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../lib/supplier-portal/inactivity-core.ts';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const DAY = 86_400_000;
const NOW = Date.parse('2026-11-25T02:00:00Z'); // thứ Tư
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const escapeHtml = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function load(file, mocks) {
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console: { ...console, error() {} }, Date, Promise, Map, Set, Math, Number, JSON, String,
    require: (id) => { assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id]; } });
  return module.exports;
}
const mod = load('../lib/supplier-portal/lifecycle-mail.ts', {
  'server-only': {},
  '@/lib/config': { SERVICE_FROM_ADDRESS: 'Vexim Trade <hello@veximtrade.com>' },
  '@/lib/db': { getStore: () => { throw new Error('inject store'); } },
  '@/lib/email/send': { transport: async () => { throw new Error('inject send'); } },
  '@/lib/email/templates': { escapeHtml, wrapPlainEmail: ({ title, body }) => `<h1>${escapeHtml(title)}</h1>${body}` },
  '@/lib/public/supplier-seo': { isSyntheticSupplier: (s) => !!s.is_demo },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  './inactivity-core': core,
  './notify': { notificationOrigin: () => 'https://www.veximtrade.com' },
  './onboarding': { portalApproved: (s) => s.onboarding_status === 'approved' },
  './reminders': { SUPPLIER_REMINDER_KIND: 'supplier_reminder' },
});

/* ---------- 1. Quy tắc nhắc đăng sản phẩm ---------- */
const st = (...statuses) => mod.firstProductState(statuses.map((s) => ({ supplier_review_status: s })));
assert.deepEqual({ ...st() }, { live: 0, unfinished: 0 });
assert.deepEqual({ ...st('draft', 'changes_requested') }, { live: 0, unfinished: 2 });
assert.equal(st('pending').live, 1, 'Đang chờ Vexim duyệt: không nhắc');
assert.equal(st('paused').live, 1, 'Đã từng đăng rồi tạm ẩn: không nhắc "chưa có sản phẩm"');
assert.equal(st(null).live, 1, 'Sản phẩm cũ không có trạng thái là đã đăng');
const due = (approvedAt, state = st(), sentAt = [], other = null) => mod.firstProductReminderDue({ approvedAt, state, sentAt, otherReminderAt: other, nowMs: NOW });
assert.equal(due(ago(2)), null, 'Chưa đủ 3 ngày');
assert.equal(due(ago(3)), 0);
assert.equal(due(ago(3), st('approved')), null, 'Đã có sản phẩm');
assert.equal(due(ago(9), st(), [ago(6)]), null, 'Chưa đủ 10 ngày');
assert.equal(due(ago(10), st(), [ago(7)]), 1);
assert.equal(due(ago(30), st(), [ago(2)]), null, 'Thư 2 cách thư 1 ít nhất 5 ngày');
assert.equal(due(ago(40), st(), [ago(30), ago(20)]), null, 'Tối đa 2 thư, rồi thôi hẳn');
assert.equal(due(null), null, 'Không biết ngày mở cổng: không đoán');
assert.equal(due(ago(5), st(), [], ago(1)), null, 'Vừa có thư nhắc khác: không dồn');

/* ---------- 2. Nội dung thư ---------- */
const supplier = { id: '11111111-1111-1111-1111-111111111111', slug: 'hat-dieu-binh-phuoc', name: 'CÔNG TY TNHH HẠT ĐIỀU BÌNH PHƯỚC', display_name: 'Hạt điều Bình Phước', trade_name: null, contact_name: 'Lan' };
const origin = 'https://www.veximtrade.com';
const a = mod.buildFirstProductEmail({ supplier, step: 0, days: 3, state: st(), origin });
assert.equal(a.subject, 'Đăng sản phẩm đầu tiên của Hạt điều Bình Phước lên Vexim Trade');
assert.match(a.text, /^Chào Lan,/);
assert.match(a.text, /đã mở được 3 ngày nhưng chưa có sản phẩm nào/);
assert.match(a.text, /- Giá tham khảo FOB hoặc CIF và số lượng đặt tối thiểu/);
assert.match(a.text, /Đăng sản phẩm: https:\/\/www\.veximtrade\.com\/supplier\/portal\/products\/new/);
assert.match(a.text, /cách đăng sản phẩm đầu tiên: https:\/\/www\.veximtrade\.com\/supplier\/portal\/huong-dan\/cach-dang-san-pham-dau-tien/);
const drafts = mod.buildFirstProductEmail({ supplier, step: 0, days: 4, state: st('draft', 'draft'), origin });
assert.equal(drafts.subject, 'Sản phẩm của Hạt điều Bình Phước chưa được gửi duyệt');
assert.match(drafts.text, /đã bắt đầu soạn 2 sản phẩm nhưng chưa gửi duyệt/);
assert.match(drafts.text, /Mở danh sách sản phẩm: https:\/\/www\.veximtrade\.com\/supplier\/portal\/products\n/);
const last = mod.buildFirstProductEmail({ supplier: { ...supplier, contact_name: null }, step: 1, days: 10, state: st(), origin });
assert.equal(last.subject, 'Hạt điều Bình Phước chưa có sản phẩm nào trên Vexim Trade');
assert.match(last.text, /^Chào bạn,/);
assert.match(last.text, /Đây là thư nhắc cuối về việc này\./);
assert.match(last.text, /chup-anh-san-pham-bang-dien-thoai/);
const pub = mod.buildPublishedEmail({ supplier, liveProducts: 0, origin });
assert.equal(pub.subject, 'Hồ sơ Hạt điều Bình Phước đã lên Vexim Trade');
assert.match(pub.text, /https:\/\/www\.veximtrade\.com\/suppliers\/hat-dieu-binh-phuoc/);
assert.match(pub.text, /Gửi đường dẫn hồ sơ cho khách hàng quen/);
assert.match(pub.text, /Đăng sản phẩm để người mua tìm thấy bạn/);
const pubWithProducts = mod.buildPublishedEmail({ supplier: { ...supplier, slug: null }, liveProducts: 3, origin });
assert.doesNotMatch(pubWithProducts.text, /Đăng sản phẩm/, 'Đã có sản phẩm thì không nhắc đăng');
assert.match(pubWithProducts.text, /\/suppliers\/11111111-1111-1111-1111-111111111111/, 'Chưa có slug thì dùng id');
const xss = mod.buildPublishedEmail({ supplier: { ...supplier, display_name: '<script>x</script>' }, liveProducts: 1, origin });
assert.doesNotMatch(xss.html, /<script>/);
for (const mail of [a, drafts, last, pub, pubWithProducts]) {
  const all = `${mail.subject}\n${mail.text}`;
  assert.doesNotMatch(all, /[—–→←·•…“”‘’]|\p{Extended_Pictographic}/u, 'Không ký tự máy');
  assert.doesNotMatch(all, /chúng tôi|Kính gửi|Trân trọng|quý khách|Anh\/Chị|kính mong/i, 'Không giọng máy');
  assert.match(mail.text, /Vexim Trade$/);
}

/* ---------- 3. Gửi với kho giả ---------- */
const state = { suppliers: [], users: [], messages: [], products: {}, decisions: [] };
const store = {
  listSuppliers: async () => state.suppliers,
  getSupplier: async (id) => state.suppliers.find((s) => s.id === id) ?? null,
  listUsers: async () => state.users,
  listMessagesOfKind: async (k) => state.messages.filter((m) => m.kind === k),
  listSupplierOnboardingDecisions: async () => state.decisions,
  listProductsBySupplier: async (id) => state.products[id] ?? [],
  addMessage: async (m) => { state.messages.push({ ...m, created_at: m.sent_at ?? new Date(NOW).toISOString() }); },
};
const sent = [];
const send = async (mail) => { sent.push(mail); return { ok: true, status: 'sent', provider: 'resend', error: null }; };
state.suppliers = [
  { ...supplier, onboarding_status: 'approved', status: 'draft' },
  { ...supplier, id: 's2', name: 'B', display_name: 'B', onboarding_status: 'approved', status: 'published' },
  { ...supplier, id: 'demo', is_demo: true, onboarding_status: 'approved', status: 'published' },
  { ...supplier, id: 'nolog', onboarding_status: 'approved', status: 'published' },
];
state.users = [{ role: 'supplier', supplier_id: supplier.id, email: 'Lan@Example.com', is_active: true }, { role: 'supplier', supplier_id: 's2', email: 'b@x.com', is_active: true },
  { role: 'supplier', supplier_id: 'demo', email: 'd@x.com', is_active: true }, { role: 'supplier', supplier_id: 'nolog', email: 'n@x.com', is_active: true }];
state.decisions = [{ entity_id: supplier.id, action: 'supplier.portal_access_approved', created_at: ago(4) },
  { entity_id: 's2', action: 'supplier.portal_access_approved', created_at: ago(4) }, { entity_id: 'demo', action: 'supplier.portal_access_approved', created_at: ago(4) }];
state.products = { s2: [{ supplier_review_status: 'approved' }] };
const run = (ms) => mod.sendFirstProductReminders({ store, send, now: new Date(ms), origin });
let r = await run(NOW);
assert.equal(r.sent, 1, 'Chỉ nhà cung cấp chưa có sản phẩm, có ngày mở cổng, không phải hồ sơ thử');
assert.equal(sent[0].to.join(), 'lan@example.com');
assert.equal(state.messages[0].thread_id, `supplier-first-product-${supplier.id}`);
assert.equal((await run(NOW + 3_600_000)).sent, 0, 'Chạy lại cùng ngày không gửi trùng');
assert.equal((await run(NOW + 4 * DAY)).sent, 0, 'Chưa đủ 10 ngày'); // chủ nhật, 8 ngày
assert.equal((await run(NOW + 6 * DAY)).sent, 1, 'Đủ 10 ngày: thư 2'); // thứ Ba
assert.equal((await run(NOW + 30 * DAY)).sent, 0, 'Sau 2 thư thì thôi');
assert.equal((await run(Date.parse('2026-11-30T02:00:00Z'))).sent, 0, 'Thứ Hai không gửi');
const broken = await mod.sendFirstProductReminders({ store: { ...store, listMessagesOfKind: async () => { throw new Error('down'); } }, send, now: new Date(NOW) });
assert.equal(broken.sent, 0); assert.ok(broken.error, 'Không đọc được nhật ký thư: bỏ cả lượt');

// Hồ sơ lên sàn
sent.length = 0;
assert.equal(await mod.notifySupplierPublished(supplier.id, { store, send, now: new Date(NOW) }), 'skipped', 'Chưa công khai thì không gửi');
state.suppliers[0].status = 'published';
assert.equal(await mod.notifySupplierPublished(supplier.id, { store, send, now: new Date(NOW), origin }), 'sent');
assert.equal(sent[0].subject, 'Hồ sơ Hạt điều Bình Phước đã lên Vexim Trade');
assert.equal(await mod.notifySupplierPublished(supplier.id, { store, send, now: new Date(NOW), origin }), 'skipped', 'Chỉ gửi một lần');
assert.equal(await mod.notifySupplierPublished('demo', { store, send, now: new Date(NOW), origin }), 'skipped', 'Hồ sơ thử không gửi');
assert.equal(sent.length, 1);
assert.equal(await mod.notifySupplierPublished('x', { store: { ...store, getSupplier: async () => { throw new Error('down'); } }, send }), 'failed', 'Lỗi không ném ra ngoài');

/* ---------- 4. Nối vào hệ thống ---------- */
const publication = read('../app/crm/suppliers/[slug]/publication-actions.ts');
assert.match(publication, /status === "published" && supplier\.status !== "published" && !supplier\.is_demo[\s\S]*notifySupplierPublished\(id\)/);
const verification = read('../app/crm/suppliers/[slug]/verification-actions.ts');
assert.match(verification, /const wasPublished = before\.target_level === 1/);
assert.match(verification, /!wasPublished && supplier\?\.status === "published"[\s\S]*notifySupplierPublished\(before\.supplier_id\)/, 'Tự công khai khi duyệt L1 cũng báo');
assert.match(read('../app/api/cron/rfq-sla/route.ts'), /sendFirstProductReminders\(\{ store \}\)[\s\S]*sendSupplierInactivityReminders\(\{ store \}\)/, 'Nhắc sản phẩm chạy trước thư vắng mặt');
assert.match(read('../app/api/cron/supplier-reminders/route.ts'), /await sendFirstProductReminders\(\)/);
assert.match(read('../lib/supplier-portal/reminders.ts'), /!message\.thread_id\.startsWith\("supplier-reminder-"\)/, 'Thư nhắc hồ sơ chỉ tính thread của chính nó');
assert.match(read('../scripts/check-email-copy.mjs'), /lib\/supplier-portal\/lifecycle-mail\.ts/);
assert.ok(fs.existsSync(new URL('../app/supplier/portal/huong-dan/[slug]/page.tsx', import.meta.url)), 'Trang bài hướng dẫn tồn tại');

console.log('✅ Supplier lifecycle mail: first-product nudge at 3 and 10 days then stop, published notice once (CRM publish or L1 auto-publish), natural copy, no duplicates.');
