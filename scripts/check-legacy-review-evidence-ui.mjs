// node scripts/check-legacy-review-evidence-ui.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../components/products/legacy-review-evidence.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const requireJsx = await import('react/jsx-runtime');
vm.runInNewContext(code, { exports, require: (key) => { if (key === 'react/jsx-runtime') return requireJsx; throw Error(key); } });
let html = renderToStaticMarkup(React.createElement(exports.LegacyReviewEvidencePanel, { evidence: [{ label: 'MOQ', lines: ['1 túi', '<img onerror=alert(1)>'], instruction: 'Cần xác nhận' }] }));
assert.match(html, /Thông tin cần xác nhận/); assert.match(html, /1 túi/); assert.match(html, /&lt;img onerror=alert\(1\)&gt;/); assert.doesNotMatch(html, /<img onerror/);
html = renderToStaticMarkup(React.createElement(exports.LegacyReviewEvidencePanel, { evidence: [] })); assert.equal(html, '');
console.log('Legacy evidence UI: escaped values and no empty warning panel passed');
