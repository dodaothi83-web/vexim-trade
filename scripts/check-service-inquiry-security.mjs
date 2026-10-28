// node scripts/check-service-inquiry-security.mjs — homepage registration abuse controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let protectionResult = { ok: true };
const protectionCalls = [];
let audits = 0;
const sent = [];
const mod = { exports: {} };
const path = '../app/api/public/service-inquiry/route.ts';
const output = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(output, {
  module: mod, exports: mod.exports, Request, Response, FormData, URL, Date, console,
  process: { env: { NODE_ENV: 'production' } },
  require: (key) => {
    const mocks = {
      'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
      '@/lib/config': { COMPANY: { email: 'hello@veximtrade.com' } },
      '@/lib/db': { getStore: () => ({
        addAuditLog: async () => { audits++; },
        listUsers: async () => [{ email: 'admin@veximtrade.com', role: 'admin', is_active: true }],
      }) },
      '@/lib/email/service-inquiry': {
        buildServiceInquiryAcknowledgement: () => ({ subject: 'Ack', html: '<p>Ack</p>', text: 'Ack' }),
        buildServiceInquiryInternalEmail: () => ({ subject: 'Internal', html: '<p>Internal</p>', text: 'Internal' }),
        serviceDisplayTitle: () => 'Service',
        serviceInquiryReference: () => 'REF-TEST',
      },
      '@/lib/email/send': { transport: async (input) => { sent.push(input); return { ok: true }; } },
      '@/lib/email/sender': { isOwnMailAddress: () => false },
      '@/lib/auth/abuse-protection': {
        protectPublicRequest: async (input) => { protectionCalls.push(input); return protectionResult; },
      },
    };
    assert.ok(key in mocks, `Unexpected ${key}`);
    return mocks[key];
  },
}, { filename: path });
const { POST } = mod.exports;

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    lang: 'en', service_key: 'free_listing', company_name: 'Example Co', contact_name: 'Jane',
    phone: '+84901234567', email: 'jane@example.com', note: 'Please contact me.', challenge_token: 'solved-token',
  })) data.set(key, value);
  return data;
}
async function post(data, headers = {}) {
  const response = await POST(new Request('https://www.veximtrade.com/api/public/service-inquiry', {
    method: 'POST', body: data, headers: { 'x-forwarded-for': '203.0.113.40', ...headers },
  }));
  return { status: response.status, data: await response.json() };
}

const honeypot = new FormData();
honeypot.set('lang', 'en');
honeypot.set('website_hp', 'bot-filled');
const bot = await post(honeypot);
assert.equal(bot.status, 200);
assert.equal(bot.data.ok, true);
assert.equal(audits, 0);
assert.equal(sent.length, 0);
assert.equal(protectionCalls.length, 0, 'Honeypot exits before external protection and mail work');

const accepted = await post(form());
assert.equal(accepted.status, 200);
assert.equal(accepted.data.ok, true);
assert.equal(protectionCalls.at(-1).flow, 'service-inquiry');
assert.equal(protectionCalls.at(-1).token, 'solved-token');
assert.equal(protectionCalls.at(-1).email, 'jane@example.com');
assert.equal(audits, 1);
assert.equal(sent.length, 2, 'Existing staff and acknowledgement emails still work after protection');

protectionResult = { ok: false, status: 429, message: 'Vietnamese rate limit' };
const limited = await post(form());
assert.equal(limited.status, 429);
assert.match(limited.data.message, /Too many attempts/);
assert.equal(audits, 1);
assert.equal(sent.length, 2);
protectionResult = { ok: false, status: 400, message: 'Vietnamese security error' };
const invalidChallenge = await post(form());
assert.equal(invalidChallenge.status, 400);
assert.match(invalidChallenge.data.message, /security check/);
assert.equal(audits, 1);
assert.equal(sent.length, 2);
protectionResult = { ok: true };
const invalidEmail = form();
invalidEmail.set('email', 'not-an-email');
const protectionBeforeInvalid = protectionCalls.length;
assert.equal((await post(invalidEmail)).status, 400);
assert.equal(protectionCalls.length, protectionBeforeInvalid);
const oversized = await post(form(), { 'content-length': '20000' });
assert.equal(oversized.status, 413);
assert.equal(audits, 1);
assert.equal(sent.length, 2);
console.log('✅ Service registration: honeypot, form challenge token, rate limit, body cap and existing mail flow passed.');

const featured = form();
featured.set('service_key', 'featured_ads');
const featuredResult = await post(featured);
assert.equal(featuredResult.status, 200, 'Banner advertising inquiry remains available');
assert.equal(featuredResult.data.ok, true);
assert.equal(audits, 2);
assert.equal(sent.length, 4);
