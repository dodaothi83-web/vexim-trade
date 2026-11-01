// node scripts/check-supplier-reminders.mjs — thư nhắc NCC là dịch vụ, đúng người, có giới hạn tần suất.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../lib/supplier-portal/reminders.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const exports = {};
const mocks = {
  '@/lib/db': { getStore: () => { throw new Error('store phải được inject trong bài kiểm tra'); } },
  '@/lib/email/send': { transport: async () => ({ ok: false, status: 'failed', provider: 'local', error: 'không inject' }) },
  '@/lib/email/templates': { escapeHtml, wrapPlainEmail: ({ title, body }) => `<h1>${title}</h1>${body}` },
  '@/lib/l2-scope': {
    l2ScopeForSupplier: (type) => type === 'trading' ? 'partner_contract' : type === 'manufacturer' || type === 'cooperative' ? 'factory' : null,
    effectiveL2Scope: (scope) => scope === 'partner_contract' ? 'partner_contract' : 'factory',
  },
  './notify': { notificationOrigin: () => 'https://portal.example' },
  './onboarding': { portalApproved: (supplier) => supplier.onboarding_status === 'approved' },
};
vm.runInNewContext(source, {
  exports, console, Date, Set, Map, Promise, process,
  require: (id) => { if (id === 'server-only') return {}; assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id]; },
});

/** Store giả: đủ method reminders dùng, ghi lại thư đã gửi. */
function makeStore(state) {
  let clock = 0;
  return {
    listSuppliers: async () => state.suppliers,
    listUsers: async () => state.users,
    listVerifications: async () => state.reviews,
    listSubmissions: async () => state.submissions,
    listSupplierVerificationRequests: async () => state.requests,
    listMessagesOfKind: async (kind) => state.messages.filter((m) => m.kind === kind),
    addMessage: async (input) => {
      clock += 1;
      const row = { ...input, id: `msg-${state.messages.length + 1}`, created_at: new Date(Date.UTC(2026, 10, 1, 0, clock)).toISOString(), sent_at: input.status === 'sent' || input.status === 'simulated' ? new Date(Date.UTC(2026, 10, 1, 0, clock)).toISOString() : null };
      state.messages.push(row);
      return row;
    },
  };
}

function makeSupplier(patch = {}) {
  return { id: 'sup-1', name: 'Nhà máy <A>', contact_name: null, email: 'owner@example.com', supplier_type: 'manufacturer', onboarding_status: 'approved', ...patch };
}

function makeUser(patch = {}) {
  return { id: 'u-1', email: 'owner@example.com', role: 'supplier', is_active: true, supplier_id: 'sup-1', ...patch };
}

const base = (over = {}) => ({ suppliers: [], users: [], reviews: [], submissions: [], requests: [], messages: [], ...over });
const NOW = new Date('2026-11-01T02:00:00.000Z');

/* 1. NCC đã mở cổng, chưa có giấy tờ nào được duyệt → đúng 1 thư, đúng người, đúng nội dung. */
{
  const state = base({ suppliers: [makeSupplier()], users: [makeUser()] });
  const sent = [];
  const report = await exports.sendSupplierProgressReminders({
    store: makeStore(state), now: NOW,
    send: async (mail) => { sent.push(mail); return { ok: true, status: 'sent', provider: 'resend', error: null }; },
  });
  assert.equal(report.checked, 1);
  assert.equal(report.sent, 1);
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].to)), ['owner@example.com'], 'Chỉ gửi cho tài khoản NCC đang hoạt động');
  assert.match(sent[0].subject, /Nhắc hoàn thiện hồ sơ xác minh: Giấy tờ doanh nghiệp/);
  assert.ok(sent[0].html.includes('không phải thư quảng cáo'));
  assert.ok(sent[0].html.includes('Nhà máy &lt;A&gt;'), 'Tên NCC được escape');
  assert.ok(sent[0].html.includes('https://portal.example/supplier/portal/documents'));
  assert.ok(sent[0].text.includes('https://portal.example/supplier/portal'));
  assert.equal(state.messages.length, 1, 'Mỗi thư được ghi nhật ký để chống trùng');
  assert.equal(state.messages[0].kind, 'supplier_reminder');
  assert.equal(state.messages[0].status, 'sent');
  assert.equal(state.messages[0].created_by, null);
  assert.equal(state.messages[0].sent_at, '2026-11-01T00:01:00.000Z', 'Thư đã gửi có sent_at để tính thời gian chờ');
}

/* 2. Chạy lại trong 14 ngày → không gửi; qua 15 ngày → gửi lại. */
{
  const state = base({ suppliers: [makeSupplier()], users: [makeUser()] });
  const store = makeStore(state);
  let sends = 0;
  const send = async () => { sends += 1; return { ok: true, status: 'sent', provider: 'resend', error: null }; };
  await exports.sendSupplierProgressReminders({ store, now: NOW, send });
  const second = await exports.sendSupplierProgressReminders({ store, now: new Date('2026-11-10T02:00:00.000Z'), send });
  assert.equal(sends, 1, 'Chưa hết 14 ngày thì không nhắc lại');
  assert.equal(second.sent, 0);
  assert.equal(second.skipped, 1);
  assert.equal(second.details[0].status, 'cooldown');
  const third = await exports.sendSupplierProgressReminders({ store, now: new Date('2026-11-20T02:00:00.000Z'), send });
  assert.equal(sends, 2, 'Qua 14 ngày mới nhắc lại');
  assert.equal(third.sent, 1);
}

/* 3. Đã nhận đủ 6 thư → dừng hẳn, để nhân viên liên hệ tay. */
{
  const delivered = Array.from({ length: 6 }, (_, i) => ({
    id: `old-${i}`, supplier_id: 'sup-1', kind: 'supplier_reminder', status: 'sent',
    created_at: `2026-0${i + 1}-01T00:00:00.000Z`, sent_at: `2026-0${i + 1}-01T00:00:00.000Z`,
  }));
  const state = base({ suppliers: [makeSupplier()], users: [makeUser()], messages: delivered });
  let sends = 0;
  const report = await exports.sendSupplierProgressReminders({
    store: makeStore(state), now: NOW,
    send: async () => { sends += 1; return { ok: true, status: 'sent', provider: 'resend', error: null }; },
  });
  assert.equal(sends, 0);
  assert.equal(report.skipped, 1);
  assert.equal(report.details[0].status, 'capped');
}

/* 4. Đang chờ Vexim duyệt thì không nhắc; NCC chưa được mở cổng cũng không nhắc. */
{
  const state = base({
    suppliers: [makeSupplier(), makeSupplier({ id: 'sup-2', name: 'Chưa mở cổng', onboarding_status: 'pending', email: 'p@example.com' })],
    users: [makeUser(), makeUser({ id: 'u-2', email: 'p@example.com', supplier_id: 'sup-2' })],
    reviews: [{ supplier_id: 'sup-1', target_level: 1, status: 'submitted' }],
    submissions: [{ supplier_id: 'sup-1', target_level: 2, status: 'pending_review', l2_scope: 'factory' }],
  });
  let sends = 0;
  const report = await exports.sendSupplierProgressReminders({
    store: makeStore(state), now: NOW,
    send: async () => { sends += 1; return { ok: true, status: 'sent', provider: 'resend', error: null }; },
  });
  assert.equal(sends, 0, 'Không nhắc việc đang nằm trong tay Vexim');
  assert.equal(report.checked, 0);
}

/* 5. Chỉ nhắc L2/L3 khi NCC đã tự yêu cầu hoặc đã tự bắt đầu; nhãn đúng loại hình. */
{
  const trading = base({
    suppliers: [makeSupplier({ supplier_type: 'trading' })],
    users: [makeUser()],
    requests: [{ supplier_id: 'sup-1', target_level: 2, status: 'requested' }],
    reviews: [{ supplier_id: 'sup-1', target_level: 1, status: 'approved' }],
  });
  const itemsTrading = exports.outstandingVerificationItems({
    supplier: trading.suppliers[0], reviews: trading.reviews, submissions: trading.submissions, requests: trading.requests,
  });
  assert.equal(itemsTrading.length, 1);
  assert.equal(itemsTrading[0].title, 'Nhà máy đối tác');
  assert.equal(itemsTrading[0].href, '/supplier/portal/verification/factory');

  const factory = base({
    suppliers: [makeSupplier()],
    requests: [{ supplier_id: 'sup-1', target_level: 3, status: 'requested' }],
    reviews: [{ supplier_id: 'sup-1', target_level: 1, status: 'approved' }],
  });
  const itemsFactory = exports.outstandingVerificationItems({
    supplier: factory.suppliers[0], reviews: factory.reviews, submissions: factory.submissions, requests: factory.requests,
  });
  assert.equal(itemsFactory.length, 1);
  assert.equal(itemsFactory[0].title, 'Lịch sử giao hàng');
  assert.equal(itemsFactory[0].href, '/supplier/portal/verification/export');

  const untouched = base({
    suppliers: [makeSupplier()],
    reviews: [{ supplier_id: 'sup-1', target_level: 1, status: 'approved' }],
  });
  assert.equal(exports.outstandingVerificationItems({
    supplier: untouched.suppliers[0], reviews: untouched.reviews, submissions: untouched.submissions, requests: untouched.requests,
  }).length, 0, 'Không mời chào thêm cấp khi NCC chưa đụng tới');
}

/* 6. Không có tài khoản NCC đang hoạt động → bỏ qua, không gửi hộp thư ngoài. */
{
  const state = base({
    suppliers: [makeSupplier()],
    users: [makeUser({ is_active: false }), makeUser({ id: 'u-admin', email: 'admin@example.com', role: 'admin', supplier_id: null })],
  });
  let sends = 0;
  const report = await exports.sendSupplierProgressReminders({
    store: makeStore(state), now: NOW,
    send: async () => { sends += 1; return { ok: true, status: 'sent', provider: 'resend', error: null }; },
  });
  assert.equal(sends, 0);
  assert.equal(report.details[0].status, 'no_recipient');
}

/* 7. Gửi lỗi: ghi failed, không được coi là đã nhắc (lần sau vẫn thử lại). */
{
  const state = base({ suppliers: [makeSupplier()], users: [makeUser()] });
  const store = makeStore(state);
  const failed = await exports.sendSupplierProgressReminders({
    store, now: NOW,
    send: async () => ({ ok: false, status: 'failed', provider: 'resend', error: 'resend down' }),
  });
  assert.equal(failed.sent, 0);
  assert.equal(failed.failed, 1);
  assert.equal(state.messages[0].status, 'failed');
  const retry = await exports.sendSupplierProgressReminders({
    store, now: NOW,
    send: async () => ({ ok: true, status: 'sent', provider: 'resend', error: null }),
  });
  assert.equal(retry.sent, 1, 'Thư lỗi không chặn lần gửi sau');
}

/* 8. Bảng nguồn chưa migrate → bỏ cả lượt, không nhắc sai và không ném lỗi ra cron. */
{
  const store = makeStore(base({ suppliers: [makeSupplier()], users: [makeUser()] }));
  store.listSubmissions = async () => { throw new Error('relation supplier_submissions does not exist'); };
  let sends = 0;
  const report = await exports.sendSupplierProgressReminders({
    store, now: NOW,
    send: async () => { sends += 1; return { ok: true, status: 'sent', provider: 'resend', error: null }; },
  });
  assert.equal(sends, 0);
  assert.equal(report.sent, 0);
  assert.match(report.error, /supplier_submissions/);
}

/* 9. Triển khai: kind mới có trong schema + migration, cron có route riêng và gộp trong rfq-sla. */
{
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /'supplier_reminder'/);
  const migrationUrl = new URL('../supabase/migrations/20261101_supplier_progress_reminders.sql', import.meta.url);
  assert.ok(existsSync(migrationUrl));
  assert.match(readFileSync(migrationUrl, 'utf8'), /'supplier_reminder'/);
  const route = readFileSync(new URL('../app/api/cron/supplier-reminders/route.ts', import.meta.url), 'utf8');
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /sendSupplierProgressReminders/);
  const sla = readFileSync(new URL('../app/api/cron/rfq-sla/route.ts', import.meta.url), 'utf8');
  assert.match(sla, /sendSupplierProgressReminders/);
}

console.log('✅ Supplier reminders: chỉ nhắc việc NCC tự bắt đầu/yêu cầu, đúng người, 14 ngày/thư, tối đa 6 thư.');
