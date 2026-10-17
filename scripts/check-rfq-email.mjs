// Regression tests for RFQ Reply-To routing + buyer status notifications.
// No live Resend/Supabase credentials needed. Run: node scripts/check-rfq-email.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTS(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, process, console, Date, Set, Map,
    require: (id) => {
      assert.ok(id in mocks, `Unexpected import ${id} in ${file}`);
      return mocks[id];
    },
  }, { filename: file });
  return module.exports;
}

const config = { MAIL_DOMAIN: 'veximtrade.com', FROM_ADDRESS: 'Vexim <sales@veximtrade.com>', COMPANY: { name: 'Vexim Trade' } };
const router = loadTS('../lib/rfq/reply-routing.ts', { '@/lib/config': config });
const code = 'RFQ-20261017-00001';
const id = '12345678-1234-4567-89ab-abcdef012345';
const addr = router.supplierReplyAddress(code, id);
assert.equal(addr, `rfq+rfq-20261017-00001-m123456781234456789ababcdef012345@veximtrade.com`);
assert.deepEqual({ ...router.parseRfqRoute([`Supplier <${addr}>`]) }, { kind: 'supplier', rfqCode: code, matchId: id });
assert.deepEqual({ ...router.parseRfqRoute([router.supplierReplyAddress(code)]) }, { kind: 'supplier', rfqCode: code, matchId: null });
assert.deepEqual({ ...router.parseRfqRoute([router.buyerReplyAddress(code)]) }, { kind: 'buyer', rfqCode: code });
assert.equal(router.parseRfqRoute([addr.replace('@veximtrade.com', '@evil.com')]), null);
assert.throws(() => router.supplierReplyAddress(code, 'not-a-uuid'));
assert.throws(() => router.buyerReplyAddress('../invalid'));

const rfq = { id: 'rfq-1', code, buyer_id: 'buyer-1', product_text: 'Cashew', quantity: 100, unit: 'MT', access_token: 'secret-token', lost_reason: 'price', closed_reason: 'INTERNAL ONLY' };
const buyer = { id: 'buyer-1', email: 'buyer@example.com', cc_emails: 'assistant@example.com', contact_name: 'Jane Smith' };
const supplier = { id: 'supplier-1', email: 'supplier@example.com', name: 'Factory One' };
const match = { id, rfq_id: rfq.id, supplier_id: supplier.id, sent_to_supplier_at: '2026-10-16T10:00:00Z', supplier_replied_at: null };
const messages = [];
const sent = [];
let transportFailed = false;
const store = {
  listMessages: async () => messages,
  listMessagesForRfq: async (rfqId) => messages.filter((m) => m.rfq_id === rfqId),
  addMessage: async (row) => {
    if (row.kind === 'buyer_status_update' && messages.some((m) => m.rfq_id === row.rfq_id && m.kind === row.kind && m.stage === row.stage)) throw new Error('unique violation');
    const saved = { ...row, id: `message-${messages.length + 1}` }; messages.push(saved); return saved;
  },
  updateMessage: async (mid, patch) => { const msg = messages.find((m) => m.id === mid); Object.assign(msg, patch); return msg; },
  listUsers: async () => [],
  listBuyers: async () => [buyer],
  listSuppliers: async () => [supplier],
  listProspects: async () => [],
  getRfqByCode: async (c) => c === code ? rfq : null,
  getRfq: async (rid) => rid === actionRfq.id ? actionRfq : null,
  updateRfq: async (_rid, patch) => Object.assign(actionRfq, patch),
  addAuditLog: async () => ({}),
  getBuyer: async (id) => id === buyer.id ? buyer : null,
  getRfqMatch: async (mid) => mid === id ? match : null,
  updateRfqMatch: async (_mid, patch) => Object.assign(match, patch),
  getSupplier: async (sid) => sid === supplier.id ? supplier : null,
  listRfqMatches: async () => [match],
};
const bareAddress = (s) => (s.match(/<([^>]+)>/)?.[1] ?? s).split(',')[0].trim();
const escapeHtml = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const transport = async (mail) => {
  sent.push(mail);
  return transportFailed ? { ok: false, status: 'failed', provider: 'resend' } : { ok: true, status: 'simulated', provider: 'local' };
};
const mocks = {
  resend: { Resend: class {} },
  '@/lib/config': { ...config, resendConfigured: () => false },
  '@/lib/email/sender': { bareAddress, findUserByAddress: () => null, isOwnMailAddress: () => false },
  '@/lib/db': { getStore: () => store },
  '@/lib/email/templates': { escapeHtml, wrapPlainEmail: ({ body }) => body },
  '@/lib/email/privacy': { htmlToText: (html) => html.replace(/<[^>]+>/g, ' ').trim() },
  '@/lib/email/send': { transport, threadId: (dir, from) => `${dir}:${from}` },
  '@/lib/rfq/reply-routing': router,
  '@/lib/site': { SITE_URL: 'https://veximtrade.com' },
};
const { processInboundEvent } = loadTS('../lib/mail/inbound.ts', mocks);
const fetchFull = (from, to, message_id) => async () => ({
  from, to, cc: [], subject: 'Re: quote', html: null, text: 'We can quote.',
  message_id, created_at: '2026-10-17T10:00:00Z',
});
async function receive(key, from, to) {
  return processInboundEvent({ email_id: key, from, to: [to], subject: 'Re: quote' }, fetchFull(from, [to], `<${key}@example.com>`));
}
const supplierReply = await receive('supplier-reply', 'Factory <supplier@example.com>', addr);
assert.equal(supplierReply.saved, true);
assert.equal(messages.at(-1).rfq_match_id, id);
assert.equal(messages.at(-1).rfq_id, rfq.id);
assert.equal(match.supplier_replied_at, '2026-10-17T10:00:00Z', 'Only a routed supplier reply counts in dashboard');
assert.equal(messages.at(-1).thread_id, `rfq-${rfq.id}-match-${id}`);
assert.equal((await receive('supplier-reply', 'supplier@example.com', addr)).reason, 'duplicate');

await receive('legacy-reply', supplier.email, router.supplierReplyAddress(code));
assert.equal(messages.at(-1).rfq_match_id, id, 'legacy address resolves via sender');
messages.push({ rfq_id: rfq.id, rfq_match_id: id, kind: 'manual', direction: 'supplier', to_emails: ['alias@example.com'] });
await receive('alias-reply', 'alias@example.com', addr);
assert.equal(messages.at(-1).rfq_match_id, id, 'manual To override may reply from its own address');
await receive('wrong-supplier', 'attacker@example.com', addr);
assert.equal(messages.at(-1).rfq_id, null, 'unrecognized sender must not enter RFQ timeline');
await receive('wrong-domain', supplier.email, addr.replace('@veximtrade.com', '@evil.com'));
assert.equal(messages.at(-1).rfq_id, null);
await receive('buyer-reply', `Jane <${buyer.email}>`, router.buyerReplyAddress(code));
assert.equal(messages.at(-1).rfq_id, rfq.id);
assert.equal(messages.at(-1).rfq_match_id, null);
await receive('buyer-cc', 'assistant@example.com', router.buyerReplyAddress(code));
assert.equal(messages.at(-1).rfq_id, rfq.id);
await receive('wrong-buyer', 'stranger@example.com', router.buyerReplyAddress(code));
assert.equal(messages.at(-1).rfq_id, null);

const { notifyBuyerRfqStatus } = loadTS('../lib/rfq/buyer-notify.ts', mocks);
assert.equal((await notifyBuyerRfqStatus(rfq, 'sampling', id)).sent, true);
assert.equal(sent.at(-1).replyTo, router.buyerReplyAddress(code));
assert.equal(messages.at(-1).kind, 'buyer_status_update');
assert.equal(messages.at(-1).rfq_match_id, null);
assert.equal((await notifyBuyerRfqStatus(rfq, 'sampling', id)).reason, 'already_sent');
assert.equal((await notifyBuyerRfqStatus(rfq, 'lost')).sent, true);
assert.ok(sent.at(-1).html.includes('Giá chưa cạnh tranh'));
assert.ok(!sent.at(-1).html.includes('INTERNAL ONLY'), 'internal closed_reason must stay private');
assert.equal((await notifyBuyerRfqStatus(rfq, 'lost')).reason, 'already_sent');
assert.equal(messages.filter((m) => m.kind === 'buyer_status_update').length, 2);

const newRfq = { ...rfq, id: 'rfq-2', code: 'RFQ-20261017-00002' };
transportFailed = true;
assert.equal((await notifyBuyerRfqStatus(newRfq, 'lost')).reason, 'transport_failed');
transportFailed = false;
assert.equal((await notifyBuyerRfqStatus(newRfq, 'lost')).sent, true, 'failed send may retry');

const actionRfq = { ...rfq, id: 'rfq-action', code: 'RFQ-20261017-00003', status: 'quoted' };
const actions = loadTS('../app/crm/rfqs/[id]/compose-action.ts', {
  'next/cache': { revalidatePath: () => {} },
  'next/navigation': { redirect: () => { throw Error('access denied'); } },
  ...mocks,
  '@/lib/auth/session': { guard: async () => null, getSession: async () => ({ uid: 'admin', email: 'admin@veximtrade.com' }) },
  '@/lib/rfq/buyer-notify': { notifyBuyerRfqStatus },
});
const sampling = new FormData(); sampling.set('rfq_id', actionRfq.id);
await actions.markSamplingAction(sampling);
assert.equal(actionRfq.status, 'sampling');
assert.equal(messages.filter((m) => m.rfq_id === actionRfq.id && m.stage === 'sampling').length, 1);
await actions.markSamplingAction(sampling);
assert.equal(messages.filter((m) => m.rfq_id === actionRfq.id && m.stage === 'sampling').length, 1, 'resubmit must not notify twice');
const lost = new FormData(); lost.set('rfq_id', actionRfq.id); lost.set('lost_reason', 'price');
await actions.markLostAction(lost);
assert.equal(actionRfq.status, 'lost');
assert.equal(messages.filter((m) => m.rfq_id === actionRfq.id && m.stage === 'lost').length, 1);
await actions.markLostAction(lost);
assert.equal(messages.filter((m) => m.rfq_id === actionRfq.id && m.stage === 'lost').length, 1);
const regularActions = loadTS('../app/crm/rfqs/actions.ts', {
  'next/cache': { revalidatePath: () => {} },
  'next/navigation': { redirect: () => { throw Error('redirect'); } },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { guard: async () => null, getSession: async () => ({ uid: 'admin' }) },
});
const badStatus = new FormData(); badStatus.set('id', actionRfq.id); badStatus.set('status', 'lost');
await assert.rejects(regularActions.updateRfqStatusFormAction(badStatus), /Chốt giai đoạn/);
assert.equal(actionRfq.lost_reason, 'price');
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
assert.ok(schema.indexOf('create table if not exists public.rfq_matches') < schema.indexOf('alter table public.email_messages add column if not exists rfq_match_id'));
assert.ok(schema.includes('email_messages_buyer_status_once_idx'));
console.log('✅ RFQ email: Reply-To, inbound validation, action transitions, dedupe, buyer notifications, retries passed.');
