import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const mod = { exports: {} };
const mocks = {
  'react/jsx-runtime': jsx,
  'next/image': { default: ({ sizes, ...props }) => React.createElement('img', props) },
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  'lucide-react': { ArrowRight: () => null },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/public/connection-overview.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, require(id) { assert.ok(id in mocks, id); return mocks[id]; } });
for (const isVi of [false, true]) {
  const html = renderToStaticMarkup(React.createElement(mod.exports.ConnectionOverview, { isVi }));
  assert.equal((html.match(/<li\b/g) || []).length, 3);
  assert.match(html, /object-contain/);
  assert.match(html, /alt=""/);
  assert.match(html, isVi ? /không phải bên bán hàng/ : /not the seller/);
  assert.match(html, isVi ? /href="\/how-it-works\?lang=vi"/ : /href="\/how-it-works"/);
  assert.doesNotMatch(html, /fetchpriority="high"|object-cover|scale-/);
}
assert.ok(fs.statSync('public/images/vexim-buyer-supplier-connection.webp').size < 100000);
const home = fs.readFileSync('app/(public)/home.tsx', 'utf8');
assert.equal((home.match(/<ConnectionOverview /g) || []).length, 1);
assert.ok(home.indexOf('<ConnectionOverview ') > home.indexOf('id="categories"'), 'Overview replaces FAQ after the catalogue sections');
assert.ok(home.indexOf('<ConnectionOverview ') < home.indexOf('aria-labelledby="home-news-title"'), 'How it connects comes before the articles');
assert.ok(home.indexOf('<ConnectionOverview ') < home.indexOf('id="home-supplier-band"'), 'Supplier band sits below the buyer content');
assert.ok(fs.readFileSync('app/(public)/for-suppliers/page.tsx', 'utf8').includes('<ServiceRegistrationSection'), 'Supplier services live on /for-suppliers');
assert.ok(home.indexOf('<ConnectionOverview ') < home.indexOf('<PlatformLegalStrip'), 'Overview remains above footer');
assert.doesNotMatch(home, /const FAQ_EN|const FAQ_VI|faqs\.map|id="faq"|Frequently Asked Questions|Bộ câu hỏi và trả lời/, 'Old FAQ removed in both languages');
console.log('Connection overview: EN/VI semantics, three steps, links, uncropped decorative image, size and placement passed.');
