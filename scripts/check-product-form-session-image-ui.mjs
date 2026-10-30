// node scripts/check-product-form-session-image-ui.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const exports = {};
const mocks = {
  react: React, 'react/jsx-runtime': await import('react/jsx-runtime'),
  '@/components/products/product-form-five-sections': { ProductFormFiveSections: (props) => React.createElement('div', null, props.imageControls,
    React.createElement('button', { disabled: !props.canSubmit }, 'Gửi duyệt'), React.createElement('span', null, props.statusText)) },
  '@/lib/products/product-form-session': { ProductFormSession: class { isDirty() { return false; } } },
  '@/lib/products/product-form-image-transport': { prepareProductFormImageTransport: async (file) => file },
};
const code = ts.transpileModule(readFileSync(new URL('../components/products/product-form-session-editor.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
const images = Array.from({ length: 8 }, (_, i) => ({ id: String(i + 1), source: 'staged', url: `/image-${i + 1}.webp` }));
const props = { initialDraft: {}, initialProductId: null, initialRevision: 0, initialImages: images.slice(0, 2), categories: [], policies: {}, operations: {} };
let html = renderToStaticMarkup(React.createElement(exports.ProductFormSessionEditor, props));
assert.match(html, /alt="Ảnh chính"/); assert.match(html, />Ảnh chính<\/span>/); assert.match(html, /Gỡ ảnh 1 khỏi bản nháp/);
assert.match(html, /Đặt ảnh 2 làm ảnh chính/); assert.match(html, /\+ Thêm ảnh/); assert.match(html, /type="file"/); assert.match(html, /2\/8 ảnh/);
html = renderToStaticMarkup(React.createElement(exports.ProductFormSessionEditor, { ...props, initialImages: images }));
assert.doesNotMatch(html, /type="file"/); assert.match(html, /8\/8 ảnh/);
html = renderToStaticMarkup(React.createElement(exports.ProductFormSessionEditor, { ...props, disabled: true }));
assert.match(html, /type="file"[^>]*disabled=""/); assert.match(html, /disabled=""[^>]*aria-label="Gỡ ảnh 1/);
html = renderToStaticMarkup(React.createElement(exports.ProductFormSessionEditor, { ...props, initialPending: true }));
assert.match(html, /Giá mới đang chờ Vexim xác nhận\./); assert.match(html, /<button disabled="">Gửi duyệt<\/button>/);
assert.match(html, /Đang chờ duyệt/);
console.log('Product form image UI: cover, remove, add, limit, locked and pending states passed');
