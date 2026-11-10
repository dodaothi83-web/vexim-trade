// The last quote/message must actually enter the viewport before its read marker advances.
// JSDOM has no layout, so we supply geometry and an IntersectionObserver whose callbacks we control.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://www.veximtrade.com/buyer/account' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Event', 'MutationObserver']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const observers = [];
class SimulatedIntersectionObserver {
  constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
  observe(target) { this.target = target; }
  disconnect() { this.disconnected = true; }
  trigger(isIntersecting) { this.callback([{ target: this.target, isIntersecting }]); }
}
globalThis.IntersectionObserver = SimulatedIntersectionObserver;
let onScreen = false;
let tabHidden = false;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => tabHidden ? 'hidden' : 'visible' });
Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
dom.window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { top: onScreen ? 200 : 2000, bottom: onScreen ? 201 : 2001, left: 0, right: 100, width: 100, height: 1 };
};
function load(path, mocks = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { module, exports: module.exports, window, document, IntersectionObserver: SimulatedIntersectionObserver,
    require(id) { if (id === 'react') return React; if (id === 'react/jsx-runtime') return jsx;
      if (id === 'lucide-react') return new Proxy({}, { get: () => () => null });
      assert.ok(id in mocks, `Unexpected ${id} in ${path}`); return mocks[id]; } });
  return module.exports;
}
const direct = load('components/rfq-thread.tsx');
const mediated = load('components/rfq-mediated-thread.tsx', { '@/components/rfq-thread': direct });
const root = createRoot(document.getElementById('root'));
const calls = [];
const mark = async (at) => { calls.push(at); };
const one = '2026-11-09T10:00:00.000123Z';
const two = '2026-11-09T11:00:00.000456Z';
await act(async () => root.render(React.createElement(direct.RfqReadTracker, { at: one, markRead: mark })));
assert.equal(calls.length, 0, 'Mount alone does not mark an event as read');
assert.equal(observers.length, 1);
assert.equal(observers[0].target.tagName, 'SPAN', 'Observe the marker placed after the latest content, not the whole section');
onScreen = true;
tabHidden = true;
await act(async () => observers[0].trigger(true));
assert.equal(calls.length, 0, 'Background tabs cannot mark a thread read');
tabHidden = false;
onScreen = false;
await act(async () => observers[0].trigger(true));
assert.equal(calls.length, 0, 'A stale observer callback must recheck actual viewport geometry');
onScreen = true;
await act(async () => document.dispatchEvent(new window.Event('visibilitychange')));
assert.deepEqual(calls, [one], 'Returning to a visible tab reads the visible endpoint even if IO does not refire');
await act(async () => observers[0].trigger(true));
assert.equal(calls.length, 1, 'Repeated intersection does not duplicate writes');
await act(async () => root.render(React.createElement(direct.RfqReadTracker, { at: two, markRead: mark })));
onScreen = false;
await act(async () => observers.at(-1).trigger(true));
assert.equal(calls.length, 1, 'New content under the fold stays unread');
onScreen = true;
await act(async () => observers.at(-1).trigger(true));
assert.deepEqual(calls, [one, two], 'Only the displayed timestamp advances');

// Multiple Vexim desks on one CRM page: seeing one header does not read every desk.
const staffCalls = [];
const desk = (matchId, at) => React.createElement(mediated.RfqMediatedThread, {
  rfqId: 'rfq-1', matchId, side: 'staff', messages: [{ id: `msg-${matchId}`, sender: 'supplier', body: `Unread ${matchId}`, created_at: at }],
  lastVisibleAt: at, canPost: false, locale: 'en', sendAction: async () => ({}),
  markRead: async (value) => { staffCalls.push([matchId, value]); },
});
onScreen = false;
const start = observers.length;
await act(async () => root.render(React.createElement('div', null, desk('supplier-1', one), desk('supplier-2', two))));
const desks = observers.slice(start);
assert.equal(desks.length, 2);
for (const observer of desks) {
  assert.equal(observer.target.previousElementSibling?.tagName, 'OL', 'Marker must follow the final visible message');
  assert.notEqual(observer.target, observer.target.closest('section'));
}
assert.equal(staffCalls.length, 0);
onScreen = true;
await act(async () => desks[0].trigger(true));
assert.deepEqual(staffCalls, [['supplier-1', one]], 'Only the opened desk is read');
await act(async () => desks[1].trigger(true));
assert.deepEqual(staffCalls, [['supplier-1', one], ['supplier-2', two]]);

// No IntersectionObserver on older browsers: use viewport geometry on scroll, not mount.
await act(async () => root.unmount());
const legacyRoot = createRoot(document.getElementById('root'));
const legacyCalls = [];
// The module was loaded with an IO implementation; the fallback is tested by an
// isolated load where IntersectionObserver is undefined, not by mutating the global.
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('components/rfq-thread.tsx'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, { module: mod, exports: mod.exports, window, document, IntersectionObserver: undefined,
  require(id) { if (id === 'react') return React; if (id === 'react/jsx-runtime') return jsx;
    if (id === 'lucide-react') return new Proxy({}, { get: () => () => null }); throw new Error(id); } });
onScreen = false;
await act(async () => legacyRoot.render(React.createElement(mod.exports.RfqReadTracker, { at: one, markRead: async (at) => { legacyCalls.push(at); } })));
assert.deepEqual(legacyCalls, []);
onScreen = true;
await act(async () => window.dispatchEvent(new window.Event('scroll')));
assert.deepEqual(legacyCalls, [one], 'Fallback advances after the last content actually enters view');
await act(async () => legacyRoot.unmount());

const buyerPage = read('app/(public)/buyer/account/requests/[id]/offers/[matchId]/page.tsx');
assert.match(buyerPage, /<RfqReadTracker at=\{quote\.published_at\}/, 'Quote is read only when its own content is visible');
assert.match(buyerPage, /lastVisibleAt=\{messages\.at\(-1\)\?\.created_at \?\? null\}/, 'Old messages cannot mark an unseen newer quote read');
assert.doesNotMatch(buyerPage, /<RfqReadTracker at=\{lastVisibleAt\}/);
console.log('✅ RFQ viewport reads: visible latest message/quote only, hidden tabs, multiple CRM desks and no-IO scroll fallback.');
