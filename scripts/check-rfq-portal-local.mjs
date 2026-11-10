// Real local DataStore, isolated in-memory. Never writes data/local-db.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, structuredClone, console, ...globals,
    require(id) { assert.ok(id in mocks, `${file}: unexpected import ${id}`); return mocks[id]; } }, { filename: file });
  return mod.exports;
}
const channel = load('lib/rfq/channel.ts');
const contact = load('lib/rfq/buyer-contact.ts');
const consent = (source = 'rfq_form') => contact.buyerContactConsentSpec({ company: 'Buyer', contact_name: 'Buyer',
  email: 'buyer@example.com', phone: null, country: 'VN', website: null, business_type: null },
'2026-11-01T00:00:00Z', source);
const direct = { id: 'direct', code: 'RFQ-D', source_page: '/products/p1', source_product_id: 'p1',
  preferred_supplier_ids: ['s1'], status: 'matching', specs: consent() };
const sourcing = { id: 'sourcing', code: 'RFQ-S', source_page: '/rfq', source_product_id: null,
  preferred_supplier_ids: [], status: 'matching', specs: consent('sourcing_form') };
const question = { id: 'question', code: 'RFQ-Q', source_page: '/rfq?intent=question', source_product_id: null,
  preferred_supplier_ids: ['s1'], status: 'matching', specs: consent() };
const noConsent = { ...sourcing, id: 'old', code: 'RFQ-OLD', specs: {} };
const legacy = { ...sourcing, id: 'legacy', code: 'RFQ-L', status: 'quoted' };
const stamped = '2026-11-03T01:00:00Z';
const match = (id, rfqId, supplierId = 's1', status = 'sent_to_supplier', fields = {}) => ({
  id, rfq_id: rfqId, supplier_id: supplierId, status, sent_to_supplier_at: stamped,
  sent_to_buyer_at: null, quote_price: null, quote_currency: 'USD', quote_unit: 'kg',
  quote_incoterm: 'FOB', quote_lead_time_days: 12, quote_valid_until: null,
  quote_buyer_note: null, internal_note: 'SECRET', updated_at: stamped, ...fields,
});
const state = { buyers: [], suppliers: [], products: [], media: [], rfqs: [direct, sourcing, question, noConsent, legacy],
  rfq_matches: [
    match('d1', 'direct'), match('d2', 'direct', 's2'), match('s1', 'sourcing', 's1', 'quoted', { quote_price: 6.25 }),
    match('s2', 'sourcing', 's2', 'quoted', { quote_price: 7.25 }),
    match('q1', 'question'), match('old1', 'old', 's1', 'presented_to_buyer', { sent_to_buyer_at: stamped }),
    match('legacy1', 'legacy', 's1', 'presented_to_buyer', { sent_to_buyer_at: stamped, quote_price: 4.25 }),
    match('legacyDraft', 'legacy', 's1', 'quoted', { sent_to_buyer_at: stamped, quote_price: 99.75 }),
  ],
  sponsored_pushes: [], certificates: [], supplier_submissions: [], supplier_submission_items: [],
  audit_log: [], categories: [{ slug: 'nuts-kernels', status: 'published', is_published: true }] };
const config = { intro: '', seo_desc: '', spec_columns: [], spec_rows: [], buying_facts: [], faqs: [], filters: [], product_fields: [] };
const store = load('lib/db/local.ts', {
  'node:crypto': crypto, 'node:path': path, 'node:fs': { existsSync: () => false, mkdirSync() {}, writeFileSync() {} },
  '@/lib/db/seed': { SEED_BUYERS: [], SEED_PRODUCTS: [], SEED_SUPPLIERS: [] },
  '@/lib/db/preview-seed': { PREVIEW_PEPPER_HARVEST: null, previewCategories: () => [], previewSeedRows: () => ({ suppliers: [], products: [] }) },
  '@/lib/db/demo-suppliers': { DEMO_SUPPLIERS: [] }, '@/lib/l2-scope': {},
  '@/lib/types': { L2_FACTORY_PHOTO_ITEMS: [], L3_EXPORT_ITEMS: [] }, '@/lib/verification-submission': {},
  '@/lib/public/product-selection': { isTestOnlyProduct: () => false, productBelongsToCategory: () => false },
  '@/lib/media/readiness': {}, '@/lib/rfq/channel': channel, '@/lib/rfq/buyer-contact': contact,
  './category-seed': { CASHEW_CATEGORY_CONFIG: config, DEFAULT_CATEGORY_CONFIG: config, PEPPER_CATEGORY_CONFIG: config },
}, { __veximLocal: state, process: { cwd: () => '/virtual', env: {} } }).localStore;

assert.equal((await store.listRfqQuoteVersions(['legacy1'])).length, 1, 'Legacy published quote backfilled');
assert.equal((await store.listRfqQuoteVersions(['legacyDraft'])).length, 0, 'Old draft with stale delivery timestamp is not backfilled');
assert.equal((await store.getRfqMatch('legacyDraft')).sent_to_buyer_at, null, 'Old delivery is not portal publication');
assert.equal((await store.getRfqMatch('legacyDraft')).legacy_sent_to_buyer_at, stamped, 'Keep the old email timestamp for staff');
await assert.rejects(store.addRfqThreadMessage({ match_id: 'legacyDraft', sender: 'buyer', sender_email: 'buyer@example.com', body: 'Price?' }),
  /not available/, 'Legacy sourcing draft remains hidden even when old email was sent');
assert.equal(state.rfq_quote_versions[0].buyer_note, null, 'Private CRM note never appears in buyer snapshots');
const reviewed = (ids) => Object.fromEntries(ids.map((id) => [id, state.rfq_matches.find((m) => m.id === id)?.updated_at]));
assert.equal((await store.publishRfqQuotes('sourcing', ['s1', 's2', 'd1'], reviewed(['s1', 's2', 'd1']))).map((v) => v.match_id).join(','), 's1,s2');
assert.equal((await store.publishRfqQuotes('sourcing', ['s1', 's2'], reviewed(['s1', 's2']))).length, 0, 'Duplicate publication is idempotent');
assert.equal(state.rfq_portal_alerts.length, 2, 'One transactional outbox event for each published version');
let current = await store.getRfqMatch('s1');
const staleAt = current.updated_at;
assert.equal((await store.updateRfqMatchIfState('s1', 's2', current.status, staleAt, { quote_price: 1 })), null,
  'A foreign supplier cannot revise this quote');
const updates = await Promise.all([
  store.updateRfqMatchIfState('s1', 's1', current.status, staleAt, { quote_price: 5.75, status: 'quoted' }),
  store.updateRfqMatchIfState('s1', 's1', current.status, staleAt, { quote_price: 1, status: 'quoted' }),
]);
assert.equal(updates.filter(Boolean).length, 1, 'Only one concurrent quote edit wins the compare-and-swap');
assert.equal((await store.listRfqQuoteVersions(['s1']))[0].quote_price, 6.25, 'Published version survives a pending revision');
assert.equal((await store.publishRfqQuotes('sourcing', ['s1'], { s1: staleAt })).length, 0,
  'A stale staff review must not publish another draft');
assert.equal((await store.publishRfqQuotes('sourcing', ['s1'], reviewed(['s1'])))[0].version, 2, 'Revision publishes a new version');
assert.equal((await store.listRfqQuoteVersions(['s1'])).length, 2);
await assert.rejects(store.addRfqThreadMessage({ match_id: 'old1', sender: 'buyer', sender_email: 'buyer@example.com', body: 'Question' }), /consent/);
await assert.rejects(store.addRfqThreadMessage({ match_id: 'd2', sender: 'buyer', sender_email: 'buyer@example.com', body: 'Question' }), /consent/);
await assert.rejects(store.addRfqThreadMessage({ match_id: 'q1', sender: 'buyer', sender_email: 'buyer@example.com', body: 'Question' }), /not available/);
const a = await store.addRfqThreadMessage({ match_id: 'd1', sender: 'buyer', sender_email: 'buyer@example.com', body: ' MOQ? ' });
assert.equal(a.body, 'MOQ?');
assert.equal(state.rfq_portal_alerts.at(-1).recipient, 'supplier');
const b = await store.addRfqThreadMessage({ match_id: 's2', sender: 'supplier', sender_email: 's2@example.com', body: 'Available.' });
assert.equal(state.rfq_portal_alerts.at(-1).recipient, 'buyer');
assert.equal(b.match_id, 's2', 'Per-supplier thread isolation');
for (let i = 0; i < 11; i++) await store.addRfqThreadMessage({ match_id: 'd1', sender: 'buyer', sender_email: 'buyer@example.com', body: `Follow-up ${i}` });
await assert.rejects(store.addRfqThreadMessage({ match_id: 'd1', sender: 'buyer', sender_email: 'buyer@example.com', body: 'Excess' }), /rate limited/);
assert.equal((await store.listRfqThreadMessages('d1')).length, 12);
const otherSide = await store.addRfqThreadMessage({ match_id: 'd1', sender: 'supplier', sender_email: 's1@example.com', body: 'Other party may reply' });
assert.equal(otherSide.sender, 'supplier');
await store.markRfqThreadRead('d1', 'buyer', a.created_at);
const firstRead = state.rfq_matches.find((m) => m.id === 'd1').buyer_last_read_at;
await store.markRfqThreadRead('d1', 'buyer', stamped);
assert.equal(state.rfq_matches.find((m) => m.id === 'd1').buyer_last_read_at, firstRead, 'Read marker is monotonic');
const due = await store.listDueRfqPortalAlerts(new Date(Date.now() + 20 * 60_000).toISOString(), 50, ['d1']);
assert.ok(due.length > 0);
const now = new Date(Date.now() + 20 * 60_000).toISOString();
assert.equal(await store.claimRfqPortalAlert(due[0], now), true);
assert.equal(await store.claimRfqPortalAlert(due[0], now), false, 'Outbox claim has compare-and-swap');
assert.equal(await store.finishRfqPortalAlert(due[0].id, now, { status: 'failed', not_before: new Date(Date.now() + 30 * 60_000).toISOString() }), true);
assert.equal(state.rfq_portal_alerts.find((row) => row.id === due[0].id).status, 'failed');
console.log('✅ RFQ local store: safe backfill, versions, CAS, consented per-supplier threads, rate limits and retryable outbox.');
