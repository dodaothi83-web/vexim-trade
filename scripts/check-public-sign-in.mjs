// node scripts/check-public-sign-in.mjs — public sign-in entry points and EN/VI header rendering.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadAuthDictionary } from './lib/auth-dictionary.mjs';

function load(file, mocks, globals = {}) {
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
    console, URLSearchParams, ...globals,
  }, { filename: file });
  return mod.exports;
}

const Link = ({ href, children, prefetch: _prefetch, ...props }) => React.createElement('a', { href, ...props }, children);
const icons = new Proxy({}, { get: () => (props) => React.createElement('svg', props) });
const common = { react: React, 'react/jsx-runtime': jsx, 'next/link': { default: Link }, 'lucide-react': icons, '@/components/brand/vexim-icons': icons };
// setSignedOut() cập nhật lạc quan state dùng chung khi bấm đăng xuất (xem
// lib/buyer/public-session-context.tsx) — bài kiểm tra này chỉ cần nó không ném lỗi.
const publicSessionActionsStub = { usePublicSessionActions: () => ({ setSignedOut: () => {}, setSignedIn: () => {}, refresh: () => {} }) };
const signIn = load('../components/public-sign-in-link.tsx', { ...common, '@/app/(public)/buyer/sign-in/actions': { signOutBuyerAction: async () => {} }, '@/lib/buyer/public-session-context': publicSessionActionsStub });
const sourcingComposer = load('../components/sourcing-composer.tsx', {
  ...common,
  '@/components/buyer-enquiry-auth': { useBuyerEnquiryAuth: () => ({ requireBuyer() {} }) },
  '@/components/form-challenge': { FormChallenge: () => null },
  '@/lib/browser/dialog-scroll-lock': { lockDialogScroll: () => () => {} },
  '@/lib/sourcing/files': { SOURCING_MAX_FILES: 3, SOURCING_MAX_FILE_BYTES: 2097152 },
});
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
// buyerEmail/buyerCompanyName không còn là prop của PublicHeaderControls — HeaderControlsInner
// và HeaderControlsFallback giờ tự gọi usePublicSession() (xem lib/buyer/public-session-context.tsx).
// Biến có thể điều khiển được này đóng vai trò phiên hiện tại cho cả hai trong bài kiểm tra.
let headerSession = { buyerEmail: null, buyerCompanyName: null };
const { PublicHeaderControls } = load('../components/public-header-controls.tsx', {
  ...common, 'next/navigation': nav, '@/components/public-sign-in-link': signIn, '@/components/sourcing-composer': sourcingComposer,
  '@/lib/buyer/public-session-context': { usePublicSession: () => ({ buyerEmail: headerSession.buyerEmail, buyerCompanyName: headerSession.buyerCompanyName, oneTapClientId: null, showOneTap: false }) },
});

function assertSignIn(html, lang, label) {
  const link = html.match(/<a\b[^>]*href="\/sign-in"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(link, 'A sign-in link must point to the sign-in entrance');
  assert.match(link, new RegExp(`lang="${lang}"`));
  assert.ok(link.includes(`aria-label="${label}"`));
  assert.ok(link.includes(`title="${label}"`));
  assert.match(link, /<svg\b/);
  assert.doesNotMatch(link, />[^<]+<\/a>/, "Sign-in link is icon-only");
  const openingTag = link.slice(0, link.indexOf('>'));
  assert.doesNotMatch(openingTag, /(?:^|\s)(?:hidden|sm:hidden|md:hidden|lg:hidden)(?:\s|"|$)/, 'Sign-in itself must not be hidden at any breakpoint');
}

let html = renderToStaticMarkup(React.createElement(PublicHeaderControls));
assertSignIn(html, 'en', 'Sign in');
assert.match(html, /<button[^>]*aria-label="Sourcing request"/);
assert.doesNotMatch(html, /href="\/rfq"/);
assert.match(html, /Language switcher \/ Chuyển đổi ngôn ngữ/);
assert.match(html, /href="\/for-suppliers"/);

params = new URLSearchParams('lang=vi');
html = renderToStaticMarkup(React.createElement(PublicHeaderControls));
assertSignIn(html, 'vi', 'Đăng nhập');
assert.match(html, /<button[^>]*aria-label="Yêu cầu tìm nguồn"/);
assert.match(html, /href="\/\?lang=vi#categories"/);
assert.match(html, /Tìm nguồn/);

// The Suspense fallback must remain usable while search parameters are loading.
suspend = true;
html = renderToStaticMarkup(React.createElement(PublicHeaderControls));
assertSignIn(html, 'en', 'Sign in');
assert.match(html, /<button[^>]*aria-label="Sourcing request"/);
assert.doesNotMatch(html, /href="\/rfq"/);
suspend = false;

// Authenticated header opens account details rather than routing back to registration.
for (const lang of ['en', 'vi']) {
  params = new URLSearchParams(lang === 'vi' ? 'lang=vi' : '');
  headerSession = { buyerEmail: 'buyer@example.test', buyerCompanyName: null };
  const signedIn = renderToStaticMarkup(React.createElement(PublicHeaderControls));
  assert.match(signedIn, /buyer@example.test/);
  assert.match(signedIn, /<details/);
  assert.match(signedIn, lang === 'vi' ? /Đăng xuất/ : /Sign out/);
  assert.doesNotMatch(signedIn, /href="\/sign-in"/);
}
suspend = true;
headerSession = { buyerEmail: 'buyer@example.test', buyerCompanyName: null };
const signedFallback = renderToStaticMarkup(React.createElement(PublicHeaderControls));
assert.match(signedFallback, /buyer@example.test/);
assert.doesNotMatch(signedFallback, /href="\/sign-in"/);
suspend = false;
headerSession = { buyerEmail: null, buyerCompanyName: null };

const nothing = () => null;
const layoutMocks = {
  '@/components/sourcing-composer': sourcingComposer,
  '@/components/buyer-enquiry-auth': { BuyerEnquiryAuthProvider: ({ children }) => children },
  '@/lib/i18n/buyer-auth': { buyerAuthMessages: { en: {} } },
  '@/lib/auth/buyer-session': { getBuyerSession: async () => null },
  // app/blog/layout.tsx: PublicSessionProvider không còn đọc cookie (xem
  // lib/buyer/public-session-context.tsx) — passthrough đủ cho bài kiểm tra kết dây header
  // này; hành vi thật của usePublicSession()/BuyerSignInStatus đã có bài kiểm tra riêng ở
  // check-buyer-account.mjs / check-buyer-google-one-tap.mjs.
  '@/lib/buyer/public-session-context': { PublicSessionProvider: ({ children }) => children },
  '@/components/buyer-sign-in-status': { BuyerSignInStatus: ({ lang }) => React.createElement(signIn.PublicSignInLink, { lang: lang ?? 'en', buyerEmail: null, buyerCompanyName: null }) },
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
  html = renderToStaticMarkup(await Layout({ children: 'Content' }));
  const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0];
  assert.ok(header, `${file} needs a header`);
  assertSignIn(header, 'en', 'Sign in');
}

const footer = fs.readFileSync(new URL('../components/platform-legal-strip.tsx', import.meta.url), 'utf8');
assert.match(footer, /href: "\/login", label: vi \? "Đăng nhập nhà cung cấp" : "Supplier sign in"/, 'Shared footer has a bilingual supplier sign-in entry');
const supplierPage = fs.readFileSync(new URL('../app/(public)/for-suppliers/page.tsx', import.meta.url), 'utf8');
assert.match(supplierPage, /Already have an account\?[\s\S]{0,120}href="\/login"/, 'Existing suppliers can sign in from the supplier application section');

// The supplier login page still preserves its role-aware redirects.
let session = null;
const authMessages = loadAuthDictionary();
const LoginPage = load('../app/(auth)/login/page.tsx', {
  ...common,
  'next/navigation': { redirect: (href) => { throw Object.assign(new Error('redirect'), { href }); } },
  '@/lib/db': { getStore: () => ({ countUsers: async () => 1 }) },
  '@/lib/auth/session': { getSession: async () => session },
  '@/lib/auth/authenticate': { supabaseAuthReachable: async () => true },
  '@/components/login-form': { LoginForm: () => React.createElement('form', { 'data-login-form': true }) },
  '@/components/auth-split-shell': { AuthSplitShell: ({ children }) => React.createElement('div', null, children) },
  '@/lib/i18n/server': { getAuthMessages: async () => ({ locale: 'en', m: authMessages.en }) },
}).default;
const props = { searchParams: Promise.resolve({}) };
html = renderToStaticMarkup(await LoginPage(props));
assert.match(html, /data-login-form="true"/);
session = { role: 'supplier' };
await assert.rejects(() => LoginPage(props), (error) => error.href === '/supplier/portal');
session = { role: 'admin' };
await assert.rejects(() => LoginPage(props), (error) => error.href === '/');
console.log('✓ Public sign-in links, EN/VI labels, quote access, fallback and existing role redirects.');

// Exercise the actual menu's listeners and handlers without a browser/database.
const listeners = new Map();
const removed = [];
const effects = [];
const inside = {};
const outside = {};
let focusCount = 0;
let refIndex = 0;
let timerId = 0;
const timers = new Map();
const documentMock = {
  activeElement: outside,
  addEventListener: (type, handler, capture) => { assert.equal(capture, true); listeners.set(type, handler); },
  removeEventListener: (type, handler, capture) => { assert.equal(listeners.get(type), handler); assert.equal(capture, true); removed.push(type); },
};
const menu = { open: true, contains: (target) => target === inside, querySelector: () => ({ focus: () => focusCount++ }) };
const interactive = load('../components/public-sign-in-link.tsx', {
  ...common,
  react: { useRef: (initial) => ({ current: refIndex++ % 3 === 0 ? menu : initial }), useEffect: (effect) => effects.push(effect) },
  '@/app/(public)/buyer/sign-in/actions': { signOutBuyerAction: async () => {} },
  '@/lib/buyer/public-session-context': publicSessionActionsStub,
}, {
  document: documentMock,
  window: { matchMedia: () => ({ matches: true }) },
  setTimeout: (callback, delay) => { assert.equal(delay, 250); timers.set(++timerId, callback); return timerId; },
  clearTimeout: (id) => timers.delete(id),
});
const tree = interactive.PublicSignInLink({ buyerEmail: 'buyer@example.test' });
const cleanup = effects.pop()();
listeners.get('pointerdown')({ target: inside });
assert.equal(menu.open, true, 'Clicks inside must not dismiss the menu');
listeners.get('pointerdown')({ target: outside });
assert.equal(menu.open, false, 'Outside pointer/touch dismisses the menu');
assert.equal(focusCount, 0, 'Outside interaction must not steal focus');
menu.open = true;
listeners.get('focusin')({ target: outside });
assert.equal(menu.open, false, 'Tabbing outside dismisses the menu');
menu.open = true;
listeners.get('focusin')({ target: inside });
assert.equal(menu.open, true, 'Keyboard focus inside keeps the menu open');
tree.props.onKeyDown({ key: 'Escape', currentTarget: menu });
assert.equal(menu.open, false);
assert.equal(focusCount, 1, 'Escape returns focus to the account trigger');
const panel = tree.props.children[1].props.children;
const accountNav = panel.props.children.find((child) => child?.type === 'nav');
for (const link of accountNav.props.children) {
  menu.open = true;
  link.props.onClick();
  assert.equal(menu.open, false, 'Every navigation item closes the menu, including the current route');
}
menu.open = true;
panel.props.children.find((child) => child?.type === 'form').props.onSubmit();
assert.equal(menu.open, false, 'Signing out closes the menu');
// Mouse hover opens; touch and pen retain native click/tap behavior.
menu.open = false;
tree.props.onPointerEnter({ pointerType: 'touch' });
assert.equal(menu.open, false);
tree.props.onPointerEnter({ pointerType: 'pen' });
assert.equal(menu.open, false);
tree.props.onPointerEnter({ pointerType: 'mouse' });
assert.equal(menu.open, true);
tree.props.onPointerLeave({ pointerType: 'mouse' });
assert.equal(menu.open, true, 'Leaving does not close immediately');
assert.equal(timers.size, 1);
tree.props.onPointerEnter({ pointerType: 'mouse' });
assert.equal(timers.size, 0, 'Crossing back into the menu cancels delayed dismissal');
tree.props.onPointerLeave({ pointerType: 'mouse' });
const finishTimer = () => { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); };
finishTimer();
assert.equal(menu.open, false, 'Leaving the entire menu closes after 250ms');
tree.props.onPointerEnter({ pointerType: 'mouse' });
tree.props.onKeyDown({ key: 'Tab', currentTarget: menu });
documentMock.activeElement = inside;
tree.props.onPointerLeave({ pointerType: 'mouse' });
finishTimer();
assert.equal(menu.open, true, 'Mouse leaving must not disrupt keyboard navigation inside');
documentMock.activeElement = outside;
listeners.get('focusin')({ target: outside });
assert.equal(menu.open, false);
tree.props.onPointerEnter({ pointerType: 'mouse' });
tree.props.onPointerLeave({ pointerType: 'mouse' });
assert.equal(timers.size, 1);
cleanup();
assert.equal(timers.size, 0, 'Unmount also clears the hover timer');
assert.equal(removed.sort().join(','), 'focusin,pointerdown', 'Listeners are cleaned up on unmount or session change');
interactive.PublicSignInLink({ buyerEmail: null });
assert.equal(effects.pop()(), undefined, 'Guest header does not register document listeners');
console.log('✓ Buyer account menu: outside pointer/focus, inside interactions, navigation, Escape and listener cleanup.');

for (const [company, email, initial] of [['Vexim Global', 'buyer@example.test', 'V'], ['  ', 'buyer@example.test', 'B'], ['Đại Việt', 'buyer@example.test', 'Đ']]) {
  const accountHtml = renderToStaticMarkup(React.createElement(signIn.PublicSignInLink, { buyerEmail: email, buyerCompanyName: company, lang: 'vi' }));
  assert.match(accountHtml, /rounded-full bg-brand-700/);
  assert.ok(accountHtml.includes(`aria-hidden="true">${initial}</span>`));
  assert.match(accountHtml, /Đã đăng nhập/);
}
headerSession = { buyerEmail: 'buyer@example.test', buyerCompanyName: 'Company' };
const forwarded = renderToStaticMarkup(React.createElement(PublicHeaderControls));
assert.match(forwarded, /aria-hidden="true">C<\/span>/);
suspend = true;
const fallbackAvatar = renderToStaticMarkup(React.createElement(PublicHeaderControls));
assert.match(fallbackAvatar, /aria-hidden="true">C<\/span>/);
suspend = false;
headerSession = { buyerEmail: null, buyerCompanyName: null };
console.log('✓ Signed-in avatar: company/email initials, EN/VI, header fallback and mouse-only hover with a cancellable 250ms close delay.');
