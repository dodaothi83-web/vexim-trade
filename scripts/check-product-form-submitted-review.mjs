// node scripts/check-product-form-submitted-review.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
let props;
const mocks = { 'react/jsx-runtime': jsx, '@/components/products/product-form-five-sections': { ProductFormFiveSections: (received) => {
  props = received; return React.createElement('section', null, received.imageControls);
} } };
const exports = {}, code = ts.transpileModule(readFileSync(new URL('../components/products/product-form-submitted-review.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, require: (key) => { if (!(key in mocks)) throw Error(key); return mocks[key]; } });
const render = (extra) => renderToStaticMarkup(React.createElement(exports.ProductFormSubmittedReview, { draft: {}, categories: [], policies: {}, ...extra }));
let html = render({ imagesValid: true, images: [{ id: '1', url: '/api/product-form/images/p/1' }, { id: '2', url: null }] });
assert.equal(props.reviewOnly, true); assert.equal(props.coverUrl, '/api/product-form/images/p/1');
assert.match(html, /Ảnh chính trong bản gửi/); assert.match(html, /Ảnh cũ cần được sao chụp riêng tư/);
assert.match(html, /Không thể duyệt khi ảnh cũ/);
html = render({ imagesValid: false, images: [] }); assert.match(html, /Không xác nhận được danh sách ảnh/); assert.equal(props.coverUrl, null);
console.log('Submitted review: same read-only form, authorized staged image links and unverified legacy warnings passed');
