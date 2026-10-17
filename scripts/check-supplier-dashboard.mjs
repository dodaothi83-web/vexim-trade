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

const rfq = { id: 'r1', code: 'RFQ-20261017-001', product_text: 'Cashew', quantity: 5, unit: 'MT', status: 'new' };
const storedMatch = { ...match, rfq_id: rfq.id, status: 'proposed', sent_to_supplier_at: null };
const sent = [];
let mode = 'simulated';
let preflightFails = false;
const store = {
  getRfq: async () => rfq,
  listRfqMatches: async () => [storedMatch],
  listSupplierRfqInvitations: async () => { if (preflightFails) throw Error('migration missing'); return []; },
  listSupplierNoticeReads: async () => [],
  listSuppliers: async () => [{ id: 's-a', email: 'supplier@example.com', name: 'Supplier A' }],
  updateRfqMatch: async (_id, patch) => Object.assign(storedMatch, patch),
  addMessage: async (message) => sent.push(message),
  updateRfq: async (_id, patch) => Object.assign(rfq, patch),
};
const outbound = load('../lib/rfq/outreach.ts', {
  '@/lib/db': { getStore: () => store },
  '@/lib/public/product-selection': { withoutDirectContacts: onlyContacts },
  '@/lib/email/send': { transport: async (mail) => { sent.push(mail); return { ok: true, status: mode, provider: 'resend' }; } },
  '@/lib/config': { FROM_ADDRESS: 'Vexim <sales@example.com>', COMPANY: { name: 'Vexim' } },
  '@/lib/site': { SITE_URL: 'https://example.com' },
  '@/lib/email/templates': { escapeHtml: (s) => s, wrapPlainEmail: ({ body }) => body },
  '@/lib/rfq/reply-routing': { supplierReplyAddress: () => 'reply@example.com', buyerReplyAddress: () => 'buyer-reply@example.com' },
});
const privateMail = outbound.buildRfqSupplierEmail({ rfq: { ...rfq, product_text: 'contact buyer@example.com', specs: { notes: 'SECRET BUYER CONTACT' } },
  supplier: { name: 'Supplier A' }, deadline: now });
assert.ok(!privateMail.html.includes('buyer@example.com'));
assert.ok(!privateMail.html.includes('SECRET BUYER CONTACT'));
preflightFails = true;
await assert.rejects(outbound.dispatchRfqToSuppliers({ rfqId: rfq.id, matchIds: [match.id] }), /migration missing/);
assert.equal(sent.length, 0, 'No mail before DB migration is ready');
preflightFails = false;
assert.equal((await outbound.dispatchRfqToSuppliers({ rfqId: rfq.id, matchIds: [match.id] })).sent, 0);
assert.equal(storedMatch.sent_to_supplier_at, null, 'A simulated email is not an invitation');
mode = 'sent';
assert.equal((await outbound.dispatchRfqToSuppliers({ rfqId: rfq.id, matchIds: [match.id] })).sent, 1);
assert.equal(storedMatch.status, 'sent_to_supplier');
assert.ok(storedMatch.response_due_at);
assert.equal((await outbound.dispatchRfqToSuppliers({ rfqId: rfq.id, matchIds: [match.id] })).sent, 0, 'No duplicate invitation');
assert.equal(sent.filter((x) => x.to?.includes('supplier@example.com')).length, 2, 'Simulated and real attempts only');

let accessEnabled = true;
const writes = [];
const noticesAction = load('../app/supplier/portal/notice-actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => accessEnabled ? {
    supplier: { id: 's-a' }, reviews: [], store: {
      listSupplierRfqInvitations: async () => [match, foreign], listSupplierVerificationRequests: async () => [],
      markSupplierNoticeRead: async (supplierId, key) => writes.push([supplierId, key]),
    },
  } : null },
  '@/lib/supplier-portal/dashboard': dashboard,
});
const noticeForm = (key) => { const fd = new FormData(); fd.set('notice_key', key); return fd; };
await noticesAction.markSupplierNoticeReadAction(noticeForm(`rfq:${idB}`));
assert.equal(writes.length, 0, 'Forged foreign notice cannot be marked read');
accessEnabled = false;
await noticesAction.markSupplierNoticeReadAction(noticeForm(`rfq:${idA}`));
assert.equal(writes.length, 0, 'Logged-out user cannot mark a notice read');
accessEnabled = true;
await noticesAction.markSupplierNoticeReadAction(noticeForm(`rfq:${idA}`));
assert.equal(writes[0][0], 's-a');

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
