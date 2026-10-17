// node scripts/check-email-transport.mjs — missing Resend config never looks like delivery in production.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../lib/email/send.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(mode, configured) {
  const exports = {};
  const mocks = {
    resend: { Resend: class {} },
    '@/lib/config': { FROM_ADDRESS: 'Vexim <team@example.com>', resendConfigured: () => configured },
    '@/lib/db': { getStore: () => ({}) },
    '@/lib/email/sender': {},
    '@/lib/email/templates': {},
    '@/lib/pipeline': {},
    '@/lib/email/stage-content': {},
    '@/lib/mail/attachments': {},
  };
  vm.runInNewContext(source, { exports, process: { env: { NODE_ENV: mode } }, console,
    require: (key) => { assert.ok(key in mocks, `Unexpected import ${key}`); return mocks[key]; },
  });
  return exports;
}
const payload = { to: ['buyer@example.com'], subject: 'Test', html: '<p>Test</p>' };
const prod = await load('production', false).transport(payload);
assert.equal(prod.ok, false);
assert.equal(prod.status, 'failed');
assert.match(prod.error, /RESEND_API_KEY/);
const dev = await load('development', false).transport(payload);
assert.equal(dev.ok, true);
assert.equal(dev.status, 'simulated');
const missingRecipient = await load('production', false).transport({ ...payload, to: [] });
assert.equal(missingRecipient.ok, false);
console.log('✅ Mail transport: production fails closed without Resend; development simulation stays explicit.');
