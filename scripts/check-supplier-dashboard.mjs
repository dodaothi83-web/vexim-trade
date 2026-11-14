// node scripts/check-supplier-dashboard.mjs — supplier isolation, truthful analytics, mail gating.
import assert from 'node:assert/strict';
import { loadPortalDictionary } from './lib/portal-dictionary.mjs';
import { loadFormat } from './lib/i18n-format.mjs';
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
const dictionary = loadPortalDictionary();
const contact = load('../lib/rfq/buyer-contact.ts', {});
const displayName = load('../lib/public/display-name.ts', {});
const consent = contact.buyerContactConsentSpec({ company: 'Buyer Co', contact_name: 'Jane', email: 'buyer@example.com', phone: '123456', country: 'US', website: null, business_type: null }, '2026-10-17T00:00:00Z', 'rfq_form');
const channel = load('../lib/rfq/channel.ts', {});
const core = load('../lib/rfq/portal-core.ts', {
  '@/lib/public/product-selection': { withoutDirectContacts: onlyContacts },
  './buyer-contact': contact, './channel': channel,
});
const certificateCopy = load('../lib/certificate-supplier-copy.ts', {});
const dashboard = load('../lib/supplier-portal/dashboard.ts', {
  '@/lib/certificate-supplier-copy': certificateCopy,
  '@/lib/rfq/buyer-contact': contact,
  '@/lib/rfq/channel': channel,
  '@/lib/rfq/mediated': { deskHasNewReply: (thread, side) => !!thread && !!(side === 'staff' ? thread.last_party_message_at : thread.last_staff_message_at) },
  '@/lib/rfq/portal-core': core,
  '@/lib/public/display-name': displayName,
  '@/lib/i18n/format': loadFormat(),
  '@/lib/i18n/portal/notices': { noticesMessages: { vi: dictionary.vi.notices, en: dictionary.en.notices } },
  '@/lib/i18n/portal/rfqs': { rfqsMessages: { vi: dictionary.vi.rfqs, en: dictionary.en.rfqs } }, '@/lib/public/product-selection': { withoutDirectContacts: onlyContacts } });
const now = new Date('2026-10-17T12:00:00Z');
const idA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const idB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const make = (id, supplierId, status, sentAt, sourceProductId = 'p-a') => ({
  id, supplier_id: supplierId, rfq_id: `r-${id}`, status, sent_to_supplier_at: sentAt,
  response_due_at: '2026-10-20T12:00:00Z', quote_price: null, quote_currency: 'USD', quote_unit: 'MT',
  created_at: sentAt || '2026-10-17T00:00:00Z', updated_at: '2026-10-17T00:00:00Z',
  rfq: { code: `RFQ-${id}`, product_text: 'Need Cashew W320, vacuum tins. Contact buyer@example.com', source_product_id: sourceProductId,
    preferred_supplier_ids: sourceProductId ? [supplierId] : [],
    quantity: 5, unit: 'MT', destination_country: 'US', destination_port: 'Chennai',
    incoterm: 'FOB', shipment_month: '2027-01', grade: 'W320', packaging: '10 kg tins',
    certifications: 'HACCP', wants_samples: true, frequency: 'Monthly', needed_by: null,
    buyer_id: 'SECRET', access_token: 'SECRET', notes: 'SECRET INTERNAL NOTE', ...consent },
});
const match = make(idA, 's-a', 'sent_to_supplier', '2026-10-17T09:00:00Z');
const foreign = make(idB, 's-b', 'quoted', '2026-10-17T08:00:00Z');
const unsent = make('cccccccc-cccc-cccc-cccc-cccccccccccc', 's-a', 'proposed', null);
const legacy = make('dddddddd-dddd-dddd-dddd-dddddddddddd', 's-a', 'quoted', '2026-08-01T08:00:00Z', null);
legacy.quote_price = 28;
for (const field of Object.keys(consent)) delete legacy.rfq[field];
foreign.rfq.buyer_contact = { ...consent.buyer_contact, email: 'foreign@example.com' };
const products = [{ id: 'p-a', supplier_id: 's-a', name: 'Cashew W320',
  spec: 'Whole kernels. Ask buyer@example.com', packaging: 'Vacuum bags', moq: '1 MT',
  private_note: 'SECRET PRODUCT DESK NOTE' }, { id: 'p-b', supplier_id: 's-b', name: 'SECRET factory' }];
const input = { supplierId: 's-a', invites: [match, foreign, unsent, legacy], products, reads: [], reviews: [], requests: [], days: 30, now };
const base = dashboard.buildSupplierDashboard(input);
assert.equal(base.invites.length, 2, 'Only sent invitations for this supplier are visible');
assert.equal(base.invites[0].title, 'Cashew W320', 'Verified product title stays separate from the buyer request');
assert.equal(base.invites[0].linkedProduct.spec, 'Whole kernels. Ask [đã ẩn liên hệ]');
assert.equal(base.invites[0].linkedProduct.packaging, 'Vacuum bags');
assert.equal(base.invites[0].linkedProduct.moq, '1 MT');
assert.equal(base.invites[1].linkedProduct, null, 'Legacy RFQ without a source product has no inferred product card');
assert.doesNotMatch(JSON.stringify(base), /SECRET PRODUCT DESK NOTE/);
assert.match(base.invites[0].request.description, /Need Cashew W320, vacuum tins\. Contact \[đã ẩn liên hệ\]/);
assert.doesNotMatch(base.invites[0].request.description, /buyer@example.com/, 'Unsolicited contact in request text is suppressed');
assert.equal(base.invites[0].request.grade, 'W320');
assert.equal(base.invites[0].request.packaging, '10 kg tins');
assert.equal(base.invites[0].request.certifications, 'HACCP');
assert.equal(base.invites[0].request.delivery, '01/2027');
assert.equal(base.invites[0].destination, 'US · Chennai');
assert.equal(base.invites[0].request.wantsSamples, true);
assert.equal(base.invites[0].request.notes, undefined, 'Desk-only notes never enter the supplier model');
assert.ok(!JSON.stringify(base).includes('SECRET'));
assert.equal(base.invites[0].buyerContact.email, 'buyer@example.com', 'Only sent RFQ exposes consented contact');
assert.equal(base.invites[1].buyerContact, null, 'Legacy RFQ without consent stays private');
assert.ok(!JSON.stringify(base).includes('foreign@example.com'), 'Other supplier contact never appears');
const alternative = { ...match, id: 'alternative', supplier_id: 's-a',
  rfq: { ...match.rfq, preferred_supplier_ids: ['s-b'], buyer_contact: { ...consent.buyer_contact, email: 'named-supplier-only@example.com' } } };
const noAlternativeGrant = dashboard.buildSupplierDashboard({ ...input, invites: [alternative] });
assert.equal(noAlternativeGrant.invites[0].buyerContact, null, 'Even a sent alternative cannot inherit a direct RFQ grant meant for another supplier');
const withoutNamedSupplier = { ...alternative, rfq: { ...alternative.rfq, preferred_supplier_ids: [] } };
assert.equal(dashboard.buildSupplierDashboard({ ...input, invites: [withoutNamedSupplier] }).invites[0].buyerContact, null,
  'Product-addressed RFQ with missing supplier ID cannot reveal contact');
assert.equal(base.tasks.length, 1);
assert.equal(base.tasks[0].directToBuyer, true);
const sourced = dashboard.buildSupplierRfqBoard({ ...input, invites: [{ ...match, rfq: { ...match.rfq, sourcing_request_id: 'req-1' } }] });
assert.equal(sourced.tasks[0].directToBuyer, false, 'Linked sourcing RFQ must not promise direct buyer delivery');
const submitted = { ...match, status: 'quoted', quote_price: 6.35 };
for (const [language, directPending, sourcingPending, revisionPending] of [
  ['en', 'Quote saved · publication pending', 'Awaiting publication', 'Revision awaiting publication'],
  ['vi', 'Đã lưu · chờ công bố', 'Chờ công bố', 'Bản điều chỉnh chờ công bố'],
]) {
  const board = (invite) => dashboard.buildSupplierRfqBoard({ ...input, language, invites: [invite] }).invites[0];
  assert.equal(board(submitted).status, directPending, 'Direct quote may have been saved while automatic publication awaits retry');
  assert.equal(board({ ...submitted, rfq: { ...submitted.rfq, sourcing_request_id: 'req-1' } }).status, sourcingPending,
    'Submitted sourcing price is not buyer-visible until Vexim publishes it');
  assert.equal(board({ ...submitted, sent_to_buyer_at: '2026-10-17T10:00:00Z',
    rfq: { ...submitted.rfq, sourcing_request_id: 'req-1' } }).status, revisionPending,
    'A pending revision does not replace the last published quote');
}
const closedRfq = dashboard.buildSupplierRfqBoard({ ...input, invites: [{ ...match, rfq: { ...match.rfq, status: 'won' } }] });
assert.equal(closedRfq.tasks.length, 0, 'A closed RFQ is history, not an impossible action');
assert.equal(base.report.sent, 1, 'Period based on sent timestamp, not buyer creation');
assert.equal(base.report.quoted, 0);
assert.equal(base.report.responded, 0);
assert.equal(base.unreadCount, 2);
const directQuestion = { ...make('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 's-a', 'sent_to_supplier', '2026-10-17T09:30:00Z'),
  rfq: { ...match.rfq, source_page: '/rfq?intent=question' } };
const withDirectQuestion = dashboard.buildSupplierDashboard({ ...input, invites: [...input.invites, directQuestion] });
assert.equal(withDirectQuestion.invites.length, 2, 'Direct supplier questions are not quote invitations');
assert.equal(withDirectQuestion.tasks.length, 1, 'Direct supplier questions do not become supplier quote tasks');
assert.ok(!withDirectQuestion.notices.some((n) => n.key.startsWith('question:')), 'Câu hỏi kiểu cũ không còn trên cổng; Ask supplier dùng chat');
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
assert.ok(!approved.notices.some((n) => n.title.includes('Xác thực nhà máy')));
const decided = dashboard.buildSupplierDashboard({ ...input,
  products: [{ ...products[0], supplier_review_status: 'approved', supplier_originated: true, ready_for_buyer: true, updated_at: now.toISOString() }, products[1]],
  certificates: [{ id: 'c-a', supplier_id: 's-a', name: 'ISO 22000', review_status: 'approved',
    publicly_visible: false, checked_at: now.toISOString(), updated_at: now.toISOString() },
    { id: 'c-b', supplier_id: 's-b', name: 'SECRET factory certificate', review_status: 'approved',
      publicly_visible: true, updated_at: now.toISOString() }],
});
assert.ok(decided.notices.some((n) => n.key === 'product-approved:p-a' && n.title.includes('đã đăng') && n.detail.includes('hiển thị với người mua')));
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

// Direct RFQ delivery and sourcing dispatch are covered by dedicated portal-only regression tests.

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
const beforeMarkAll = writes.length;
await noticesAction.markAllSupplierNoticesReadAction();
const markAllWrites = writes.slice(beforeMarkAll);
assert.ok(markAllWrites.length >= 2, 'Mark all writes every visible notice');
assert.ok(markAllWrites.every(([supplierId]) => supplierId === 's-a'), 'Mark all stays scoped to the signed-in supplier');
assert.ok(markAllWrites.some(([, key]) => key === `rfq:${idA}`), 'Mark all includes the supplier RFQ');
assert.ok(markAllWrites.some(([, key]) => key === 'product-approved:p-a'), 'Mark all includes the supplier product');
assert.ok(!markAllWrites.some(([, key]) => key === `rfq:${idB}` || key === 'product-approved:p-b'),
  'Mark all must not write foreign supplier notices');

const schema = fs.readFileSync(new URL('../supabase/migrations/20261017_supplier_dashboard.sql', import.meta.url), 'utf8');
assert.match(schema, /source_product_id uuid references public\.supplier_products/);
assert.match(schema, /response_due_at timestamptz/);
assert.match(schema, /supplier_portal_notice_reads enable row level security/);
const createdRfqs = [];
const category = { id: 'cat1', slug: 'cashew', status: 'published', is_published: true };
const submitStore = { listBuyers: async () => [], getBuyerByEmail: async () => null, createBuyer: async () => ({ id: 'buyer-1', email: 'buyer@example.com' }),
  getCategoryBySlug: async () => category, getSupplier: async (id) => ({ id }), listRfqs: async () => [],
  createRfq: async (input) => { createdRfqs.push(input); return { ...input, id: 'new-rfq', status: 'new', access_token: 'private' }; },
  addAuditLog: async () => null };
const submit = load('../lib/rfq/submit.ts', {
  '@/lib/auth/buyer-session': { getBuyerSession: async () => ({ uid: 'buyer-account', email: 'buyer@example.com' }) },
  'next/headers': { headers: async () => ({ get: () => null }) },
  '@/lib/db': { getStore: () => submitStore },
  '@/lib/public/catalog': { listPublicSuppliers: async () => [{ id: 's-a' }, { id: 's-b' }] },
  '@/lib/supplier-portal/onboarding': { canInviteSupplier: async () => true },
  '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => [{ id: 'p-a', name: 'Cashew W320', supplierId: 's-a' }] },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  '@/lib/security/challenge': { verifyFormChallenge: () => ({ ok: true }) },
  '@/lib/email/rfq': { sendRfqAckBuyer: async () => null, sendRfqNewInternal: async () => null },
  './buyer-contact': contact,
  './targeted-portal': { releaseTargetedQuoteToPortal: async () => 0 },
  './auto-match': { createPreferredSupplierMatches: async () => [] },
  './supplier-question-rate-limit': { checkSupplierQuestionRateLimit: async () => ({ status: 'ok' }) },
  './supplier-question': { deliverSupplierQuestion: async () => ({ delivered: false }),
    sendSupplierQuestionAckBuyer: async () => null, sendSupplierQuestionExceptionInternal: async () => null },
  '.': { emailDomain: () => 'example.com', fingerprint: () => 'test', generateAccessToken: () => 'private', rfqDayKey: () => '20261017', generateRfqCode: () => 'RFQ-CODE',
    hasMxRecord: async () => ({ ok: true }), isLikelyWebmail: () => false, normalizeCompanyWebsite: () => null,
    scoreSpam: () => ({ score: 0, flags: [] }) },
  './enrich': { scheduleRfqEnrichment: () => {} },
  './rate-limit': { gcRateLimit() {}, rateLimit: () => ({ ok: true }) },
});
const raw = { company: 'Buyer', contact_name: 'Jane', email: 'buyer@example.com', consent: true, share_contact_consent: true,
  product_text: 'Cashew W320', category_slug: 'cashew', source_product_id: 'p-a', preferred_supplier_ids: ['s-a'] };
assert.equal((await submit.submitRfq(raw)).ok, true);
assert.equal(createdRfqs.at(-1).source_product_id, 'p-a');
assert.equal(createdRfqs.at(-1).specs.direct_delivery_version, 'portal_direct_v2');
await submit.submitRfq({ ...raw, product_text: 'Rice' });
assert.equal(createdRfqs.at(-1).source_product_id, 'p-a', 'Free-text requirements cannot replace the validated source-product attribution');
assert.match(createdRfqs.at(-1).product_text, /Cashew W320.*Rice/);
const beforeInvalidProduct = createdRfqs.length;
assert.equal((await submit.submitRfq({ ...raw, preferred_supplier_ids: ['s-b'] })).ok, false, 'Product cannot be attributed to a different supplier');
assert.equal(createdRfqs.length, beforeInvalidProduct, 'Invalid product/supplier pair never creates a direct RFQ');

await submit.submitRfq({ ...raw, preferred_supplier_ids: [] });
assert.equal(createdRfqs.at(-1).source_product_id, 'p-a');
assert.equal(createdRfqs.at(-1).preferred_supplier_ids.join(','), 's-a', 'Published product owner is recovered when the client omits supplier IDs');

const productPage = fs.readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(productPage, /product_id=\$\{encodeURIComponent\(card\.id\)\}/);
console.log('✅ Supplier dashboard: recipient-scoped contact consent, no internal leaks, honest metrics, verified outreach and migration gate.');

/* Chuông: giấy hết hạn có thông báo riêng; ghi chú nội bộ không lên chuông; bản đã thay không nhắc. */
{
  const at = new Date('2026-11-14T03:00:00Z');
  const base = { supplier_id: idA, review_status: 'pending', publicly_visible: false, staff_hidden: false, created_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:00:00Z' };
  const notices = dashboard.buildSupplierNotices({ supplierId: idA, invites: [], products: [], reviews: [], requests: [], reads: [], now: at, language: 'vi', certificates: [
    { ...base, id: 'c-exp', name: 'ISO 22000', valid_until: '2025-11-06' },
    { ...base, id: 'c-old', name: 'HACCP cũ', valid_until: '2026-11-20', superseded_by_certificate_id: 'c-new' },
    { ...base, id: 'c-chg', name: 'Halal', valid_until: '2027-01-01', review_status: 'changes_requested', review_note: 'Chưa tự công bố: ảnh mờ' },
  ] });
  const expired = notices.find((n) => n.key === 'cert-expired:c-exp');
  assert.ok(expired, 'Giấy đã hết hạn có thông báo trên chuông');
  assert.match(expired.detail, /Hết hạn ngày 06\/11\/2025/);
  assert.match(expired.detail, /Giấy tờ và chứng nhận/);
  assert.ok(!notices.some((n) => n.key.endsWith(':c-old')), 'Bản cũ đã có bản gia hạn thì không nhắc hạn');
  const changes = notices.find((n) => n.key === 'cert-changes:c-chg');
  assert.ok(changes && !/Chưa tự công bố/.test(changes.detail), 'Ghi chú nội bộ không lên chuông');
  console.log('✅ Chuông chứng nhận: báo hết hạn, ẩn ghi chú nội bộ, bỏ qua bản đã gia hạn.');
}
