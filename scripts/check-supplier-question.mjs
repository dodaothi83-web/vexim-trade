// node scripts/check-supplier-question.mjs — direct supplier question delivery, consent and quote isolation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, mocks) {
  const output = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, { module: mod, exports: mod.exports, process, console, Date, Map, Set, URLSearchParams,
    require: (key) => { assert.ok(key in mocks, `Unexpected ${key} in ${path}`); return mocks[key]; },
  }, { filename: path });
  return mod.exports;
}
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mailMocks = {
  '@/lib/config': { MAIL_DOMAIN: 'example.com', FROM_ADDRESS: 'Vexim <hello@example.com>' },
  '@/lib/email/privacy': { htmlToText: (html) => html.replace(/<[^>]+>/g, ' ') },
  '@/lib/email/templates': { escapeHtml, wrapPlainEmail: ({ title, body }) => `<h1>${title}</h1>${body}` },
  '@/lib/public/product-selection': { withoutDirectContacts: (value) => String(value) },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  '@/lib/supplier-portal/onboarding': { canInviteSupplier: async () => true },
};

process.env.RFQ_INTERNAL_EMAIL = 'desk@example.com';
const buyer = { id: 'buyer-1', company: 'Buyer Co', contact_name: 'Jane Doe', email: 'buyer@example.com' };
const supplier = { id: 's-a', name: 'Supplier A', contact_name: 'Export team', email: 'supplier@example.com', onboarding_status: 'approved' };
const rfq = {
  id: 'r-q', buyer_id: buyer.id, code: 'RFQ-Q-1', access_token: 'private-token', product_text: 'Cashew W320', source_product_id: 'p-a',
  preferred_supplier_ids: [supplier.id], source_page: '/rfq?intent=question', status: 'new', spam_score: 0, spam_flags: [],
  specs: { inquiry_kind: 'supplier_question', contact_share_consent: true, notes: 'Can you confirm the peroxide value and available packaging?' },
};
const match = { id: 'm-q', rfq_id: rfq.id, supplier_id: supplier.id, status: 'proposed', sent_to_supplier_at: null };
const messages = [];
const rfqUpdates = [];
const sent = [];
let deliveryResult = { ok: true, status: 'sent', provider: 'resend' };
const questionStore = {
  listRfqMatches: async () => [match],
  getSupplier: async () => supplier,
  updateRfqMatch: async (_id, patch) => Object.assign(match, patch),
  updateRfq: async (_id, patch) => { rfqUpdates.push(patch); return { ...rfq, ...patch }; },
  addMessage: async (input) => { messages.push(input); return input; },
};
const questionMail = load('../lib/rfq/supplier-question.ts', {
  ...mailMocks,
  '@/lib/db': { getStore: () => questionStore },
  '@/lib/email/send': { transport: async (message) => { sent.push(message); return deliveryResult; } },
});
const delivered = await questionMail.deliverSupplierQuestion({ rfq, buyer, supplierId: supplier.id,
  productUrl: 'https://www.veximtrade.com/products/cashew/p-a' });
assert.equal(delivered.delivered, true);
assert.equal(sent.length, 1);
assert.equal(sent[0].to[0], supplier.email);
assert.equal(sent[0].replyTo, buyer.email, 'Supplier replies route directly to the consenting buyer');
assert.match(sent[0].html, /peroxide value/);
assert.match(sent[0].html, /buyer@example\.com/);
assert.doesNotMatch(sent[0].html, /mailto:/i, 'Buyer email stays plain text; Reply-To handles direct replies without cross-domain mailto links');
assert.match(sent[0].html, /products\/cashew\/p-a/);
assert.ok(!sent[0].subject.includes('—'), 'No decorative em dash in the supplier subject');
assert.equal(match.status, 'sent_to_supplier');
assert.ok(match.sent_to_supplier_at);
assert.equal(rfqUpdates[0].status, 'matching');
assert.equal(messages[0].status, 'sent');
assert.equal(messages[0].sent_at, match.sent_to_supplier_at);

await questionMail.sendSupplierQuestionAckBuyer({ rfq, buyer, delivered: true });
assert.equal(sent[1].to[0], buyer.email);
assert.match(sent[1].html, /reply directly to your email/);
assert.doesNotMatch(sent[1].html, /export desk|contact details stay private/i);
await questionMail.sendSupplierQuestionExceptionInternal({ rfq, buyer, reason: 'provider rejected' });
assert.equal(sent[2].to[0], 'desk@example.com');
assert.match(sent[2].subject, /Question delivery/);
assert.match(sent[2].html, /Do not treat this as a quote request/);

for (const result of [
  { ok: true, status: 'simulated', provider: 'resend' },
  { ok: false, status: 'failed', provider: 'resend', error: 'provider rejected' },
]) {
  deliveryResult = result;
  match.status = 'proposed'; match.sent_to_supplier_at = null;
  const beforeUpdates = rfqUpdates.length;
  const failed = await questionMail.deliverSupplierQuestion({ rfq, buyer, supplierId: supplier.id });
  assert.equal(failed.delivered, false, `${result.status} is not confirmed supplier delivery`);
  assert.equal(match.status, 'proposed');
  assert.equal(match.sent_to_supplier_at, null);
  assert.equal(rfqUpdates.length, beforeUpdates, 'Unsent questions never advance the RFQ status');
  assert.equal(messages.at(-1).status, result.status);
  assert.equal(messages.at(-1).sent_at, null);
}
const beforeConsentMail = sent.length;
const noConsent = await questionMail.deliverSupplierQuestion({ rfq: { ...rfq, specs: { ...rfq.specs, contact_share_consent: false } }, buyer, supplierId: supplier.id });
assert.equal(noConsent.delivered, false);
assert.equal(noConsent.reason, 'contact_consent_required');
assert.equal(sent.length, beforeConsentMail, 'No contact sharing without per-question consent');
const wrongSupplier = await questionMail.deliverSupplierQuestion({ rfq, buyer, supplierId: 's-b' });
assert.equal(wrongSupplier.reason, 'selected_supplier_required');
const unreviewed = await questionMail.deliverSupplierQuestion({ rfq: { ...rfq, status: 'needs_review' }, buyer, supplierId: supplier.id });
assert.equal(unreviewed.reason, 'moderation_required');
assert.equal(sent.length, beforeConsentMail, 'Moderation and selected-supplier guards cannot be bypassed');

// Full submit wiring: direct questions and staff-mediated quotes share storage, not notification behaviour.
process.env.TURNSTILE_SECRET_KEY = '';
process.env.RFQ_REJECT_WEBMAIL = 'false';
const createdRfqs = [];
const createdBuyers = [];
const buyerUpdates = [];
let listedBuyers = [];
const questionAcks = [];
const exceptionReasons = [];
let directCalls = 0;
let autoMatches = 0;
let genericAcks = 0;
let genericInternal = 0;
let directResult = { delivered: true };
let spamScore = 0;
let distributedResult = { status: 'ok' };
let distributedCalls = 0;
const category = { id: 'cat-1', slug: 'cashew', status: 'published', is_published: true };
const submitStore = {
  listBuyers: async () => listedBuyers,
  createBuyer: async (input) => { createdBuyers.push(input); return { id: 'buyer-1', ...input }; },
  updateBuyer: async (id, patch) => {
    buyerUpdates.push({ id, patch });
    const current = listedBuyers.find((item) => item.id === id) ?? createdBuyers.at(-1) ?? {};
    return { ...current, id, ...patch };
  },
  getCategoryBySlug: async () => category,
  listRfqs: async () => [],
  createRfq: async (input) => { createdRfqs.push(input); return { ...input, id: `r-${createdRfqs.length}`, access_token: 'private-token' }; },
  addAuditLog: async () => null,
};
const submit = load('../lib/rfq/submit.ts', {
  'next/headers': { headers: async () => ({ get: () => null }) },
  '@/lib/db': { getStore: () => submitStore },
  '@/lib/public/catalog': { listPublicSuppliers: async () => [{ id: supplier.id }] },
  '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => [{ id: 'p-a', name: 'Cashew W320', supplierId: supplier.id }] },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  '@/lib/email/rfq': { sendRfqAckBuyer: async () => { genericAcks++; }, sendRfqNewInternal: async () => { genericInternal++; } },
  '.': { emailDomain: () => 'example.com', fingerprint: () => 'test', generateAccessToken: () => 'private-token', generateRfqCode: () => 'RFQ-Q-1',
    hasMxRecord: async () => ({ ok: true }), isLikelyWebmail: () => false, normalizeCompanyWebsite: () => null,
    scoreSpam: (input) => ({ score: spamScore + (input.turnstileOk ? 0 : 60), flags: input.turnstileOk ? [] : ['turnstile_missing'] }) },
  './auto-match': { createPreferredSupplierMatches: async () => { autoMatches++; return []; } },
  './supplier-question-rate-limit': { checkSupplierQuestionRateLimit: async () => { distributedCalls++; return distributedResult; } },
  './supplier-question': {
    deliverSupplierQuestion: async () => { directCalls++; return directResult; },
    sendSupplierQuestionAckBuyer: async ({ delivered: wasDelivered }) => { questionAcks.push(wasDelivered); },
    sendSupplierQuestionExceptionInternal: async ({ reason }) => { exceptionReasons.push(reason); },
  },
  './rate-limit': { gcRateLimit() {}, rateLimit: () => ({ ok: true }) },
});
const rawQuestion = {
  company: 'Buyer Co', contact_name: 'Jane Doe', email: 'buyer@example.com', consent: true,
  product_text: 'Cashew W320', category_slug: 'cashew', source_product_id: 'p-a', preferred_supplier_ids: [supplier.id],
  inquiry_kind: 'supplier_question', share_contact_consent: true,
  message: 'Can you confirm the peroxide value and available packaging?',
};
const direct = await submit.submitRfq(rawQuestion);
assert.equal(direct.ok, true);
assert.equal(direct.status, 'matching');
assert.equal(direct.supplierDelivered, true);
assert.equal(createdBuyers[0].stage, 'lead', 'New RFQ buyers must satisfy buyers_stage_check');
assert.equal(buyerUpdates[0].patch.supplier_id, supplier.id, 'A delivered question links the selected supplier in Buyer CRM');
assert.equal(createdRfqs[0].specs.inquiry_kind, 'supplier_question');
assert.equal(createdRfqs[0].specs.contact_share_consent, true);
assert.equal(createdRfqs[0].specs.notes, rawQuestion.message);
assert.equal(createdRfqs[0].source_page, '/rfq?intent=question');
assert.equal(createdRfqs[0].source_product_id, 'p-a');
assert.equal(createdRfqs[0].quantity, null, 'Question mode does not require quote quantity');
assert.equal(questionAcks[0], true);
assert.equal(genericAcks, 0, 'Direct questions never receive the generic staffed RFQ acknowledgement');
assert.equal(genericInternal, 0, 'Successful direct questions do not create routine desk notifications');
assert.equal(exceptionReasons.length, 0);

const quote = await submit.submitRfq({ ...rawQuestion, inquiry_kind: 'quote', share_contact_consent: false,
  quantity: 10, unit: 'MT', destination_country: 'US', message: 'Quote notes' });
assert.equal(quote.ok, true);
assert.equal(quote.supplierDelivered, undefined);
assert.equal(createdBuyers[1].stage, 'lead', 'Quote buyers use the same valid initial pipeline stage');
assert.equal(buyerUpdates.length, 1, 'Ordinary quotes do not auto-link a buyer supplier');
assert.equal(directCalls, 1, 'Quote mode never uses direct question delivery');
assert.equal(distributedCalls, 1, 'Quote mode never calls the supplier-question distributed limiter');
assert.equal(genericAcks, 1, 'Quote acknowledgement is unchanged');
assert.equal(genericInternal, 1, 'Quote desk notification is unchanged');
assert.equal(questionAcks.length, 1);

directResult = { delivered: false, reason: 'email_not_delivered' };
const failed = await submit.submitRfq(rawQuestion);
assert.equal(failed.ok, true);
assert.equal(failed.status, 'new');
assert.equal(failed.supplierDelivered, false);
assert.equal(buyerUpdates.length, 1, 'A failed question delivery does not establish a CRM supplier link');
assert.equal(questionAcks.at(-1), false);
assert.equal(exceptionReasons[0], 'email_not_delivered');
assert.equal(genericAcks, 1, 'Failed questions still use question-specific acknowledgement');
assert.equal(genericInternal, 1, 'Failed questions use question-specific exception notification');

spamScore = 50;
const review = await submit.submitRfq(rawQuestion);
assert.equal(review.status, 'needs_review');
assert.equal(directCalls, 2, 'Flagged questions are not sent before moderation');
assert.equal(questionAcks.at(-1), false);
assert.equal(exceptionReasons.length, 2);
const denied = await submit.submitRfq({ ...rawQuestion, share_contact_consent: false });
assert.equal(denied.ok, false);
assert.match(denied.message, /approve sharing/i);
assert.equal(directCalls, 2);

spamScore = 0;
directResult = { delivered: true };
distributedResult = { status: 'degraded', reason: 'not_configured' };
const notConfigured = await submit.submitRfq(rawQuestion);
assert.equal(notConfigured.status, 'needs_review');
assert.ok(createdRfqs.at(-1).spam_flags.includes('rate_limit_not_configured'));
assert.equal(directCalls, 2, 'Missing production Redis configuration never opens direct delivery');
assert.equal(exceptionReasons.at(-1), 'not_configured');

distributedResult = { status: 'degraded', reason: 'unavailable' };
const degraded = await submit.submitRfq(rawQuestion);
assert.equal(degraded.status, 'needs_review');
assert.equal(degraded.supplierDelivered, false);
assert.ok(createdRfqs.at(-1).spam_flags.includes('rate_limit_unavailable'));
assert.equal(directCalls, 2, 'Redis failure never opens direct delivery');
assert.equal(exceptionReasons.at(-1), 'unavailable');

distributedResult = { status: 'ok' };
const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';
const missingTurnstile = await submit.submitRfq(rawQuestion);
if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;
assert.equal(missingTurnstile.status, 'needs_review');
assert.ok(createdRfqs.at(-1).spam_flags.includes('turnstile_missing'));
assert.equal(directCalls, 2, 'Missing production Turnstile configuration never opens direct delivery');
assert.equal(exceptionReasons.at(-1), 'turnstile_missing');

const beforeRejected = createdRfqs.length;
distributedResult = { status: 'limited', resetAt: Date.now() + 60_000 };
const limited = await submit.submitRfq(rawQuestion);
assert.equal(limited.ok, false);
assert.equal(limited.rateLimited, true);
assert.equal(createdRfqs.length, beforeRejected, 'Rate-limited attempts do not fill the database');
assert.equal(directCalls, 2);

distributedResult = { status: 'ok' };
for (const invalid of [
  { email: 'buyer@example' },
  { company: 'x'.repeat(201) },
  { message: 'x'.repeat(4_001) },
]) {
  const rejected = await submit.submitRfq({ ...rawQuestion, ...invalid });
  assert.equal(rejected.ok, false);
  assert.equal(createdRfqs.length, beforeRejected, 'Invalid oversized payloads are rejected before persistence');
}
assert.equal(directCalls, 2);

// An existing CRM supplier link and pipeline ownership survive a new direct question.
const updatesBeforeExistingBuyer = buyerUpdates.length;
listedBuyers = [{
  id: 'buyer-existing', company: 'Existing Buyer Co', contact_name: 'Existing Contact',
  email: rawQuestion.email, supplier_id: 'supplier-existing', stage: 'contacted', owner: 'Sales Owner',
}];
await submit.submitRfq(rawQuestion);
assert.equal(buyerUpdates.length, updatesBeforeExistingBuyer + 1, 'An already linked buyer is not auto-linked a second time');
assert.equal(buyerUpdates.at(-1).patch.supplier_id, 'supplier-existing', 'A new question never replaces the existing supplier');
assert.equal(buyerUpdates.at(-1).patch.stage, 'contacted');
assert.equal(buyerUpdates.at(-1).patch.owner, 'Sales Owner');

const productPage = fs.readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
const form = fs.readFileSync(new URL('../app/(public)/rfq/rfq-form.tsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../app/(public)/rfq/page.tsx', import.meta.url), 'utf8');
const status = fs.readFileSync(new URL('../app/(public)/rfq/status/[token]/page.tsx', import.meta.url), 'utf8');
const crm = fs.readFileSync(new URL('../app/crm/rfqs/[id]/page.tsx', import.meta.url), 'utf8');
const crmList = fs.readFileSync(new URL('../app/crm/rfqs/page.tsx', import.meta.url), 'utf8');
const crmActions = fs.readFileSync(new URL('../app/crm/rfqs/[id]/actions.ts', import.meta.url), 'utf8');
const outreach = fs.readFileSync(new URL('../lib/rfq/outreach.ts', import.meta.url), 'utf8');
assert.match(productPage, /grid grid-cols-2 gap-3/);
assert.match(productPage, /const questionRfq = `\$\{rfq\}&intent=question`/);
assert.match(productPage, /href=\{questionRfq\}/);
assert.match(form, /I agree to share my name, company, email and this question/);
assert.match(form, /Send to supplier/);
assert.match(form, /Request a quote instead/);
assert.match(page, /mode=\{isQuestion \? "question" : "quote"\}/);
const questionUi = form.slice(form.indexOf('if (isQuestion) {'), form.indexOf('\n  return (', form.indexOf('if (isQuestion) {')));
assert.match(questionUi, /label="Your question"/);
assert.doesNotMatch(questionUi, /label="Quantity"|label="Destination"/);
assert.doesNotMatch(questionUi, /—/);
assert.match(status, /function questionStatusInfo/);
assert.match(status, /Supplier replies go to your email and are not shown here/);
assert.match(crm, /canManageRfq && !isSupplierQuestion/);
assert.match(crmList, /Câu hỏi NCC/);
assert.match(crmList, /return !isSupplierQuestion\(rfq\) && rfq\.status === tab/);
assert.match(crmList, /không tính SLA báo giá/);
assert.match(crmActions, /Tạo RFQ mới sau khi buyer đồng ý nếu cần thêm NCC khác/);
assert.match(outreach, /không dùng quy trình gửi yêu cầu báo giá/);

console.log('✅ Supplier question: consent, direct Reply-To, honest delivery, focused alerts, quote isolation and contextual UI passed.');
