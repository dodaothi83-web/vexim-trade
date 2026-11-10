import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, mocks) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, process: { env: {} }, require(id) { if (id === 'react/jsx-runtime') return jsx; assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id]; } });
  return mod.exports;
}
let session = null, verified = true, ownerEmail = 'buyer@example.com', accountEmail = 'buyer@example.com';
let rfqExists = true, buyerExists = true, buyerId = 'crm-buyer';
const calls = [];
const notFound = () => { throw Error('NOT_FOUND'); };
const navigation = { notFound, redirect: (path) => { throw Error(`REDIRECT:${path}`); } };
const record = () => ({ id: 'r1', buyer_id: buyerId, access_token: 'old-secret', code: 'RFQ-1', status: 'new', product_text: 'Private product', specs: {}, internal_notes: 'DO NOT RENDER' });
const access = load('lib/buyer/enquiry-access.ts', {
  'server-only': {}, 'next/navigation': navigation,
  '@/lib/auth/buyer-session': { requireBuyerSession: async (next) => {
    calls.push(['auth', next]);
    if (!session) throw Error(`REDIRECT:/buyer/sign-in?next=${encodeURIComponent(next)}`);
    return session;
  } },
  '@/lib/db': { getStore: () => { calls.push(['store']); return {
    getBuyerUserByEmail: async (email) => { calls.push(['account', email]); return { email: accountEmail, verified_at: verified ? 'today' : null }; },
    getRfq: async (id) => { calls.push(['id', id]); return rfqExists ? record() : null; },
    getRfqByToken: async (token) => { calls.push(['token', token]); return rfqExists ? record() : null; },
    getBuyer: async (id) => { calls.push(['buyer', id]); return buyerExists ? { id, email: ownerEmail, company: 'Same Company' } : null; },
  }; } },
});
const legacy = load('app/(public)/rfq/status/[token]/page.tsx', { 'next/navigation': navigation, '@/lib/buyer/enquiry-access': access });
const copy = load('lib/rfq/portal-copy.ts', {});
const detailComponent = load('components/buyer-enquiry-detail.tsx', {
  'next/link': { default: ({ children, prefetch: _prefetch, ...props }) => React.createElement('a', props, children) },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/ui': { Breadcrumbs: () => null },
  '@/lib/rfq/portal-copy': copy,
});
const channel = load('lib/rfq/channel.ts', {});
const contact = load('lib/rfq/buyer-contact.ts', {});
const core = load('lib/rfq/portal-core.ts', {
  '@/lib/public/product-selection': { withoutDirectContacts: (s) => s },
  './buyer-contact': contact, './channel': channel,
});
const quoteStore = {
  listRfqMatches: async () => [
    { id: 'q1', rfq_id: 'r1', supplier_id: 's1', status: 'quoted', sent_to_buyer_at: '2026-11-05T00:00:00Z', quote_price: 9.99, quote_currency: 'USD', quote_unit: 'kg', quote_incoterm: 'FOB', quote_lead_time_days: 20, quote_valid_until: null },
    { id: 'q2', rfq_id: 'r1', supplier_id: 's2', status: 'quoted', sent_to_buyer_at: null, quote_price: 9.99, quote_currency: 'USD', quote_unit: 'kg' },
  ],
  listSuppliers: async () => [
    { id: 's1', name: 'Shown Supplier', province: 'Dak Lak', email: 'secret-supplier@example.com', phone: '+84 900 000 000' },
    { id: 's2', name: 'Hidden Supplier' },
  ],
  listRfqQuoteVersions: async () => [{ id: 'v1', match_id: 'q1', version: 1, quote_price: 6.35,
    quote_currency: 'USD', quote_unit: 'kg', quote_incoterm: 'FOB', quote_lead_time_days: 20,
    quote_valid_until: null, buyer_note: 'Public packing only', published_at: '2026-11-05T00:00:00Z' }],
};
const detail = load('app/(public)/buyer/account/requests/[id]/page.tsx', {
  '@/lib/buyer/enquiry-access': access, '@/components/buyer-enquiry-detail': detailComponent,
  '@/lib/db': { getStore: () => quoteStore }, '@/lib/i18n/server': { getLocale: async () => 'en' },
  '@/lib/rfq/portal-core': core, '@/lib/rfq/channel': channel,
});
for (const [page, params, next] of [
  [legacy.default, { token: 'old-secret' }, '/rfq/status/old-secret'],
  [detail.default, { id: 'r1' }, '/buyer/account/requests/r1'],
]) {
  calls.length = 0;
  await assert.rejects(page({ params: Promise.resolve(params) }), new RegExp(`^Error: REDIRECT:/buyer/sign-in\\?next=${encodeURIComponent(next)}$`));
  assert.equal(calls.length, 1, 'Guests (including staff/supplier-only sessions) do not look up requests');
  session = { email: 'buyer@example.com', uid: 'buyer-account' };
  ownerEmail = 'someone-else@example.com';
  await assert.rejects(page({ params: Promise.resolve(params) }), /NOT_FOUND/, 'A token or known ID does not grant access to another buyer');
  ownerEmail = null;
  await assert.rejects(page({ params: Promise.resolve(params) }), /NOT_FOUND/, 'No automatic claim for legacy records missing email');
  ownerEmail = 'buyer@example.com';
  verified = false;
  await assert.rejects(page({ params: Promise.resolve(params) }), /NOT_FOUND/);
  verified = true;
  session = null;
}
session = { email: 'buyer@example.com', uid: 'buyer-account' };
ownerEmail = ' Buyer@EXAMPLE.com ';
await assert.rejects(legacy.default({ params: Promise.resolve({ token: 'old-secret' }) }), /REDIRECT:\/buyer\/account\/requests\/r1$/);
let tree = await detail.default({ params: Promise.resolve({ id: 'r1' }) });
let html = renderToStaticMarkup(React.createElement(tree.type, tree.props));
assert.match(html, /Private product/);
assert.match(html, /All enquiries/);
assert.match(html, /Supplier quotes \(1\)/, 'Buyer sees published offers in their account');
assert.match(html, /Shown Supplier[\s\S]*6\.35 USD \/ kg/);
assert.doesNotMatch(html, /Hidden Supplier|9\.99/, 'Unpublished quotes and pending revisions stay hidden');
assert.match(html, /Public packing only/);
assert.doesNotMatch(html, /secret-supplier@example\.com|\+84 900/, 'No supplier contact details before the buyer chooses');
assert.doesNotMatch(html, /old-secret|DO NOT RENDER|without logging in|private and unique/);
for (const missing of ['rfq', 'buyer', 'buyer-id']) {
  rfqExists = missing !== 'rfq'; buyerExists = missing !== 'buyer'; buyerId = missing === 'buyer-id' ? null : 'crm-buyer';
  await assert.rejects(detail.default({ params: Promise.resolve({ id: 'r1' }) }), /NOT_FOUND/);
}
rfqExists = buyerExists = true; buyerId = 'crm-buyer';
accountEmail = 'other@example.com';
await assert.rejects(detail.default({ params: Promise.resolve({ id: 'r1' }) }), /NOT_FOUND/);
for (const file of ['lib/email/rfq.ts', 'lib/rfq/submit.ts', 'lib/rfq/buyer-notify.ts',
  'lib/rfq/portal-alerts.ts', 'app/(public)/buyer/account/page.tsx']) {
  const source = read(file);
  assert.match(source, /\/buyer\/account\/requests\//, `${file} emits dashboard links`);
  assert.doesNotMatch(source, /\/rfq\/status\//, `${file} no longer emits bearer links`);
  assert.doesNotMatch(source, /without logging in|private and unique/);
}
assert.equal(legacy.metadata.robots.index, false);
assert.equal(detail.metadata.robots.index, false);
console.log('✅ Enquiry access: authenticate before lookup, verified exact-email ownership, legacy redirect, IDOR denial, orphan recovery boundary, safe detail and dashboard links.');

// Render the actual acknowledgement template with a fake transport: no live mail.
const sent = [];
const mail = load('lib/email/rfq.ts', {
  '@/lib/brand/colors.json': { default: { primary: '#1f3e74', muted: '#64748b' } },
  '@/lib/config': { COMPANY: { name: 'Vexim' }, FROM_ADDRESS: 'hello@example.com', MAIL_DOMAIN: 'example.com' },
  '@/lib/email/templates': { escapeHtml: (v) => String(v ?? '').replace(/</g, '&lt;'), wrapPlainEmail: ({ body }) => body },
  '@/lib/email/threading': { mailTopic: () => 'topic', openThread: async () => ({ headers: {}, messageId: 'test' }) },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  '@/lib/db': { getStore: () => ({ addMessage: async () => ({}) }) },
  '@/lib/rfq/reply-routing': { buyerReplyAddress: (code) => `buyer+${String(code).toLowerCase()}@veximtrade.com`, supplierReplyAddress: (code, matchId) => `rfq+${String(code).toLowerCase()}-m${String(matchId).replace(/-/g, '')}@veximtrade.com` },
  './send': { transport: async (input) => { sent.push(input); return { status: 'simulated' }; } },
});
await mail.sendRfqAckBuyer({ rfq: record(), buyer: { id: 'crm-buyer', email: 'buyer@example.com', contact_name: 'Buyer' } });
assert.match(sent[0].html, /href="https:\/\/www.veximtrade.com\/buyer\/account\/requests\/r1"/);
assert.match(sent[0].html, />View enquiry<\/a>/);
assert.match(sent[0].replyTo, /^buyer\+.+@veximtrade\.com$/, 'Người mua trả lời thư xác nhận RFQ thì thư vào đúng timeline RFQ');
assert.doesNotMatch(sent[0].html + sent[0].text, /old-secret|without logging in|\/rfq\/status\//);
console.log('✅ Actual buyer acknowledgement email links to account-owned detail without exposing legacy tokens.');
