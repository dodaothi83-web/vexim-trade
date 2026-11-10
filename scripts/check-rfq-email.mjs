// RFQ email is notification-only. Old RFQ/sourcing Reply-To aliases are parsed
// solely to refuse inbound transactions; unrelated mailbox email remains intact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, process, console, Date, Set, Map,
      require: (id) => { assert.ok(id in mocks, `${file}: unexpected ${id}`); return mocks[id]; } }, { filename: file });
  return mod.exports;
}
const config = { MAIL_DOMAIN: 'veximtrade.com', FROM_ADDRESS: 'Vexim <hello@veximtrade.com>',
  resendConfigured: () => true, COMPANY: { name: 'Vexim Trade' } };
const routing = load('../lib/rfq/reply-routing.ts', { '@/lib/config': config });
assert.equal(routing.supplierReplyAddress, undefined, 'The app cannot mint a new RFQ reply alias');
assert.equal(routing.buyerReplyAddress, undefined);
assert.equal(routing.sourcingReplyAddress, undefined);
const matchId = '12345678-1234-4567-89ab-abcdef012345';
const address = 'rfq+rfq-20261109-00001-m123456781234456789ababcdef012345@veximtrade.com';
const legacy = { ...routing.parseRfqRoute([`Factory <${address}>`]) };
assert.deepEqual(legacy, { kind: 'supplier', rfqCode: 'RFQ-20261109-00001', matchId });
assert.deepEqual({ ...routing.parseRfqRoute(['buyer+rfq-20261109-00001@veximtrade.com']) },
  { kind: 'buyer', rfqCode: 'RFQ-20261109-00001' });
const sourcingAddress = 'sourcing+abcdef01234546789abcdef012345678@veximtrade.com';
assert.equal(routing.parseSourcingRoute([sourcingAddress]), 'abcdef01-2345-4678-9abc-def012345678');
assert.equal(routing.parseRfqRoute([address.replace('@veximtrade.com', '@foreign.example')]), null);
assert.equal(routing.parseSourcingRoute([sourcingAddress.replace('@veximtrade.com', '@foreign.example')]), null);
assert.equal(routing.sourcingThreadId('old-request'), 'sourcing-old-request', 'Old timeline identifiers are retained');

const buyer = { id: 'b1', email: 'buyer@example.com', contact_name: 'Buyer' };
const supplier = { id: 's1', email: 'supplier@example.com' };
const messages = [], mails = [];
let mailWorks = true;
const store = {
  listMessages: async () => messages,
  listMessagesForRfq: async (rfqId) => messages.filter((m) => m.rfq_id === rfqId),
  addMessage: async (m) => { const row = { ...m, id: `msg-${messages.length + 1}` }; messages.push(row); return row; },
  updateMessage: async (id, patch) => { const row = messages.find((m) => m.id === id); Object.assign(row, patch); return row; },
  listUsers: async () => [], listBuyers: async () => [buyer], listSuppliers: async () => [supplier], listProspects: async () => [],
  getBuyer: async (id) => id === buyer.id ? buyer : null,
};
const mail = async (m) => { mails.push(m); return { ok: mailWorks, status: mailWorks ? 'sent' : 'failed', provider: 'resend', error: mailWorks ? null : 'down' }; };
const escapeHtml = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const common = {
  '@/lib/config': config, '@/lib/db': { getStore: () => store },
  '@/lib/email/templates': { escapeHtml, wrapPlainEmail: ({ body }) => body },
  '@/lib/email/send': { transport: mail, threadId: (direction, from) => `${direction}:${from}` },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
};
const channel = load('../lib/rfq/channel.ts');
const rfqMail = load('../lib/email/rfq.ts', { ...common, './send': { transport: mail }, '@/lib/rfq/channel': channel });
const sourcing = { id: 'rfq-sourcing', code: 'RFQ-20261109-00001', buyer_id: buyer.id, status: 'new',
  source_page: '/rfq', source_product_id: null, preferred_supplier_ids: [], specs: { notes: 'SECRET PRICE 6.25 USD' }, access_token: 'SECRET-TOKEN' };
const direct = { ...sourcing, id: 'rfq-direct', status: 'matching', source_product_id: 'p1', preferred_supplier_ids: [supplier.id] };
await rfqMail.sendRfqAckBuyer({ rfq: direct, buyer });
assert.equal(mails[0].to[0], buyer.email);
assert.match(mails[0].html, /\/buyer\/account\/requests\/rfq-direct/);
assert.match(mails[0].html, /not the intermediary/i);
await rfqMail.sendRfqNewInternal({ rfq: direct, buyer });
assert.equal(mails.length, 1, 'Direct RFQs do not create a Vexim intake queue or internal mail');
await rfqMail.sendRfqAckBuyer({ rfq: sourcing, buyer });
await rfqMail.sendRfqNewInternal({ rfq: sourcing, buyer });
assert.equal(mails.length, 3);
assert.match(mails.at(-1).html, /\/crm\/rfqs\/rfq-sourcing/);
const lifecycle = load('../lib/rfq/buyer-notify.ts', { ...common, '@/lib/rfq/channel': channel });
assert.equal((await lifecycle.notifyBuyerRfqStatus(direct, 'lost')).sent, false, 'Staff cannot notify a direct transaction as mediated sourcing');
assert.equal((await lifecycle.notifyBuyerRfqStatus(sourcing, 'sampling')).sent, true);
assert.equal((await lifecycle.notifyBuyerRfqStatus(sourcing, 'sampling')).reason, 'already_sent');
assert.match(mails.at(-1).html, /\/buyer\/account\/requests\/rfq-sourcing/);
mailWorks = false;
const lost = { ...sourcing, id: 'rfq-lost', status: 'lost', lost_reason: 'price', closed_reason: 'SECRET INTERNAL' };
assert.equal((await lifecycle.notifyBuyerRfqStatus(lost, 'lost')).reason, 'transport_failed');
mailWorks = true;
assert.equal((await lifecycle.notifyBuyerRfqStatus(lost, 'lost')).sent, true, 'Failed notice may retry without a new row');
assert.equal(messages.filter((m) => m.rfq_id === lost.id && m.stage === 'lost').length, 1);
for (const m of mails) {
  assert.equal(m.replyTo, undefined);
  assert.doesNotMatch((m.html ?? '') + (m.text ?? ''), /SECRET|6\.25 USD|buyer@example\.com|supplier@example\.com|mailto:|rfq\+|sourcing\+/i);
}

const bareAddress = (s) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim();
const inbound = load('../lib/mail/inbound.ts', {
  ...common, resend: { Resend: class {} },
  '@/lib/email/sender': { bareAddress, findUserByAddress: () => null, isOwnMailAddress: () => false },
  '@/lib/rfq/reply-routing': routing,
});
const receive = (id, to, from) => inbound.processInboundEvent({ email_id: id, from, to: [to], subject: 'Quote 6.25 USD' },
  async () => ({ from, to: [to], cc: [], subject: 'Quote 6.25 USD', html: null, text: 'PRICE 6.25 USD',
    created_at: '2026-11-09T10:00:00Z', message_id: `<${id}@foreign.example>` }));
const before = messages.length, beforeMails = mails.length;
for (const [id, to, from] of [
  ['old-supplier', address, supplier.email], ['old-buyer', 'buyer+rfq-20261109-00001@veximtrade.com', buyer.email],
  ['old-sourcing', sourcingAddress, buyer.email],
]) {
  assert.deepEqual({ ...(await receive(id, to, from)) }, { saved: false, reason: 'rfq_disabled' });
}
assert.equal(messages.length, before, 'Inbound RFQ alias cannot change email history, quote, status, or match');
assert.equal(mails.length, beforeMails, 'Do not notify staff of disabled RFQ replies');
assert.equal((await receive('ordinary', 'hello@veximtrade.com', supplier.email)).saved, true,
  'Unrelated supplier correspondence still reaches the ordinary inbox');
assert.equal(messages.at(-1).rfq_id, null);
assert.equal(messages.at(-1).thread_id, `supplier:${supplier.email}`);
assert.equal((await receive('ordinary', 'hello@veximtrade.com', supplier.email)).reason, 'duplicate');
console.log('✅ RFQ email: link-only notices, deduped retry, legacy aliases rejected without mutation, unrelated inbox preserved.');
