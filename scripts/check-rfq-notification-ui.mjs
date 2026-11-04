import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
import { loadPortalDictionary } from './lib/portal-dictionary.mjs';
import { loadFormat } from './lib/i18n-format.mjs';
const dom = new JSDOM('<div id="root"></div>', { url: 'https://www.veximtrade.com/supplier/portal' });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'CustomEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const errors = [];
window.addEventListener('error', (e) => errors.push(e.error));
function load(file, mocks) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, window, document, CustomEvent, Date, Intl, fetch: async () => ({ ok: true, json: async () => response }), require(id) {
      if (id === 'react') return React;
      if (id === 'react/jsx-runtime') return jsx;
      assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id];
    } });
  return mod.exports;
}
let refreshes = 0;
const router = { refresh: () => { refreshes++; } };
const common = {
  'next/navigation': { usePathname: () => '/supplier/portal', useRouter: () => router },
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  'lucide-react': new Proxy({}, { get: () => () => null }),
};
const { SupplierSidebar } = load('components/supplier-sidebar.tsx', { ...common,
  '@/app/auth-actions': { logoutAction: async () => {} }, '@/components/ui': { cx: (...v) => v.filter(Boolean).join(' ') },
  '@/components/brand-logo': { Logo: () => null },
});
const { SupplierTopbar } = load('components/supplier-topbar.tsx', { ...common,
  '@/lib/i18n/format': loadFormat(), '@/components/locale-switch': { LocaleSwitch: () => null },
  '@/app/supplier/portal/notice-actions': { markAllSupplierNoticesReadAction: async () => ({}), markSupplierNoticeReadAction: async () => ({}) },
});
let response = { pendingRfqs: 1, rfqsKnown: true, readsKnown: true, unread: 1,
  items: [{ key: 'rfq:m1', title: 'New quote RFQ-1', at: new Date().toISOString(), read: false, kind: 'rfq', href: '/supplier/portal/rfqs' }] };
const messages = loadPortalDictionary().en.shell;
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(React.Fragment, null,
  React.createElement(SupplierSidebar, { supplierName: 'Supplier', email: 's@example.com', approved: true, messages, lang: 'en' }),
  React.createElement(SupplierTopbar, { messages, lang: 'en', intl: 'en-GB' }))));
const nav = () => document.querySelector('a[href="/supplier/portal/rfqs"]');
assert.match(nav().textContent, /1/);
const bell = document.querySelector('button[aria-expanded="false"][aria-label]');
assert.ok(bell && bell.textContent.includes('1'), 'Bell shows the unread invitation');
await act(async () => bell.dispatchEvent(new MouseEvent('click', { bubbles: true })));
assert.ok(document.body.textContent.includes('New quote RFQ-1'));
response = { ...response, pendingRfqs: 2, unread: 2 };
await act(async () => window.dispatchEvent(new Event('focus')));
assert.match(nav().textContent, /2/);
assert.equal(refreshes, 1, 'New invitations refresh dashboard server-rendered KPIs');
response = { ...response, rfqsKnown: false };
await act(async () => window.dispatchEvent(new Event('focus')));
assert.ok(nav().textContent.includes('!'), 'A failed RFQ read is unknown, not an empty queue');
assert.equal(nav().querySelector('[title]').title, messages.topbar.rfqsUnknown);
assert.deepEqual(errors, []);
await act(async () => root.unmount());
dom.window.close();
console.log('✅ Supplier notification UI: real bell, RFQ menu badge, focus polling, dashboard refresh and unavailable-data indication.');
