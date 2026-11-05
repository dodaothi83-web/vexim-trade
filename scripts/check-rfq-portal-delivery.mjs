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
const dashboard = load('lib/supplier-portal/dashboard.ts', {
  '@/lib/public/product-selection': { withoutDirectContacts: (s) => String(s).replace(/[\w.+-]+@[\w.-]+/g, '[redacted]') },
  '@/lib/i18n/format': loadFormat(),
  '@/lib/i18n/portal/notices': { noticesMessages: { en: dictionary.en.notices, vi: dictionary.vi.notices } },
  '@/lib/i18n/portal/rfqs': { rfqsMessages: { en: dictionary.en.rfqs, vi: dictionary.vi.rfqs } },
});
let supplier = { id: 's1', status: 'published', onboarding_status: 'approved', email: 'supplier@example.com' };
let migrated = true, emailSent = true;
let rfq = { id: 'r1', code: 'RFQ-1', status: 'new', source_product_id: 'p1', preferred_supplier_ids: ['s1'], specs: {}, quantity: 10, unit: 'MT', product_text: 'secret buyer@example.com', access_token: 'private-token' };
let match = { id: 'm1', rfq_id: 'r1', supplier_id: 's1', status: 'proposed', sent_to_supplier_at: null };
const mail = [], messages = [], writes = [];
const invites = () => match.sent_to_supplier_at ? [{ ...match, rfq }] : [];
const products = [{ id: 'p1', supplier_id: 's1', name: 'Cashew W320' }];
const store = {
  getSupplier: async () => supplier,
  listSupplierRfqInvitations: async () => { if (!migrated) throw Error('migration missing'); return invites(); },
  listSupplierNoticeReads: async () => [],
  listRfqMatches: async () => [match],
  updateRfqMatch: async (_, patch) => { writes.push(['match', patch]); Object.assign(match, patch); },
  updateRfq: async (_, patch) => { writes.push(['rfq', patch]); Object.assign(rfq, patch); },
  addMessage: async (message) => messages.push(message),
  listProductsBySupplier: async () => products,
  listCertificates: async () => [], listSupplierVerificationRequests: async () => [], listSubmissions: async () => [],
};
const publisher = load('lib/rfq/targeted-portal.ts', {
  './outreach': { buildRfqSupplierEmail: () => ({ subject: 'Anonymous RFQ', html: '<p>Commercial specification</p>', text: 'Commercial specification' }) },
  '@/lib/email/send': { transport: async (input) => { mail.push(input); return { ok: emailSent, status: emailSent ? 'sent' : 'failed', provider: 'test' }; } },
  '@/lib/config': { FROM_ADDRESS: 'Vexim <system@example.com>' },
  './reply-routing': { supplierReplyAddress: (_, id) => `rfq+${id}@example.com` },
});
for (const patch of [ { status: 'spam' }, { status: 'needs_review' }, { source_product_id: null }, { preferred_supplier_ids: ['s1', 's2'] }, { specs: { inquiry_kind: 'supplier_question' } } ]) {
  assert.equal(await publisher.releaseTargetedQuoteToPortal(store, { ...rfq, ...patch }), 0);
}
supplier.onboarding_status = 'pending';
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, rfq), 0);
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
assert.equal(mail[0].headers['X-Vexim-Anonymous'], '1');
assert.equal(messages[0].created_by, null, 'System delivery must not fabricate a staff sender');
assert.equal(await publisher.releaseTargetedQuoteToPortal(store, { ...rfq, status: 'new' }), 0, 'A retry does not re-publish/re-send');
assert.equal(mail.length, 1);
const input = { supplierId: 's1', supplier, invites: invites(), products, reads: [], certificates: [], reviews: [], requests: [], language: 'en', days: 30 };
const board = dashboard.buildSupplierDashboard(input);
assert.equal(board.tasks.length, 1);
assert.equal(board.invites[0].productId, 'p1');
assert.equal(board.report.sent, 1);
assert.ok(board.notices.some((n) => n.key === 'rfq:m1' && !n.read && n.href === '/supplier/portal/rfqs'));
assert.doesNotMatch(JSON.stringify(board), /buyer@example.com|private-token/);
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
assert.match(read('app/crm/layout.tsx'), /pendingRfqs=\{pendingRfqs\}/);
assert.match(read('app/crm/layout.tsx'), /href: "\/crm\/rfqs".*pendingRfqs/);
assert.match(read('components/sidebar.tsx'), /item.href === "\/crm\/rfqs".*pendingRfqs/);
assert.match(read('components/supplier-sidebar.tsx'), /vexim:supplier-rfqs/);
assert.match(read('components/supplier-topbar.tsx'), /pendingRfqs !== previousRfqs.current\) router.refresh\(\)/);
console.log('✅ CRM server/client boundary and non-nested forms; targeted product → durable supplier invitation → tasks, bell API and badges; moderation/ownership/privacy/retry/mail-failure gates.');
