// node scripts/check-rfq-sla-notification.mjs — never mark simulated/failed SLA emails as sent.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks, env = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Request, Response, Headers, Date, process: { env }, console,
    require: (key) => { if (key === "@/lib/brand/colors.json") return { default: JSON.parse(readFileSync(new URL("../lib/brand/colors.json", import.meta.url), "utf8")) }; assert.ok(key in mocks, `Unexpected import ${key} in ${file}`); return mocks[key]; },
  }, { filename: file });
  return exports;
}
const rfq = { id: 'rfq-1', code: 'RFQ-001', buyer_id: 'buyer-1', status: 'new', assigned_to: null,
  first_response_at: null, specs: {}, product_text: 'Cashew', created_at: new Date(Date.now() - 22 * 3600_000).toISOString() };
const buyer = { id: 'buyer-1', company: 'Buyer Co', email: 'buyer@example.com' };
const directQuestion = { ...rfq, id: 'rfq-q-1', code: 'RFQ-Q-001', status: 'matching',
  source_page: '/rfq?intent=question', specs: { inquiry_kind: 'supplier_question', contact_share_consent: true } };
const directQuote = { ...rfq, id: 'rfq-d-1', code: 'RFQ-D-001', status: 'matching',
  source_page: '/rfq', preferred_supplier_ids: ['supplier-1'], specs: { direct_delivery_version: 'portal_direct_v2' } };
let status = 'simulated';
const mail = [];
const { sendSlaAlert } = load('../lib/email/rfq.ts', {
  '@/lib/config': { COMPANY: { name: 'Vexim' }, FROM_ADDRESS: 'Vexim <test@example.com>', MAIL_DOMAIN: 'example.com' },
  '@/lib/email/templates': { escapeHtml: String, wrapPlainEmail: ({ body }) => body },
  '@/lib/site': { SITE_URL: 'https://example.com' },
  '@/lib/rfq/channel': load('../lib/rfq/channel.ts', {}),
  '@/lib/email/threading': { mailTopic: () => 'rfq.rfq-q-001', openThread: async () => ({ messageId: '<rfq.rfq-q-001.1@example.com>', headers: {}, seq: 1 }) },
  '@/lib/db': { getStore: () => ({ addMessage: async () => ({}) }) },
  '@/lib/rfq/reply-routing': { buyerReplyAddress: (code) => `buyer+${String(code).toLowerCase()}@veximtrade.com`, supplierReplyAddress: (code, matchId) => `rfq+${String(code).toLowerCase()}-m${String(matchId).replace(/-/g, '')}@veximtrade.com` },
  './send': { transport: async (msg) => { mail.push(msg); return status === 'failed'
    ? { ok: false, status, error: 'provider error' }
    : { ok: true, status, error: null }; } },
});
await assert.rejects(sendSlaAlert({ kind: 'unassigned_4h', rfq, buyer }), /Resend chưa gửi thật/);
status = 'failed';
await assert.rejects(sendSlaAlert({ kind: 'response_due_4h', rfq, buyer }), /provider error/);
status = 'sent';
await sendSlaAlert({ kind: 'unassigned_4h', rfq, buyer });
const updates = [];
let directSweeps = 0;
const store = {
  listRfqs: async () => [rfq, directQuestion, directQuote], listBuyers: async () => [buyer], listUsers: async () => [],
  updateRfq: async (id, patch) => { assert.equal(id, rfq.id, 'Direct RFQs must not get staff SLA markers');
    updates.push(patch); Object.assign(rfq, patch); return rfq; },
};
const { GET } = load('../app/api/cron/rfq-sla/route.ts', {
  'next/server': { NextResponse: class extends Response { static json(data, init) { return Response.json(data, init); } } },
  '@/lib/db': { getStore: () => store },
  '@/lib/email/rfq': { sendSlaAlert },
  '@/lib/rfq/channel': load('../lib/rfq/channel.ts', {}),
  '@/lib/rfq/direct-followup': { runDirectRfqFollowUps: async (used) => { assert.equal(used, store); directSweeps += 1;
    return { checked: 0, reminded: 0, noResponse: 0, buyerNotified: 0, failed: 0 }; } },
  '@/lib/certificate-service': { sendCertificateExpiryReminders: async () => ({ checked: 0, reminded: 0, alreadyNotified: 0, failed: 0, details: [] }) },
  '@/lib/supplier-portal/reminders': { sendSupplierProgressReminders: async () => ({ checked: 0, reminded: 0, skipped: 0 }) },
}, { CRON_SECRET: 'only-for-test' });
const request = new Request('https://example.com/api/cron/rfq-sla', { headers: { authorization: 'Bearer only-for-test' } });
assert.equal((await GET(new Request(request.url))).status, 401);
status = 'failed';
let result = await GET(request);
assert.equal(result.status, 503);
assert.equal((await result.json()).ok, false);
assert.equal(updates.length, 0, 'No sent markers when both alerts fail');
status = 'simulated';
result = await GET(request);
assert.equal(result.status, 503);
assert.equal(updates.length, 0, 'Simulated mail is not delivered');
status = 'sent';
result = await GET(request);
assert.equal(result.status, 200);
assert.equal((await result.json()).unassigned, 1);
assert.equal(updates.length, 2);
assert.ok(rfq.specs.sla_unassigned_alerted_at && rfq.specs.sla_due_alerted_at);
await GET(request);
assert.equal(updates.length, 2, 'Flags prevent duplicate alerts after confirmed acceptance');
assert.ok(directSweeps >= 4, 'Every authorized run also follows up direct RFQs');
assert.equal(directQuestion.specs.sla_unassigned_alerted_at, undefined, 'Direct questions do not receive quote assignment alerts');
assert.equal(directQuestion.specs.sla_due_alerted_at, undefined, 'Direct questions do not receive quote response alerts');
assert.equal(directQuote.specs.sla_unassigned_alerted_at, undefined, 'Direct quotes are never assigned to Vexim by the SLA cron');
assert.equal(directQuote.specs.sla_due_alerted_at, undefined, 'Direct quotes are never marked with a staff response SLA');
console.log('✅ RFQ SLA alerts: failed/simulated sends remain retryable; direct quotes/questions stay outside staff SLA.');
