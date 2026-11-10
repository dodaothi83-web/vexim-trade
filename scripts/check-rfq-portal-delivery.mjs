// Direct RFQs go to each named supplier's approved portal; email is optional link-only notice.
// No real mail or database. CRM detail remains a read-only support view for direct RFQs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadPortalDictionary } from './lib/portal-dictionary.mjs';
import { loadFormat } from './lib/i18n-format.mjs';
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, Date, Set, console, require(id) { assert.ok(id in mocks, `${file}: unexpected ${id}`); return mocks[id]; } });
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
assert.match(read('app/crm/rfqs/[id]/page.tsx'), /canManageRfq = hasManagePermission && channel === "sourcing"/);
assert.match(read('app/crm/layout.tsx'), /rfqChannel\(r\) === "question" && UNCLAIMED_RFQ_STATUSES/);
assert.match(read('components/confirm-submit-button.tsx'), /window\.confirm\(message\)/);

const contact = load('lib/rfq/buyer-contact.ts');
const channel = load('lib/rfq/channel.ts');
const onboarding = load('lib/supplier-portal/onboarding.ts');
const core = load('lib/rfq/portal-core.ts', {
  '@/lib/public/product-selection': { withoutDirectContacts: (s) => String(s).replace(/[\w.+-]+@[\w.-]+/g, '[redacted]') },
  './buyer-contact': contact, './channel': channel,
});
const dictionary = loadPortalDictionary();
const dashboard = load('lib/supplier-portal/dashboard.ts', {
  '@/lib/rfq/buyer-contact': contact, '@/lib/rfq/channel': channel,
  '@/lib/rfq/mediated': { deskHasNewReply: () => false }, '@/lib/rfq/portal-core': core,
  '@/lib/public/display-name': load('lib/public/display-name.ts'),
  '@/lib/public/product-selection': { withoutDirectContacts: (s) => String(s).replace(/[\w.+-]+@[\w.-]+/g, '[redacted]') },
  '@/lib/i18n/format': loadFormat(),
  '@/lib/i18n/portal/notices': { noticesMessages: { vi: dictionary.vi.notices, en: dictionary.en.notices } },
  '@/lib/i18n/portal/rfqs': { rfqsMessages: { vi: dictionary.vi.rfqs, en: dictionary.en.rfqs } },
});
const suppliers = ['s1', 's2'].map((id) => ({ id, status: 'published', onboarding_status: 'approved', email: `${id}@legacy.example`, name: `Supplier ${id}` }));
const accounts = Object.fromEntries(suppliers.map((s) => [s.id, { email: `${s.id}@portal.example`, role: 'supplier', supplier_id: s.id, is_active: true }]));
const consent = contact.buyerContactConsentSpec({ company: 'Buyer Co', contact_name: 'Jane', email: 'buyer@example.com', phone: '123456', country: 'VN', website: null, business_type: null }, '2026-11-09T00:00:00Z', 'rfq_form');
const rfq = { id: 'r1', code: 'RFQ-1', buyer_id: 'b1', status: 'new', spam_score: 0, source_page: '/rfq',
  source_product_id: null, preferred_supplier_ids: ['s1', 's2'], specs: { ...consent, direct_delivery_version: 'portal_direct_v2', notes: 'SECRET INTERNAL' },
  product_text: 'Cashew W320 contact buyer@private.io', quantity: 10, unit: 'MT', access_token: 'PRIVATE-TOKEN' };
const matches = suppliers.map((s, i) => ({ id: `m${i + 1}`, rfq_id: rfq.id, supplier_id: s.id, status: 'proposed', sent_to_supplier_at: null }));
const mail = [], writes = [];
let migrated = true, mailOk = true;
const store = {
  getSupplier: async (id) => suppliers.find((s) => s.id === id) ?? null,
  getUserBySupplierId: async (id) => accounts[id] ?? null,
  listSupplierRfqInvitations: async () => { if (!migrated) throw Error('migration missing'); return []; },
  listSupplierNoticeReads: async () => [], listRfqMatches: async () => matches,
  updateRfqMatch: async (id, patch) => { Object.assign(matches.find((m) => m.id === id), patch); writes.push([id, patch]); },
  updateRfq: async (_, patch) => Object.assign(rfq, patch),
};
const templates = { escapeHtml: (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;'), wrapPlainEmail: ({ body }) => body };
const notify = async (input) => { mail.push(input); return { ok: mailOk, status: mailOk ? 'sent' : 'failed', provider: 'test' }; };
const outreach = load('lib/rfq/outreach.ts', {
  '@/lib/email/templates': templates, '@/lib/email/send': { transport: notify },
  '@/lib/config': { FROM_ADDRESS: 'Vexim <system@example.com>' },
  '@/lib/site': { SITE_URL: 'https://example.com' }, '@/lib/db': { getStore: () => store },
  '@/lib/supplier-portal/onboarding': onboarding, './buyer-contact': contact, './channel': channel,
});
const publisher = load('lib/rfq/targeted-portal.ts', {
  './outreach': outreach, '@/lib/email/send': { transport: notify },
  '@/lib/config': { FROM_ADDRESS: 'Vexim <system@example.com>' },
  '@/lib/site': { SITE_URL: 'https://example.com' },
  '@/lib/supplier-portal/onboarding': onboarding, './buyer-contact': contact, './channel': channel,
});
for (const patch of [{ status: 'spam' }, { status: 'needs_review' }, { preferred_supplier_ids: [] },
  { specs: { inquiry_kind: 'supplier_question' }, source_page: '/rfq?intent=question' }]) {
  assert.equal(await publisher.releaseTargetedQuoteToPortal(store, { ...rfq, ...patch }), 0);
}
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, { ...rfq, specs: {} }), 0, 'No retroactive contact consent');
suppliers[1].onboarding_status = 'pending';
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 0, 'One ineligible named recipient blocks the whole delivery');
suppliers[1].onboarding_status = 'approved';
accounts.s2 = null;
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 0, 'No email-only fallback for a supplier without an account');
accounts.s2 = { email: 's2@portal.example', role: 'supplier', supplier_id: 's2', is_active: true };
accounts.s2.is_active = false;
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 0, 'Inactive account cannot receive RFQ');
accounts.s2.is_active = true;
assert.equal(writes.length + mail.length, 0, 'Invalid recipients never create partial portal delivery');
migrated = false;
await assert.rejects(publisher.releaseTargetedQuoteToPortal(store, rfq), /migration missing/);
assert.equal(writes.length + mail.length, 0, 'Migration failure is not disguised by an email send');
migrated = true;
mailOk = false;
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 2, 'Both named suppliers receive durable invitations despite SMTP failure');
assert.ok(matches.every((m) => m.status === 'sent_to_supplier' && m.sent_to_supplier_at && m.response_due_at));
assert.equal(rfq.status, 'matching');
assert.equal(mail.length, 2, 'Only portal accounts receive optional notice');
for (const [index, notice] of mail.entries()) {
  assert.equal(notice.to[0], accounts[`s${index + 1}`].email, 'Never fall back to the legacy CRM email');
  assert.ok(notice.html.includes(`/supplier/portal/rfqs/m${index + 1}`));
  assert.doesNotMatch(JSON.stringify(notice), /SECRET|PRIVATE-TOKEN|buyer@example\.com|private\.io|123456|replyTo/);
}
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 0, 'Retry cannot duplicate an invitation or mail');
assert.equal(mail.length, 2);
const invite = { ...matches[0], rfq: { code: rfq.code, source_page: rfq.source_page, source_product_id: null,
  preferred_supplier_ids: rfq.preferred_supplier_ids, status: rfq.status, quantity: rfq.quantity, unit: rfq.unit,
  product_text: rfq.product_text, ...consent } };
const board = dashboard.buildSupplierDashboard({ supplierId: 's1', supplier: suppliers[0], invites: [invite], products: [],
  reads: [], reviews: [], requests: [], certificates: [], language: 'en', days: 30 });
assert.equal(board.tasks.length, 1);
assert.equal(board.invites[0].buyerContact.email, 'buyer@example.com');
assert.ok(board.notices.some((n) => n.key === 'rfq:m1' && n.href === '/supplier/portal/rfqs'));
assert.doesNotMatch(JSON.stringify(board), /SECRET|PRIVATE-TOKEN|private\.io/);
console.log('✅ Direct portal: multiple named suppliers, no staff/email fallback, eligibility & consent gates, link-only notice, SMTP failure and idempotence.');
