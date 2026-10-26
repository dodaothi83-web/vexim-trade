// Focused regression: canonical product detail HTML, legacy text, XSS and buyer rendering.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadProductDescription } from './product-description-test-utils.mjs';

const { description, format } = loadProductDescription();
const {
  sanitizeProductDescriptionForSave,
  sanitizeProductDescriptionHtml,
} = description;
const { plainTextToProductDescriptionHtml } = format;

assert.equal(format.hasProductDescriptionMarkup('<p>Origin</p>'), true);
assert.equal(format.hasProductDescriptionMarkup('Origin & processing'), false);
assert.equal(plainTextToProductDescriptionHtml('Origin\n\nMoisture < 5%\nW320'),
  '<p>Origin</p><p>Moisture &lt; 5%<br>W320</p>', 'Legacy text is escaped and keeps paragraph/line breaks');
assert.equal(sanitizeProductDescriptionForSave('Origin\n\nMoisture < 5%\nW320'),
  '<p>Origin</p><p>Moisture &lt; 5%<br />W320</p>');

const unsafe = '<h2 class="source">Origin</h2><p onclick="bad()"><b>W320</b> <i>New crop</i></p>'
  + '<ul><li style="color:red">Moisture ≤ 5%</li></ul><ol><li>Ordered</li></ol>'
  + '<a href="javascript:alert(1)">Unsafe link</a><img src=x onerror=alert(1)><script>alert(1)</script>';
const safe = sanitizeProductDescriptionHtml(unsafe);
assert.ok(safe.includes('<h2>Origin</h2>'));
assert.ok(safe.includes('<p><strong>W320</strong> <em>New crop</em></p>'));
assert.ok(safe.includes('<ul><li>Moisture ≤ 5%</li></ul>'));
assert.ok(safe.includes('Ordered') && safe.includes('Unsafe link'), 'Safe text from unsupported markup is retained');
for (const forbidden of ['<script', 'alert(1)', '<img', '<a ', 'javascript:', 'onclick', 'style=', 'class=', '<ol'])
  assert.ok(!safe.includes(forbidden), `Unsafe markup removed: ${forbidden}`);
assert.equal(sanitizeProductDescriptionHtml('<script>alert(1)</script>'), '');

assert.equal(sanitizeProductDescriptionForSave(`<p><strong>${'x'.repeat(6000)}</strong></p>`).length > 6000, true,
  'Markup does not count toward the visible-text limit');
assert.throws(() => sanitizeProductDescriptionForSave('x'.repeat(6001)), /6[.,]000|6000/,
  'Oversized content returns a validation error instead of slicing HTML');
assert.throws(() => sanitizeProductDescriptionForSave(`<p>${'x'.repeat(12001)}</p>`, { maxTextLength: 12000 }), /12[.,]000|12000/);
assert.equal(sanitizeProductDescriptionForSave('<p><script>alert(1)</script></p>'), '',
  'Empty or entirely unsafe detail stays empty');

function loadBuyerDescription() {
  const file = new URL('../components/public/product-description.tsx', import.meta.url);
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: mod, exports: mod.exports, console,
    require: (id) => {
      if (id === 'react/jsx-runtime') return jsx;
      if (id === '@/lib/products/product-description') return description;
      if (id === '@/lib/public/product-selection') return {
        withoutDirectContacts: (value) => value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[contact via Vexim]'),
      };
      throw new Error(`Unexpected buyer renderer import: ${id}`);
    },
  }, { filename: file.pathname });
  return mod.exports.ProductDescription;
}

const ProductDescription = loadBuyerDescription();
const buyerHtml = renderToStaticMarkup(React.createElement(ProductDescription, {
  value: '<h2>Origin</h2><p>Email sales@example.com</p><ul><li><strong>W320</strong></li></ul><script>alert(1)</script>',
  className: 'test-detail',
}));
assert.match(buyerHtml, /^<div class="product-description test-detail">/);
assert.ok(buyerHtml.includes('<h2>Origin</h2>') && buyerHtml.includes('<ul><li><strong>W320</strong></li></ul>'));
assert.ok(buyerHtml.includes('[contact via Vexim]') && !buyerHtml.includes('sales@example.com'));
assert.ok(!buyerHtml.includes('<script') && !buyerHtml.includes('alert(1)'));
assert.equal(renderToStaticMarkup(React.createElement(ProductDescription, { value: '' })), '');

const editor = fs.readFileSync(new URL('../components/products/product-description-editor.tsx', import.meta.url), 'utf8');
for (const control of ['toggleHeading', 'toggleBold', 'toggleItalic', 'toggleBulletList', 'undo', 'redo', 'setParagraph'])
  assert.ok(editor.includes(control), `Editor control is wired: ${control}`);
assert.ok(editor.includes('immediatelyRender: false') && !editor.includes('dangerouslySetInnerHTML'),
  'TipTap is SSR-safe and does not inject HTML directly');
const buyerRenderer = fs.readFileSync(new URL('../components/public/product-description.tsx', import.meta.url), 'utf8');
assert.ok(!buyerRenderer.includes('@tiptap'), 'Buyer renderer does not import the editor bundle');
console.log('✅ Product descriptions: legacy text, canonical HTML, limits, XSS and buyer rendering.');
