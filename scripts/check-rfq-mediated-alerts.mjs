// Run the actual sourcing desk alert worker against a CAS/outbox test double.
// No Supabase credentials, live email or local DB writes. SQL/local store claims
// and desk isolation are separately exercised by the migration/local tests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const load = (file, mocks = {}, extras = {}) => {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, console, process: { env: {
    RFQ_INTERNAL_EMAIL: 'desk@vexim.test',
  } }, require(key) {
    assert.ok(Object.hasOwn(mocks, key), `${file}: unexpected import ${key}`);
    return mocks[key];
  }, ...extras }, { filename: file });
  return module.exports;
};
const channel = load('lib/rfq/channel.ts');
const contact = load('lib/rfq/buyer-contact.ts');
const scrub = (value) => String(value).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted]')
  .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, '[redacted]')
  .replace(/\+?\d[\d ()-]{8,}\d/g, '[redacted]');
const core = load('lib/rfq/portal-core.ts', {
  './channel': channel, './buyer-contact': contact, '@/lib/public/product-selection': { withoutDirectContacts: scrub },
});
const mediated = load('lib/rfq/mediated.ts', {
  './channel': channel, './buyer-contact': contact, './portal-core': core,
  '@/lib/public/product-selection': { withoutDirectContacts: scrub },
});
const rfq = { id: 'rfq-1', code: 'RFQ-TEST', buyer_id: 'buyer-1', status: 'matching',
  source_page: '/rfq', source_product_id: null, preferred_supplier_ids: [], specs: {
    ...contact.buyerContactConsentSpec({ company: 'PRIVATE BUYER', contact_name: 'Jane',
      email: 'private-buyer@example.com', phone: '9876543210', country: 'VN', website: null,
      business_type: null }, new Date().toISOString(), 'rfq_form', true),
  } };
const supplier = (id, approved = true) => ({ id, status: 'published', onboarding_status: approved ? 'approved' : 'changes_requested' });
const match = (id, sid, rid = rfq.id) => ({ id, rfq_id: rid, supplier_id: sid,
  status: 'sent_to_supplier', sent_to_supplier_at: new Date().toISOString() });
const matches = new Map([['match-1', match('match-1', 'supplier-1')], ['match-2', match('match-2', 'supplier-2')],
  ['mismatched', match('mismatched', 'supplier-1', 'another-rfq')]]);
const suppliers = new Map([['supplier-1', supplier('supplier-1')], ['supplier-2', supplier('supplier-2', false)]]);
const users = new Map([['supplier-1', { role: 'supplier', supplier_id: 'supplier-1', is_active: true,
  email: 's1@portal.test' }], ['supplier-2', { role: 'supplier', supplier_id: 'supplier-2', is_active: true,
  email: 's2@portal.test' }]]);
const threads = [
  { id: rfq.id, rfq_id: rfq.id, match_id: null, audience: 'buyer', party_last_read_at: null, staff_last_read_at: null },
  { id: 'match-1', rfq_id: rfq.id, match_id: 'match-1', audience: 'supplier', party_last_read_at: null, staff_last_read_at: null },
  { id: 'match-2', rfq_id: rfq.id, match_id: 'match-2', audience: 'supplier', party_last_read_at: null, staff_last_read_at: null },
  { id: 'mismatched', rfq_id: rfq.id, match_id: 'mismatched', audience: 'supplier', party_last_read_at: null, staff_last_read_at: null },
];
assert.equal(mediated.canReadMediatedDesk(rfq, matches.get('mismatched')), false, 'Cannot read another RFQ match');
assert.deepEqual(Object.keys(mediated.safeMediatedMessages([{ id: 'msg', sender: 'supplier',
  sender_email: 'hidden@portal.test', body: 'For Vexim', created_at: '2026-11-01T00:00:00Z' }])[0]),
['id', 'sender', 'body', 'created_at'], 'Portal props do not include the sender email');

const now = Date.now();
const iso = (at) => new Date(at).toISOString();
// Two events with the same millisecond but different PostgreSQL microseconds.
const instant = iso(now - 12 * 60_000);
const sameMs = instant.replace(/\.(\d{3})Z$/, (_, millis) => `.${millis}001Z`);
threads[0].party_last_read_at = instant;
const alerts = [];
const alert = (threadId, recipient, event = instant) => {
  const id = `alert-${alerts.length + 1}`;
  alerts.push({ id, message_id: `message-${id}`, thread_id: threadId, recipient,
    status: 'pending', event_at: event, not_before: iso(Date.parse(event) + 10 * 60_000),
    attempts: 0, claimed_at: null, sent_at: null, last_error: null, created_at: event });
  return id;
};
const readBuyer = alert(rfq.id, 'party');
const unreadBuyer = alert(rfq.id, 'party', sameMs);
const readStaff = alert(rfq.id, 'staff');
threads[0].staff_last_read_at = sameMs;
const supplierToStaff = alert('match-1', 'staff', sameMs);
const staffToSupplierA = alert('match-1', 'party', sameMs);
const staffToSupplierB = alert('match-1', 'party', sameMs);
const revokedSupplier = alert('match-2', 'party', sameMs);
const foreignMatch = alert('mismatched', 'party', sameMs);
const missingThread = alert('no-thread', 'staff', sameMs);
assert.equal(core.rfqEventAfter(sameMs, instant), true, 'Microsecond event is not suppressed by read rounding');

const mail = [];
let failSupplierOnce = true;
const worker = load('lib/rfq/mediated-alerts.ts', {
  'server-only': {}, '@/lib/config': { FROM_ADDRESS: 'Vexim <no-reply@vexim.test>', MAIL_DOMAIN: 'vexim.test' },
  '@/lib/email/send': { transport: async (input) => {
    mail.push(input);
    if (input.to[0] === 's1@portal.test' && failSupplierOnce) {
      failSupplierOnce = false;
      return { ok: false, status: 'failed', error: 'SMTP temporarily unavailable' };
    }
    return { ok: true, status: 'sent' };
  } },
  '@/lib/email/templates': { escapeHtml: (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    wrapPlainEmail: ({ title, body }) => `<h1>${title}</h1>${body}` },
  '@/lib/site': { SITE_URL: 'https://vexim.test' },
  '@/lib/supplier-portal/onboarding': { portalApproved: (s) => s.onboarding_status === 'approved' },
  './portal-core': core, './mediated': mediated,
}).runRfqMediatedAlerts;
const store = {
  listDueRfqMediatedAlerts: async (at, limit, ids) => alerts.filter((a) =>
    (!ids || ids.includes(a.thread_id)) && a.not_before <= at &&
    (['pending', 'failed'].includes(a.status) || a.status === 'sending' &&
      a.claimed_at && Date.parse(a.claimed_at) < Date.parse(at) - 20 * 60_000))
    .slice(0, limit).map((a) => ({ ...a })),
  claimRfqMediatedAlert: async (a, at) => {
    const saved = alerts.find((r) => r.id === a.id);
    if (!saved || saved.status !== a.status || saved.attempts !== a.attempts || saved.claimed_at !== a.claimed_at) return false;
    Object.assign(saved, { status: 'sending', attempts: saved.attempts + 1, claimed_at: at });
    return true;
  },
  finishRfqMediatedAlert: async (id, at, patch) => {
    const saved = alerts.find((a) => a.id === id && a.claimed_at === at && a.status === 'sending');
    if (!saved) return false;
    Object.assign(saved, patch);
    return true;
  },
  getRfqMatch: async (id) => matches.get(id) ?? null,
  listRfqMediatedThreads: async (rfqIds) => threads.filter((t) => rfqIds.includes(t.rfq_id)),
  getRfq: async (id) => id === rfq.id ? rfq : null,
  getBuyer: async (id) => id === rfq.buyer_id ? { email: 'buyer@portal.test' } : null,
  getUserBySupplierId: async (id) => users.get(id) ?? null,
  getSupplier: async (id) => suppliers.get(id) ?? null,
};
const byId = (id) => alerts.find((a) => a.id === id);
assert.equal((await worker(store, { nowMs: now - 3 * 60_000 })).claimed, 0, 'No email before the 10-minute delay');
assert.equal(mail.length, 0);
const first = await worker(store, { nowMs: now });
assert.equal(first.claimed, 9);
assert.equal(first.sent, 2, 'One unread buyer notice and one staff notice');
assert.equal(first.failed, 1, 'Two supplier messages group into one failed email');
assert.equal(first.skipped, 5, 'Read, revoked, foreign and missing desks never notify');
assert.equal(byId(readBuyer).status, 'skipped');
assert.equal(byId(readStaff).status, 'skipped');
assert.equal(byId(unreadBuyer).status, 'sent');
assert.equal(byId(supplierToStaff).status, 'sent');
assert.equal(byId(staffToSupplierA).status, 'failed');
assert.equal(byId(staffToSupplierB).status, 'failed');
assert.equal(byId(revokedSupplier).status, 'skipped');
assert.equal(byId(foreignMatch).status, 'skipped');
assert.equal(byId(missingThread).status, 'skipped');
assert.deepEqual(mail.map((m) => m.to[0]), ['buyer@portal.test', 'desk@vexim.test', 's1@portal.test']);
assert.ok(mail[0].html.includes('/buyer/account/requests/rfq-1#vexim-conversation'));
assert.ok(mail[1].html.includes('/crm/rfqs/rfq-1#vexim-conversations'));
assert.ok(mail[2].html.includes('/supplier/portal/rfqs/match-1#vexim-conversation'));
assert.doesNotMatch(JSON.stringify(mail), /PRIVATE BUYER|private-buyer@example\.com|9876543210|For Vexim|hidden@portal|replyTo|s2@portal/);
assert.equal((await worker(store, { nowMs: now + 9 * 60_000 })).claimed, 0, 'Failed notice respects backoff');
const recovered = await worker(store, { nowMs: now + 11 * 60_000 });
assert.equal(recovered.claimed, 2);
assert.equal(recovered.sent, 1, 'Retry still coalesces supplier messages');
assert.equal(byId(staffToSupplierA).status, 'sent');
assert.equal(byId(staffToSupplierB).status, 'sent');
assert.equal(mail.length, 4);
assert.equal((await worker(store, { nowMs: now + 30 * 60_000 })).claimed, 0, 'No duplicate mail after a successful claim');

// Two cron invocations racing for a due event can claim it only once.
const race = alert(rfq.id, 'party', iso(now - 11 * 60_000));
const [left, right] = await Promise.all([worker(store, { nowMs: now }), worker(store, { nowMs: now })]);
assert.equal(left.claimed + right.claimed, 1);
assert.equal(byId(race).status, 'sent');
assert.equal(mail.length, 5);
console.log('✅ Sourcing alerts: isolated recipients, microsecond reads, delayed/link-only mail, CAS grouping, backoff & no repeat.');
