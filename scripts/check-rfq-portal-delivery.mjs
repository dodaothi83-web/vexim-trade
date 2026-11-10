import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadPortalDictionary } from './lib/portal-dictionary.mjs';
import { loadFormat } from './lib/i18n-format.mjs';
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function load(file, mocks) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, Date, Set, console, require(id) { assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id]; } });
  return mod.exports;
}
const page = ts.createSourceFile('page.tsx', read('app/crm/rfqs/[id]/page.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function inspect(node, forms = 0) {
  if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(page))) assert.fail('Server page must not pass event handlers');
  const form = ts.isJsxElement(node) && node.openingElement.tagName.getText(page) === 'form';
  if (form) assert.equal(forms, 0, 'CRM forms must not nest');
  ts.forEachChild(node, (child) => inspect(child, forms + Number(form)));
}
inspect(page);
assert.match(read('components/confirm-submit-button.tsx'), /^"use client"/);
assert.match(read('components/confirm-submit-button.tsx'), /window\.confirm\(message\)/);
assert.match(read('app/crm/rfqs/[id]/page.tsx'), /form="rfq-dispatch"/);
const dictionary = loadPortalDictionary();
const contact = load('lib/rfq/buyer-contact.ts', {});
const displayName = load('lib/public/display-name.ts', {});
const channel = load('lib/rfq/channel.ts', {});
const core = load('lib/rfq/portal-core.ts', {
  '@/lib/public/product-selection': { withoutDirectContacts: (s) => String(s).replace(/[\w.+-]+@[\w.-]+/g, '[redacted]') },
  './buyer-contact': contact, './channel': channel,
});
const dashboard = load('lib/supplier-portal/dashboard.ts', {
  '@/lib/rfq/buyer-contact': contact,
  '@/lib/rfq/channel': channel,
  '@/lib/rfq/portal-core': core,
  '@/lib/public/display-name': displayName,
  '@/lib/public/product-selection': { withoutDirectContacts: (s) => String(s).replace(/[\w.+-]+@[\w.-]+/g, '[redacted]') },
  '@/lib/i18n/format': loadFormat(),
  '@/lib/i18n/portal/notices': { noticesMessages: { en: dictionary.en.notices, vi: dictionary.vi.notices } },
  '@/lib/i18n/portal/rfqs': { rfqsMessages: { en: dictionary.en.rfqs, vi: dictionary.vi.rfqs } },
});
let supplier = { id: 's1', status: 'published', onboarding_status: 'approved', email: 'supplier@example.com' };
let migrated = true, emailSent = true;
let portalUser = { email: supplier.email, role: 'supplier', supplier_id: 's1', is_active: true };
const consent = contact.buyerContactConsentSpec({ company: 'Buyer Co', contact_name: 'Jane', email: 'buyer@example.com', phone: '123456', country: 'VN', website: null, business_type: null }, '2026-10-17T00:00:00Z', 'rfq_form');
let rfq = { id: 'r1', code: 'RFQ-1', buyer_id: 'b1', status: 'new', source_product_id: 'p1', preferred_supplier_ids: ['s1'], specs: { ...consent, notes: 'SECRET' }, quantity: 10, unit: 'MT', product_text: 'secret buyer@example.com', access_token: 'private-token' };
let match = { id: 'm1', rfq_id: 'r1', supplier_id: 's1', status: 'proposed', sent_to_supplier_at: null };
const mail = [], messages = [], writes = [];
const invites = () => match.sent_to_supplier_at ? [{ ...match, rfq: {
  code: rfq.code, source_product_id: rfq.source_product_id, preferred_supplier_ids: rfq.preferred_supplier_ids,
  unit: rfq.unit, quantity: rfq.quantity, destination_country: 'VN', status: rfq.status,
  ...consent,
} }] : [];
const products = [{ id: 'p1', supplier_id: 's1', name: 'Cashew W320' }];
const store = {
  getSupplier: async () => supplier,
  getUserByEmail: async (email) => portalUser && portalUser.email === email ? portalUser : null,
  listSupplierRfqInvitations: async () => { if (!migrated) throw Error('migration missing'); return invites(); },
  listSupplierNoticeReads: async () => [],
  listRfqMatches: async () => [match],
  updateRfqMatch: async (_, patch) => { writes.push(['match', patch]); Object.assign(match, patch); },
  updateRfq: async (_, patch) => { writes.push(['rfq', patch]); Object.assign(rfq, patch); },
  addMessage: async (message) => messages.push(message),
  listProductsBySupplier: async () => products,
  listCertificates: async () => [], listSupplierVerificationRequests: async () => [], listSubmissions: async () => [],
};
const emailInputs = [];
const publisher = load('lib/rfq/targeted-portal.ts', {
  './outreach': { buildRfqSupplierEmail: (input) => { emailInputs.push(input); return { subject: 'RFQ', html: '<p>Consented buyer details</p>', text: 'Consented buyer details' }; } },
  './buyer-contact': contact,
  './attach-buyer': { attachBuyerAfterDirectRfqDelivery: async (_store, _rfq, id) => {
    assert.equal(id, match.id); assert.ok(match.sent_to_supplier_at, 'CRM link only after a durable invitation');
    writes.push(['crm_link', id]); return true;
  } },
  '@/lib/site': { SITE_URL: 'https://example.com' },
  '@/lib/email/send': { transport: async (input) => { mail.push(input); return { ok: emailSent, status: emailSent ? 'sent' : 'failed', provider: 'test' }; } },
  '@/lib/config': { FROM_ADDRESS: 'Vexim <system@example.com>' },
  './reply-routing': { supplierReplyAddress: (_, id) => `rfq+${id}@example.com` },
  '@/lib/supplier-portal/onboarding': load('lib/supplier-portal/onboarding.ts', {}),
});
for (const patch of [ { status: 'spam' }, { status: 'needs_review' }, { preferred_supplier_ids: [] }, { preferred_supplier_ids: ['s1', 's2'] }, { specs: { inquiry_kind: 'supplier_question' } } ]) {
  assert.equal(await publisher.releaseTargetedQuoteToPortal(store, { ...rfq, ...patch }), 0);
}
supplier.onboarding_status = 'pending';
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 0);
supplier.onboarding_status = 'approved';
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, { ...rfq, specs: {} }), 0, 'Old anonymous requests cannot be published without separate consent');
assert.equal(writes.length + mail.length, 0);
supplier.onboarding_status = 'approved';
migrated = false;
await assert.rejects(publisher.releaseTargetedQuoteToPortal(store, rfq), /migration missing/);
assert.equal(writes.length + mail.length, 0, 'Moderation/approval/migration gates precede publishing and mail');
migrated = true;
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 1);
assert.equal(match.status, 'sent_to_supplier');
assert.ok(match.sent_to_supplier_at && match.response_due_at);
assert.equal(rfq.status, 'matching');
assert.equal(mail[0].replyTo, 'rfq+m1@example.com');
assert.equal(emailInputs[0].portalUrl, 'https://example.com/supplier/portal/rfqs', 'Nhà cung cấp có cổng được dẫn sang báo giá trên cổng');
assert.equal(mail[0].headers['X-Vexim-Anonymous'], undefined);
assert.equal(writes.filter(([kind]) => kind === 'crm_link').length, 1);
assert.equal(messages[0].created_by, null, 'System delivery must not fabricate a staff sender');
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, { ...rfq, status: 'new' }), 0, 'A retry does not re-publish/re-send');
assert.equal(mail.length, 1);
const input = { supplierId: 's1', supplier, invites: invites(), products, reads: [], certificates: [], reviews: [], requests: [], language: 'en', days: 30 };
const board = dashboard.buildSupplierDashboard(input);
assert.equal(board.tasks.length, 1);
assert.equal(board.invites[0].productId, 'p1');
assert.equal(board.report.sent, 1);
assert.ok(board.notices.some((n) => n.key === 'rfq:m1' && !n.read && n.href === '/supplier/portal/rfqs'));
assert.equal(board.invites[0].buyerContact.email, 'buyer@example.com');
assert.equal(board.invites[0].buyerContact.phone, '123456');
assert.doesNotMatch(JSON.stringify(board), /private-token|SECRET/);
assert.equal(dashboard.buildSupplierDashboard({ ...input, supplierId: 's2' }).invites.length, 0);
assert.equal(dashboard.buildSupplierDashboard({ ...input, reads: [{ supplier_id: 's1', notice_key: 'rfq:m1' }] }).notices.find((n) => n.key === 'rfq:m1').read, true);
let access = { supplier, store, reviews: [] };
const route = load('app/api/supplier-portal/notifications/route.ts', {
  'next/server': { NextResponse: { json: (data) => data } },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access },
  '@/lib/supplier-portal/onboarding': { portalApproved: (s) => s.onboarding_status === 'approved' },
  '@/lib/supplier-portal/dashboard': dashboard,
  '@/lib/i18n/server': { getLocale: async () => 'en' },
});
const response = await route.GET();
assert.equal(response.pendingRfqs, 1);
assert.equal(response.rfqsKnown, true);
assert.ok(response.unread > 0 && response.items.some((n) => n.key === 'rfq:m1'));
access = null;
assert.equal((await route.GET()).pendingRfqs, 0);
// Email failure is recorded, not a false 'sent' email, and does not erase portal delivery.
match = { ...match, id: 'm2', status: 'proposed', sent_to_supplier_at: null };
rfq.status = 'new'; emailSent = false;
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 1);
assert.equal(messages.at(-1).status, 'failed');
assert.equal(messages.at(-1).sent_at, null);
assert.ok(match.sent_to_supplier_at, 'In-app delivery remains available after SMTP failure');
// Hồ sơ Vexim tạo trong CRM (not_started, chưa có tài khoản cổng) nhận RFQ trực tiếp qua email,
// cùng luật với câu hỏi trực tiếp; có tài khoản cổng nhưng chưa được duyệt thì không.
match = { ...match, id: 'm4', status: 'proposed', sent_to_supplier_at: null };
rfq.status = 'new'; emailSent = true;
supplier = { ...supplier, onboarding_status: 'not_started' };
portalUser = { email: supplier.email, role: 'supplier', supplier_id: 's1', is_active: true };
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 0, 'Own unapproved portal account is not invited');
portalUser = null;
emailSent = false;
const linksBeforeMailFailure = writes.filter(([kind]) => kind === 'crm_link').length;
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 0, 'A staff-created supplier without a portal did not receive a failed email');
assert.equal(match.status, 'proposed'); assert.equal(match.sent_to_supplier_at, null);
assert.equal(writes.filter(([kind]) => kind === 'crm_link').length, linksBeforeMailFailure, 'Do not link a Buyer to a mail-only supplier on delivery failure');
emailSent = true;
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 1, 'Staff-created supplier receives the RFQ only after Resend accepts its email');
assert.equal(match.status, 'sent_to_supplier');
supplier = { ...supplier, onboarding_status: 'approved' };
portalUser = { email: supplier.email, role: 'supplier', supplier_id: 's1', is_active: true };
// RFQ gửi từ trang của đúng một nhà cung cấp (không gắn sản phẩm) cũng đi thẳng tới nhà cung cấp đó.
match = { ...match, id: 'm3', status: 'proposed', sent_to_supplier_at: null };
rfq.status = 'new'; emailSent = true;
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, { ...rfq, source_product_id: null, source_page: '/suppliers/s1' }), 1);
assert.equal(match.status, 'sent_to_supplier');
assert.match(read('app/crm/layout.tsx'), /pendingRfqs=\{pendingRfqs\}/);
assert.match(read('app/crm/layout.tsx'), /href: "\/crm\/rfqs".*pendingRfqs/);
assert.match(read('components/sidebar.tsx'), /item.href === "\/crm\/rfqs".*pendingRfqs/);
assert.match(read('components/supplier-sidebar.tsx'), /vexim:supplier-rfqs/);
assert.match(read('components/supplier-topbar.tsx'), /pendingRfqs !== previousRfqs.current\) router.refresh\(\)/);
console.log('✅ CRM server/client boundary and non-nested forms; targeted product → durable supplier invitation → tasks, bell API and badges; moderation/ownership/privacy/retry/mail-failure gates.');
