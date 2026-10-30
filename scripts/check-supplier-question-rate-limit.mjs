// node scripts/check-supplier-question-rate-limit.mjs — distributed limiter and fail-safe behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const calls = [];
let redisInstances = 0;
const redisConfigs = [];
let behaviors = {};
class RatelimitMock {
  constructor(config) { this.config = config; }
  static fixedWindow(tokens, window) { return { tokens, window }; }
  async limit(identifier) {
    const behavior = behaviors[this.config.prefix] ?? behaviors.default ?? {};
    calls.push({ prefix: this.config.prefix, identifier, algorithm: this.config.limiter });
    if (behavior.throw) throw new Error('Redis unavailable');
    return {
      success: behavior.success ?? true,
      limit: 5,
      remaining: behavior.success === false ? 0 : 1,
      reset: behavior.reset ?? 1_800_000_000_000,
      reason: behavior.reason,
      pending: behavior.pending ?? Promise.resolve(),
    };
  }
}
class RedisMock {
  constructor(config) {
    if (behaviors.redisThrow) throw new Error('Invalid Redis URL');
    redisInstances++; this.config = config; redisConfigs.push(config);
  }
}

function load(env) {
  const path = '../lib/rfq/supplier-question-rate-limit.ts';
  const output = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, { module: mod, exports: mod.exports, process: { env }, console, Promise,
    require: (key) => {
      if (key === 'server-only') return {};
      if (key === '@upstash/ratelimit') return { Ratelimit: RatelimitMock };
      if (key === '@upstash/redis') return { Redis: RedisMock };
      assert.fail(`Unexpected ${key}`);
    },
  }, { filename: path });
  return mod.exports;
}

const missingProduction = load({ NODE_ENV: 'production' });
const missingResult = await missingProduction.checkSupplierQuestionRateLimit({ ipFingerprint: 'ip', buyerSupplierFingerprint: 'buyer' });
assert.equal(missingResult.status, 'degraded');
assert.equal(missingResult.reason, 'not_configured');
assert.equal(redisInstances, 0, 'Missing ENV never creates a Redis client');
const missingDevelopment = load({ NODE_ENV: 'development' });
assert.equal((await missingDevelopment.checkSupplierQuestionRateLimit({ ipFingerprint: 'ip', buyerSupplierFingerprint: 'buyer' })).status, 'ok',
  'Local development can run without hosted Redis');

const limiter = load({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://redis.example.com', UPSTASH_REDIS_REST_TOKEN: 'secret' });
const input = { ipFingerprint: 'sha256-ip', buyerSupplierFingerprint: 'sha256-email-supplier' };
assert.equal((await limiter.checkSupplierQuestionRateLimit(input)).status, 'ok');
assert.equal(calls.length, 2);
assert.ok(calls.every((call) => call.identifier.includes('sha256-')), 'Only fingerprints are used as Redis identifiers');
assert.equal(calls[0].algorithm.tokens, 5);
assert.equal(calls[0].algorithm.window, '1 h');
assert.equal(calls[1].algorithm.tokens, 3);
assert.equal(calls[1].algorithm.window, '24 h');
assert.equal(redisConfigs.at(-1).url, 'https://redis.example.com');
assert.equal(redisConfigs.at(-1).token, 'secret');

const vercelLimiter = load({ NODE_ENV: 'production', KV_REST_API_URL: 'https://vercel-redis.example.com', KV_REST_API_TOKEN: 'vercel-secret', KV_URL: 'rediss://should-not-be-used' });
assert.equal((await vercelLimiter.checkSupplierQuestionRateLimit(input)).status, 'ok', 'Vercel native Upstash ENV works without duplicate variables');
assert.equal(redisConfigs.at(-1).url, 'https://vercel-redis.example.com');
assert.equal(redisConfigs.at(-1).token, 'vercel-secret');
const preferredLimiter = load({ NODE_ENV: 'production',
  UPSTASH_REDIS_REST_URL: 'https://explicit.example.com', UPSTASH_REDIS_REST_TOKEN: 'explicit-secret',
  KV_REST_API_URL: 'https://vercel-redis.example.com', KV_REST_API_TOKEN: 'vercel-secret' });
assert.equal((await preferredLimiter.checkSupplierQuestionRateLimit(input)).status, 'ok');
assert.equal(redisConfigs.at(-1).url, 'https://explicit.example.com', 'A complete explicit pair takes precedence');
assert.equal(redisConfigs.at(-1).token, 'explicit-secret');
const incompletePair = load({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://wrong.example.com', KV_REST_API_TOKEN: 'vercel-secret' });
assert.equal((await incompletePair.checkSupplierQuestionRateLimit(input)).reason, 'not_configured', 'Credentials from different pairs are never combined');

behaviors = { 'vexim:supplier-question:buyer-supplier': { success: false, reset: 1_800_000_100_000 } };
const limited = await limiter.checkSupplierQuestionRateLimit(input);
assert.equal(limited.status, 'limited');
assert.equal(limited.resetAt, 1_800_000_100_000);

behaviors = { default: { success: true, reason: 'timeout' } };
const timeout = await limiter.checkSupplierQuestionRateLimit(input);
assert.equal(timeout.status, 'degraded');
assert.equal(timeout.reason, 'unavailable', 'Library timeout success is not permission to send');
behaviors = { 'vexim:supplier-question:ip': { throw: true } };
const failed = await limiter.checkSupplierQuestionRateLimit(input);
assert.equal(failed.status, 'degraded');
assert.equal(failed.reason, 'unavailable');
behaviors = { default: { success: true, pending: Promise.reject(new Error('background failure')) } };
const backgroundFailure = await limiter.checkSupplierQuestionRateLimit(input);
assert.equal(backgroundFailure.status, 'degraded');
assert.equal(backgroundFailure.reason, 'unavailable');
behaviors = { redisThrow: true };
const invalidConfig = load({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'bad-url', UPSTASH_REDIS_REST_TOKEN: 'secret' });
const invalidConfigResult = await invalidConfig.checkSupplierQuestionRateLimit(input);
assert.equal(invalidConfigResult.status, 'degraded');
assert.equal(invalidConfigResult.reason, 'unavailable');

const envExample = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const guide = fs.readFileSync(new URL('../docs/supplier-question-security.md', import.meta.url), 'utf8');
for (const key of ['CHALLENGE_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
  assert.ok(envExample.includes(key), `${key} is documented in .env.example`);
  assert.ok(guide.includes(key), `${key} is documented in the deployment guide`);
}
console.log('✅ Supplier question rate limit: distributed windows, hashed identifiers, timeout/error fail-safe and ENV guide passed.');
