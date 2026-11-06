// Real React DOM interaction checks in a local DOM. No email, OAuth or production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<div id="root"></div>', { url: 'https://www.veximtrade.com/products/nuts/p1' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'MouseEvent', 'MutationObserver', 'Event', 'FormData']) globalThis[key] = dom.window[key];
const errors = [];
window.addEventListener('error', (event) => errors.push(event.error));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.show = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
function load(file, mocks) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: mod, exports: mod.exports, window, document, HTMLElement, Element, MutationObserver, URL, console,
    require(id) { if (id === 'react') return React; if (id === 'react/jsx-runtime') return jsx; assert.ok(id in mocks, `Unexpected dependency ${id}`); return mocks[id]; } });
  return mod.exports;
}
const paths = [], codeRequests = [], verifies = [];
const router = { push: (path) => paths.push(path), replace: (path) => paths.push(path), refresh() {} };
const icon = () => null;
const navigation = { useRouter: () => router, useSearchParams: () => params };
let params = new URLSearchParams();
let allowCode = false;
const authMessages = load('lib/i18n/buyer-auth.ts', {}).buyerAuthMessages;
const nextPaths = load('lib/buyer/next-path.ts', {});
for (const unsafe of ['//evil.example', '/\\evil.example', '/\t/evil.example', 'https://evil.example', '/' + 'x'.repeat(1501)]) assert.equal(nextPaths.safeNextPath(unsafe), null);
const longContext = '/rfq?product=' + 'x'.repeat(550) + '&suppliers=s1';
assert.equal(nextPaths.safeNextPath(longContext), longContext);

const { BuyerSignInForm } = load('components/buyer-sign-in-form.tsx', {
  'next/navigation': navigation,
  'lucide-react': { ArrowLeft: icon, ArrowRight: icon, Loader2: icon, MailCheck: icon },
  '@/lib/i18n/format': { fill: (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => values[k]) },
  '@/components/form-challenge': { FormChallenge: () => null },
  '@/components/google-g-icon': { GoogleGIcon: icon },
  '@/app/(public)/buyer/sign-in/actions': {
    requestBuyerSignInAction: async (input) => { codeRequests.push(input); return { ok: true }; },
    verifyBuyerCodeAction: async (input) => { verifies.push(input); return allowCode ? { ok: true, redirectTo: input.next } : { ok: false, errorKey: 'wrongCode' }; },
  },
});
const scrollLock = load('lib/browser/dialog-scroll-lock.ts', {});
const auth = load('components/buyer-enquiry-auth.tsx', {
  '@/lib/browser/dialog-scroll-lock': scrollLock,
  'next/navigation': navigation, 'lucide-react': { X: icon },
  '@/components/buyer-sign-in-form': { BuyerSignInForm }, '@/lib/buyer/next-path': nextPaths,
});
const { AskSupplierDialog } = load('components/products/ask-supplier-dialog.tsx', {
  '@/components/chat/dock': { CHAT_DOCK_CLASS: 'dock', useChatDock: () => {} },
  'next/navigation': navigation, 'lucide-react': { MessageCircle: icon },
  '@/components/buyer-enquiry-auth': auth,
  '@/lib/chat/buyer-labels': { BUYER_CHAT_LABELS: { en: { title: 'Messages' }, vi: { title: 'Tin nhắn' } } },
  // Khung chat thật đã có kiểm tra riêng; ở đây chỉ cần biết cửa sổ mở đúng sản phẩm.
  '@/components/chat/chat-workspace': { ChatWorkspace: (p) => {
    chatMounts.push(p);
    return React.createElement('div', null,
      React.createElement('textarea', { id: 'ask-supplier-message', 'data-product': p.product.id, readOnly: true }),
      React.createElement('button', { type: 'button', 'aria-label': 'Close', onClick: p.onClose }));
  } },
});
const chatMounts = [];
const target = '/rfq?category=nuts&product_id=p1&suppliers=s1&grade=W320&sample=1';
const props = { category: 'nuts', productId: 'p1', productName: 'Cashew', supplierId: 's1', supplierName: 'Supplier', grade: 'W320', imageUrl: null, quoteHref: target };
let root = createRoot(document.getElementById('root'));
async function mount(email = null, locale = 'en', strict = false) {
  await act(async () => root.unmount());
  root = createRoot(document.getElementById('root'));
  let content = React.createElement(auth.BuyerEnquiryAuthProvider, { buyerEmail: email, locale, messages: authMessages[locale] },
    React.createElement('a', { href: target, id: 'quote' }, React.createElement('span', null, 'Request a quote')),
    React.createElement(AskSupplierDialog, props));
  if (strict) content = React.createElement(React.StrictMode, null, content);
  await act(async () => root.render(content));
}
async function click(element, extra = {}) { await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...extra }))); }
const quick = () => document.querySelector('[aria-labelledby="buyer-quick-auth-title"]');
const question = () => document.querySelector('[aria-labelledby="ask-supplier-title"]');
async function enter(name, value) {
  const input = document.querySelector(`input[name="${name}"]`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    // Dispatch actual native input events to exercise controlled form state.
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
await mount(null, 'en', true);
await click(document.querySelector('#quote span'));
assert.equal(quick().open, true, 'Modal opens on the first quote click, including StrictMode');
assert.equal(question().open, false);
assert.ok(!quick().textContent.includes(authMessages.en.emailHint));
assert.ok(!quick().textContent.includes(authMessages.en.firstTime));
assert.ok(!quick().textContent.includes(authMessages.en.googleHint));
const google = quick().querySelector('a');
assert.equal(new URL(google.href).searchParams.get('next'), target, 'OAuth retains complete quote context');
assert.ok(google.className.includes('-order-2'), 'Google is presented first');
assert.equal(document.body.style.overflow, 'hidden');
await click(quick().querySelector('[aria-label="Close"]'));
assert.equal(quick().open, false);
assert.equal(paths.length, 0, 'Closing authentication does not navigate');
assert.equal(document.body.style.overflow, '');
await click(document.querySelector('button[aria-label^="Chat with supplier"]'));
assert.equal(quick().open, true);
assert.equal(question().open, false, 'Question form never opens before authentication');
assert.equal(question().open, false, 'Chat composer stays closed until authenticated');
assert.equal(new URL(quick().querySelector('a').href).searchParams.get('next'), '/products/nuts/p1?ask=1');
await act(async () => quick().dispatchEvent(new window.Event('cancel', { cancelable: true })));
assert.equal(quick().open, false, 'Escape/cancel dismisses the modal');
// Email-code login continues in place without showing the question first or auto-submitting it.
await click(document.querySelector('button[aria-label^="Chat with supplier"]'));
await enter('email', 'Buyer@EXAMPLE.com');
async function submitAuth() { await act(async () => quick().querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); }
await submitAuth();
assert.equal(codeRequests.length, 1);
assert.equal(codeRequests[0].next, '/products/nuts/p1?ask=1');
await enter('code', '123456');
await submitAuth();
assert.equal(quick().open, true, 'Invalid code stays in authentication');
assert.equal(question().open, false);
assert.ok(quick().querySelector('[role="alert"]'));
allowCode = true;
await submitAuth();
assert.equal(verifies.length, 2);
assert.equal(quick().open, false);
assert.equal(question().open, true, 'Successful code opens the pending question, not a new route');
assert.ok(question().querySelector('textarea#ask-supplier-message'), 'Chat composer is ready after authentication');
assert.equal(paths.length, 0);
assert.equal(document.body.style.overflow, '', 'Đăng nhập xong mở khung chat bám cạnh: trang không bị khoá cuộn');
await click(question().querySelector('[aria-label="Close"]'));
assert.equal(document.body.style.overflow, '');
await mount();
await click(document.querySelector('#quote'));
await enter('email', 'buyer@example.com');
await submitAuth();
await enter('code', '123456');
await submitAuth();
assert.equal(paths.at(-1), target, 'Code sign-in resumes the exact quote destination');
assert.equal(quick().open, false);
await mount('buyer@example.com');
await click(document.querySelector('button[aria-label^="Chat with supplier"]'));
assert.equal(quick().open, false);
assert.equal(question().open, true, 'Authenticated buyers go straight to the question');
assert.ok(question().querySelector('textarea#ask-supplier-message'), 'Chat composer is ready after authentication');
assert.equal(chatMounts.at(-1).variant, 'popup', 'Ask supplier opens the chat window over the product page');
assert.equal(chatMounts.at(-1).product.id, 'p1', 'The product card is attached to the chat');
assert.equal(paths.length, 1, 'Opening the chat does not navigate away');
params = new URLSearchParams('ask=1');
await mount();
assert.equal(quick().open, true, 'Deep-linked ask resumes at authentication first');
assert.equal(question().open, false);
await mount('buyer@example.com');
assert.equal(question().open, true, 'OAuth/email-link ask return opens the right product question');
params = new URLSearchParams();
await mount(null, 'vi');
await click(document.querySelector('#quote'));
assert.match(quick().textContent, /Đăng nhập \/ Tạo tài khoản/);
await act(async () => root.unmount());
assert.deepEqual(errors, [], 'No unhandled DOM interaction errors');
console.log('✅ Buyer enquiry entry: first-click gate, compact EN/VI modal, Google context, cancel/no-navigation, strict-mode cleanup, buyer bypass and ask deep-link continuation.');
