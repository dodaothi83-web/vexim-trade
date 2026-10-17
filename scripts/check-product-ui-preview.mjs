// node scripts/check-product-ui-preview.mjs — buyer-layout sample never becomes an offer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hasPermission } from '../lib/auth/permissions.ts';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../app/(public)/preview/product-detail/page.tsx', import.meta.url), 'utf8');
const exports = {};
let authorized = false;
const mocks = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': require('lucide-react'),
  '@/components/product-media-gallery': { ProductMediaGallery: ({ images, previewStaticMedia }) => React.createElement('div', {
    'data-gallery': images.join(','), 'data-illustration': String(previewStaticMedia),
  }) },
  '@/lib/auth/session': { requirePagePermission: async (permission) => {
    assert.equal(permission, 'products.view');
    if (!authorized) throw Error('Access denied');
  } },
};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports, require: (key) => {
  assert.ok(key in mocks, `Unexpected import ${key}`);
  return mocks[key];
} });
assert.equal(hasPermission('supplier', 'products.view'), false);
assert.equal(hasPermission('admin', 'products.view'), true);
assert.equal(exports.metadata.robots.index, false);
assert.equal(exports.metadata.robots.follow, false);
await assert.rejects(exports.default(), /Access denied/, 'Anonymous/supplier cannot load the sample page');
authorized = true;
const html = renderToStaticMarkup(await exports.default());
assert.match(html, /BẢN XEM THỬ GIAO DIỆN · CHỈ NHÂN VIÊN/);
assert.match(html, /data-gallery="\/images\/categories\/cashew-grade.jpg"/);
assert.match(html, /data-illustration="true"/);
assert.match(html, /MOQ|Reference price|Lead time|Product description|Supplied by/);
assert.match(html, /RFQ không khả dụng trên trang xem thử/);
assert.doesNotMatch(html, /href="\/rfq|\/products\/cashew\/[^"#]+|Documents checked|Factory visited|USD \d|<script type="application\/ld\+json"/);
const crm = readFileSync(new URL('../app/crm/products/page.tsx', import.meta.url), 'utf8');
const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
const robots = readFileSync(new URL('../app/robots.ts', import.meta.url), 'utf8');
assert.match(crm, /href="\/preview\/product-detail"/, 'Only CRM navigation links to the staff preview');
assert.match(middleware, /"\/preview"/, 'Preview is always noindex at the response layer');
assert.match(robots, /"\/preview\/"/, 'Robots excludes staff previews');
console.log('✅ Staff-only product UI example: no buyer offer, no RFQ, no verification claims, no indexing.');
