// node scripts/check-public-sign-in.mjs — public sign-in entry points and EN/VI header rendering.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports,
    require: (id) => {
      assert.ok(id in mocks, `${file}: unexpected ${id}`);
      return mocks[id];
    },
    console, URLSearchParams,
  }, { filename: file });
  return mod.exports;
}

const Link = ({ href, children, prefetch: _prefetch, ...props }) => React.createElement('a', { href, ...props }, children);
const icons = new Proxy({}, { get: () => (props) => React.createElement('svg', props) });
const common = { react: React, 'react/jsx-runtime': jsx, 'next/link': { default: Link }, 'lucide-react': icons };
const signIn = load('../components/public-sign-in-link.tsx', common);
let params = new URLSearchParams();
let suspend = false;
const nav = {
  usePathname: () => '/',
  useRouter: () => ({ push() {} }),
  useSearchParams: () => {
    if (suspend) throw new Promise(() => {});
    return params;
  },
};
const { PublicHeaderControls } = load('../components/public-header-controls.tsx', {
  ...common, 'next/navigation': nav, '@/components/public-sign-in-link': signIn,
});

function assertSignIn(html, lang, label) {
  const link = html.match(/<a\b[^>]*href="\/login"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(link, 'A sign-in link must point to the existing /login form');
  assert.match(link, new RegExp(`lang="${lang}"`));
  assert.ok(link.includes(label), `Sign-in link should say ${label}`);
  const openingTag = link.slice(0, link.indexOf('>'));
  assert.doesNotMatch(openingTag, /(?:^|\s)(?:hidden|sm:hidden|md:hidden|lg:hidden)(?:\s|"|$)/, 'Sign-in itself must not be hidden at any breakpoint');
}

let html = renderToStaticMarkup(React.createElement(PublicHeaderControls));
assertSignIn(html, 'en', 'Supplier sign in');
assert.match(html, /href="\/rfq"[^>]*aria-label="Request a quote"/);
assert.match(html, /Language switcher \/ Chuyển đổi ngôn ngữ/);
assert.match(html, /href="\/for-suppliers"/);

params = new URLSearchParams('lang=vi');
html = renderToStaticMarkup(React.createElement(PublicHeaderControls));
assertSignIn(html, 'vi', 'Đăng nhập nhà cung cấp');
assert.match(html, /href="\/rfq"[^>]*aria-label="Yêu cầu báo giá"/);
assert.match(html, /href="\/\?lang=vi#categories"/);
assert.match(html, /Báo giá/);

// The Suspense fallback must remain usable while search parameters are loading.
suspend = true;
html = renderToStaticMarkup(React.createElement(PublicHeaderControls));
assertSignIn(html, 'en', 'Supplier sign in');
assert.match(html, /href="\/rfq"[^>]*aria-label="Request a quote"/);
suspend = false;

const nothing = () => null;
const layoutMocks = {
  ...common,
  '@/components/brand-logo': { Logo: nothing },
  '@/components/public-sign-in-link': signIn,
  '@/components/site-footer': { SiteFooter: nothing },
  '@/components/site-traffic-beacon': { SiteTrafficBeacon: nothing },
  '@/components/cookie-consent': { CookieSettingsButton: nothing },
  '@/components/platform-legal-strip': { PlatformLegalStrip: nothing },
  '@/components/social-links': { SocialLinks: nothing },
};
for (const file of ['../app/blog/layout.tsx', '../app/(legal)/layout.tsx']) {
  const Layout = load(file, layoutMocks).default;
  html = renderToStaticMarkup(React.createElement(Layout, null, 'Content'));
  const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0];
  assert.ok(header, `${file} needs a header`);
  assertSignIn(header, 'en', 'Supplier sign in');
}

const home = fs.readFileSync(new URL('../app/(public)/home.tsx', import.meta.url), 'utf8');
assert.match(home, /href="\/login"[\s\S]{0,100}isVi \? "Đăng nhập nhà cung cấp" : "Supplier sign in"/, 'Homepage footer has a bilingual supplier sign-in entry');
const supplierPage = fs.readFileSync(new URL('../app/(public)/for-suppliers/page.tsx', import.meta.url), 'utf8');
assert.match(supplierPage, /Already have an account\?[\s\S]{0,120}href="\/login"/, 'Existing suppliers can sign in from the supplier application section');

// The shared link keeps using the existing role-aware login page.
let session = null;
const LoginPage = load('../app/(auth)/login/page.tsx', {
  ...common,
  'next/navigation': { redirect: (href) => { throw Object.assign(new Error('redirect'), { href }); } },
  '@/lib/db': { getStore: () => ({ countUsers: async () => 1 }) },
  '@/lib/auth/session': { getSession: async () => session },
  '@/lib/auth/authenticate': { supabaseAuthReachable: async () => true },
  '@/components/login-form': { LoginForm: () => React.createElement('form', { 'data-login-form': true }) },
}).default;
const props = { searchParams: Promise.resolve({}) };
html = renderToStaticMarkup(await LoginPage(props));
assert.match(html, /data-login-form="true"/);
session = { role: 'supplier' };
await assert.rejects(() => LoginPage(props), (error) => error.href === '/supplier/portal');
session = { role: 'admin' };
await assert.rejects(() => LoginPage(props), (error) => error.href === '/');
console.log('✓ Public sign-in links, EN/VI labels, quote access, fallback and existing role redirects.');
