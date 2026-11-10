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
      if (id === "@/lib/brand/colors.json") return { default: JSON.parse(fs.readFileSync(new URL("../lib/brand/colors.json", import.meta.url), "utf8")) };
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
const sourcingRequest = { id: 'abcdef01-2345-4678-9abc-def012345678', buyer_email: 'sourcer@example.com' };
const messages = [];
const sent = [];
let transportFailed = false;
let transportStatus = 'simulated';
let hasSnapshot = false;
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
  getUserByEmail: async () => null,
  listRfqMatches: async () => [match],
  listRfqQuoteVersions: async (ids) => hasSnapshot && ids.includes(match.id) ? [{ id: 'published-v1', match_id: match.id, version: 1 }] : [],
  getSourcingRequest: async (sid) => sid === sourcingRequest.id ? sourcingRequest : null,
};
const bareAddress = (s) => (s.match(/<([^>]+)>/)?.[1] ?? s).split(',')[0].trim();
const escapeHtml = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const transport = async (mail) => {
  sent.push(mail);
  return transportFailed ? { ok: false, status: 'failed', provider: 'resend' } : { ok: true, status: transportStatus, provider: 'resend' };
};
const threading = loadTS('../lib/email/threading.ts', {
  '@/lib/config': { MAIL_DOMAIN: 'example.com' },
  '@/lib/db': { getStore: () => store },
});
const mocks = {
  resend: { Resend: class {} },
  '@/lib/email/threading': threading,
  '@/lib/config': { ...config, resendConfigured: () => false },
  '@/lib/email/sender': { bareAddress, findUserByAddress: () => null, isOwnMailAddress: () => false },
  '@/lib/db': { getStore: () => store },
  '@/lib/email/templates': { escapeHtml, wrapPlainEmail: ({ body }) => body },
  '@/lib/email/privacy': { htmlToText: (html) => html.replace(/<[^>]+>/g, ' ').trim() },
  '@/lib/email/send': { transport, threadId: (dir, from) => `${dir}:${from}` },
  '@/lib/rfq/reply-routing': router,
  '@/lib/rfq/staff-sender': { requireRfqStaffSender: async () => ({ header: 'Nguyễn Văn Dung <dung@veximtrade.com>' }) },
  '@/lib/supplier-portal/onboarding': loadTS('../lib/supplier-portal/onboarding.ts', {}),
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

// Yêu cầu tìm nguồn: thư người mua trả lời vào sourcing+id gắn đúng mạch, người lạ thì không.
const sourcingAddr = router.sourcingReplyAddress(sourcingRequest.id);
assert.equal(sourcingAddr, 'sourcing+abcdef0123454678' + '9abcdef012345678@veximtrade.com');
assert.equal(router.parseSourcingRoute([`Vexim <${sourcingAddr}>`]), sourcingRequest.id);
assert.equal(router.parseSourcingRoute([sourcingAddr.replace('@veximtrade.com', '@evil.com')]), null);
assert.throws(() => router.sourcingReplyAddress('not-a-uuid'));
await receive('sourcing-reply', `Buyer <${sourcingRequest.buyer_email}>`, sourcingAddr);
assert.equal(messages.at(-1).thread_id, `sourcing-${sourcingRequest.id}`, 'Thư trả lời gắn vào mạch của yêu cầu tìm nguồn');
assert.equal(messages.at(-1).direction, 'buyer');
assert.equal(messages.at(-1).rfq_id, null);
await receive('sourcing-stranger', 'stranger@example.com', sourcingAddr);
assert.notEqual(messages.at(-1).thread_id, `sourcing-${sourcingRequest.id}`, 'Người lạ đoán địa chỉ không chen được vào yêu cầu');

const { notifyBuyerRfqStatus } = loadTS('../lib/rfq/buyer-notify.ts', mocks);
assert.equal((await notifyBuyerRfqStatus(rfq, 'sampling', id)).sent, true);
assert.equal(sent.at(-1).replyTo, router.buyerReplyAddress(code));
assert.equal(messages.at(-1).kind, 'buyer_status_update');
assert.equal(messages.at(-1).rfq_match_id, null);
assert.equal((await notifyBuyerRfqStatus(rfq, 'sampling', id)).reason, 'already_sent');
const samplingMail = sent.at(-1);
assert.match(samplingMail.html, /\/buyer\/account\/requests\/rfq-1/);
assert.doesNotMatch(samplingMail.html, /secret-token|\/rfq\/status\//);
assert.ok(!samplingMail.subject.startsWith('['), 'mã không đứng đầu tiêu đề');
assert.match(samplingMail.subject, /\(Ref RFQ-20261017-00001\)$/, 'mã đặt ở cuối tiêu đề');
assert.equal(samplingMail.headers['In-Reply-To'], undefined, 'thư đầu mạch không có In-Reply-To');
assert.match(samplingMail.headers['Message-ID'], /^<rfq\.rfq-20261017-00001\.1@example\.com>$/, 'Message-ID mang tên mạch + số thứ tự');
assert.equal((await notifyBuyerRfqStatus(rfq, 'lost')).sent, true);
const lostMail = sent.at(-1);
assert.equal(lostMail.headers['In-Reply-To'], samplingMail.headers['Message-ID'], 'thư sau nối đúng thư trước');
assert.equal(lostMail.headers['References'], samplingMail.headers['Message-ID'], 'References chứa thư trước');
assert.match(lostMail.subject, /\(Ref RFQ-20261017-00001\)$/, 'cả mạch dùng chung một mã');
assert.ok(sent.at(-1).html.includes('The quoted price was not competitive'), 'buyer mail carries the public reason');
assert.ok(!/[àáảãạăâđêôơư]/i.test(sent.at(-1).html), 'buyer mail is English only');
assert.ok(!sent.at(-1).html.includes('INTERNAL ONLY'), 'internal closed_reason must stay private');
assert.equal((await notifyBuyerRfqStatus(rfq, 'lost')).reason, 'already_sent');
assert.equal(messages.filter((m) => m.kind === 'buyer_status_update').length, 2);

const newRfq = { ...rfq, id: 'rfq-2', code: 'RFQ-20261017-00002' };
transportFailed = true;
assert.equal((await notifyBuyerRfqStatus(newRfq, 'lost')).reason, 'transport_failed');
transportFailed = false;
assert.equal((await notifyBuyerRfqStatus(newRfq, 'lost')).sent, true, 'failed send may retry');

const workflow = loadTS('../lib/rfq/workflow.ts', {});
const contact = loadTS('../lib/rfq/buyer-contact.ts', {});
const actionRfq = { ...rfq, id: 'rfq-action', code: 'RFQ-20261017-00003', status: 'quoted',
  specs: contact.buyerContactConsentSpec({ company: 'Buyer Co', contact_name: 'Jane', email: buyer.email,
    phone: null, country: null, website: null, business_type: null }, '2026-10-17T00:00:00Z', 'rfq_form') };
const actions = loadTS('../app/crm/rfqs/[id]/compose-action.ts', {
  'next/cache': { revalidatePath: () => {} },
  'next/navigation': { redirect: () => { throw Error('access denied'); } },
  ...mocks,
  '@/lib/auth/session': { guard: async () => null, getSession: async () => ({ uid: 'admin', email: 'admin@veximtrade.com' }) },
  '@/lib/rfq/buyer-notify': { notifyBuyerRfqStatus },
  '@/lib/rfq/outreach': { notifySelectedSupplier: async () => 'sent', recordSupplierSelection: async (_r, m) => { m.status = 'selected'; } },
  '@/lib/rfq/workflow': workflow,
  '@/lib/rfq/buyer-contact': contact,
  '@/lib/public/product-selection': { withoutDirectContacts: (text) => text },
});
const sampling = new FormData(); sampling.set('rfq_id', actionRfq.id);
await assert.rejects(actions.markSamplingAction(sampling), /Chọn nhà cung cấp có báo giá/, 'sampling needs a quoted supplier');
match.rfq_id = actionRfq.id; match.status = 'proposed';
sampling.set('selected_match_id', match.id);
await assert.rejects(actions.markSamplingAction(sampling), /đã công bố/, 'cannot sample with an unquoted supplier');
match.status = 'quoted';
await assert.rejects(actions.markSamplingAction(sampling), /đã công bố/, 'cannot sample with an unpublished draft');
assert.equal(actionRfq.status, 'quoted');
match.status = 'presented_to_buyer'; match.sent_to_buyer_at = '2026-10-17T11:00:00Z';
await assert.rejects(actions.markSamplingAction(sampling), /đã công bố/, 'An old timestamp with no immutable snapshot cannot be sampled');
hasSnapshot = true;
await actions.markSamplingAction(sampling);
assert.equal(actionRfq.status, 'sampling');
assert.equal(match.status, 'selected');
assert.equal(messages.filter((m) => m.rfq_id === actionRfq.id && m.stage === 'sampling').length, 1);
await actions.markSamplingAction(sampling);
assert.equal(messages.filter((m) => m.rfq_id === actionRfq.id && m.stage === 'sampling').length, 1, 'resubmit must not notify twice');
const lost = new FormData(); lost.set('rfq_id', actionRfq.id); lost.set('lost_reason', 'price');
await actions.markLostAction(lost);
assert.equal(actionRfq.status, 'lost');
assert.equal(messages.filter((m) => m.rfq_id === actionRfq.id && m.stage === 'lost').length, 1);
await actions.markLostAction(lost);
assert.equal(messages.filter((m) => m.rfq_id === actionRfq.id && m.stage === 'lost').length, 1);
await assert.rejects(actions.markSamplingAction(sampling), /RFQ đã đóng/, 'a closed RFQ cannot go back to sampling');
const compose = new FormData(); compose.set('rfq_id', actionRfq.id); compose.set('match_id', match.id);
compose.set('subject', 'Báo giá'); compose.set('body', 'Xin chào');
match.status = 'proposed';
await assert.rejects(actions.composeMatchEmailAction(compose), /sau khi nhà cung cấp nhận yêu cầu/, 'No manual RFQ email to proposed suppliers');
match.status = 'selected';
await assert.rejects(actions.composeMatchEmailAction(compose), /chưa gửi thật/);
assert.equal(messages.filter((m) => m.kind === 'manual' && m.rfq_id === actionRfq.id).length, 0, 'Simulated attempt cannot count as sent');
transportStatus = 'sent';
supplier.onboarding_status = 'pending';
await assert.rejects(actions.composeMatchEmailAction(compose), /Tài khoản nhà cung cấp chưa được xác nhận/);
const pendingFollowup = new FormData(); pendingFollowup.set('rfq_id', actionRfq.id); pendingFollowup.set('match_id', match.id);
await assert.rejects(actions.sendFollowUpAction(pendingFollowup), /Tài khoản nhà cung cấp chưa được xác nhận/);
supplier.onboarding_status = 'approved';
await actions.composeMatchEmailAction(compose);
assert.equal(sent.at(-1).from, 'Nguyễn Văn Dung <dung@veximtrade.com>');
assert.equal(sent.at(-1).replyTo, router.supplierReplyAddress(actionRfq.code, match.id));
assert.equal(messages.filter((m) => m.kind === 'manual' && m.rfq_id === actionRfq.id).length, 1);
const followup = new FormData(); followup.set('rfq_id', actionRfq.id); followup.set('match_id', match.id);
await actions.sendFollowUpAction(followup);
assert.equal(sent.at(-1).from, 'Nguyễn Văn Dung <dung@veximtrade.com>');
assert.equal(sent.at(-1).replyTo, router.supplierReplyAddress(actionRfq.code, match.id));
assert.match(sent.at(-1).html, /buyer@example.com/, 'Follow-up repeats the consented buyer contact, not CRM data');
assert.equal(messages.filter((m) => m.kind === 'rfq_followup').length, 1);
const releasedRfqs = [];
const regularActions = loadTS('../app/crm/rfqs/actions.ts', {
  'next/cache': { revalidatePath: () => {} },
  'next/navigation': { redirect: () => { throw Error('redirect'); } },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { guard: async () => null, getSession: async () => ({ uid: 'admin' }) },
  '@/lib/rfq/workflow': workflow,
  '@/lib/rfq/release-after-review': { releaseDirectRfqAfterReview: async (_store, rfq) => { releasedRfqs.push(rfq); return 1; } },
});
// Duyệt cho qua RFQ bị giữ lại thì chuyển tiếp tới nhà cung cấp; đổi trạng thái thường thì không.
actionRfq.status = 'needs_review';
const approve = new FormData(); approve.set('id', actionRfq.id); approve.set('status', 'in_progress');
await assert.rejects(regularActions.updateRfqStatusFormAction(approve), /redirect/);
assert.equal(releasedRfqs.length, 1, 'approving a held RFQ re-runs direct delivery');
assert.equal(releasedRfqs[0].status, 'in_progress');
const again = new FormData(); again.set('id', actionRfq.id); again.set('status', 'matching');
await assert.rejects(regularActions.updateRfqStatusFormAction(again), /redirect/);
assert.equal(releasedRfqs.length, 1, 'ordinary status changes do not re-send');
for (const status of ['lost', 'sampling', 'won', 'quoted']) {
  const badStatus = new FormData(); badStatus.set('id', actionRfq.id); badStatus.set('status', status);
  await assert.rejects(regularActions.updateRfqStatusFormAction(badStatus), /nút nghiệp vụ/, `${status} must use its business action`);
}
assert.equal(actionRfq.lost_reason, 'price');
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
assert.ok(schema.indexOf('create table if not exists public.rfq_matches') < schema.indexOf('alter table public.email_messages add column if not exists rfq_match_id'));
assert.ok(schema.includes('email_messages_buyer_status_once_idx'));
console.log('✅ RFQ email: Reply-To, inbound validation, action transitions, dedupe, buyer notifications, retries passed.');
