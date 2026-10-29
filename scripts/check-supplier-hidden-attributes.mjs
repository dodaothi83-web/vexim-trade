// node scripts/check-supplier-hidden-attributes.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, JSON, Object, Set, Map, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
  } });
  return exports;
}
const attributes = load('../lib/product-attributes.ts', {});
const { SupplierAttributeInputs } = load('../components/supplier-attribute-inputs.tsx', {
  react: React, 'react/jsx-runtime': jsx, '@/lib/product-attributes': attributes,
});
const officialFields = [{ key: 'kind', label: 'Loại', type: 'select', options: ['A', 'B'] },
  { key: 'moisture', label: 'Độ ẩm', type: 'text', options: [], showWhen: { key: 'kind', value: 'A' } }];
const render = (values, disabled = false) => renderToStaticMarkup(React.createElement(SupplierAttributeInputs, { officialFields, values, disabled }));
const hidden = render({ kind: 'B', moisture: '12%' });
assert.match(hidden, /Thông số Độ ẩm đang ẩn nhưng vẫn có giá trị: 12%/);
assert.match(hidden, /Xóa giá trị Độ ẩm/);
assert.doesNotMatch(render({ kind: 'A', moisture: '12%' }), /đang ẩn nhưng vẫn có giá trị/);
assert.match(render({ kind: 'B', moisture: '12%' }, true), /<button[^>]*disabled=""[^>]*>Xóa giá trị Độ ẩm/);
console.log('Hidden supplier attributes: values remain visible until explicitly cleared');
