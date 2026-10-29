// node scripts/check-quantity-price-table.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../components/public/quantity-price-table.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(code, { exports, Date, Intl, Number, require: (key) => { if (key === 'react/jsx-runtime') return require(key); throw Error(key); } });
const offer = { grade: 'W320', incoterm: 'FOB', moq: '1 MT', price: 'USD 6.00–6.40/kg',
  tiers: [{ from: '1 MT', to: '4.999 MT', price: 'USD 6.40/kg' }, { from: '5 MT', to: null, price: 'USD 6.00/kg' }],
  confirmedAt: '2026-10-29T00:00:00Z', stale: true, daysSinceConfirmed: 91 };
const render = (props) => renderToStaticMarkup(React.createElement(exports.QuantityPriceTable, { offer: { ...offer, ...props } }));
let html = render({});
for (const text of ['Reference pricing', 'Grade W320', 'FOB', 'MOQ 1 MT', '1 MT', '4.999 MT', 'USD 6.40/kg', 'and above', 'Price updated 29 Oct 2026', 'Last updated 91 days ago']) assert.ok(html.includes(text), text);
assert.match(html, /tabular-nums/);
assert.doesNotMatch(html, /font-mono/);
html = render({ stale: false });
assert.doesNotMatch(html, /Last updated/);
html = render({ price: null, tiers: [], confirmedAt: null, daysSinceConfirmed: null, stale: false });
assert.match(html, /Price on request/);
assert.doesNotMatch(html, /Price updated|USD 6/);
console.log('Quantity buyer price table: tiers, 90-day label, date and price privacy passed');
