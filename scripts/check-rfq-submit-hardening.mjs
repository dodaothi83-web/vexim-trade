// node --experimental-strip-types --no-warnings scripts/check-rfq-submit-hardening.mjs
//
// RFQ submit hardening:
//  1) Token chống bot chỉ bị tiêu khi RFQ đã LƯU. Yêu cầu bị từ chối (MX hỏng, lỗi CSDL…) rồi
//     gửi lại bằng cùng token thì không bị tính là "challenge failed" (+60 điểm spam). Token
//     của một RFQ đã lưu không dùng lại được.
//  2) Đầu vào Server Action được kiểm kiểu + độ dài bằng zod (thiếu company không còn lỗi 500).
//  3) Lỗi CSDL trả thông báo dễ hiểu, không ném ra Server Action.
//  4) Email xác nhận/nội bộ chạy SAU response (after()); ngoài request scope thì chạy ngay.
//  5) Tra MX có timeout và cho qua khi DNS treo.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TextEncoder } from 'node:util';
import vm from 'node:vm';
import ts from 'typescript';
import * as rfqShippingModule from "../lib/rfq/shipping.ts";

const requireHost = createRequire(import.meta.url);
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function load(file, mocks = {}, env = {}, extra = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    ...(file.endsWith('.tsx') ? { jsx: ts.JsxEmit.ReactJSX } : {}),
  } }).outputText;
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, process: { env }, console: { ...console, warn() {}, error() {} }, Buffer,
    Date, JSON, Math, Number, String, Boolean, Array, Object, Promise, Set, Map, Error, RegExp,
    setTimeout, clearTimeout, encodeURIComponent, ...extra,
    require: (key) => { assert.ok(Object.hasOwn(mocks, key), `${file}: unexpected import ${key}`); return mocks[key]; },
  }, { filename: file });
  return mod.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

/* 1) Challenge: verify-without-consume + consume ------------------------------------------ */
const challenge = load('lib/security/challenge.ts', {
  'server-only': {}, 'node:crypto': crypto,
  '@/lib/auth/secret': { getAuthSecret: () => 'check-rfq-submit-hardening' },
}, { NODE_ENV: 'production', CHALLENGE_DIFFICULTY: '1' });
const widget = load('components/form-challenge.tsx', {
  react: {}, 'react/jsx-runtime': {}, 'lucide-react': {},
}, {}, { crypto: crypto.webcrypto, TextEncoder });
const solve = async () => widget.solveFormChallenge(challenge.issueFormChallenge('rfq'));

{
  const token = await solve();
  assert.deepEqual(plain(challenge.verifyFormChallenge({ purpose: 'rfq', token, consume: false })), { ok: true });
  assert.deepEqual(plain(challenge.verifyFormChallenge({ purpose: 'rfq', token, consume: false })), { ok: true },
    'consume:false leaves the token usable for a corrected resubmit');
  challenge.consumeFormChallenge(token);
  assert.deepEqual(plain(challenge.verifyFormChallenge({ purpose: 'rfq', token, consume: false })), { ok: false, reason: 'replayed' });
  const legacy = await solve();
  assert.equal(challenge.verifyFormChallenge({ purpose: 'rfq', token: legacy }).ok, true);
  assert.equal(challenge.verifyFormChallenge({ purpose: 'rfq', token: legacy }).reason, 'replayed', 'Default still consumes (other forms unchanged)');
  challenge.consumeFormChallenge('garbage');
  challenge.consumeFormChallenge(null);
}
assert.ok(widget.FORM_CHALLENGE_REFRESH_MS < 15 * 60_000, 'Form refreshes its token before the 15-minute expiry');

/* 2) zod input validation ------------------------------------------------------------------ */
const limits = await import('../lib/rfq/input-limits.ts');
const inputMod = load('lib/rfq/submit-input.ts', { zod: requireHost('zod'), './input-limits': limits });
const valid = {
  company: 'Buyer Co', contact_name: 'Jane Doe', email: 'jane@buyer.com', consent: true, share_contact_consent: true,
  product_text: 'Cashew W320', quantity: 100, unit: 'MT', destination_country: 'Germany', challenge_token: 'tok',
  preferred_supplier_ids: ['s-1'], phone: null, website: '', referrer: 'x'.repeat(5_000),
};
{
  const ok = inputMod.parseSubmitRfqInput({ ...valid, unknown_key: 'dropped' });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.unknown_key, undefined, 'Unknown keys are stripped');
  assert.equal(ok.data.referrer.length, 1_000, 'Browser metadata is truncated, not rejected');
  const { company: _drop, ...noCompany } = valid;
  assert.deepEqual(plain(inputMod.parseSubmitRfqInput(noCompany)), { ok: false, field: 'company' });
  for (const [field, value] of [
    ['company', 'x'.repeat(limits.RFQ_FIELD_LIMITS.company + 1)],
    ['phone', '1'.repeat(limits.RFQ_FIELD_LIMITS.phone + 1)],
    ['website', 'w'.repeat(limits.RFQ_FIELD_LIMITS.website + 1)],
    ['quantity', 'lots'],
    ['consent', 'yes'],
    ['preferred_supplier_ids', Array.from({ length: 51 }, (_, i) => `s-${i}`)],
    ['inquiry_kind', 'other'],
  ]) {
    assert.deepEqual(plain(inputMod.parseSubmitRfqInput({ ...valid, [field]: value })), { ok: false, field }, `${field} is validated`);
  }
  assert.equal(inputMod.parseSubmitRfqInput(null).ok, false);
  const nan = inputMod.parseSubmitRfqInput({ ...valid, quantity: Number.NaN, target_price: Number.POSITIVE_INFINITY });
  assert.equal(nan.ok, true, 'Number("") style NaN from the form is treated as empty, as before');
  assert.equal(nan.data.quantity, null);
}
// Form maxLength and server limits come from the same constants.
const formSource = read('app/(public)/rfq/rfq-form.tsx');
for (const key of ['company', 'contact_name', 'email', 'phone', 'website', 'packaging', 'grade', 'destination_port', 'destination_country']) {
  assert.match(formSource, new RegExp(`maxLength=\\{LIMITS\\.${key}\\}`), `form caps ${key} with the shared limit`);
}

/* 3–4) submit.ts end-to-end with the real challenge, real validation, real afterResponse ----- */
function makeSubmit({ afterImpl }) {
  const state = { mxOk: true, failCreate: false, created: [], acks: [], internal: [], challengeSeen: [], deferred: [] };
  const store = {
    getBuyerByEmail: async () => null,
    createBuyer: async (input) => ({ id: 'buyer-1', ...input }),
    updateBuyer: async (id, patch) => ({ id, ...patch }),
    getCategoryBySlug: async () => null,
    listRfqs: async () => [],
    createRfq: async (input) => {
      if (state.failCreate) throw new Error('connection reset by peer');
      const row = { ...input, id: `r-${state.created.length + 1}` };
      state.created.push(row);
      return row;
    },
    addAuditLog: async () => null,
  };
  const background = load('lib/rfq/background.ts', { 'next/server': { after: afterImpl(state) } });
  const submit = load('lib/rfq/submit.ts', {
    './buyer-contact': load('lib/rfq/buyer-contact.ts'),
    '@/lib/auth/buyer-session': { getBuyerSession: async () => ({ uid: 'u', email: 'jane@buyer.com' }) },
    'next/headers': { headers: async () => ({ get: () => null }) },
    '@/lib/db': { getStore: () => store },
    '@/lib/public/catalog': { listPublicSuppliers: async () => [] },
    '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => [] },
    '@/lib/supplier-portal/onboarding': { canInviteSupplier: async () => true },
    '@/lib/email/rfq': {
      sendRfqAckBuyer: async () => { state.acks.push(1); },
      sendRfqNewInternal: async () => { state.internal.push(1); throw new Error('provider down'); },
    },
    '.': {
      emailDomain: () => 'buyer.com', fingerprint: () => `fp-${Math.random()}`, generateAccessToken: () => 'tok',
      rfqDayKey: () => '20261121', generateRfqCode: (seq, day) => `RFQ-${day}-${seq}`,
      hasMxRecord: async () => ({ ok: state.mxOk }), isLikelyWebmail: () => false, normalizeCompanyWebsite: () => null,
      scoreSpam: ({ challengeOk }) => { state.challengeSeen.push(challengeOk); return challengeOk ? { score: 0, flags: [] } : { score: 60, flags: ['challenge_failed'] }; },
    },
    './targeted-portal': { releaseTargetedQuoteToPortal: async () => 0 },
    './auto-match': { createPreferredSupplierMatches: async () => 0 },
    './enrich': { scheduleRfqEnrichment: () => {} },
    './rate-limit': { gcRateLimit() {}, rateLimit: () => ({ ok: true }) },
    '@/lib/security/challenge': challenge,
    './background': background,
    './submit-input': inputMod,
    './shipping': rfqShippingModule,
  }, { RFQ_REJECT_WEBMAIL: 'false' });
  return { submit, state };
}

{
  const { submit, state } = makeSubmit({ afterImpl: (state) => (task) => { state.deferred.push(task); } });
  const token = await solve();
  const raw = { ...valid, challenge_token: token, preferred_supplier_ids: [] };

  state.mxOk = false;
  const rejected = await submit.submitRfq(raw);
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /email domain cannot receive mail/);
  state.mxOk = true;

  state.failCreate = true;
  const dbDown = await submit.submitRfq(raw);
  assert.deepEqual(plain(dbDown), { ok: false, message: 'We could not save your request right now. Please try again in a minute.' },
    'Database errors return a friendly message instead of a Server Action 500');
  state.failCreate = false;

  const saved = await submit.submitRfq(raw);
  assert.equal(saved.ok, true, 'Same token works after a rejected attempt');
  assert.equal(saved.status, 'new', 'Resubmit is not scored as a failed challenge');
  assert.equal(state.challengeSeen.at(-1), true);
  assert.equal(state.created.length, 1);
  assert.equal(state.acks.length + state.internal.length, 0, 'Emails wait until after the response');
  assert.equal(state.deferred.length, 2);
  for (const task of state.deferred) await task(); // internal notice throws: swallowed, RFQ already saved
  assert.equal(state.acks.length, 1);
  assert.equal(state.internal.length, 1);

  const replay = await submit.submitRfq({ ...raw, product_text: 'Another request' });
  assert.equal(replay.ok, true);
  assert.equal(state.challengeSeen.at(-1), false, 'A token of a saved RFQ cannot be reused');
  assert.equal(replay.status, 'needs_review');

  const { company: _drop, ...noCompany } = raw;
  const missing = await submit.submitRfq(noCompany);
  assert.equal(missing.ok, false, 'Missing company is a validation message, not a crash');
  assert.match(missing.message, /missing or too long/);
  const huge = await submit.submitRfq({ ...raw, phone: '9'.repeat(10_000) });
  assert.equal(huge.ok, false);
}

{
  // Outside a request scope after() throws: notices are sent inline and never lost.
  const { submit, state } = makeSubmit({ afterImpl: () => () => { throw new Error('after() outside request scope'); } });
  const result = await submit.submitRfq({ ...valid, challenge_token: await solve(), preferred_supplier_ids: [] });
  assert.equal(result.ok, true);
  assert.equal(state.acks.length, 1);
  assert.equal(state.internal.length, 1);
}

/* 5) MX lookup timeout fails open ---------------------------------------------------------- */
{
  let hang = true;
  const rfqIndex = load('lib/rfq/index.ts', {
    'node:crypto': crypto,
    'node:dns': { promises: { resolveMx: () => hang ? new Promise(() => {}) : Promise.resolve([]) } },
  });
  const started = Date.now();
  const slow = await rfqIndex.hasMxRecord('slow.example', 50);
  assert.equal(slow.ok, true, 'A hung DNS lookup lets the buyer through');
  assert.equal(slow.skipReason, 'dns_timeout');
  assert.ok(Date.now() - started < 1_000);
  assert.equal(rfqIndex.MX_LOOKUP_TIMEOUT_MS <= 2_000, true);
  hang = false;
  assert.equal((await rfqIndex.hasMxRecord('nomx.example', 50)).ok, false, 'A domain without MX is still rejected');
}

/* Resend call is bounded ------------------------------------------------------------------- */
const sendSource = read('lib/email/send.ts');
assert.match(sendSource, /export const RESEND_TIMEOUT_MS = 15_000;/);
assert.match(sendSource, /Promise\.race\(\[timeout, resend\.emails\.send\(/);

/* Form refreshes the challenge after a failed submit ---------------------------------------- */
assert.match(formSource, /refreshKey=\{challengeRound\}/);
assert.match(formSource, /setChallengeRound\(\(round\) => round \+ 1\)/);

console.log('✅ RFQ submit hardening: token consumed only after save, zod input limits, friendly DB errors, emails after response, MX/Resend timeouts.');
