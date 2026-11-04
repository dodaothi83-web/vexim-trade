import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: mod.exports, module: mod, require(id) { assert.ok(id in mocks, id); return mocks[id]; } });
  return mod.exports;
}
const dictionary = load('lib/i18n/sign-in-entry.ts');
const nextPaths = load('lib/buyer/next-path.ts');
let locale = 'en';
const entry = load('app/(auth)/sign-in/page.tsx', {
  'react/jsx-runtime': jsx,
  'next/link': { default: ({ href, children, prefetch, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': { ArrowRight: () => null, Factory: () => null, ShoppingBag: () => null },
  '@/components/auth-split-shell': { AuthSplitShell: ({ children }) => React.createElement('main', null, children) },
  '@/lib/i18n/server': { getLocale: async () => locale },
  '@/lib/i18n/sign-in-entry': dictionary,
  '@/lib/buyer/next-path': nextPaths,
});
function resolve(tree) {
  if (Array.isArray(tree)) return tree.map(resolve);
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return resolve(tree.type(tree.props));
  const children = resolve(tree.props.children);
  return Array.isArray(children) ? React.cloneElement(tree, {}, ...children) : React.cloneElement(tree, {}, children);
}
for (locale of ['en', 'vi']) {
  for (const next of [undefined, '/rfq?category=pepper', '//evil.example', '/\\evil.example', 'https://evil.example', 'x'.repeat(501)]) {
    const html = renderToStaticMarkup(resolve(await entry.default({ searchParams: Promise.resolve({ next }) })));
    assert.match(html, /href="\/login"/);
    assert.match(html, /href="\/register"/);
    const target = nextPaths.safeNextPath(next);
    const buyerHref = `/buyer/sign-in${target ? `?next=${encodeURIComponent(target)}` : ''}`;
    assert.ok(html.includes(`href="${buyerHref}"`));
    assert.ok(html.includes(dictionary.signInEntryMessages[locale].staff));
    assert.ok(html.includes(dictionary.signInEntryMessages[locale].supplier));
    assert.ok(html.includes(dictionary.signInEntryMessages[locale].buyer));
    assert.doesNotMatch(html, /evil.example/);
    assert.doesNotMatch(html, /<form|<input/, 'The entrance never collects shared credentials or guesses account roles');
  }
  const metadata = await entry.generateMetadata();
  assert.equal(metadata.robots.index, false);
  assert.ok(metadata.title.startsWith(dictionary.signInEntryMessages[locale].title));
}
console.log('✓ Shared sign-in entry: EN/VI, existing buyer/supplier/staff routes, separate registration and safe buyer return paths.');

const config = load('lib/i18n/config.ts');
assert.equal(config.isLocalizedAuthPath('/sign-in'), true);
assert.match(readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8'), /"\/sign-in"/);
