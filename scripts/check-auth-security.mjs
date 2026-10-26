// node scripts/check-auth-security.mjs — password auth, signup abuse controls and safe failures.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const deepEqual = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);

function transpile(path) {
  return ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}
function run(path, mocks, extra = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(transpile(path), {
    module: mod, exports: mod.exports, console: { warn() {}, error() {}, log() {} },
    URL, URLSearchParams, Headers, Request, Response, FormData, Date, Map, Set, Promise,
    AbortSignal, Buffer, process: { env: {} },
    require: (key) => {
      if (key === 'server-only') return {};
      assert.ok(key in mocks, `Unexpected ${key} in ${path}`);
      return mocks[key];
    },
    ...extra,
  }, { filename: path });
  return mod.exports;
}

// Form challenge (proof-of-work tự chủ, thay Cloudflare Turnstile): phát → giải →
// xác minh, chặn dùng chéo purpose, chống replay, hết hạn, giả mạo, công tắc khẩn cấp.
function solveNode(challenge) {
  const parts = challenge.split('.');
  const prefix = '0'.repeat(Number(parts[2]));
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    if (crypto.createHash('sha256').update(`${parts[0]}:${nonce}`).digest('hex').startsWith(prefix)) {
      return `${challenge}.${nonce}`;
    }
  }
  return null;
}
const challengeEnv = { NODE_ENV: 'production', CHALLENGE_DIFFICULTY: '2' };
const challenge = run('../lib/security/challenge.ts', {
  'node:crypto': crypto,
  '@/lib/auth/secret': { getAuthSecret: () => 'unit-test-secret' },
}, { process: { env: challengeEnv } });
const issued = challenge.issueFormChallenge('login');
assert.match(issued, /^[0-9a-f]{32}\.\d+\.2\.[0-9a-f]{32}$/, 'Đúng định dạng salt.issuedMs.difficulty.hmac');
const solved = solveNode(issued);
assert.ok(solved, 'Difficulty 2 phải giải được trong vài trăm lần băm');
deepEqual(challenge.verifyFormChallenge({ purpose: 'login', token: solved }), { ok: true });
// Challenge của form này không dùng được cho form khác (purpose nằm trong chữ ký).
deepEqual(challenge.verifyFormChallenge({ purpose: 'supplier-signup', token: solved }), { ok: false, reason: 'signature' });
// Salt đã tiêu không dùng lại được.
deepEqual(challenge.verifyFormChallenge({ purpose: 'login', token: solved }), { ok: false, reason: 'replayed' });
// Token chưa giải / sai dạng / thiếu.
const fresh = challenge.issueFormChallenge('login');
deepEqual(challenge.verifyFormChallenge({ purpose: 'login', token: `${fresh}.123` }), { ok: false, reason: 'unsolved' });
deepEqual(challenge.verifyFormChallenge({ purpose: 'login', token: fresh }), { ok: false, reason: 'malformed' });
deepEqual(challenge.verifyFormChallenge({ purpose: 'login', token: '' }), { ok: false, reason: 'missing' });
// Hết hạn sau 15 phút.
const fresh2 = challenge.issueFormChallenge('login');
const solved2 = solveNode(fresh2);
deepEqual(challenge.verifyFormChallenge({ purpose: 'login', token: solved2, nowMs: Date.now() + 16 * 60_000 }), { ok: false, reason: 'expired' });
// Sửa issuedMs/difficulty làm vỡ chữ ký.
const tampered = `${fresh2.split('.')[0]}.${Date.now()}.1.${fresh2.split('.')[3]}.${solved2.split('.').at(-1)}`;
deepEqual(challenge.verifyFormChallenge({ purpose: 'login', token: tampered }), { ok: false, reason: 'signature' });
// Độ khó kẹp trong 1..6, mặc định 4.
challengeEnv.CHALLENGE_DIFFICULTY = '9';
assert.equal(challenge.formChallengeDifficulty(), 6);
delete challengeEnv.CHALLENGE_DIFFICULTY;
assert.equal(challenge.formChallengeDifficulty(), 4);
// Công tắc khẩn cấp CHALLENGE_DISABLED=true: pass hết, kể cả token rỗng.
challengeEnv.CHALLENGE_DISABLED = 'true';
deepEqual(challenge.verifyFormChallenge({ purpose: 'login', token: '' }), { ok: true });
deepEqual(challenge.verifyFormChallenge({ purpose: 'rfq', token: 'whatever' }), { ok: true });
delete challengeEnv.CHALLENGE_DISABLED;

// Shared local + distributed limiter policies use hashes and safe degradation.
const redisCalls = [];
const redisConfigs = [];
let behaviors = {};
let localLimited = false;
let localCalls = [];
class RatelimitMock {
  constructor(config) { this.config = config; }
  static fixedWindow(tokens, window) { return { tokens, window }; }
  async limit(identifier) {
    const behavior = behaviors[this.config.prefix] ?? behaviors.default ?? {};
    redisCalls.push({ prefix: this.config.prefix, identifier, algorithm: this.config.limiter });
    if (behavior.throw) throw new Error('Redis unavailable');
    return {
      success: behavior.success ?? true,
      reset: behavior.reset ?? Date.now() + 60_000,
      reason: behavior.reason,
      pending: behavior.pending ?? Promise.resolve(),
    };
  }
}
class RedisMock { constructor(config) { redisConfigs.push(config); } }
let challengeResult = { ok: true };
let challengeCalls = 0;
const abuseMocks = {
  'node:crypto': crypto,
  '@upstash/ratelimit': { Ratelimit: RatelimitMock },
  '@upstash/redis': { Redis: RedisMock },
  '@/lib/rfq/rate-limit': {
    gcRateLimit() {},
    rateLimit: (key, options) => {
      localCalls.push({ key, options });
      return { ok: !localLimited, resetInMs: 60_000 };
    },
  },
  '@/lib/security/challenge': { verifyFormChallenge: () => { challengeCalls++; return challengeResult; } },
};
const headers = new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1', 'user-agent': 'auth-test' });
const missing = run('../lib/auth/abuse-protection.ts', abuseMocks, { process: { env: { NODE_ENV: 'production' } } });
assert.equal((await missing.checkAuthRateLimit({ flow: 'login', headers, email: 'person@example.com' })).reason, 'not_configured');
assert.equal(localCalls.length, 2, 'Both local buckets still apply without Redis');
const development = run('../lib/auth/abuse-protection.ts', abuseMocks, { process: { env: { NODE_ENV: 'development' } } });
assert.equal((await development.checkAuthRateLimit({ flow: 'login', headers })).status, 'ok');
const limiter = run('../lib/auth/abuse-protection.ts', abuseMocks, { process: { env: {
  NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://redis.example.com', UPSTASH_REDIS_REST_TOKEN: 'secret',
} } });
assert.equal((await limiter.checkAuthRateLimit({ flow: 'login', headers, email: 'Person@Example.com' })).status, 'ok');
assert.equal(redisCalls.length, 2);
assert.ok(redisCalls.every((call) => /^[a-f0-9]{64}$/.test(call.identifier)), 'Only SHA-256 identifiers reach Redis');
assert.ok(redisCalls.every((call) => !call.identifier.includes('203.0.113.10') && !call.identifier.includes('example.com')));
assert.equal(redisCalls[0].algorithm.tokens, 30);
assert.equal(redisCalls[0].algorithm.window, '15 m');
assert.equal(redisCalls[1].algorithm.tokens, 5);
assert.equal(redisConfigs.at(-1).url, 'https://redis.example.com');
redisCalls.length = 0;
assert.equal((await limiter.checkAuthRateLimit({ flow: 'supplier-signup', headers })).status, 'ok');
assert.equal(redisCalls.length, 1, 'OAuth start only consumes the shared IP bucket');
assert.equal(redisCalls[0].algorithm.tokens, 3);
assert.equal(redisCalls[0].algorithm.window, '1 h');
redisCalls.length = 0;
await limiter.checkAuthRateLimit({ flow: 'supplier-signup', headers, email: 'person@example.com' });
assert.equal(redisCalls.length, 2);
assert.equal(redisCalls[1].algorithm.window, '24 h');
redisCalls.length = 0;
await limiter.checkAuthRateLimit({ flow: 'admin-setup', headers, email: 'admin@example.com' });
assert.equal(redisCalls.length, 2);
assert.ok(redisCalls.every((call) => call.algorithm.tokens === 3));
redisCalls.length = 0;
await limiter.checkAuthRateLimit({ flow: 'service-inquiry', headers, email: 'buyer@example.com' });
assert.equal(redisCalls.length, 2);
assert.equal(redisCalls[0].algorithm.tokens, 5);
assert.equal(redisCalls[1].algorithm.tokens, 3);
behaviors = { 'vexim:auth:login:account': { success: false, reset: Date.now() + 30_000 } };
const limited = await limiter.checkAuthRateLimit({ flow: 'login', headers, email: 'person@example.com' });
assert.equal(limited.status, 'limited');
assert.ok(limited.retryAfterSeconds > 0);
behaviors = { default: { success: true, reason: 'timeout' } };
assert.equal((await limiter.checkAuthRateLimit({ flow: 'login', headers })).reason, 'unavailable');
behaviors = { default: { throw: true } };
assert.equal((await limiter.checkAuthRateLimit({ flow: 'login', headers })).reason, 'unavailable');
behaviors = {};
localLimited = true;
const redisBeforeLocalStop = redisCalls.length;
assert.equal((await limiter.checkAuthRateLimit({ flow: 'login', headers })).status, 'limited');
assert.equal(redisCalls.length, redisBeforeLocalStop, 'Local rejection does not call Redis');
localLimited = false;
challengeResult = { ok: false, reason: 'signature' };
assert.equal((await limiter.protectPasswordAuth({ flow: 'login', headers, email: 'person@example.com', token: 'bad' })).status, 400);
challengeResult = { ok: false, reason: 'expired' };
assert.equal((await limiter.protectPasswordAuth({ flow: 'login', headers, email: 'person@example.com', token: '' })).status, 400);
challengeResult = { ok: true };
deepEqual(await limiter.protectPasswordAuth({ flow: 'login', headers, email: 'person@example.com', token: 'good' }), { ok: true });
assert.ok(challengeCalls >= 3);

// The public server action never invokes authentication before protection and
// never returns raw backend details to the browser.
let protectionResult = { ok: true };
let authResult = { ok: false, message: 'Email hoặc mật khẩu không đúng.' };
let protectionCalls = [];
let authCalls = 0;
let sessions = [];
let userCount = 0;
let countCalls = 0;
const createdUsers = [];
const action = run('../app/auth-actions.ts', {
  'next/cache': { revalidatePath() {} },
  'next/navigation': { redirect() {} },
  'next/headers': { headers: async () => headers },
  '@/lib/db': { getStore: () => ({
    touchUserLogin: async () => null,
    countUsers: async () => { countCalls++; return userCount; },
    createUser: async (input) => { const user = { ...input, id: `user-${createdUsers.length + 1}` }; createdUsers.push(user); return user; },
  }) },
  '@/lib/auth/abuse-protection': { protectPasswordAuth: async (input) => { protectionCalls.push(input); return protectionResult; } },
  '@/lib/auth/authenticate': {
    authenticate: async () => { authCalls++; if (authResult instanceof Error) throw authResult; return authResult; },
    createSupabaseUser: async () => null,
    describeAppUsersError: () => null,
    isMissingUsersTable: () => false,
  },
  '@/lib/auth/session': {
    startSession: async (input) => { sessions.push(input); }, endSession: async () => {}, getSession: async () => null, guard: async () => null,
  },
  '@/lib/auth/password': { hashPassword: async () => 'hash', passwordProblem: () => null, verifyPassword: async () => true },
  '@/lib/auth/permissions': { ROLES: [] },
  '@/lib/config': { MAIL_DOMAIN: 'example.com' },
  '@/lib/email/sender': { checkSenderAddress: async () => null, senderAddressFor: () => 'sender' },
});
assert.equal((await action.loginAction('invalid', 'password123')).ok, false);
assert.equal(protectionCalls.length, 0);
protectionResult = { ok: false, status: 429, message: 'Too many attempts' };
const stopped = await action.loginAction('person@example.com', 'password123', 'token');
assert.equal(stopped.message, 'Too many attempts');
assert.equal(authCalls, 0);
protectionResult = { ok: true };
authResult = { ok: false, message: 'Safe message', details: ['raw database detail'] };
const safeFailure = await action.loginAction('Person@Example.com', 'password123', 'token');
assert.equal(safeFailure.message, 'Safe message');
assert.equal(safeFailure.details, undefined);
assert.equal(protectionCalls.at(-1).email, 'person@example.com');
assert.equal(protectionCalls.at(-1).token, 'token');
authResult = new Error('private backend failure');
const exception = await action.loginAction('person@example.com', 'password123', 'token');
assert.doesNotMatch(exception.message, /private backend failure/);
assert.equal(exception.details, undefined);
authResult = { ok: true, user: { id: 'supplier-1', email: 'person@example.com', name: 'Supplier', role: 'supplier' }, via: 'supabase' };
const success = await action.loginAction('person@example.com', 'password123', 'token');
assert.equal(success.ok, true);
assert.equal(success.redirectTo, '/supplier/portal');
assert.equal(sessions.at(-1).role, 'supplier');

// First-admin setup receives the same protection and cannot be used after setup.
protectionResult = { ok: false, status: 400, message: 'Security check failed' };
const setupStopped = await action.setupAdminAction('admin@example.com', 'Admin', 'password123', 'password123', 'bad-token');
assert.equal(setupStopped.ok, false);
assert.equal(countCalls, 0, 'Setup does not query or provision before the security check');
protectionResult = { ok: true };
const setup = await action.setupAdminAction('admin@example.com', 'Admin', 'password123', 'password123', 'setup-token');
assert.equal(setup.ok, true);
assert.equal(createdUsers.at(-1).role, 'admin');
assert.equal(protectionCalls.at(-1).flow, 'admin-setup');
assert.equal(protectionCalls.at(-1).token, 'setup-token');
userCount = 1;
const existingSetup = await action.setupAdminAction('other@example.com', 'Other', 'password123', 'password123', 'new-token');
assert.equal(existingSetup.ok, false);
assert.equal(createdUsers.length, 1, 'A second public setup cannot create another administrator');

// Local password fallback does not reveal status, role or passwordless accounts
// before password verification and still denies every supplier fallback.
let record = null;
let verifiedHashes = [];
const authBackend = run('../lib/auth/authenticate.ts', {
  '@/lib/db': { getStore: () => ({ mode: 'local', getUserByEmail: async () => record }) },
  '@/lib/db/supabase': { getSupabaseAuthClient: () => null },
  '@/lib/auth/password': {
    hashPassword: async () => 'hash',
    verifyPassword: async (password, stored) => {
      verifiedHashes.push(stored);
      return password === 'correct-password' && stored === record?.password_hash;
    },
  },
});
const unknown = await authBackend.authenticate('unknown@example.com', 'wrong');
assert.equal(unknown.message, 'Email hoặc mật khẩu không đúng.');
assert.match(verifiedHashes.at(-1), /^scrypt\$/);
record = { id: 's', email: 'supplier@example.com', role: 'supplier', is_active: true, password_hash: 'legacy-hash' };
assert.equal((await authBackend.authenticate(record.email, 'correct-password')).message, 'Email hoặc mật khẩu không đúng.');
record = { id: 'staff', email: 'staff@example.com', role: 'admin', is_active: false, password_hash: 'staff-hash' };
assert.equal((await authBackend.authenticate(record.email, 'wrong')).message, 'Email hoặc mật khẩu không đúng.');
assert.equal((await authBackend.authenticate(record.email, 'correct-password')).message, 'Tài khoản đã bị tạm khoá.');
record = { ...record, is_active: true };
assert.equal((await authBackend.authenticate(record.email, 'correct-password')).ok, true);
record = { ...record, password_hash: null };
assert.equal((await authBackend.authenticate(record.email, 'correct-password')).message, 'Email hoặc mật khẩu không đúng.');

const secretSource = fs.readFileSync(new URL('../lib/auth/secret.ts', import.meta.url), 'utf8');
assert.doesNotMatch(secretSource, /\["SUPABASE_ANON_KEY"/, 'A public anon key can never sign app sessions');
console.log('✅ Auth security: form challenge (PoW tự chủ), distributed/local limits, safe failures, signup/login/setup wiring and local fallback passed.');
