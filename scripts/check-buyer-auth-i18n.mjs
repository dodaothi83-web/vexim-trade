// Database-free EN/VI rendering checks for buyer sign-in.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, URLSearchParams, console, require: (id) => { assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id]; },
  });
  return exports;
}
const { buyerAuthMessages } = load('lib/i18n/buyer-auth.ts');
const { fill } = load('lib/i18n/format.ts');
const { safeNextPath } = load('lib/buyer/next-path.ts');
const noOp = () => null;
const common = {
  'react/jsx-runtime': jsx,
  'next/link': { default: ({ children, prefetch, ...props }) => React.createElement('a', props, children) },
  'lucide-react': new Proxy({}, { get: () => noOp }),
  '@/lib/i18n/format': { fill },
  '@/components/form-challenge': { FormChallenge: noOp },
  '@/components/google-g-icon': { GoogleGIcon: noOp },
  'next/navigation': { useRouter: () => ({ replace() {}, refresh() {} }), redirect: (href) => { throw Object.assign(new Error('redirect'), { href }); } },
  '@/app/(public)/buyer/sign-in/actions': {},
};
let locale = 'en', session = null;
const page = load('app/(public)/buyer/sign-in/page.tsx', {
  ...common,
  '@/lib/i18n/server': { getLocale: async () => locale },
  '@/lib/i18n/buyer-auth': { buyerAuthMessages },
  '@/lib/buyer/next-path': { safeNextPath },
  '@/lib/auth/buyer-session': { getBuyerSession: async () => session },
  '@/components/auth-split-shell': { AuthSplitShell: ({ children, caption, lede, points, note }) => React.createElement('div', null, caption, lede, ...points, note, children) },
  '@/components/buyer-sign-in-form': { BuyerSignInForm: ({ initialError, initialOauthError, next }) => React.createElement('div', { 'data-next': next }, initialError, initialOauthError) },
});
for (locale of ['en','vi']) {
  const m = buyerAuthMessages[locale];
  const tree = await page.default({ searchParams: Promise.resolve({ error: 'used', oauth: 'cancelled', next: '/rfq?category=cashew' }) });
  const html = renderToStaticMarkup(tree);
  for (const text of [m.title, m.intro, m.caption, m.linkErrors.used, m.oauthErrors.cancelled]) assert.ok(html.includes(text), text);
  assert.ok(html.includes('data-next="/rfq?category=cashew"'));
  assert.match((await page.generateMetadata()).title, new RegExp(m.signIn));
  const renderForm = (step = 'email', error = null) => {
    let index = 0;
    const states = [step, 'person@example.test', '123456', true, error, false, null, 0];
    const { BuyerSignInForm } = load('components/buyer-sign-in-form.tsx', {
      ...common, react: { useState: () => [states[index++], () => {}], useTransition: () => [false, () => {}] },
    });
    return renderToStaticMarkup(React.createElement(BuyerSignInForm, { messages: m, lang: locale, next: '/rfq?category=cashew' }));
  };
  const email = renderForm();
  for (const text of [m.email, m.sendCode, m.google]) assert.ok(email.includes(text), text);
  assert.ok(email.includes('next=%2Frfq%3Fcategory%3Dcashew'));
  const code = renderForm('code');
  for (const text of [m.code, m.signIn, m.differentEmail, m.sent, 'person@example.test', '123456']) assert.ok(code.includes(text), text);
  for (const [key, text] of Object.entries(m.errors)) assert.ok(renderForm('code', key).includes(text), key);
}
session = { email: 'person@example.test' };
await assert.rejects(() => page.default({ searchParams: Promise.resolve({}) }), (e) => e.href === '/');
await assert.rejects(() => page.default({ searchParams: Promise.resolve({ next: '/rfq?category=cashew' }) }), (e) => e.href === '/rfq?category=cashew');
await assert.rejects(() => page.default({ searchParams: Promise.resolve({ next: '//evil.test' }) }), (e) => e.href === '/');
console.log('Buyer auth EN/VI: page, both form steps, errors, metadata and safe return paths passed.');
