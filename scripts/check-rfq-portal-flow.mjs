// Scoped buyer/supplier access, conversation actions, read markers and independent mail alerts.
// VM mocks only: no live accounts, Supabase or Resend credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, console: { ...console, error() {} }, Date, FormData, Promise, Map,
      require(id) { if (id === 'server-only') return {}; assert.ok(id in mocks, `${file}: unexpected ${id}`); return mocks[id]; } },
    { filename: file });
  return mod.exports;
}
const contact = load('lib/rfq/buyer-contact.ts');
const channel = load('lib/rfq/channel.ts');
const core = load('lib/rfq/portal-core.ts', {
  '@/lib/public/product-selection': { withoutDirectContacts: (s) => String(s).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/g, '[contact]') },
  './buyer-contact': contact, './channel': channel,
});
const consent = contact.buyerContactConsentSpec({ company: 'Buyer Co', contact_name: 'Jane',
  email: 'buyer@example.com', phone: null, country: 'VN', website: null, business_type: null },
'2026-11-05T00:00:00Z', 'rfq_form');
const requests = {
  r1: { id: 'r1', code: 'RFQ-1', buyer_id: 'b1', status: 'matching', specs: consent,
    source_page: '/products/p1', source_product_id: 'p1', preferred_supplier_ids: ['s1'] },
  r2: { id: 'r2', code: 'RFQ-2', buyer_id: 'b1', status: 'matching', specs: consent,
    source_page: '/rfq', source_product_id: null, preferred_supplier_ids: [] },
  r3: { id: 'r3', code: 'RFQ-Q', buyer_id: 'b1', status: 'matching', specs: consent,
    source_page: '/rfq?intent=question', source_product_id: null, preferred_supplier_ids: ['s1'] },
};
const matches = {
  m1: { id: 'm1', rfq_id: 'r1', supplier_id: 's1', status: 'sent_to_supplier', sent_to_supplier_at: '2026-11-06T00:00:00Z', sent_to_buyer_at: null, quote_price: null },
  m2: { id: 'm2', rfq_id: 'r1', supplier_id: 's2', status: 'sent_to_supplier', sent_to_supplier_at: '2026-11-06T00:00:00Z', sent_to_buyer_at: null },
  m3: { id: 'm3', rfq_id: 'r2', supplier_id: 's1', status: 'quoted', sent_to_supplier_at: '2026-11-06T00:00:00Z', sent_to_buyer_at: null, quote_price: 9.99 },
  proposed: { id: 'proposed', rfq_id: 'r1', supplier_id: 's1', status: 'proposed', sent_to_supplier_at: null },
  question: { id: 'question', rfq_id: 'r3', supplier_id: 's1', status: 'presented_to_buyer',
    sent_to_supplier_at: '2026-11-06T00:00:00Z', sent_to_buyer_at: '2026-11-07T00:00:00Z' },
};
const notes = [];
const reads = [];
let count = 0;
const store = {
  getRfq: async (id) => requests[id] ?? null, getRfqMatch: async (id) => { count++; return matches[id] ?? null; },
  getSupplier: async (id) => ({ id, display_name: 'Only display name', email: 'private-supplier@example.com' }),
  listRfqThreadMessages: async (id) => notes.filter((m) => m.match_id === id),
  addRfqThreadMessage: async (input) => {
    const row = { ...input, id: `msg-${notes.length}`, created_at: new Date(Date.now() + notes.length * 1000).toISOString() };
    notes.push(row);
    Object.assign(matches[input.match_id], { last_thread_message_at: row.created_at, last_thread_sender: input.sender,
      [input.sender === 'buyer' ? 'last_buyer_message_at' : 'last_supplier_message_at']: row.created_at });
    return row;
  },
  markRfqThreadRead: async (id, side, at) => { reads.push({ id, side, at });
    matches[id][side === 'buyer' ? 'buyer_last_read_at' : 'supplier_last_read_at'] = at; },
};
let owned = true, access = { store, supplier: { id: 's1', onboarding_status: 'approved' }, user: { email: 'owner@example.com' } };
const navigation = { notFound: () => { throw Error('NOT_FOUND'); }, redirect: () => { throw Error('REDIRECT'); } };
const buyerAccess = load('lib/rfq/portal-access.ts', {
  'next/navigation': navigation, '@/lib/db': { getStore: () => store },
  '@/lib/buyer/enquiry-access': { requireOwnedBuyerEnquiry: async ({ id }) => {
    if (!owned || !requests[id]) throw Error('NOT_FOUND');
    return { rfq: requests[id], buyer: { id: 'b1', email: 'buyer@example.com' } };
  } },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access },
  '@/lib/supplier-portal/onboarding': { portalApproved: (supplier) => supplier.onboarding_status === 'approved' },
  './channel': channel, './portal-core': core,
});
assert.equal((await buyerAccess.buyerOfferAccess('r1', 'm1')).match.id, 'm1', 'Direct buyer can clarify before a quote');
const before = count;
owned = false;
await assert.rejects(buyerAccess.buyerOfferAccess('r1', 'm1'), /NOT_FOUND/);
assert.equal(count, before, 'Buyer authentication/ownership precedes match lookup');
owned = true;
for (const id of ['m2', 'm3', 'proposed']) await assert.rejects(buyerAccess.buyerOfferAccess('r1', id), /NOT_FOUND/);
await assert.rejects(buyerAccess.buyerOfferAccess('r2', 'm3'), /NOT_FOUND/, 'Sourcing draft invisible');
await assert.rejects(buyerAccess.buyerOfferAccess('r3', 'question'), /NOT_FOUND/, 'Legacy question-only RFQs cannot enter the quote portal');
assert.equal((await buyerAccess.supplierOfferAccess('m1')).supplier.id, 's1');
for (const id of ['m2', 'proposed', 'absent']) await assert.rejects(buyerAccess.supplierOfferAccess(id), /NOT_FOUND/);
access = null;
await assert.rejects(buyerAccess.supplierOfferAccess('m1'), /REDIRECT/);
access = { store, supplier: { id: 's1', onboarding_status: 'approved' }, user: { email: 'owner@example.com' } };

const conversation = load('lib/rfq/portal-conversation.ts', { './portal-core': core });
const revalidated = [];
const supplierActions = load('app/supplier/portal/rfqs/[matchId]/actions.ts', {
  'next/cache': { revalidatePath: (p) => revalidated.push(p) },
  '@/lib/rfq/portal-access': { supplierOfferAccess: buyerAccess.supplierOfferAccess },
  '@/lib/rfq/portal-core': core, '@/lib/rfq/portal-conversation': conversation,
  // Lead ratings have their own check (check-rfq-lead-rating.mjs).
  '@/lib/rfq/lead-rating': { canRateRfqLead: () => false, cleanLeadRating: () => ({ ok: false, error: 'rating' }) },
  '@/lib/db/migration-hints': { migrationHint: () => null },
  '@/lib/rfq/mediated': { sendMediatedRfqMessage: async () => ({ ok: false, error: 'unavailable' }),
    canReadMediatedDesk: () => false, markMediatedRfqRead: async () => {} },
});
const buyerActions = load('app/(public)/buyer/account/requests/[id]/offers/actions.ts', {
  'next/cache': { revalidatePath: (p) => revalidated.push(p) },
  '@/lib/rfq/portal-access': { buyerOfferAccess: buyerAccess.buyerOfferAccess },
  '@/lib/rfq/portal-core': core, '@/lib/rfq/portal-conversation': conversation,
});
const fd = (rfq, match, body) => { const form = new FormData(); form.set('rfq_id', rfq); form.set('match_id', match); form.set('body', body); return form; };
const initial = { error: null, sent: false, body: '', seq: 0 };
assert.equal((await supplierActions.supplierRfqMessageAction(initial, fd('r1', 'm1', ' Can you confirm the MOQ? '))).sent, true);
assert.equal(notes[0].body, 'Can you confirm the MOQ?');
assert.equal(notes[0].sender_email, 'owner@example.com');
assert.equal(matches.m1.quote_price, null, 'A message cannot silently edit a quote');
assert.ok(revalidated.includes('/buyer/account/requests/r1/offers/m1'));
assert.equal((await buyerActions.buyerRfqMessageAction(initial, fd('r1', 'm1', 'At least 10 MT.'))).sent, true);
assert.equal(notes[1].sender_email, 'buyer@example.com');
assert.equal((await buyerActions.buyerRfqMessageAction(initial, fd('r1', 'm1', ' '))).error, 'empty');
assert.equal((await buyerActions.buyerRfqMessageAction(initial, fd('r1', 'm1', 'x'.repeat(2001)))).error, 'too_long');
await assert.rejects(supplierActions.supplierRfqMessageAction(initial, fd('r1', 'm2', 'Hello')), /NOT_FOUND/);
await assert.rejects(buyerActions.buyerRfqMessageAction(initial, fd('r2', 'm3', 'Hello')), /NOT_FOUND/);
assert.equal(core.canReadRfqThread(requests.r2, matches.m3), false);
Object.assign(matches.m3, { status: 'presented_to_buyer', sent_to_buyer_at: '2026-11-07T00:00:00Z' });
assert.equal((await buyerAccess.buyerOfferAccess('r2', 'm3')).match.id, 'm3');
assert.equal(core.canUseRfqThread(requests.r2, matches.m3), false, 'New direct conversation is blocked even after Vexim publishes a sourcing offer');
assert.equal((await supplierActions.supplierRfqMessageAction(initial, fd('r2', 'm3', 'Hello buyer'))).error, 'unavailable');
assert.equal(core.lastPublishedQuote([], { ...matches.m3, status: 'quoted' }), null, 'Pending revisions never fall back to the draft');
assert.equal(core.lastPublishedQuote([], { ...matches.m3, status: 'presented_to_buyer' }), null, 'A timestamp alone is not a published snapshot');
assert.equal(core.supplierMatchHasReply({ ...matches.m1, last_thread_sender: 'supplier' }), true,
  'A supplier response does not hide an earlier unread buyer message');
const parsed = core.cleanRfqMessage('Message sent, price is 6.50 USD/kg');
assert.equal(parsed.ok, true);
assert.equal(matches.m3.quote_price, 9.99, 'Conversations never mutate official quote data');
requests.r2.status = 'lost';
assert.equal((await supplierActions.supplierRfqMessageAction(initial, fd('r2', 'm3', 'Hello'))).error, 'unavailable');
requests.r2.status = 'quoted';

const lastSeen = notes.at(-1).created_at;
await supplierActions.supplierRfqReadAction('m1', lastSeen);
assert.equal(reads.at(-1).side, 'supplier');
await buyerActions.buyerRfqReadAction('r1', 'm1', '2999-01-01T00:00:00Z');
assert.equal(reads.at(-1).side, 'buyer');
assert.ok(Date.parse(reads.at(-1).at) <= Date.parse(lastSeen), 'Forged future timestamp cannot mark an unseen future event');
assert.equal(core.buyerMatchHasUpdate({ ...matches.m1, last_supplier_message_at: '2026-11-07T00:00:00.123456+00:00', buyer_last_read_at: '2026-11-07T00:00:00.123Z' }), true,
  'Unread PostgreSQL microseconds are not truncated by JS Date.parse');
assert.equal(core.buyerMatchHasNewQuote({ sent_to_buyer_at: '2026-11-07T00:00:00.123Z',
  buyer_last_read_at: '2026-11-07T00:00:00.123456Z' }), false, 'A reply badge is not mislabeled as a new quote');
assert.equal(core.rfqEventAfter('2026-11-07T07:00:00.123456+07:00', '2026-11-07T00:00:00.123456Z'), false);
assert.equal(core.lastVisibleEventAt({ published_at: '2026-11-07T00:00:00.123456Z' },
  [{ created_at: '2026-11-07T00:00:00.123789Z' }]), '2026-11-07T00:00:00.123789Z');
const publicMessages = core.buyerSupplierThreadMessages(notes);
assert.equal(publicMessages.length, notes.length);
assert.deepEqual(Object.keys(publicMessages[0]).sort().join(','), 'body,created_at,id,sender',
  'Only message text and sender role, never either party email or audit columns, reach the client');
assert.doesNotMatch(JSON.stringify(publicMessages), /owner@example\.com|buyer@example\.com/);
matches.m1.last_thread_message_at = '2026-11-07T00:00:00.123456+00:00';
await conversation.markVisibleRfqThreadRead({ store, matchId: 'm1', side: 'supplier', visibleAt: matches.m1.last_thread_message_at });
assert.equal(reads.at(-1).at, matches.m1.last_thread_message_at, 'Read marker preserves PostgreSQL precision');
matches.m1.last_thread_message_at = lastSeen;

// Alert outbox: independent from publication/messages; failed transport retries, reading
// before the worker runs skips the mail, claiming concurrently cannot send twice.
const dueAt = Date.now() + 20 * 60_000;
const alert = (id, extra = {}) => ({ id, match_id: 'm1', version_id: 'version-1', message_id: null,
  recipient: 'buyer', event_at: new Date(dueAt - 60_000).toISOString(), not_before: new Date(dueAt - 60_000).toISOString(),
  status: 'pending', attempts: 0, claimed_at: null, sent_at: null, last_error: null, created_at: new Date(dueAt - 60_000).toISOString(), ...extra });
const outbox = [alert('a1')];
matches.m1.sent_to_buyer_at = outbox[0].event_at;
matches.m1.buyer_last_read_at = null;
const mail = [];
let transportOk = false;
const alertStore = {
  listDueRfqPortalAlerts: async (now, _limit, scope) => outbox.filter((a) => a.not_before <= now &&
    (a.status === 'pending' || a.status === 'failed') && (!scope || scope.includes(a.match_id))),
  claimRfqPortalAlert: async (event, at) => { const row = outbox.find((a) => a.id === event.id);
    if (row.status === 'sending' || row.status !== event.status || row.attempts !== event.attempts) return false;
    Object.assign(row, { status: 'sending', claimed_at: at, attempts: row.attempts + 1 }); return true; },
  finishRfqPortalAlert: async (id, claimedAt, patch) => { const row = outbox.find((a) => a.id === id);
    if (!row || row.status !== 'sending' || row.claimed_at !== claimedAt) return false;
    Object.assign(row, patch); return true; },
  getRfqMatch: async () => matches.m1, getRfq: async () => requests.r1,
  getBuyer: async () => ({ email: 'buyer@example.com' }),
  getUserBySupplierId: async () => ({ role: 'supplier', is_active: true, email: 'owner@example.com' }),
};
const notifier = load('lib/rfq/portal-alerts.ts', {
  '@/lib/config': { FROM_ADDRESS: 'Vexim <hello@example.com>' },
  '@/lib/email/send': { transport: async (input) => { mail.push(input);
    return { ok: transportOk, status: transportOk ? 'sent' : 'failed', error: transportOk ? null : 'mail unavailable' }; } },
  '@/lib/email/templates': { escapeHtml: (s) => String(s).replaceAll('<', '&lt;'), wrapPlainEmail: ({ body }) => body },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  './reply-routing': { buyerReplyAddress: () => 'buyer+rfq-1@example.com', supplierReplyAddress: () => 'rfq+match@example.com' },
  './portal-core': core, './channel': channel,
});
let result = await notifier.runRfqPortalAlerts(alertStore, { nowMs: dueAt });
assert.equal(result.failed, 1);
assert.equal(outbox[0].status, 'failed');
assert.equal(matches.m1.sent_to_buyer_at, outbox[0].event_at, 'Email failure cannot undo a published in-app event');
assert.equal((await notifier.runRfqPortalAlerts(alertStore, { nowMs: dueAt + 60_000 })).claimed, 0);
assert.doesNotMatch(JSON.stringify(mail), /9\.99|private-supplier@example\.com|At least 10 MT/, 'Mail never contains quotes, contacts or discussion content');
transportOk = true;
result = await notifier.runRfqPortalAlerts(alertStore, { nowMs: Date.parse(outbox[0].not_before) + 1000 });
assert.equal(result.sent, 1);
assert.equal(outbox[0].status, 'sent');
assert.match(mail.at(-1).html, /\/buyer\/account\/requests\/r1\/offers\/m1/);
assert.match(mail.at(-1).subject, /\(Ref RFQ-1\)$/);
const readEvent = alert('a2', { version_id: null, message_id: 'msg-1', recipient: 'supplier',
  event_at: lastSeen, not_before: new Date(dueAt - 60_000).toISOString() });
outbox.push(readEvent);
matches.m1.supplier_last_read_at = new Date(Date.parse(lastSeen) + 1000).toISOString();
assert.equal((await notifier.runRfqPortalAlerts(alertStore, { nowMs: dueAt + 24 * 60 * 60_000 })).skipped, 1);
assert.equal(outbox[1].status, 'skipped', 'Read messages do not cause email');
outbox.push(alert('a3', { version_id: null, message_id: 'msg-2', recipient: 'supplier',
  event_at: new Date(dueAt + 25 * 60 * 60_000).toISOString(), not_before: new Date(dueAt + 25 * 60 * 60_000).toISOString() }));
const beforeMail = mail.length;
await Promise.all([notifier.runRfqPortalAlerts(alertStore, { nowMs: dueAt + 26 * 60 * 60_000 }),
  notifier.runRfqPortalAlerts(alertStore, { nowMs: dueAt + 26 * 60 * 60_000 })]);
assert.equal(mail.length, beforeMail + 1, 'Two workers must not send the same notification twice');
assert.equal(mail.at(-1).to[0], 'owner@example.com');
assert.match(mail.at(-1).html, /\/supplier\/portal\/rfqs\/m1/);
// Staff can publish only the exact draft revision reviewed, never a newer one
// slipped into the same RFQ after the confirmation page rendered.
const staffRfqs = { direct: { ...requests.r1, id: 'direct' }, sourcing: { ...requests.r2, id: 'sourcing' } };
const staffMatches = {
  d1: { ...matches.m1, id: 'd1', rfq_id: 'direct', quote_price: null, sent_to_buyer_at: null, status: 'sent_to_supplier', updated_at: '2026-11-01T00:00:00Z' },
  s1: { ...matches.m3, id: 's1', rfq_id: 'sourcing', quote_price: 8, status: 'quoted', updated_at: '2026-11-01T00:00:00Z' },
  s2: { ...matches.m3, id: 's2', rfq_id: 'sourcing', quote_price: 9, status: 'quoted', updated_at: '2026-11-01T00:00:00Z' },
  s3: { ...matches.m3, id: 's3', rfq_id: 'sourcing', quote_price: 10, status: 'quoted', updated_at: '2026-11-01T00:00:00Z' },
};
const snapshots = [];
let alertAttempts = 0;
const staffStore = {
  getRfq: async (id) => staffRfqs[id] ?? null, getRfqMatch: async (id) => staffMatches[id] ?? null,
  listRfqMatches: async (id) => Object.values(staffMatches).filter((m) => m.rfq_id === id),
  updateRfqMatchIfState: async (id, supplierId, status, stamp, patch) => {
    const m = staffMatches[id];
    if (!m || m.supplier_id !== supplierId || m.status !== status || m.updated_at !== stamp) return null;
    Object.assign(m, patch, { updated_at: new Date(Date.parse(stamp) + 1000).toISOString() });
    return m;
  },
  publishRfqQuotes: async (rfqId, ids, expected) => ids.flatMap((id) => {
    const m = staffMatches[id];
    if (!m || m.rfq_id !== rfqId || m.status !== 'quoted' || m.updated_at !== expected[id]) return [];
    const version = { id: `v-${snapshots.length + 1}`, match_id: id, version: 1, quote_price: m.quote_price };
    snapshots.push(version);
    m.status = 'presented_to_buyer'; m.sent_to_buyer_at = new Date().toISOString();
    return [version];
  }),
};
const staffNavigation = { redirect: (url) => { throw Error(`REDIRECT ${url}`); } };
const mailDown = { runRfqPortalAlerts: async () => { alertAttempts++; throw Error('mail down'); } };
const workflow = load('lib/rfq/workflow.ts');
const staffAccess = load('lib/rfq/staff-access.ts', { './channel': channel });
const staffQuoteActions = load('app/crm/rfqs/[id]/actions.ts', {
  'next/cache': { revalidatePath: (p) => revalidated.push(p) }, 'next/navigation': staffNavigation,
  'crypto': { randomUUID: () => 'id' }, '@/lib/db': { getStore: () => staffStore },
  '@/lib/auth/session': { guard: async () => null }, '@/lib/rfq/workflow': workflow,
  '@/lib/supplier-portal/onboarding': { canInviteSupplier: async () => true },
  '@/lib/rfq/staff-access': staffAccess,
});
const staffQuoteForm = (rfqId, matchId) => { const input = new FormData();
  for (const [key, value] of Object.entries({ rfq_id: rfqId, match_id: matchId, quote_price: '6.1256',
    quote_currency: 'USD', quote_unit: 'kg', quote_incoterm: 'FOB', quote_lead_time_days: '12' })) input.set(key, value);
  return input; };
await assert.rejects(staffQuoteActions.updateMatchQuoteAction(staffQuoteForm('direct', 'd1')), /Nhà cung cấp tự nộp giá trên cổng/);
await assert.rejects(staffQuoteActions.updateMatchQuoteAction(staffQuoteForm('sourcing', 's1')), /Nhà cung cấp tự nộp giá trên cổng/);
assert.equal(snapshots.length, 0, 'Neither direct nor sourcing prices can be entered by staff');
const forgedStatus = staffQuoteForm('direct', 'd1'); forgedStatus.set('status', 'quoted');
await assert.rejects(staffQuoteActions.updateMatchStatusAction(forgedStatus), /Trạng thái này do nút nghiệp vụ|chỉ được xem/);

const publishAction = load('app/crm/rfqs/[id]/outreach-actions.ts', {
  'next/cache': { revalidatePath: (p) => revalidated.push(p) }, 'next/navigation': staffNavigation,
  '@/lib/auth/session': { guard: async () => null, getSession: async () => ({ uid: 'staff' }) },
  '@/lib/rfq/outreach': { dispatchRfqToSuppliers() {}, selectSupplier() {} },
  '@/lib/db': { getStore: () => staffStore }, '@/lib/rfq/portal-alerts': mailDown,
  '@/lib/rfq/channel': channel, '@/lib/rfq/staff-access': staffAccess,
});
const approval = new FormData(); approval.set('rfq_id', 'sourcing');
approval.append('publish_version', `s1:${staffMatches.s1.updated_at}`);
approval.append('publish_version', `s2:${staffMatches.s2.updated_at}`);
staffMatches.s1.updated_at = new Date(Date.parse(staffMatches.s1.updated_at) + 2000).toISOString();
await assert.rejects(publishAction.presentShortlistAction(approval), /published=1&publish_skipped=1/);
assert.equal(staffMatches.s1.status, 'quoted', 'A newly changed quote is not published under stale approval');
assert.equal(staffMatches.s2.status, 'presented_to_buyer');
assert.equal(staffMatches.s3.status, 'quoted', 'An unreviewed quote cannot sneak into the same batch');
assert.equal(snapshots.length, 1);
assert.equal(alertAttempts, 1, 'Staff publication survives the notification failure');
const directPublish = new FormData(); directPublish.set('rfq_id', 'direct');
directPublish.append('publish_version', `d1:${staffMatches.d1.updated_at}`);
await assert.rejects(publishAction.presentShortlistAction(directPublish), /chỉ được xem/);
assert.equal(staffMatches.d1.sent_to_buyer_at, null, 'Staff cannot publish direct quotes');
// The supplier's form distinguishes a saved draft from a successfully published
// direct quote. An SMTP failure after publication still reports buyer visibility.
let supplierEnabled = true;
let reviewedAt = null;
const supplierQuoteAction = load('app/supplier/portal/rfqs/quote-actions.ts', {
  'next/cache': { revalidatePath: (p) => revalidated.push(p) }, 'next/navigation': staffNavigation,
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => supplierEnabled ? {
    supplier: { id: 's1', onboarding_status: 'approved' }, user: { email: 'owner@example.com' }, store: staffStore,
  } : null },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  '@/lib/supplier-portal/quote': { parseSupplierQuote: () => ({ ok: true, value: { intent: 'quote' } }),
    recordSupplierPortalQuote: async () => ({ code: 'RFQ-1', rfqId: 'direct', matchId: 'd1',
      updatedAt: reviewedAt, intent: 'quote', direct: true }) },
  '@/lib/i18n/server': { getPortalMessages: async () => ({ m: { rfqs: { quote: { errors: {} } } } }) },
  '@/lib/rfq/portal-alerts': mailDown,
  // A quote must never trigger the decline notice.
  '@/lib/rfq/direct-followup': { notifyBuyerDirectMatch: async () => { throw new Error('Quote is not a decline'); } },
});
staffMatches.d1.status = 'quoted'; staffMatches.d1.quote_price = 7;
reviewedAt = staffMatches.d1.updated_at;
const supplierQuoteFd = new FormData(); supplierQuoteFd.set('match_id', 'd1');
await assert.rejects(supplierQuoteAction.submitSupplierQuoteAction({ error: null }, supplierQuoteFd), /quote=delivered/);
assert.equal(snapshots.length, 2);
assert.equal(alertAttempts, 2, 'Mail failure leaves the buyer-visible direct version intact');
staffMatches.d1.status = 'quoted'; staffMatches.d1.quote_price = 7.5;
staffMatches.d1.updated_at = new Date(Date.parse(reviewedAt) + 2000).toISOString();
// Another writer changed the match since the form's quote revision was saved.
await assert.rejects(supplierQuoteAction.submitSupplierQuoteAction({ error: null }, supplierQuoteFd), /quote=publish_pending/);
assert.equal(snapshots.length, 2, 'Unpublished direct revision is never mislabeled as visible');
supplierEnabled = false;
await assert.rejects(supplierQuoteAction.submitSupplierQuoteAction({ error: null }, supplierQuoteFd), /REDIRECT \/supplier\/portal/);
console.log('✅ RFQ portal flow: IDOR/consent, buyer vs supplier actions, read scope, rate checks and mail retry/claim isolation and staff/supplier reviewed-revision publishing.');
