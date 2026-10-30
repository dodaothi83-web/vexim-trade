// node scripts/check-product-name-translation-helper.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let enabled = true, source, result = 'Cashew Kernels';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/ai/product-name-translation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, require: (key) => key === 'server-only' ? {} : key === '@/lib/ai/translate-content' ? {
  translationConfigured: () => enabled, translateProductContent: async (input) => { source = input; return { translation: { name: result } }; },
} : (() => { throw Error(key); })() });
const translate = exports.translateProductName;
assert.equal(await translate('  Nhân điều  '), 'Cashew Kernels');
assert.equal(JSON.stringify(source), JSON.stringify({ name: 'Nhân điều' }), 'No price, description or other data is sent');
source = null; enabled = false; assert.equal(await translate('Nhân điều'), null); assert.equal(source, null); enabled = true;
assert.equal(await translate('ab'), null); assert.equal(await translate('x'.repeat(181)), null);
result = ''; assert.equal(await translate('Nhân điều'), null);
result = 'x'.repeat(181); assert.equal(await translate('Nhân điều'), null);
console.log('Name translation helper: title-only source, configuration and output length passed');
