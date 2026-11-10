// Quote validation and scoped drafts/versions. No production database or mail service.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function load(file, mocks) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, Date, Number, console,
      require(id) { assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id]; } }, { filename: file });
  return mod.exports;
}
const withoutDirectContacts = (s) => String(s).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:https?:\/\/|www\.)[^\s]+|\+?\d[\d ()-]{8,}\d/gi, '[redacted]');
const contact = load('lib/rfq/buyer-contact.ts', {});
const channel = load('lib/rfq/channel.ts', {});
const core = load('lib/rfq/portal-core.ts', {
  '@/lib/public/product-selection': { withoutDirectContacts }, './buyer-contact': contact, './channel': channel,
});
const quote = load('lib/supplier-portal/quote.ts', {
  '@/lib/public/product-selection': { withoutDirectContacts }, '@/lib/rfq/portal-core': core,
});
const form = (o) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const good = { price: '6,25', currency: 'usd', unit: 'kg', incoterm: 'fob', lead_time_days: '21',
  valid_until: '', buyer_note: 'Packed in 10kg cartons', note: 'Internal margin to Vexim only' };
const now = new Date('2026-11-05T00:00:00Z');
const ok = quote.parseSupplierQuote(form(good), now);
assert.equal(ok.ok, true);
assert.equal(ok.value.price, 6.25);
assert.equal(ok.value.currency, 'USD');
assert.equal(ok.value.buyerNote, 'Packed in 10kg cartons');
for (const [patch, error] of [
  [{ price: '0' }, 'price'], [{ price: '-1' }, 'price'], [{ price: '1.23456' }, 'price'], [{ price: 'abc' }, 'price'],
  [{ currency: 'JPY' }, 'currency'], [{ unit: '' }, 'unit'], [{ unit: 'call 0912345678' }, 'unit'],
  [{ incoterm: 'XYZ' }, 'incoterm'], [{ lead_time_days: '0' }, 'leadTime'], [{ lead_time_days: '2.5' }, 'leadTime'],
  [{ valid_until: '2026-11-01' }, 'validUntil'], [{ valid_until: '2028-01-01' }, 'validUntil'],
  [{ note: 'x'.repeat(1001) }, 'note'], [{ buyer_note: 'Contact sales@example.com' }, 'buyerNote'],
  [{ buyer_note: 'see https://other.example' }, 'buyerNote'], [{ buyer_note: 'x'.repeat(1001) }, 'buyerNote'],
]) assert.equal(quote.parseSupplierQuote(form({ ...good, ...patch }), now).error, error, JSON.stringify(patch));
assert.equal(quote.parseSupplierQuote(form({ intent: 'decline', note: '' }), now).value.intent, 'decline');

const consent = contact.buyerContactConsentSpec({ company: 'Buyer Co', contact_name: 'Jane',
  email: 'buyer@example.com', phone: null, country: 'VN', website: null, business_type: null },
'2026-11-04T00:00:00Z', 'rfq_form');
const rfqs = { r1: { id: 'r1', code: 'RFQ-1', status: 'matching', source_page: '/rfq',
  source_product_id: null, preferred_supplier_ids: [], specs: consent } };
const matches = {
  m1: { id: 'm1', rfq_id: 'r1', supplier_id: 's1', status: 'sent_to_supplier',
    sent_to_supplier_at: '2026-11-01', supplier_replied_at: null, quote_price: null, sent_to_buyer_at: null,
    updated_at: '2026-11-01T00:00:00Z' },
  other: { id: 'other', rfq_id: 'r1', supplier_id: 's2', status: 'sent_to_supplier',
    sent_to_supplier_at: '2026-11-01', updated_at: '2026-11-01T00:00:00Z' },
};
const messages = [], audit = [], versions = [];
let conflict = false;
const store = {
  getRfqMatch: async (id) => matches[id] ?? null,
  getRfq: async (id) => rfqs[id] ?? null,
  updateRfqMatchIfState: async (id, supplierId, status, updatedAt, patch) => {
    const m = matches[id];
    if (conflict || !m || m.supplier_id !== supplierId || !m.sent_to_supplier_at ||
        m.status !== status || m.updated_at !== updatedAt) return null;
    Object.assign(m, patch, { updated_at: new Date(Date.parse(updatedAt) + 1000).toISOString() });
    return m;
  },
  publishRfqQuotes: async (rfqId, ids, expected) => ids.flatMap((id) => {
    const m = matches[id];
    if (!m || m.rfq_id !== rfqId || m.status !== 'quoted' || expected?.[id] !== m.updated_at) return [];
    const v = { id: `v${versions.length + 1}`, match_id: id, version: versions.filter((r) => r.match_id === id).length + 1,
      quote_price: m.quote_price, quote_currency: m.quote_currency, quote_unit: m.quote_unit,
      quote_incoterm: m.quote_incoterm, quote_lead_time_days: m.quote_lead_time_days,
      quote_valid_until: m.quote_valid_until, buyer_note: m.quote_buyer_note,
      published_at: new Date(Date.now() + versions.length * 1000).toISOString() };
    versions.push(v); Object.assign(m, { status: 'presented_to_buyer', sent_to_buyer_at: v.published_at,
      updated_at: new Date(Date.parse(m.updated_at) + 1000).toISOString() });
    rfqs[rfqId].status = 'quoted'; return [v];
  }),
  addMessage: async (m) => messages.push(m),
  addAuditLog: async (e) => audit.push(e),
};
const record = (matchId, value, supplierId = 's1') => quote.recordSupplierPortalQuote({ store,
  supplier: { id: supplierId, email: 's1@example.com' }, actorEmail: 's1@example.com', matchId, quote: value });

await assert.rejects(record('other', ok.value), /notFound/, 'cannot edit another supplier’s invitation');
await assert.rejects(record('missing', ok.value), /notFound/);
const first = await record('m1', ok.value);
assert.equal(first.direct, false, 'sourcing requires a staff publication');
assert.equal(matches.m1.status, 'quoted');
assert.equal(matches.m1.quote_price, 6.25);
assert.equal(matches.m1.quote_buyer_note, 'Packed in 10kg cartons');
assert.equal(matches.m1.internal_note, undefined, 'private note goes to CRM timeline only');
assert.equal(versions.length, 0, 'an unreviewed draft has no buyer-visible snapshot');
assert.equal(core.lastPublishedQuote(versions, matches.m1), null);
assert.equal(messages.at(-1).rfq_match_id, 'm1');
assert.match(messages.at(-1).body_text, /6.25 USD \/ kg[\s\S]*Internal margin to Vexim only/);
assert.equal(audit.at(-1).action, 'supplier_portal.quote');
await store.publishRfqQuotes('r1', ['m1'], { m1: matches.m1.updated_at });
assert.equal(core.lastPublishedQuote(versions, matches.m1).quote_price, 6.25);
assert.equal(core.lastPublishedQuote(versions, matches.m1).buyer_note, 'Packed in 10kg cartons');
assert.doesNotMatch(JSON.stringify(versions), /Internal margin/);

// A sourcing revision stays private until staff publishes it as version 2.
await record('m1', { ...ok.value, price: 6.1, buyerNote: 'Revised packing' });
assert.equal(matches.m1.status, 'quoted');
assert.equal(core.lastPublishedQuote(versions, matches.m1).quote_price, 6.25);
await store.publishRfqQuotes('r1', ['m1'], { m1: matches.m1.updated_at });
assert.equal(versions.length, 2);
assert.equal(core.lastPublishedQuote(versions, matches.m1).version, 2);
assert.equal(versions[0].quote_price, 6.25, 'version 1 is immutable');

conflict = true;
await assert.rejects(record('m1', ok.value), /closed/, 'stale concurrent edits are rejected');
conflict = false;
for (const status of ['won', 'lost', 'spam']) {
  rfqs.r1.status = status;
  await assert.rejects(record('m1', ok.value), /closed/, status);
}
rfqs.r1.status = 'matching'; rfqs.r1.specs = { inquiry_kind: 'supplier_question' };
await assert.rejects(record('m1', ok.value), /notFound/, 'direct questions have no quote flow');
rfqs.r1.specs = consent;
matches.m1.sent_to_supplier_at = null;
await assert.rejects(record('m1', ok.value), /notFound/, 'an unsent match is invisible');
matches.m1.sent_to_supplier_at = '2026-11-01';

// Only the supplier named in a consented direct RFQ can auto-publish.
Object.assign(rfqs.r1, { preferred_supplier_ids: ['s1'], source_product_id: 'p1' });
assert.equal((await record('m1', { ...ok.value, price: 6.2 })).direct, true);
assert.equal(core.canDirectPublishRfqQuote(rfqs.r1, matches.other), false);
rfqs.r1.preferred_supplier_ids = ['s2'];
assert.equal((await record('m1', { ...ok.value, price: 6.3 })).direct, false, 'non-named supplier needs explicit consent');
rfqs.r1.preferred_supplier_ids = ['s1']; rfqs.r1.specs = {};
assert.equal((await record('m1', ok.value)).direct, false, 'no retroactive contact consent');
rfqs.r1.specs = consent;
Object.assign(matches.m1, { sent_to_buyer_at: null, status: 'sent_to_supplier' });
await record('m1', { intent: 'decline', note: 'No stock' });
assert.equal(matches.m1.status, 'declined');
assert.match(messages.at(-1).body_text, /không tham gia[\s\S]*No stock/);
await assert.rejects(record('m1', ok.value), /closed/, 'declined invitation cannot be resurrected');

const action = read('app/supplier/portal/rfqs/quote-actions.ts');
assert.match(action, /^"use server"/);
assert.match(action, /supplierPortalAccess\(\)/);
assert.match(action, /portalApproved\(access\.supplier\)/);
assert.match(action, /result\.intent === "quote" && result\.direct[\s\S]*publishRfqQuotes/);
assert.doesNotMatch(action, /presentShortlistToBuyer/);
assert.match(read('app/supplier/portal/rfqs/quote-form.tsx'), /name="buyer_note"/);
assert.match(read('app/supplier/portal/rfqs/quote-form.tsx'), /name="note"/);
console.log('✅ Supplier quotes: scoped ownership, separate buyer/private notes, draft snapshots, revisions, CAS, consented direct publishing.');
