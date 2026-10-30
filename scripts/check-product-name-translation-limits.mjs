// node scripts/check-product-name-translation-limits.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let configured, calls = [], aiCalls = 0, outcome = { success: true, pending: Promise.resolve() };
class Redis { constructor(config) { configured = config; } }
class Ratelimit { static fixedWindow(max, window) { assert.equal(max, 30); assert.equal(window, '1 h'); return {}; }
  async limit(key) { calls.push(key); if (outcome instanceof Error) throw outcome; return outcome; } }
const code = ts.transpileModule(readFileSync(new URL('../lib/ai/product-name-rate-limit.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(env) {
  const exports = {};
  vm.runInNewContext(code, { exports, process: { env }, require: (key) => ({
    'server-only': {}, '@upstash/ratelimit': { Ratelimit }, '@upstash/redis': { Redis },
    '@/lib/rfq/rate-limit': { rateLimit: () => { aiCalls++; return { ok: true }; } },
  })[key] });
  return exports.checkProductNameTranslationLimit;
}
let check = load({ NODE_ENV: 'production' });
assert.equal(await check('supplier:a'), false); assert.equal(aiCalls, 0, 'Production never falls back to a per-instance limit');
check = load({ NODE_ENV: 'development' }); assert.equal(await check('supplier:a'), true); assert.equal(aiCalls, 1);
check = load({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://upstash', UPSTASH_REDIS_REST_TOKEN: 'secret' });
assert.equal(await check('supplier:a'), true); assert.equal(configured.url, 'https://upstash'); assert.equal(calls[0], 'supplier:a');
outcome = { success: false, pending: Promise.resolve() }; assert.equal(await check('supplier:a'), false);
outcome = { success: true, reason: 'timeout', pending: Promise.resolve() }; assert.equal(await check('supplier:a'), false);
outcome = Error('unavailable'); assert.equal(await check('supplier:a'), false);
outcome = { success: true, pending: Promise.reject(Error('unavailable')) }; assert.equal(await check('supplier:a'), false);
console.log('Translation limits: distributed production, limit, timeout and failure closed passed');
