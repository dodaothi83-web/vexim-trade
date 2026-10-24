// node scripts/check-supplier-dashboard.mjs — supplier isolation, truthful analytics, mail gating.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, mocks) {
  const output = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, { module: mod, exports: mod.exports, process, console, Date, Map, Set, FormData,
    require: (key) => { if (key === 'server-only') return {}; assert.ok(key in mocks, `Unexpected ${key} in ${path}`); return mocks[key]; },
  }, { filename: path });
  return mod.exports;
}
const onlyContacts = (v) => v.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[contact via Vexim]');
const dashboard = load('../lib/supplier-portal/dashboard.ts', { '@/lib/public/product-selection': { withoutDirectContacts: onlyContacts } });
const now = new Date('2026-10-17T12:00:00Z');
const idA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const idB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const make = (id, supplierId, status, sentAt, sourceProductId = 'p-a') => ({
  id, supplier_id: supplierId, rfq_id: `r-${id}`, status, sent_to_supplier_at: sentAt,
  response_due_at: '2026-10-20T12:00:00Z', quote_price: null, quote_currency: 'USD', quote_unit: 'MT',
  created_at: sentAt || '2026-10-17T00:00:00Z', updated_at: '2026-10-17T00:00:00Z',
  rfq: { code: `RFQ-${id}`, product_text: 'secret buyer@example.com', source_product_id: sourceProductId,
    quantity: 5, unit: 'MT', destination_country: 'US', incoterm: 'FOB', needed_by: null,
    buyer_id: 'SECRET', access_token: 'SECRET' },
});
const match = make(idA, 's-a', 'sent_to_supplier', '2026-10-17T09:00:00Z');
const foreign = make(idB, 's-b', 'quoted', '2026-10-17T08:00:00Z');
const unsent = make('cccccccc-cccc-cccc-cccc-cccccccccccc', 's-a', 'proposed', null);
const legacy = make('dddddddd-dddd-dddd-dddd-dddddddddddd', 's-a', 'quoted', '2026-08-01T08:00:00Z', null);
legacy.quote_price = 28;
const products = [{ id: 'p-a', supplier_id: 's-a', name: 'Cashew W320' }, { id: 'p-b', supplier_id: 's-b', name: 'SECRET factory' }];
const input = { supplierId: 's-a', invites: [match, foreign, unsent, legacy], products, reads: [], reviews: [], requests: [], days: 30, now };
const base = dashboard.buildSupplierDashboard(input);
assert.equal(base.invites.length, 2, 'Only sent invitations for this supplier are visible');
assert.equal(base.invites[0].title, 'Cashew W320');
assert.ok(!JSON.stringify(base).includes('SECRET'));
assert.ok(!JSON.stringify(base).includes('buyer@example.com'));
assert.equal(base.tasks.length, 1);
assert.equal(base.report.sent, 1, 'Period based on sent timestamp, not buyer creation');
assert.equal(base.report.quoted, 0);
assert.equal(base.report.responded, 0);
assert.equal(base.unreadCount, 2);
const replied = dashboard.buildSupplierDashboard({ ...input, invites: [{ ...match, supplier_replied_at: '2026-10-17T10:00:00Z' }, foreign, unsent, legacy] });
assert.equal(replied.tasks.length, 0, 'Verified supplier response clears the RFQ task');
assert.equal(replied.report.responded, 1);
assert.equal(replied.report.quoted, 0, 'Email response does not fabricate a quote');
const read = dashboard.buildSupplierDashboard({ ...input, reads: [{ supplier_id: 's-a', notice_key: `rfq:${idA}`, read_at: now.toISOString() },
  { supplier_id: 's-b', notice_key: `rfq:${legacy.id}`, read_at: now.toISOString() }] });
assert.equal(read.unreadCount, 1, 'Foreign read receipt cannot hide this supplier notice');
const long = dashboard.buildSupplierDashboard({ ...input, days: 90 });
assert.equal(long.report.sent, 2);
assert.equal(JSON.stringify(long.report.byProduct.map((g) => [g.name, g.sent])), JSON.stringify([['Cashew W320', 1], ['Chưa liên kết sản phẩm của bạn', 1]]));
const approved = dashboard.buildSupplierDashboard({ ...input, reviews: [{ id: 'v3', supplier_id: 's-a', target_level: 3, status: 'approved', approved_at: now.toISOString(), updated_at: now.toISOString() },
  { id: 'v2', supplier_id: 's-b', target_level: 2, status: 'approved', approved_at: now.toISOString() }] });
assert.ok(approved.notices.some((n) => n.title.includes('Lịch sử giao hàng')));
assert.ok(!approved.notices.some((n) => n.title.includes('Thăm nhà máy')));
const decided = dashboard.buildSupplierDashboard({ ...input,
  products: [{ ...products[0], supplier_review_status: 'approved', supplier_originated: true, ready_for_buyer: true, updated_at: now.toISOString() }, products[1]],
  certificates: [{ id: 'c-a', supplier_id: 's-a', name: 'ISO 22000', review_status: 'approved',
    publicly_visible: false, checked_at: now.toISOString(), updated_at: now.toISOString() },
    { id: 'c-b', supplier_id: 's-b', name: 'SECRET factory certificate', review_status: 'approved',
      publicly_visible: true, updated_at: now.toISOString() }],
});
assert.ok(decided.notices.some((n) => n.key === 'product-approved:p-a' && n.title.includes('đã đăng') && n.detail.includes('hiển thị với buyer')));
assert.ok(decided.notices.some((n) => n.key === 'cert-approved:c-a' && n.detail.includes('Chưa công bố')));
assert.ok(!JSON.stringify(decided).includes('SECRET factory certificate'), 'Foreign certificate cannot appear');
const accountNotice = dashboard.buildSupplierDashboard({ ...input, supplier: { id: 's-a', onboarding_status: 'approved', updated_at: now.toISOString() } });
assert.ok(accountNotice.notices.some((n) => n.key === 'onboarding-approved:s-a'));
const published = dashboard.buildSupplierDashboard({ ...input, certificates: [{ id: 'c-a', supplier_id: 's-a', name: 'ISO 22000',
  review_status: 'approved', publicly_visible: true, updated_at: now.toISOString() }] });
assert.ok(published.notices.some((n) => n.key === 'cert-published:c-a'));
assert.ok(!published.notices.some((n) => n.key === 'cert-approved:c-a'), 'Publication has its own notification');

const staff = { id: 'staff-1', email: 'login@veximtrade.com', name: 'Nguyễn Văn Dung',
  role: 'sourcing', is_active: true, created_at: '2026-01-01T00:00:00Z', sender_email: null };
const senderLib = load('../lib/email/sender.ts', {
  '@/lib/config': { COMPANY: { name: 'Vexim Trade', email: 'sales@veximtrade.com' }, MAIL_DOMAIN: 'veximtrade.com', ROLE_ADDRESS: 'sales@veximtrade.com' },
});
const senderStore = { getUser: async (id) => id === staff.id ? staff : null, listUsers: async () => [staff] };
const staffSender = load('../lib/rfq/staff-sender.ts', {
  '@/lib/db': { getStore: () => senderStore }, '@/lib/email/sender': senderLib,
});
assert.equal((await staffSender.requireRfqStaffSender(staff.id)).header, 'Nguyễn Văn Dung <dung@veximtrade.com>');
await assert.rejects(staffSender.requireRfqStaffSender(''), /Chưa xác định/);
staff.sender_email = 'sales@veximtrade.com';
await assert.rejects(staffSender.requireRfqStaffSender(staff.id), /chưa hợp lệ/);
staff.sender_email = 'contact@veximtrade.com';
await assert.rejects(staffSender.requireRfqStaffSender(staff.id), /chưa hợp lệ/);
staff.sender_email = 'sales';
await assert.rejects(staffSender.requireRfqStaffSender(staff.id), /chưa hợp lệ/);
staff.sender_email = null;
staff.is_active = false;
await assert.rejects(staffSender.requireRfqStaffSender(staff.id), /đang hoạt động/);
staff.is_active = true;
staff.role = 'supplier';
await assert.rejects(staffSender.requireRfqStaffSender(staff.id), /đang hoạt động/);
staff.role = 'sourcing';
staff.name = 'Admin';
await assert.rejects(staffSender.requireRfqStaffSender(staff.id), /tên người thật/);
staff.name = 'Sales Team';
await assert.rejects(staffSender.requireRfqStaffSender(staff.id), /tên người thật/);
staff.name = 'Dung\r\nCc: attacker@example.com';
await assert.rejects(staffSender.requireRfqStaffSender(staff.id), /tên người thật/);
staff.name = 'Nguyễn Văn Dung';

const rfq = { id: 'r1', code: 'RFQ-20261017-001', buyer_id: 'b1', product_text: 'Cashew', quantity: 5, unit: 'MT', status: 'new' };
const storedMatch = { ...match, rfq_id: rfq.id, status: 'proposed', sent_to_supplier_at: null };
const sent = [];
let mode = 'simulated';
let inviteStatus = 'pending';
let preflightFails = false;
const store = {
  getRfq: async () => rfq,
  getRfqMatch: async () => storedMatch,
  getSupplier: async () => ({ id: 's-a', email: 'supplier@example.com', name: 'Supplier A', onboarding_status: inviteStatus }),
  findIntroduction: async () => null, createIntroduction: async () => {},
  getBuyer: async () => ({ id: 'b1', contact_name: 'Jane', email: 'buyer@example.com' }),
  listRfqMatches: async () => [storedMatch],
  listSupplierRfqInvitations: async () => { if (preflightFails) throw Error('migration missing'); return []; },
  listSupplierNoticeReads: async () => [],
  listSuppliers: async () => [{ id: 's-a', email: 'supplier@example.com', name: 'Supplier A', onboarding_status: inviteStatus }],
  getUserByEmail: async (email) => email === 'supplier@example.com' && inviteStatus === 'not_started' ? { role: 'supplier', supplier_id: 's-a' } : null,
  updateRfqMatch: async (_id, patch) => Object.assign(storedMatch, patch),
  addMessage: async (message) => sent.push(message),
  updateRfq: async (_id, patch) => Object.assign(rfq, patch),
};
const outbound = load('../lib/rfq/outreach.ts', {
  '@/lib/db': { getStore: () => store },
  '@/lib/public/product-selection': { withoutDirectContacts: onlyContacts },
  '@/lib/email/send': { transport: async (mail) => { sent.push(mail); return { ok: true, status: mode, provider: 'resend' }; } },
  '@/lib/rfq/staff-sender': staffSender,
  '@/lib/supplier-portal/onboarding': load('../lib/supplier-portal/onboarding.ts', {}),
  '@/lib/config': { FROM_ADDRESS: 'Vexim <sales@example.com>', COMPANY: { name: 'Vexim' } },
  '@/lib/site': { SITE_URL: 'https://example.com' },
  '@/lib/email/templates': { escapeHtml: (s) => s, wrapPlainEmail: ({ body }) => body },
  '@/lib/rfq/reply-routing': { supplierReplyAddress: () => 'reply@example.com', buyerReplyAddress: () => 'buyer-reply@example.com' },
});
const privateMail = outbound.buildRfqSupplierEmail({ rfq: { ...rfq, product_text: 'contact buyer@example.com', specs: { notes: 'SECRET BUYER CONTACT' } },
  supplier: { name: 'Supplier A' }, deadline: now });
assert.ok(!privateMail.html.includes('buyer@example.com'));
assert.ok(!privateMail.html.includes('SECRET BUYER CONTACT'));
const shortlist = outbound.buildRfqShortlistBuyerEmail({
  rfq, buyer: { contact_name: 'Jane', email: 'buyer@example.com' },
  matches: [{ ...storedMatch, internal_note: 'PRIVATE STAFF EVALUATION — never send', quote_price: 7,
    quote_currency: 'USD', quote_unit: 'kg', supplier: { name: 'Supplier A', province: 'Hanoi' } }],
});
assert.match(shortlist.html, /Supplier A|Lead time/);
assert.doesNotMatch(shortlist.html, /PRIVATE STAFF EVALUATION|Ghi chú Vexim/, 'Buyer shortlist must never include internal match notes');
preflightFails = true;
await assert.rejects(outbound.dispatchRfqToSuppliers({ rfqId: rfq.id, matchIds: [match.id], actorId: staff.id }), /migration missing/);
assert.equal(sent.length, 0, 'No mail before DB migration is ready');
preflightFails = false;
assert.equal((await outbound.dispatchRfqToSuppliers({ rfqId: rfq.id, matchIds: [match.id], actorId: staff.id })).sent, 0);
assert.equal(sent.length, 0, 'Pending account cannot receive an invitation');
inviteStatus = 'not_started';
assert.equal((await outbound.dispatchRfqToSuppliers({ rfqId: rfq.id, matchIds: [match.id], actorId: staff.id })).sent, 0);
assert.equal(sent.length, 0, 'Incomplete registered account cannot receive an invitation');
inviteStatus = 'approved';
assert.equal((await outbound.dispatchRfqToSuppliers({ rfqId: rfq.id, matchIds: [match.id], actorId: staff.id })).sent, 0);
assert.equal(storedMatch.sent_to_supplier_at, null, 'A simulated email is not an invitation');
mode = 'sent';
assert.equal((await outbound.dispatchRfqToSuppliers({ rfqId: rfq.id, matchIds: [match.id], actorId: staff.id })).sent, 1);
assert.equal(storedMatch.status, 'sent_to_supplier');
assert.ok(storedMatch.response_due_at);
assert.equal((await outbound.dispatchRfqToSuppliers({ rfqId: rfq.id, matchIds: [match.id], actorId: staff.id })).sent, 0, 'No duplicate invitation');
assert.equal(sent.filter((x) => x.to?.includes('supplier@example.com')).length, 2, 'Simulated and real attempts only');
assert.equal(sent.find((x) => x.to?.includes('supplier@example.com')).from, 'Nguyễn Văn Dung <dung@veximtrade.com>');
assert.equal(sent.find((x) => x.to?.includes('supplier@example.com')).replyTo, 'reply@example.com');
storedMatch.status = 'quoted'; storedMatch.quote_price = 7;
mode = 'simulated';
await assert.rejects(outbound.presentShortlistToBuyer({ rfqId: rfq.id }), /Resend chưa gửi thật/);
assert.equal(storedMatch.status, 'quoted', 'A simulated buyer email cannot advance the supplier match');
assert.equal(rfq.status, 'matching', 'A simulated buyer email cannot mark RFQ as quoted');
storedMatch.status = 'presented_to_buyer'; storedMatch.quote_price = null;
const countBeforeSelection = sent.length;
mode = 'sent';
assert.equal((await outbound.selectSupplier({ rfqId: rfq.id, matchId: storedMatch.id, actorId: staff.id })).email, 'sent');
assert.equal(sent.length, countBeforeSelection + 1);
assert.equal(sent.at(-1).from, 'Nguyễn Văn Dung <dung@veximtrade.com>', 'Selection mail cannot use a role address');
assert.ok(!sent.at(-1).html.includes('buyer@example.com') && !sent.at(-1).html.includes('SECRET'), 'Selection mail is anonymous');
assert.equal(storedMatch.status, 'selected');
await outbound.selectSupplier({ rfqId: rfq.id, matchId: storedMatch.id, actorId: staff.id });
assert.equal(sent.length, countBeforeSelection + 1, 'Replaying selection does not resend mail');
storedMatch.status = 'sent_to_supplier'; rfq.status = 'matching';
const matchActions = load('../app/crm/rfqs/[id]/actions.ts', {
  'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect() {} },
  crypto: { randomUUID: () => 'test-id' },
  '@/lib/db': { getStore: () => store }, '@/lib/auth/session': { guard: async () => null },
});
const forgedSelection = new FormData(); forgedSelection.set('match_id', storedMatch.id);
forgedSelection.set('rfq_id', rfq.id); forgedSelection.set('status', 'selected');
await assert.rejects(matchActions.updateMatchStatusAction(forgedSelection), /Chọn NCC này/);
assert.equal(storedMatch.status, 'sent_to_supplier', 'Generic status action cannot bypass selection notification');

let accessEnabled = true;
let portalStatus = 'pending';
const writes = [];
const noticesAction = load('../app/supplier/portal/notice-actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => accessEnabled ? {
    supplier: { id: 's-a', onboarding_status: portalStatus }, reviews: [], store: {
      listSupplierRfqInvitations: async () => [match, foreign], listSupplierVerificationRequests: async () => [],
      listProductsBySupplier: async () => products, listCertificates: async () => [],
      markSupplierNoticeRead: async (supplierId, key) => writes.push([supplierId, key]),
    },
  } : null },
  '@/lib/supplier-portal/dashboard': dashboard,
  '@/lib/supplier-portal/onboarding': { portalApproved: (supplier) => supplier.onboarding_status === 'approved' },
});
const noticeForm = (key) => { const fd = new FormData(); fd.set('notice_key', key); return fd; };
await noticesAction.markSupplierNoticeReadAction(noticeForm(`rfq:${idB}`));
assert.equal(writes.length, 0, 'Forged foreign notice cannot be marked read');
accessEnabled = false;
await noticesAction.markSupplierNoticeReadAction(noticeForm(`rfq:${idA}`));
assert.equal(writes.length, 0, 'Logged-out user cannot mark a notice read');
accessEnabled = true;
await noticesAction.markSupplierNoticeReadAction(noticeForm(`rfq:${idA}`));
assert.equal(writes.length, 0, 'Pending supplier cannot mark notices');
portalStatus = 'approved';
await noticesAction.markSupplierNoticeReadAction(noticeForm(`rfq:${idA}`));
assert.equal(writes[0][0], 's-a');
products[0].supplier_review_status = 'approved'; products[0].updated_at = now.toISOString();
await noticesAction.markSupplierNoticeReadAction(noticeForm('product-approved:p-b'));
assert.equal(writes.length, 1, 'Cannot mark a foreign supplier product notice');
await noticesAction.markSupplierNoticeReadAction(noticeForm('product-approved:p-a'));
assert.equal(writes[1][1], 'product-approved:p-a');

const schema = fs.readFileSync(new URL('../supabase/migrations/20261017_supplier_dashboard.sql', import.meta.url), 'utf8');
assert.match(schema, /source_product_id uuid references public\.supplier_products/);
assert.match(schema, /response_due_at timestamptz/);
assert.match(schema, /supplier_portal_notice_reads enable row level security/);
const createdRfqs = [];
const category = { id: 'cat1', slug: 'cashew', status: 'published', is_published: true };
const submitStore = { listBuyers: async () => [], createBuyer: async () => ({ id: 'buyer-1', email: 'buyer@example.com' }),
  getCategoryBySlug: async () => category, listRfqs: async () => [],
  createRfq: async (input) => { createdRfqs.push(input); return { ...input, id: 'new-rfq', status: 'new', access_token: 'private' }; },
  addAuditLog: async () => null };
const submit = load('../lib/rfq/submit.ts', {
  'next/headers': { headers: async () => ({ get: () => null }) },
  '@/lib/db': { getStore: () => submitStore },
  '@/lib/public/catalog': { listPublicSuppliers: async () => [{ id: 's-a' }, { id: 's-b' }] },
  '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => [{ id: 'p-a', name: 'Cashew W320', supplierId: 's-a' }] },
  '@/lib/email/rfq': { sendRfqAckBuyer: async () => null, sendRfqNewInternal: async () => null },
  '.': { emailDomain: () => 'example.com', fingerprint: () => 'test', generateAccessToken: () => 'private', generateRfqCode: () => 'RFQ-CODE',
    hasMxRecord: async () => ({ ok: true }), isLikelyWebmail: () => false, normalizeCompanyWebsite: () => null,
    scoreSpam: () => ({ score: 0, flags: [] }) },
  './rate-limit': { gcRateLimit() {}, rateLimit: () => ({ ok: true }) },
});
const raw = { company: 'Buyer', contact_name: 'Jane', email: 'buyer@example.com', consent: true,
  product_text: 'Cashew W320', category_slug: 'cashew', source_product_id: 'p-a', preferred_supplier_ids: ['s-a'] };
assert.equal((await submit.submitRfq(raw)).ok, true);
assert.equal(createdRfqs.at(-1).source_product_id, 'p-a');
await submit.submitRfq({ ...raw, product_text: 'Rice' });
assert.equal(createdRfqs.at(-1).source_product_id, null, 'Edited buyer product text cannot claim the old product');
await submit.submitRfq({ ...raw, preferred_supplier_ids: ['s-b'] });
assert.equal(createdRfqs.at(-1).source_product_id, null, 'Other supplier cannot claim product attribution');

const productPage = fs.readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(productPage, /product_id=\$\{encodeURIComponent\(card\.id\)\}/);
console.log('✅ Supplier dashboard: isolation, anonymous invitations, honest metrics, read receipts, verified outreach and migration gate.');
