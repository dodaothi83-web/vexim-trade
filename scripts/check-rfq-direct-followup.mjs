// Direct RFQ follow-up: the buyer learns when a named supplier declines or stays
// silent, and the supplier is reminded once before the response date. In-memory
// store and a fake mail transport: no network, mail provider or production DB.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, console: { ...console, error: () => {} },
    encodeURIComponent, process: { env: {} },
    require: (key) => { assert.ok(Object.hasOwn(mocks, key), `${file}: unexpected import ${key}`); return mocks[key]; },
  }, { filename: file });
  return mod.exports;
}

const channel = load('lib/rfq/channel.ts');
const contact = load('lib/rfq/buyer-contact.ts');
const core = load('lib/rfq/portal-core.ts', { './channel': channel, './buyer-contact': contact,
  '@/lib/public/product-selection': { withoutDirectContacts: (s) => s } });

const sentMail = [];
let failMail = false;
const followup = load('lib/rfq/direct-followup.ts', {
  'server-only': {}, './channel': channel, './buyer-contact': contact,
  '@/lib/config': { FROM_ADDRESS: 'Vexim <no-reply@vexim.test>' },
  '@/lib/site': { SITE_URL: 'https://vexim.test' },
  '@/lib/email/templates': { escapeHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    wrapPlainEmail: ({ body }) => body },
  '@/lib/email/send': { transport: async (mail) => {
    if (failMail) return { ok: false, status: 'failed', provider: 'resend', error: 'provider down' };
    sentMail.push(mail);
    return { ok: true, status: 'sent', provider: 'resend', error: null };
  } },
});

const HOUR = 3_600_000, DAY = 24 * HOUR;
const now = Date.parse('2026-11-10T08:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const grant = contact.buyerContactConsentSpec({ company: 'Buyer Co', contact_name: 'Jane',
  email: 'buyer@example.test', phone: '0123456789', country: 'DE', website: null, business_type: null },
iso(now - 4 * DAY), 'rfq_form');

function makeStore() {
  const db = { rfqs: [], matches: [], messages: [], uniqueViolations: 0 };
  const store = {
    db,
    listRetryableDirectRfqs: async () => db.rfqs,
    listRfqMatches: async (rfqId) => db.matches.filter((m) => m.rfq_id === rfqId),
    getBuyer: async () => ({ id: 'buyer-1', email: 'buyer@example.test' }),
    getUserBySupplierId: async (id) => id === 'supplier-inactive' ? { email: 'old@supplier.test', role: 'supplier', supplier_id: id, is_active: false }
      : { email: `${id}@supplier.test`, role: 'supplier', supplier_id: id, is_active: true },
    listMessagesForRfq: async (rfqId) => db.messages.filter((m) => m.rfq_id === rfqId),
    addMessage: async (row) => {
      // Mirrors email_messages_buyer_status_once_idx (rfq_id, stage) where kind = 'buyer_status_update'.
      if (row.kind === 'buyer_status_update' && db.messages.some((m) => m.kind === row.kind && m.rfq_id === row.rfq_id && m.stage === row.stage)) {
        db.uniqueViolations++;
        throw new Error('duplicate key value violates unique constraint');
      }
      const saved = { ...row, id: `msg-${db.messages.length + 1}` };
      db.messages.push(saved);
      return saved;
    },
    updateMessage: async (id, patch) => Object.assign(db.messages.find((m) => m.id === id), patch),
    updateRfqMatchIfState: async (id, supplierId, status, updatedAt, patch) => {
      const row = db.matches.find((m) => m.id === id && m.supplier_id === supplierId && m.status === status && m.updated_at === updatedAt);
      if (!row) return null;
      return Object.assign(row, patch, { updated_at: iso(Date.parse(row.updated_at) + 1) });
    },
  };
  return store;
}
const rfq = (id, over = {}) => ({ id, code: `RFQ-${id}`, buyer_id: 'buyer-1', status: 'matching', spam_score: 0,
  source_page: '/rfq', source_product_id: null, preferred_supplier_ids: ['supplier-a'],
  specs: { ...grant, direct_delivery_version: 'portal_direct_v2' }, created_at: iso(now - 4 * DAY), ...over });
const match = (id, rfqId, over = {}) => ({ id, rfq_id: rfqId, supplier_id: 'supplier-a', status: 'sent_to_supplier',
  sent_to_supplier_at: iso(now - 4 * DAY), response_due_at: iso(now - DAY), supplier_replied_at: null,
  sent_to_buyer_at: null, last_supplier_message_at: null, updated_at: iso(now - 4 * DAY), created_at: iso(now - 4 * DAY), ...over });
const reset = () => { sentMail.length = 0; failMail = false; };

// 1) Past the response date: no_response + one buyer notice; a second run sends nothing.
{
  reset();
  const store = makeStore();
  store.db.rfqs.push(rfq('r1'));
  store.db.matches.push(match('m1', 'r1'));
  const first = await followup.runDirectRfqFollowUps(store, { nowMs: now });
  assert.equal(first.noResponse, 1);
  assert.equal(first.buyerNotified, 1);
  assert.equal(store.db.matches[0].status, 'no_response');
  assert.equal(sentMail.length, 1);
  assert.equal(sentMail[0].to.join(), 'buyer@example.test');
  assert.match(sentMail[0].subject, /^No supplier reply yet for your request \(Ref RFQ-r1\)$/);
  const again = await followup.runDirectRfqFollowUps(store, { nowMs: now + HOUR });
  assert.equal(again.noResponse + again.buyerNotified + again.reminded, 0, 'A repeated cron run must not resend');
  assert.equal(sentMail.length, 1);
}

// 2) Within 24h of the date: one supplier reminder to the portal account, status untouched.
{
  reset();
  const store = makeStore();
  store.db.rfqs.push(rfq('r2'));
  store.db.matches.push(match('m2', 'r2', { response_due_at: iso(now + 6 * HOUR) }),
    match('m2-far', 'r2', { response_due_at: iso(now + 2 * DAY) }));
  const first = await followup.runDirectRfqFollowUps(store, { nowMs: now });
  assert.equal(first.reminded, 1);
  assert.equal(first.noResponse, 0);
  assert.equal(sentMail.map((m) => m.to[0]).join(), 'supplier-a@supplier.test');
  assert.match(sentMail[0].html, /\/supplier\/portal\/rfqs\/m2"/);
  assert.equal(store.db.matches[0].status, 'sent_to_supplier');
  await followup.runDirectRfqFollowUps(store, { nowMs: now + HOUR });
  assert.equal(sentMail.length, 1, 'The supplier is reminded once');
}

// 3) Not silent: replied in the thread, already quoted/published, or declined.
{
  reset();
  const store = makeStore();
  store.db.rfqs.push(rfq('r3', { preferred_supplier_ids: ['supplier-a', 'supplier-b', 'supplier-c'] }));
  store.db.matches.push(
    match('m3-thread', 'r3', { last_supplier_message_at: iso(now - 2 * DAY) }),
    match('m3-quoted', 'r3', { supplier_id: 'supplier-b', status: 'presented_to_buyer', sent_to_buyer_at: iso(now - 2 * DAY) }),
    match('m3-declined', 'r3', { supplier_id: 'supplier-c', status: 'declined', updated_at: iso(now - HOUR) }));
  const report = await followup.runDirectRfqFollowUps(store, { nowMs: now });
  assert.equal(report.noResponse, 0);
  assert.equal(store.db.matches[0].status, 'sent_to_supplier');
  // The sweep still delivers the decline notice if the inline send never happened.
  assert.equal(report.buyerNotified, 1);
  assert.match(sentMail[0].subject, /^A supplier declined your request \(Ref RFQ-r3\)$/);
}

// 4) Out of scope: sourcing, legacy direct, closed, unconsented supplier, stale RFQ.
{
  reset();
  const store = makeStore();
  store.db.rfqs.push(
    rfq('s1', { preferred_supplier_ids: [], specs: { ...grant, direct_delivery_version: 'portal_direct_v2', sourcing_request_id: 'src-1' } }),
    rfq('s2', { specs: { ...grant } }),
    rfq('s3', { status: 'lost' }),
    rfq('s4', { preferred_supplier_ids: ['supplier-a'] }),
    rfq('s5', { created_at: iso(now - 60 * DAY) }));
  store.db.matches.push(match('x1', 's1'), match('x2', 's2'), match('x3', 's3'),
    match('x4', 's4', { supplier_id: 'supplier-not-named' }), match('x5', 's5'));
  const report = await followup.runDirectRfqFollowUps(store, { nowMs: now });
  assert.equal(report.noResponse + report.buyerNotified + report.reminded, 0);
  assert.equal(sentMail.length, 0);
  assert.ok(store.db.matches.every((m) => m.status === 'sent_to_supplier'));
}

// 5) Mail failure keeps the outcome and is retried; a lost compare-and-set sends nothing.
{
  reset();
  failMail = true;
  const store = makeStore();
  store.db.rfqs.push(rfq('r5'));
  store.db.matches.push(match('m5', 'r5'));
  const failed = await followup.runDirectRfqFollowUps(store, { nowMs: now });
  assert.equal(failed.noResponse, 1);
  assert.equal(failed.failed, 1);
  assert.equal(store.db.messages[0].status, 'failed');
  failMail = false;
  const retried = await followup.runDirectRfqFollowUps(store, { nowMs: now + HOUR });
  assert.equal(retried.buyerNotified, 1);
  assert.equal(store.db.messages.length, 1, 'Retry reuses the same log row');
  assert.equal(store.db.messages[0].status, 'sent');

  reset();
  const racing = makeStore();
  racing.db.rfqs.push(rfq('r6'));
  racing.db.matches.push(match('m6', 'r6'));
  const stale = { ...racing.db.matches[0] };
  racing.listRfqMatches = async () => [stale];
  racing.db.matches[0].status = 'quoted';
  racing.db.matches[0].updated_at = iso(now);
  const report = await followup.runDirectRfqFollowUps(racing, { nowMs: now });
  assert.equal(report.noResponse, 0, 'A supplier who quoted meanwhile is not marked silent');
  assert.equal(sentMail.length, 0);
}

// 6) Inline decline notice: once per supplier, direct only, inactive portal not reminded.
{
  reset();
  const store = makeStore();
  const request = rfq('r7');
  const declined = match('m7', 'r7', { status: 'declined' });
  store.db.rfqs.push(request);
  store.db.matches.push(declined);
  assert.equal(await followup.notifyBuyerDirectMatch(store, request, declined, 'declined'), 'sent');
  assert.equal(await followup.notifyBuyerDirectMatch(store, request, declined, 'declined'), 'already');
  assert.equal(await followup.notifyBuyerDirectMatch(store, request, { ...declined, status: 'quoted' }, 'declined'), 'skipped');
  const sourcing = rfq('r8', { preferred_supplier_ids: [], specs: { ...grant, sourcing_request_id: 'src-2' } });
  assert.equal(await followup.notifyBuyerDirectMatch(store, sourcing, match('m8', 'r8', { status: 'declined' }), 'declined'), 'skipped');
  assert.equal(sentMail.length, 1);
  // Concurrent insert loses the unique index and does not send a duplicate.
  const stale = await followup.notifyBuyerDirectMatch(store, request, declined, 'declined', []);
  assert.equal(stale, 'already');
  assert.equal(store.db.uniqueViolations, 1);
  assert.equal(sentMail.length, 1);

  reset();
  const inactive = makeStore();
  inactive.db.rfqs.push(rfq('r9', { preferred_supplier_ids: ['supplier-inactive'] }));
  inactive.db.matches.push(match('m9', 'r9', { supplier_id: 'supplier-inactive', response_due_at: iso(now + HOUR) }));
  assert.equal((await followup.runDirectRfqFollowUps(inactive, { nowMs: now })).reminded, 0);
  assert.equal(sentMail.length, 0);
}

// 7) Emails are link-only: no request contents, contact, price or reply alias.
for (const kind of ['declined', 'no_response']) {
  const mail = followup.buildDirectBuyerNotice(kind, { id: 'rfq id', code: 'RFQ-1' });
  assert.match(mail.subject, /\(Ref RFQ-1\)$/);
  assert.match(mail.html, /https:\/\/vexim\.test\/buyer\/account\/requests\/rfq%20id/);
  assert.doesNotMatch(mail.html + mail.text, /[àáảãạăâđêôơưạ]/i, 'Buyer notice is English');
}
const source = read('lib/rfq/direct-followup.ts');
assert.doesNotMatch(source, /\breplyTo\s*:/);
assert.doesNotMatch(source, /product_text|target_price|access_token|buyer_contact\b|quote_price/);
assert.match(followup.buildDirectSupplierReminder({ code: 'RFQ-1' }, 'm1').subject, /^\[RFQ-1\]/);

// 8) Buyer-facing outcome: only when nobody is left to quote and nothing is published.
const m = (status, over = {}) => ({ status, sent_to_supplier_at: 'x', sent_to_buyer_at: null, ...over });
assert.equal(core.buyerDirectOutcome([m('declined')]), 'declined');
assert.equal(core.buyerDirectOutcome([m('declined'), m('no_response')]), 'no_response');
assert.equal(core.buyerDirectOutcome([m('declined'), m('sent_to_supplier')]), null);
assert.equal(core.buyerDirectOutcome([m('declined'), m('presented_to_buyer', { sent_to_buyer_at: 'y' })]), null);
assert.equal(core.buyerDirectOutcome([m('proposed', { sent_to_supplier_at: null })]), null);
assert.equal(core.buyerDirectOutcome([]), null);

// 9) Wiring: decline notifies inline, the SLA cron sweeps, and the buyer pages show it.
const action = read('app/supplier/portal/rfqs/quote-actions.ts');
assert.match(action, /result\.intent === "decline" && result\.direct[\s\S]*notifyBuyerDirectMatch\(access\.store, rfq, match, "declined"\)/);
assert.match(read('app/api/cron/rfq-sla/route.ts'), /runDirectRfqFollowUps\(store\)/);
const detail = read('app/(public)/buyer/account/requests/[id]/page.tsx');
assert.match(detail, /buyerDirectOutcome\(matches\.filter\(\(m\) => named\.has\(m\.supplier_id\)\)\)/);
assert.match(detail, /declined=\{declined\} directOutcome=\{directOutcome\}/);
const component = read('components/buyer-enquiry-detail.tsx');
assert.match(component, /copy\.declinedTitle/);
assert.match(component, /copy\.noReply/);
assert.match(read('app/(public)/buyer/account/page.tsx'), /directOutcomes\.get\(r\.id\)/);
assert.match(read('lib/db/supabase.ts'), /\.select\("id,rfq_id,status,sent_to_supplier_at,sent_to_buyer_at,/);

console.log('✅ Direct RFQ follow-up: decline and no-reply reach the buyer once, supplier reminded before the date, link-only mail, CAS and retry.');
