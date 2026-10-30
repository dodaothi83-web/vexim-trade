// node scripts/check-isolated-product-form-test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
const compile = (path, jsxMode = false) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsxMode ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
}).outputText;
const guardCode = compile('../lib/products/product-form-demo-access.ts');
function guard(env) { const exports = {}; vm.runInNewContext(guardCode, { exports, process: { env }, require: (k) => k === 'server-only' ? {} : null }); return exports.isIsolatedProductFormDemo(); }
const safe = { NODE_ENV: 'development', VEXIM_FORM_UI_DEMO: 'true' };
assert.equal(guard(safe), true);
for (const extra of [{ NODE_ENV: 'production' }, { VEXIM_FORM_UI_DEMO: 'false' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'production' },
  { SUPABASE_URL: 'https://example.supabase.co' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' },
  { SUPABASE_SERVICE_ROLE_KEY: 'x' }, { SUPABASE_ANON_KEY: 'x' }, { DATABASE_URL: 'x' }]) assert.equal(guard({ ...safe, ...extra }), false);
let urls = [], revoked = [], nextId = 0;
const mocks = { react: React, 'react/jsx-runtime': jsx,
  '@/components/products/product-form-session-editor': { ProductFormSessionEditor: () => null },
  '@/lib/products/product-form-demo': { PRODUCT_FORM_DEMOS: [{ draft: {} }] },
  '@/lib/products/product-form-seed': { emptyProductFormDraft: () => ({}) },
  '@/lib/products/quantity-pricing': { DEFAULT_QUANTITY_PRICING_POLICY: { maxTiers: 4 } },
};
const exports = {};
vm.runInNewContext(compile('../app/form-test/product-form-test.tsx', true), { exports, JSON,
  crypto: { randomUUID: () => `local-${++nextId}` },
  URL: { createObjectURL: () => { const value = `blob:test-${urls.length}`; urls.push(value); return value; }, revokeObjectURL: (url) => revoked.push(url) },
  require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import: ${key}`); return mocks[key]; } });
let preview = exports.makePreviewOperations(false), ops = preview.operations;
const first = await ops.create('request', {}); assert.equal(first.ok, true); assert.equal(first.revision, 1);
assert.equal((await ops.create('request', {})).id, first.id);
assert.equal((await ops.create('other', {})).ok, false);
assert.equal((await ops.save(first.id, 1, {})).revision, 2);
assert.equal((await ops.save(first.id, 1, {})).ok, false);
const image = await ops.upload(first.id, 2, {}); assert.equal(image.ok, true); assert.equal(image.revision, 3); assert.match(image.image.url, /^blob:test-/);
assert.equal((await ops.setImages(first.id, 3, [])).revision, 4);
assert.equal((await ops.setImages(first.id, 4, [])).revision, 4);
assert.match((await ops.submit(first.id, 4)).message, /mô phỏng/);
assert.equal((await ops.translateName('Nhân điều')).ok, false);
preview.dispose(); assert.deepEqual(revoked, urls);
preview = exports.makePreviewOperations(true); ops = preview.operations;
assert.equal((await ops.save('demo-product', 1, {})).revision, 2);
assert.equal((await ops.upload('different', 2, {})).ok, false);
console.log('Isolated form test: dev-only guard, no database imports, browser-memory create/edit/upload and simulated submit passed');
