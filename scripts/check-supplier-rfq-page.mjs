// node scripts/check-supplier-rfq-page.mjs — a supplier sees the verified linked product (or a truthful
// fallback), the buyer's actual request, one clear quote path, and no unauthorized contact/media.
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
    module: mod, exports: mod.exports, React, Date, Promise, Map, Set, URLSearchParams, console,
    require(key) { assert.ok(key in mocks, `Unexpected import: ${key}`); return mocks[key]; },
    ...extras,
  });
  return mod.exports;
}
const dictionary = loadPortalDictionary();
const contact = loadTs(read('lib/rfq/buyer-contact.ts'));
const channel = loadTs(read('lib/rfq/channel.ts'));
const displayName = loadTs(read('lib/public/display-name.ts'));
const scrub = (value) => String(value)
  .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[contact via Vexim]')
  .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, '[contact via Vexim]')
  .replace(/\+?\d[\d ()-]{8,}\d/g, '[contact via Vexim]');
const core = loadTs(read('lib/rfq/portal-core.ts'), {
  '@/lib/public/product-selection': { withoutDirectContacts: scrub },
  './buyer-contact': contact, './channel': channel,
});
const boardModule = loadTs(read('lib/supplier-portal/dashboard.ts'), {
  '@/lib/rfq/buyer-contact': contact,
  '@/lib/rfq/channel': channel,
  '@/lib/rfq/mediated': { deskHasNewReply: (thread, side) => !!thread && !!(side === 'staff' ? thread.last_party_message_at : thread.last_staff_message_at) },
  '@/lib/rfq/portal-core': core,
  '@/lib/public/display-name': displayName,
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
const mediatedConsent = contact.buyerContactConsentSpec(consent.buyer_contact, '2026-10-17T00:00:00Z', 'rfq_form', true);
const db = {
  rfqs: [
    { id: 'r-new', code: 'RFQ-20261110-00001', product_text: 'Mixed dried fruit chips, vacuum packed. Call buyer@private.io',
      buyer_id: 'PRIVATE-BUYER-ID', access_token: 'PRIVATE-TOKEN', quantity: 5, unit: 'MT',
      frequency: 'Monthly', destination_country: 'India', incoterm: 'FOB', needed_by: null,
      wants_samples: true, wants_inspection: false, wants_video_call: false,
      source_product_id: 'p1', source_page: '/products/p1', preferred_supplier_ids: [supplierId], status: 'matching',
      specs: { ...mediatedConsent, sourcing_request_id: 'req-1', grade: 'Mixed grades', packaging: 'Vacuum bags, 10 kg', certifications: 'HACCP',
        destination_port: 'Chennai', shipment_month: '2027-01', notes: 'PRIVATE-INTERNAL-NOTE',
        } },
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

const products = [
  { id: 'p1', supplier_id: supplierId, name: 'Mixed dried fruit chips',
    display_name: 'Wholesale mixed dried fruit chips', spec: 'Fruit chips. Contact private@secret.io',
    packaging: '10 kg cartons', moq: '1 MT', featured_media_id: 'photo-featured',
    internal_note: 'PRIVATE-PRODUCT-NOTE' },
  { id: 'p-foreign', supplier_id: 'foreign', name: 'PRIVATE-FOREIGN-PRODUCT' },
];
const media = [
  { id: 'photo-first', owner_type: 'product', product_id: 'p1', supplier_id: supplierId,
    kind: 'image', audience: 'buyer', storage_path: 'supplier/supplier-1/p1/first.jpg' },
  { id: 'photo-featured', owner_type: 'product', product_id: 'p1', supplier_id: supplierId,
    kind: 'image', audience: 'buyer', storage_path: 'supplier/supplier-1/p1/featured.webp' },
  { id: 'photo-internal', owner_type: 'product', product_id: 'p1', supplier_id: supplierId,
    kind: 'image', audience: 'internal', created_by: 'staff', storage_path: 'PRIVATE-INTERNAL-PHOTO.jpg' },
  { id: 'photo-foreign', owner_type: 'product', product_id: 'p1', supplier_id: 'foreign',
    kind: 'image', audience: 'buyer', storage_path: 'PRIVATE-FOREIGN-PHOTO.jpg' },
  { id: 'photo-other-owner', owner_type: 'supplier', product_id: 'p1', supplier_id: supplierId,
    kind: 'image', audience: 'buyer', storage_path: 'PRIVATE-OTHER-PHOTO.jpg' },
];
const productView = loadTs(read('lib/supplier-portal/product-view.ts'));
const input = { supplierId, invites: rows, products, days: 30, language: 'vi' };
const board = boardModule.buildSupplierRfqBoard(input);
assert.equal(board.tasks.length, 1);
assert.equal(board.invites.length, 2);
assert.equal(board.tasks[0].title, 'Wholesale mixed dried fruit chips', 'Product card uses the buyer-facing catalog title');
assert.equal(board.tasks[0].linkedProduct.moq, '1 MT');
assert.equal(board.tasks[0].linkedProduct.packaging, '10 kg cartons');
assert.match(board.tasks[0].linkedProduct.spec, /Fruit chips\. Contact \[liên hệ qua Vexim\]/);
assert.equal(board.invites[1].linkedProduct, null, 'Unlinked RFQ has no guessed catalog card');
assert.equal(boardModule.buildSupplierRfqBoard({ ...input, invites: [
  { ...rows[0], rfq: { ...rows[0].rfq, source_product_id: 'p-foreign' } },
] }).invites[0].linkedProduct, null, 'Foreign source product cannot appear in this supplier portal');
assert.match(board.tasks[0].request.description, /Mixed dried fruit chips, vacuum packed/);
assert.doesNotMatch(board.tasks[0].request.description, /buyer@private.io/);
assert.equal(board.tasks[0].buyerContact, null, 'Old RFQ does not gain contact consent from a stored object alone');
assert.equal(board.invites[1].buyerContact.email, 'allowed@example.com');
assert.doesNotMatch(JSON.stringify(board), /PRIVATE-TOKEN|PRIVATE-INTERNAL-NOTE|PRIVATE-BUYER-ID|buyer@private\.io|private@secret\.io|PRIVATE-PRODUCT-NOTE|PRIVATE-FOREIGN-PRODUCT/);

// Render the real server page with a safe mocked quote component. No duplicate invitation,
// no three competing email buttons beside the quote, and report/history stay accessible.
const Link = ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);
const MockQuote = ({ matchId, editing, copy }) => React.createElement('div', { 'data-quote-for': matchId, 'data-editing': editing }, editing ? copy.revise : copy.open);
const mediaCalls = [];
let access = { supplier: { id: supplierId, email: 'supplier@example.com', onboarding_status: 'approved' },
  user: { id: 'supplier-user' },
  store: { listSupplierRfqInvitations: async () => rows, listProductsBySupplier: async () => products,
    listMediaForProducts: async (ids) => { mediaCalls.push([...ids]); return media; } } };
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
  '@/lib/supplier-portal/product-view': productView,
  '@/lib/rfq/reply-routing': { supplierReplyAddress: (code, matchId) => `rfq+${code}-${matchId}@veximtrade.com` },
  '@/lib/db/migration-hints': { migrationHint: () => null },
  '@/lib/i18n/server': { getPortalMessages: async () => ({ locale, intl: locale === 'vi' ? 'vi-VN' : 'en-US', m: dictionary[locale] }) },
  '@/lib/i18n/format': loadFormat(),
  '../portal-ui': { EmptyRow: ({ children }) => React.createElement('p', null, children), date: () => '13/11/2026' },
  '@/components/supplier-rfq-reply': { SupplierRfqReply: ({ address }) => React.createElement('a', { href: `mailto:${address}` }, 'Vexim email route') },
  '@/lib/supplier-portal/quote': { QUOTE_CURRENCIES: ['USD'], QUOTE_INCOTERMS: ['FOB'] },
  './quote-form': { SupplierQuoteForm: MockQuote },
  './request-details': loadTs(read('app/supplier/portal/rfqs/request-details.tsx'), { 'react/jsx-runtime': jsx }, {}, true),
}, { console: { error() {} } }, true);
function view(element) {
  return new JSDOM(renderToStaticMarkup(React.createElement('main', null, element)));
}
const dom = view(await page.default({ searchParams: Promise.resolve({}) }));
const doc = dom.window.document;
const pending = doc.querySelector('#rfq-pending')?.closest('section');
const history = doc.querySelector('#rfq-history')?.closest('section');
assert.ok(pending && history);
assert.equal(pending.querySelectorAll('li').length, 1);
assert.equal(history.querySelectorAll('li').length, 1, 'Pending RFQ must not be duplicated in history');
assert.equal(pending.querySelectorAll('[data-quote-for]').length, 0, 'Quote entry belongs on the detail page, not the summary list');
assert.equal(mediaCalls.length, 1, 'Summary cards fetch media only for currently visible linked products');
assert.equal(mediaCalls[0].join(','), 'p1');
assert.match(pending.textContent, /Wholesale mixed dried fruit chips/);
assert.match(pending.textContent, /RFQ-20261110-00001/);
assert.match(pending.textContent, /5 MT/);
assert.match(pending.textContent, /Chennai/);
assert.match(pending.textContent, /Chờ bạn phản hồi/);
assert.equal(pending.querySelector('li img')?.getAttribute('src'), '/api/media/file/supplier/supplier-1/p1/featured.webp',
  'The product thumbnail appears on the left side of the summary card');
assert.equal(pending.querySelector('a[href="/supplier/portal/rfqs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]')?.textContent.includes('Xem yêu cầu'), true,
  'Summary card navigates to the dedicated RFQ detail page');
assert.equal(history.querySelector('a[href="/supplier/portal/rfqs/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]') != null, true);
assert.equal(doc.querySelector('#rfq-history')?.textContent, 'Lịch sử RFQ', 'History heading omits the numeric count');
const oldHistoryProduct = rows[1].rfq.source_product_id;
rows[1].rfq.source_product_id = 'p1';
const productHistory = view(await page.default({ searchParams: Promise.resolve({}) })).window.document;
assert.equal(productHistory.querySelector('#rfq-history')?.closest('section')?.querySelector('li img')?.getAttribute('src'),
  '/api/media/file/supplier/supplier-1/p1/featured.webp', 'History rows use the same product-card thumbnail layout');
rows[1].rfq.source_product_id = oldHistoryProduct;
assert.equal(doc.querySelector('input[name="q"]')?.getAttribute('placeholder'), 'Tìm theo sản phẩm hoặc mã RFQ');
assert.equal(doc.querySelectorAll('nav[aria-label="Lọc RFQ theo trạng thái"] a').length, 4);
assert.doesNotMatch(doc.body.textContent, /PRIVATE-TOKEN|PRIVATE-INTERNAL-NOTE|PRIVATE-BUYER-ID|buyer@private\.io/);
assert.equal(doc.querySelector('#rfq-report')?.open, false, 'Analytics does not distract from the main action');
assert.equal(doc.querySelector('#rfq-report')?.querySelectorAll('a[href*="report=1"]').length, 3);

const replyFilter = view(await page.default({ searchParams: Promise.resolve({ filter: 'reply' }) })).window.document;
assert.equal(replyFilter.querySelector('#rfq-pending')?.closest('section')?.querySelectorAll('li').length, 1);
assert.equal(replyFilter.querySelector('#rfq-history'), null, 'Irrelevant empty history section is hidden under the reply filter');
assert.match(replyFilter.querySelector('nav[aria-label="Lọc RFQ theo trạng thái"]')?.textContent ?? '', /Cần phản hồi/);
const quotedFilter = view(await page.default({ searchParams: Promise.resolve({ filter: 'quoted' }) })).window.document;
assert.equal(quotedFilter.querySelector('#rfq-pending'), null, 'Irrelevant empty reply section is hidden under the quoted filter');
assert.equal(quotedFilter.querySelector('#rfq-history')?.closest('section')?.querySelectorAll('li').length, 1);
const searchFilter = view(await page.default({ searchParams: Promise.resolve({ q: 'cashew' }) })).window.document;
assert.equal(searchFilter.querySelector('#rfq-pending'), null, 'No empty task section when search only matches history');
assert.equal(searchFilter.querySelector('#rfq-history')?.closest('section')?.querySelectorAll('li').length, 1);
const noMatches = view(await page.default({ searchParams: Promise.resolve({ q: 'not-a-real-product' }) })).window.document;
assert.match(noMatches.body.textContent, /Không có RFQ phù hợp với bộ lọc này/);

// History is presented as product cards and paginated at 20 cards per page.
const savedInvitesForPaging = access.store.listSupplierRfqInvitations;
const manyHistory = Array.from({ length: 22 }, (_, index) => ({
  ...rows[1], id: `history-match-${index + 1}`, rfq_id: `history-rfq-${index + 1}`,
  status: 'quoted', sent_to_supplier_at: `2026-10-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z`,
  supplier_replied_at: '2026-10-20T00:00:00Z',
  rfq: { ...rows[1].rfq, id: `history-rfq-${index + 1}`, code: `RFQ-HISTORY-${index + 1}`,
    product_text: `History item ${index + 1}`, source_product_id: null, preferred_supplier_ids: [supplierId] },
}));
access.store.listSupplierRfqInvitations = async () => manyHistory;
const pageOne = view(await page.default({ searchParams: Promise.resolve({}) })).window.document;
assert.equal(pageOne.querySelector('#rfq-history')?.closest('section')?.querySelectorAll('li').length, 20);
assert.match(pageOne.querySelector('#rfq-history')?.textContent ?? '', /Lịch sử RFQ/);
assert.match(pageOne.querySelector('#rfq-history')?.closest('section')?.textContent ?? '', /Trang 1 \/ 2/);
const nextPageHref = pageOne.querySelector('#rfq-history')?.closest('section')?.querySelector('nav a:last-child')?.getAttribute('href');
assert.match(nextPageHref ?? '', /page=2/);
const pageTwo = view(await page.default({ searchParams: Promise.resolve({ page: '2' }) })).window.document;
assert.equal(pageTwo.querySelector('#rfq-history')?.closest('section')?.querySelectorAll('li').length, 2);
assert.match(pageTwo.querySelector('#rfq-history')?.closest('section')?.textContent ?? '', /Trang 2 \/ 2/);
access.store.listSupplierRfqInvitations = savedInvitesForPaging;

locale = 'en';
const english = view(await page.default({ searchParams: Promise.resolve({ report: '1', range: '7', filter: 'reply' }) })).window.document;
assert.match(english.querySelector('#rfq-pending')?.closest('section')?.textContent, /Cashew|Wholesale mixed dried fruit chips/);
assert.equal(english.querySelector('#rfq-report')?.open, true, 'Report range link preserves the expanded report');
assert.match(english.querySelector('input[name="q"]')?.getAttribute('placeholder') ?? '', /Search product or RFQ code/);
assert.match(english.querySelector('a[href*="range=7"][href*="filter=reply"]')?.getAttribute('href') ?? '', /report=1/,
  'Changing the report range preserves active list filters');
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

assert.doesNotMatch(read('app/supplier/portal/rfqs/page.tsx'), /supplier-rfq-reply|mailto:|rfq\+/,
  'Supplier cannot use email as an RFQ quote or reply channel');

// B2B request layout: order terms, then product requirements, then the buyer's own words.
// A product-page RFQ whose buyer typed nothing must not repeat the product name as a note.
{
  const base = { ...rows[0], rfq: { ...rows[0].rfq, sourcing_request_id: null, source_page: '/rfq',
    destination_country: 'Chennai', destination_port: 'chennai' } };
  const item = (rfq) => boardModule.buildSupplierRfqBoard({ ...input,
    invites: [{ ...base, rfq: { ...base.rfq, ...rfq } }] }).invites[0];
  const bare = item({ product_text: 'Wholesale mixed dried fruit chips' });
  assert.equal(bare.request.note, null, 'The product name alone is not a buyer note');
  assert.equal(bare.destination, 'Chennai', 'A port typed in both fields is shown once');
  assert.equal(item({ product_text: 'Wholesale mixed dried fruit chips. Need 20ft FCL, private label' }).request.note,
    'Need 20ft FCL, private label');
  assert.match(item({ product_text: 'Something else entirely' }).request.note, /Something else entirely/);
  // No contact consent on a direct RFQ: it is visible, but honestly marked as unanswerable.
  assert.equal(bare.blocked, true);
  assert.equal(bare.canQuote, false);
  assert.equal(bare.status, 'Chưa thể báo giá', 'Never tell the supplier to reply to an RFQ they cannot answer');
  const consented = item({ ...consent, product_text: 'Wholesale mixed dried fruit chips' });
  assert.equal(consented.blocked, false);
  assert.equal(consented.status, 'Chờ bạn phản hồi');

  const saved = access.store.listSupplierRfqInvitations;
  access.store.listSupplierRfqInvitations = async () => [{ ...base, rfq: { ...base.rfq, product_text: 'Wholesale mixed dried fruit chips' } }];
  const blockedDoc = view(await page.default({ searchParams: Promise.resolve({}) })).window.document;
  access.store.listSupplierRfqInvitations = saved;
  const row = blockedDoc.querySelector('#rfq-history')?.closest('section');
  assert.ok(row, 'An unanswerable RFQ is not listed as a task to quote');
  assert.equal(blockedDoc.querySelectorAll('[data-quote-for]').length, 0);
  assert.match(row.textContent, /Chưa thể báo giá/);
  assert.equal(row.querySelector('a[href="/supplier/portal/rfqs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]') != null, true,
    'The unavailable direct RFQ still opens its detail page to explain the contact restriction');
  assert.doesNotMatch(row.textContent, /Ghi chú của người mua/);
}
const detailSource = read('app/supplier/portal/rfqs/[matchId]/page.tsx');
assert.match(detailSource, /<RequestDetails item=\{item\} copy=\{m\.rfqs\.request\}/, 'Detail page includes the full buyer request');
assert.match(detailSource, /item\.linkedProduct\.spec[\s\S]*item\.linkedProduct\.packaging[\s\S]*item\.linkedProduct\.moq/, 'The detail route retains linked catalog context removed from the summary list');
assert.match(detailSource, /<img src=\{productImage\} alt=\{item\.title\}/, 'Detail product image is shown beside the product information');
assert.match(read('lib/i18n/portal/rfqs.ts'), /title: "Requested product"[\s\S]*?title: "Sản phẩm yêu cầu"/, 'Requested product label replaces the linked-product wording in both locales');
assert.match(detailSource, /m\.rfqs\.buyer\.unavailableDirect/, 'A direct RFQ is never described as Vexim-coordinated');

const callsBeforeLogout = mediaCalls.length;
access = null;
await assert.rejects(page.default({ searchParams: Promise.resolve({}) }), /redirect:\/login/);
assert.equal(mediaCalls.length, callsBeforeLogout, 'Unauthenticated viewers cannot request product media');
console.log('✅ Supplier RFQ page: summary list → detail route, search/status filters, urgency sorting, scoped quote/contact flows.');
