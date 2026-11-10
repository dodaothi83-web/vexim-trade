// node scripts/check-supplier-rfq-page.mjs — a first-time supplier sees the buyer's actual request,
// one clear way to quote, and an optional Vexim email route without any unauthorized contacts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadPortalDictionary } from './lib/portal-dictionary.mjs';
import { loadFormat } from './lib/i18n-format.mjs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function loadTs(source, mocks = {}, extras = {}, jsxMode = false) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: jsxMode ? ts.JsxEmit.ReactJSX : undefined },
  }).outputText;
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, React, Date, Promise, Map, Set, console,
    require(key) { assert.ok(key in mocks, `Unexpected import: ${key}`); return mocks[key]; },
    ...extras,
  });
  return mod.exports;
}
const dictionary = loadPortalDictionary();
const contact = loadTs(read('lib/rfq/buyer-contact.ts'));
const channel = loadTs(read('lib/rfq/channel.ts'));
const scrub = (value) => String(value)
  .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[contact via Vexim]')
  .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, '[contact via Vexim]')
  .replace(/\+?\d[\d ()-]{8,}\d/g, '[contact via Vexim]');
const boardModule = loadTs(read('lib/supplier-portal/dashboard.ts'), {
  '@/lib/rfq/buyer-contact': contact,
  '@/lib/rfq/channel': channel,
  '@/lib/public/product-selection': { withoutDirectContacts: scrub },
  '@/lib/i18n/format': loadFormat(),
  '@/lib/i18n/portal/notices': { noticesMessages: { vi: dictionary.vi.notices, en: dictionary.en.notices } },
  '@/lib/i18n/portal/rfqs': { rfqsMessages: { vi: dictionary.vi.rfqs, en: dictionary.en.rfqs } },
});

// Exercise the local store's real projection, which mirrors the production Supabase allowlist.
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const oldId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const supplierId = 'supplier-1';
const consent = contact.buyerContactConsentSpec({ company: 'Consented Buyer', contact_name: 'Jane',
  email: 'allowed@example.com', phone: '1234567', country: 'VN', website: null, business_type: null },
  '2026-10-17T00:00:00Z', 'rfq_form');
const db = {
  rfqs: [
    { id: 'r-new', code: 'RFQ-20261110-00001', product_text: 'Mixed dried fruit chips, vacuum packed. Call buyer@private.io',
      buyer_id: 'PRIVATE-BUYER-ID', access_token: 'PRIVATE-TOKEN', quantity: 5, unit: 'MT',
      frequency: 'Monthly', destination_country: 'India', incoterm: 'FOB', needed_by: null,
      wants_samples: true, wants_inspection: false, wants_video_call: false,
      source_product_id: 'p1', source_page: '/products/p1', preferred_supplier_ids: [supplierId], status: 'matching',
      specs: { grade: 'Mixed grades', packaging: 'Vacuum bags, 10 kg', certifications: 'HACCP',
        destination_port: 'Chennai', shipment_month: '2027-01', notes: 'PRIVATE-INTERNAL-NOTE',
        buyer_contact: { email: 'buyer@private.io' } } },
    { id: 'r-old', code: 'RFQ-20261017-00002', product_text: 'Cashew W320', buyer_id: 'PRIVATE-BUYER-ID',
      quantity: 2, unit: 'MT', frequency: null, destination_country: 'Japan', incoterm: null, needed_by: null,
      wants_samples: false, wants_inspection: false, wants_video_call: false,
      source_product_id: null, source_page: '/rfq', preferred_supplier_ids: [supplierId], status: 'matching',
      specs: { ...consent, notes: 'PRIVATE-INTERNAL-NOTE' } },
  ],
  rfq_matches: [
    { id, rfq_id: 'r-new', supplier_id: supplierId, status: 'sent_to_supplier',
      sent_to_supplier_at: '2026-11-10T04:07:12Z', response_due_at: '2026-11-13T04:07:12Z', supplier_replied_at: null,
      quote_price: null, created_at: '2026-11-10T04:07:12Z', updated_at: '2026-11-10T04:07:12Z' },
    { id: oldId, rfq_id: 'r-old', supplier_id: supplierId, status: 'quoted',
      sent_to_supplier_at: '2026-10-17T00:00:00Z', response_due_at: null,
      supplier_replied_at: '2026-10-18T00:00:00Z', quote_price: 6.25, quote_currency: 'USD', quote_unit: 'kg',
      created_at: '2026-10-17T00:00:00Z', updated_at: '2026-10-18T00:00:00Z' },
    { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', rfq_id: 'r-old', supplier_id: supplierId,
      status: 'proposed', sent_to_supplier_at: null },
    { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', rfq_id: 'r-new', supplier_id: 'foreign',
      status: 'sent_to_supplier', sent_to_supplier_at: '2026-11-10T04:07:12Z' },
  ],
};
const localSource = ts.createSourceFile('lib/db/local.ts', read('lib/db/local.ts'), ts.ScriptTarget.Latest, true);
let listMethod;
(function find(node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(localSource) === 'listSupplierRfqInvitations') listMethod = node;
  ts.forEachChild(node, find);
})(localSource);
assert.ok(listMethod);
const local = loadTs(`const store = { ${listMethod.getText(localSource)} }; exports.store = store;`, {}, { load: () => db }).store;
const rows = await local.listSupplierRfqInvitations(supplierId);
assert.equal(rows.length, 2, 'Only actually sent invitations for this supplier');
assert.equal(rows[0].rfq.grade, 'Mixed grades');
assert.equal(rows[0].rfq.destination_port, 'Chennai');
assert.doesNotMatch(JSON.stringify(rows), /PRIVATE-TOKEN|PRIVATE-INTERNAL-NOTE|PRIVATE-BUYER-ID/);

const select = read('lib/db/supabase.ts').match(/async listSupplierRfqInvitations\(supplierId\) \{([\s\S]*?)\n  \},/)?.[1];
assert.ok(select, 'Supabase supplier projection exists');
assert.match(select, /rfq:rfqs!inner\([\s\S]{0,80}product_text/);
assert.match(select, /grade:specs->>grade,packaging:specs->>packaging,certifications:specs->>certifications/);
assert.match(select, /destination_port:specs->>destination_port,shipment_month:specs->>shipment_month/);
assert.match(select, /\.eq\("supplier_id", supplierId\)\.not\("sent_to_supplier_at", "is", null\)\.neq\("status", "proposed"\)/);
assert.doesNotMatch(select, /(?:\bspecs\b\s*[,)]|\bnotes\b|\baccess_token\b|\bbuyer_id\b|\btarget_price\b)/,
  'No full specs, internal notes, buyer row or private budget may reach the supplier');

const products = [{ id: 'p1', supplier_id: supplierId, name: 'Mixed dried fruit chips' }];
const input = { supplierId, invites: rows, products, days: 30, language: 'vi' };
const board = boardModule.buildSupplierRfqBoard(input);
assert.equal(board.tasks.length, 1);
assert.equal(board.invites.length, 2);
assert.match(board.tasks[0].request.description, /Mixed dried fruit chips, vacuum packed/);
assert.doesNotMatch(board.tasks[0].request.description, /buyer@private.io/);
assert.equal(board.tasks[0].buyerContact, null, 'Old RFQ does not gain contact consent from a stored object alone');
assert.equal(board.invites[1].buyerContact.email, 'allowed@example.com');
assert.doesNotMatch(JSON.stringify(board), /PRIVATE-TOKEN|PRIVATE-INTERNAL-NOTE|PRIVATE-BUYER-ID|buyer@private\.io/);

// Render the real server page with a safe mocked quote component. No duplicate invitation,
// no three competing email buttons beside the quote, and report/history stay accessible.
const Link = ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);
const MockQuote = ({ matchId, editing, copy }) => React.createElement('div', { 'data-quote-for': matchId, 'data-editing': editing }, editing ? copy.revise : copy.open);
let access = { supplier: { id: supplierId, email: 'supplier@example.com', onboarding_status: 'approved' },
  store: { listSupplierRfqInvitations: async () => rows, listProductsBySupplier: async () => products } };
let locale = 'vi';
const page = loadTs(read('app/supplier/portal/rfqs/page.tsx'), {
  'react/jsx-runtime': jsx,
  'next/link': { default: Link },
  'next/navigation': { redirect: (path) => { throw new Error(`redirect:${path}`); } },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/page-header': { PageHeader: ({ title, sub }) => React.createElement('header', null,
    React.createElement('h1', null, title), React.createElement('p', null, sub)) },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access },
  '@/lib/supplier-portal/onboarding': { portalApproved: (supplier) => supplier.onboarding_status === 'approved' },
  '@/lib/supplier-portal/dashboard': boardModule,
  '@/lib/rfq/reply-routing': { supplierReplyAddress: (code, matchId) => `rfq+${code}-${matchId}@veximtrade.com` },
  '@/lib/db/migration-hints': { migrationHint: () => null },
  '@/lib/i18n/server': { getPortalMessages: async () => ({ locale, intl: locale === 'vi' ? 'vi-VN' : 'en-US', m: dictionary[locale] }) },
  '@/lib/i18n/format': loadFormat(),
  '../portal-ui': { EmptyRow: ({ children }) => React.createElement('p', null, children), date: () => '13/11/2026' },
  '@/components/supplier-rfq-reply': { SupplierRfqReply: ({ address }) => React.createElement('a', { href: `mailto:${address}` }, 'Vexim email route') },
  '@/lib/supplier-portal/quote': { QUOTE_CURRENCIES: ['USD'], QUOTE_INCOTERMS: ['FOB'] },
  './quote-form': { SupplierQuoteForm: MockQuote },
}, { console: { error() {} } }, true);
function view(element) {
  return new JSDOM(renderToStaticMarkup(React.createElement('main', null, element)));
}
const dom = view(await page.default({ searchParams: Promise.resolve({}) }));
const doc = dom.window.document;
const pending = doc.querySelector('#rfq-pending')?.closest('section');
const history = doc.querySelector('#rfq-history')?.closest('section');
assert.ok(pending && history);
assert.equal(pending.querySelectorAll('article').length, 1);
assert.equal(history.querySelectorAll('li').length, 1, 'Pending RFQ must not be duplicated in history');
assert.equal(pending.querySelectorAll(`[data-quote-for="${id}"]`).length, 1);
assert.equal(history.querySelectorAll(`[data-quote-for="${id}"]`).length, 0);
assert.match(pending.textContent, /Mixed dried fruit chips, vacuum packed/);
assert.match(pending.textContent, /Chennai|Mixed grades|HACCP|01\/2027/);
assert.match(pending.textContent, /Nhập báo giá/);
assert.match(pending.textContent, /không cần gửi email/i);
assert.match(pending.textContent, /Liên hệ người mua chưa được chia sẻ/);
assert.doesNotMatch(doc.body.textContent, /buyer@private\.io|PRIVATE-TOKEN|PRIVATE-INTERNAL-NOTE|PRIVATE-BUYER-ID/);
assert.equal(pending.querySelector('a[href^="mailto:"]')?.closest('details')?.open, false,
  'Email route is a secondary, collapsed choice');
assert.equal(history.querySelector('details')?.open, false, 'Completed RFQs start collapsed');
assert.match(history.textContent, /allowed@example\.com/, 'Consented historical contact is still accessible in its own RFQ');
assert.equal(doc.querySelector('#rfq-report')?.open, false, 'Analytics does not distract from the main action');
assert.equal(doc.querySelector('#rfq-report')?.querySelectorAll('a[href*="report=1"]').length, 3);

locale = 'en';
const english = view(await page.default({ searchParams: Promise.resolve({ report: '1', range: '7' }) })).window.document;
assert.match(english.querySelector('#rfq-pending')?.closest('section')?.textContent, /What the buyer needs|Enter a quote/);
assert.equal(english.querySelector('#rfq-report')?.open, true, 'Report range link preserves the expanded report');
assert.doesNotMatch(english.body.textContent, /buyer@private\.io/);

locale = 'vi';
const originalList = access.store.listSupplierRfqInvitations;
access.store.listSupplierRfqInvitations = async () => [];
const empty = view(await page.default({ searchParams: Promise.resolve({}) })).window.document;
assert.match(empty.body.textContent, /Hiện không có yêu cầu nào cần báo giá/);
assert.equal(empty.querySelector('#rfq-history'), null);
assert.equal(empty.querySelector('#rfq-report'), null);
access.store.listSupplierRfqInvitations = async () => { throw Error('RFQ read failed'); };
const degraded = view(await page.default({ searchParams: Promise.resolve({}) })).window.document;
assert.match(degraded.body.textContent, /Một phần dữ liệu RFQ chưa tải được/);
assert.doesNotMatch(degraded.body.textContent, /Hiện không có yêu cầu nào cần báo giá/,
  'A load failure must not claim there are no RFQs');
access.store.listSupplierRfqInvitations = originalList;

// Render the real quote form: "Enter quote" opens a form, and only "Send quote" submits it.
const formDom = new JSDOM('<div id="quote-root"></div>', { url: 'https://example.com/supplier/portal/rfqs' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Event', 'MouseEvent', 'Node']) globalThis[key] = formDom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const formModule = loadTs(read('app/supplier/portal/rfqs/quote-form.tsx'), {
  react: React, 'react/jsx-runtime': jsx,
  'lucide-react': new Proxy({}, { get: () => () => null }),
  './quote-actions': { submitSupplierQuoteAction: async () => ({ error: null }) },
}, { window: formDom.window, document: formDom.window.document }, true);
const formRoot = createRoot(document.getElementById('quote-root'));
await act(async () => formRoot.render(React.createElement(formModule.SupplierQuoteForm, {
  matchId: id, code: 'RFQ-20261110-00001', defaults: board.tasks[0].quoteDefaults,
  currencies: ['USD', 'EUR'], incoterms: ['FOB', 'CIF'], editing: false,
  copy: dictionary.vi.rfqs.quote,
})));
const formDetails = document.querySelector('#quote-root details');
assert.equal(formDetails.open, false);
assert.match(formDetails.querySelector('summary').textContent, /Nhập báo giá/);
assert.match(formDetails.querySelector('button[value="quote"]').textContent, /Gửi báo giá/);
for (const name of ['price', 'unit', 'lead_time_days'])
  assert.equal(formDetails.querySelector(`[name="${name}"]`).required, true, `${name} must be filled in`);
assert.equal(formDetails.querySelector('input[name="unit"]').value, 'MT', 'RFQ unit is pre-filled');
assert.equal(formDetails.querySelector('button[value="decline"]').formNoValidate, true, 'Declining does not require a price');
await act(async () => formRoot.unmount());

const replyModule = loadTs(read('components/supplier-rfq-reply.tsx'), {
  react: React, 'react/jsx-runtime': jsx,
  'lucide-react': new Proxy({}, { get: () => () => null }),
}, { window: formDom.window, document: formDom.window.document }, true);
const route = 'rfq+test-match@veximtrade.com';
const replyRoot = createRoot(document.getElementById('quote-root'));
await act(async () => replyRoot.render(React.createElement(replyModule.SupplierRfqReply, {
  address: route, subject: 'Hỏi về RFQ-20261110-00001',
  labels: { gmail: 'Mở Gmail', app: 'Ứng dụng email khác', copy: 'Sao chép địa chỉ',
    copied: 'Đã sao chép', address: 'Gửi tới Vexim:' },
})));
assert.match(document.querySelector('#quote-root').textContent, /Gửi tới Vexim:\s*rfq\+test-match@veximtrade\.com/);
assert.match(document.querySelector('a[href^="https://mail.google.com/"]')?.href, /to=rfq%2Btest-match%40veximtrade\.com/);
assert.match(document.querySelector('a[href^="mailto:"]')?.href, /rfq\+test-match@veximtrade\.com/);
await act(async () => replyRoot.unmount());

access = null;
await assert.rejects(page.default({ searchParams: Promise.resolve({}) }), /redirect:\/login/);
console.log('✅ Supplier RFQ page: full buyer request, one quote path, optional Vexim email, single history row, safe projections and consent.');
