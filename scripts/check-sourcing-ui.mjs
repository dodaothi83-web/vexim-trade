import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
import crypto from 'node:crypto';
const dom = new JSDOM('<div id="root"></div>', { url: 'https://www.veximtrade.com/products/nuts/p1?lang=vi' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Event', 'MouseEvent', 'MutationObserver', 'FormData']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
const { createRoot } = await import('react-dom/client');
let authenticated = false, continuation, gateNext, force, sent = [], fail = true;
const mocks = {
  react: React, 'react/jsx-runtime': jsx,
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/buyer-enquiry-auth': { useBuyerEnquiryAuth: () => ({ requireBuyer(next, resume, forced) { gateNext = next; force = forced; if (authenticated && !forced) resume(); else continuation = resume; } }) },
  '@/components/form-challenge': { FormChallenge: ({ onChange }) => { React.useEffect(() => { onChange('ok'); }, []); return null; } },
  '@/lib/sourcing/files': { SOURCING_MAX_FILES: 3, SOURCING_MAX_FILE_BYTES: 2 * 1024 * 1024 },
  '@/lib/browser/dialog-scroll-lock': { lockDialogScroll: () => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; } },
};
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/sourcing-composer.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  exports: mod.exports, module: mod, window, document, console, crypto, FormData: dom.window.FormData,
  fetch: async (url, options) => { sent.push({ url, options }); return fail ? { ok: false, status: 503, json: async () => ({ error: 'Try again' }) } : { ok: true, status: 201, json: async () => ({ id: 'saved-request' }) }; },
  require(id) { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id]; },
});
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(React.StrictMode, {}, React.createElement(mod.exports.SourcingComposerTrigger, { isVi: true }))));
const trigger = document.querySelector('button');
await act(async () => trigger.click());
assert.equal(document.querySelector('textarea'), null, 'No form until login completes');
assert.equal(gateNext, '/products/nuts/p1?lang=vi'); assert.equal(sent.length, 0);
authenticated = true; await act(async () => continuation());
let dialog = document.querySelector('dialog'); assert.ok(dialog.hasAttribute('open'));
assert.match(dialog.className, /bottom-0 right-0/); assert.match(dialog.className, /sm:bottom-5 sm:right-5/);
assert.equal(document.body.style.overflow, 'hidden');
assert.equal(document.querySelectorAll('input[type=email]').length, 0, 'Do not ask for identity again');
const textarea = document.querySelector('textarea');
await act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Rice');
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
assert.equal(document.querySelector('button[type=submit]').disabled, false, 'Short nonempty requirements allowed');
const fileInput = document.querySelector('input[type=file]');
const attached = new dom.window.File(['%PDF-1.7'], 'requirements.pdf', { type: 'application/pdf' });
Object.defineProperty(fileInput, 'files', { configurable: true, value: [attached] });
await act(async () => fileInput.dispatchEvent(new dom.window.Event('change', { bubbles: true })));
assert.match(dialog.textContent, /requirements\.pdf/);
// Native file-picker cancellation can reach React's ancestor onCancel handler.
await act(async () => fileInput.dispatchEvent(new dom.window.Event('cancel', { bubbles: true })));
assert.equal(document.querySelector('dialog'), dialog, 'Cancelling the file picker must not unmount the composer');
assert.ok(dialog.hasAttribute('open'), 'Composer remains open after cancelling file selection');
assert.equal(document.querySelector('textarea').value, 'Rice', 'File picker cancellation preserves the draft');
assert.equal(document.body.style.overflow, 'hidden', 'File picker cancellation keeps the modal scroll lock');
assert.match(dialog.textContent, /requirements\.pdf/, 'Existing attachments survive picker cancellation');
Object.defineProperty(fileInput, 'files', { configurable: true, value: [] });
await act(async () => fileInput.dispatchEvent(new dom.window.Event('change', { bubbles: true })));
assert.equal(document.querySelector('textarea').value, 'Rice', 'Empty file selection does not clear the draft');

await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
assert.equal(sent[0].url, '/api/buyer/sourcing'); assert.equal(sent[0].options.body.get('content'), 'Rice');
assert.equal(document.querySelector('textarea').value, 'Rice', 'Failure retains draft');
assert.match(document.querySelector('[role=alert]').textContent, /Try again/);
fail = false;
await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
assert.equal(sent[0].options.body.get('submission_key'), sent[1].options.body.get('submission_key'), 'Retry keeps idempotency key');
assert.equal(document.querySelector('dialog'), null, 'Successful delivery automatically closes the composer');
assert.equal(document.body.style.overflow, '', 'Successful delivery unlocks page scroll');
assert.equal(document.activeElement, trigger, 'Successful delivery returns focus to the trigger');
const notice = document.querySelector('[role=status]');
assert.match(notice.textContent, /Đã gửi yêu cầu tìm nguồn/);
assert.match(notice.querySelector('a').getAttribute('href'), /buyer\/account\/sourcing\/saved-request/);
await act(async () => trigger.click());
dialog = document.querySelector('dialog');
assert.equal(document.querySelector('textarea').value, '', 'Reopening after success gives a fresh composer');
assert.equal(document.querySelectorAll('input[type=file]')[0].files.length, 0, 'Successful send clears attachments');
assert.equal(document.querySelector('[role=status]'), null, 'Reopening clears the previous success notice');
await act(async () => dialog.dispatchEvent(new dom.window.Event('cancel', { bubbles: false, cancelable: true })));
assert.equal(document.querySelector('dialog'), null, 'Genuine dialog Escape cancellation still closes the composer');
assert.equal(document.body.style.overflow, '');
await act(async () => root.unmount());
console.log('Sourcing composer real React checks passed: login first, bottom-right, short content, retry, history, close/scroll.');
