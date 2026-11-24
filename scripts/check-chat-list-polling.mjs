// node --experimental-strip-types --no-warnings scripts/check-chat-list-polling.mjs
// Danh sách cuộc trò chuyện ở trang Tin nhắn (người mua và nhà cung cấp) hỏi lại nhẹ: chỉ cuộc có
// tin mới mới trả đủ (?since=), cuộc khác chỉ trả chưa đọc / đã xem / online; tên bên kia được nhớ
// ở máy chủ thay vì tra lại mỗi 15 giây.
import { mediaMocks } from './lib/media-mocks.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
import * as core from '../lib/chat/core.ts';
import * as fileCore from '../lib/chat/attachments-core.ts';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
function load(file, mocks, extra = {}) {
  const out = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console, Date, Promise, URL, ...extra, require: (id) => {
    assert.ok((id in mocks || id in mediaMocks), `Unexpected ${id} in ${file}`); return id in mocks ? mocks[id] : mediaMocks[id];
  } });
  return module.exports;
}

/* ---------- 1. Máy chủ ---------- */
const route = read('app/api/chat/route.ts');
assert.match(route, /const since = chatAfterParam\(params\.get\("since"\)\)/, 'Chỉ nhận mốc ISO hợp lệ, sai thì tải đủ');
assert.match(route, /params\.get\("peek"\) === "1"[\s\S]*conversationListUpdate\(viewer\.store, rows, viewer\.side, since\)[\s\S]*partial: true[\s\S]*conversationViews\(/, 'peek vẫn chỉ đếm; since trả bản cập nhật');
assert.match(route, /touchPresence\(/);
assert.match(route, /scheduleChatNotifications\(/);

const calls = [];
const store = {
  getChatPresence: async (keys) => { calls.push('presence'); return Object.fromEntries(keys.map((k) => [k, '2026-11-21T09:59:00Z'])); },
  getSupplier: async (id) => { calls.push(`supplier:${id}`); return id === 'gone' ? null : { id, slug: `slug-${id}`, name: `Supplier ${id}`, status: id === 'draft' ? 'draft' : 'published' }; },
  getBuyerUserByEmail: async (email) => { calls.push(`account:${email}`); return email === 'acme@buyer.com' ? { company_name: 'Acme GmbH' } : null; },
  getBuyerByEmail: async (email) => { calls.push(`crm:${email}`); return null; },
};
const service = load('../lib/chat/service.ts', {
  './attachments': { attachmentsByMessage: async () => new Map(), readyAttachmentsFor: async () => [] }, './attachments-core': fileCore,
  'server-only': {}, '@/lib/public/product-catalog': { getPublicProductRecordsByIds: async () => [] },
  '@/lib/public/supplier-name': { supplierShortName: (s) => s.name }, '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  './core': core, './presence': load('../lib/chat/presence.ts', {}),
});
const row = (id, supplier, email, lastAt) => ({ id, supplier_id: supplier, buyer_email: email, product_name: 'Cashew W320', last_message_preview: `Preview ${id}`,
  last_message_at: lastAt, created_at: '2026-11-20T00:00:00Z', last_sender: 'supplier', supplier_last_read_at: '2026-11-21T09:30:00Z', buyer_last_read_at: null, escalated_at: null });
const rows = [row('c1', 's1', 'acme@buyer.com', '2026-11-21T09:50:00Z'), row('c2', 'draft', 'new@buyer.com', '2026-11-21T08:00:00Z'), row('c3', 'gone', 'acme@buyer.com', '2026-11-21T07:00:00Z')];
const lookups = () => calls.filter((c) => c !== 'presence').length;

const views = await service.conversationViews(store, rows, 'buyer');
assert.deepEqual(views.map((v) => [v.counterpart, v.counterpartHref]), [['Supplier s1', '/suppliers/slug-s1'], ['Supplier draft', null], ['Supplier', null]], 'Tên, link chỉ khi đã công bố');
assert.equal(views[0].unread, true);
const first = lookups();
await service.conversationViews(store, rows, 'buyer');
assert.equal(lookups(), first, 'Lượt hỏi lại dùng tên đã nhớ, không tra lại nhà cung cấp');
const buyerSide = await service.conversationViews(store, rows, 'supplier');
assert.deepEqual(buyerSide.map((v) => v.counterpart), ['Acme GmbH', 'Người mua', 'Acme GmbH'], 'Nhà cung cấp chỉ thấy tên công ty, không thấy email');
const second = lookups();
await service.conversationViews(store, rows, 'supplier');
assert.equal(lookups(), second, 'Tên công ty người mua cũng được nhớ');
service.forgetChatLabels();
await service.conversationViews(store, rows, 'buyer');
assert.ok(lookups() > second, 'Quên nhãn thì tra lại');

// Bản cập nhật: cuộc có tin mới hơn mốc trả đủ, cuộc khác chỉ phần đổi theo thời gian, giữ thứ tự.
calls.length = 0;
const update = await service.conversationListUpdate(store, rows, 'buyer', '2026-11-21T09:00:00Z');
assert.deepEqual(update.map((u) => u.id), ['c1', 'c2', 'c3']);
assert.equal(update[0].counterpart, 'Supplier s1');
assert.equal(update[0].preview, 'Preview c1');
for (const u of update.slice(1)) {
  assert.deepEqual(Object.keys(u).sort(), ['counterpartLastSeen', 'counterpartReadAt', 'id', 'lastMessageAt', 'unread', 'veximFollowingUp'], 'Dòng không có tin mới chỉ gửi phần đổi theo thời gian');
}
assert.equal(update[1].counterpartLastSeen, '2026-11-21T09:59:00Z', 'Online vẫn cập nhật mỗi lượt');
assert.equal(update[1].unread, true);
assert.equal(calls.filter((c) => c === 'presence').length, 1, 'Online đọc một lần cho cả danh sách');
assert.deepEqual(calls.filter((c) => c !== 'presence'), [], 'Dòng gọn không tra nhà cung cấp (nhãn đã nhớ)');

/* ---------- 2. Khung Tin nhắn trong trình duyệt giả ---------- */
const dom = new JSDOM('<div id="root"></div>', { url: 'https://www.veximtrade.com/buyer/account/messages', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'CustomEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true });
window.HTMLElement.prototype.scrollIntoView = function () {};
const { createRoot } = await import('react-dom/client');

const t0 = Date.parse('2026-11-21T10:00:00Z');
const at = (s) => new Date(t0 + s * 1000).toISOString();
const conv = (id, name, preview, s, extra = {}) => ({ id, counterpart: name, counterpartHref: null, productName: null, preview, lastMessageAt: at(s), unread: false, counterpartReadAt: null, counterpartLastSeen: null, veximFollowingUp: false, ...extra });
const status = (id, s, extra = {}) => ({ id, lastMessageAt: at(s), unread: false, counterpartReadAt: null, counterpartLastSeen: null, veximFollowingUp: false, ...extra });
let listReply = { conversations: [conv('c1', 'Mekong Agri', 'Price please', 20), conv('c2', 'Saigon Pepper', 'Samples sent', -600, { unread: true })] };
const urls = [];
const reply = (body) => ({ ok: true, status: 200, json: async () => body });
const fetchMock = (url) => {
  urls.push(url);
  if (url.startsWith('/api/chat?')) {
    const since = new URL(url, 'https://x').searchParams.get('since');
    // Danh sách về sau lượt hỏi tin của cuộc đang mở (máy chủ tính chưa đọc trước lúc đánh dấu đã đọc).
    const body = since ? listReply : { conversations: fullList };
    return new Promise((resolve) => setTimeout(() => resolve(reply(body)), 20));
  }
  if (url.includes('after=')) return Promise.resolve(reply({ conversation: { id: 'c1', counterpartReadAt: null, counterpartLastSeen: null, productName: null, preview: 'x', lastMessageAt: at(20) }, messages: [], partial: true }));
  return Promise.resolve(reply({ conversation: conv('c1', 'Mekong Agri', 'Price please', 20), messages: [{ id: 'm1', mine: true, body: 'Price please', productName: null, product: null, createdAt: at(20) }] }));
};
let fullList = listReply.conversations;
const icon = () => null;
const { ChatWorkspace } = load('../components/chat/chat-workspace.tsx', {
  react: React, 'react/jsx-runtime': jsx,
  'next/link': { default: ({ children, ...p }) => React.createElement('a', p, children) },
  'lucide-react': new Proxy({}, { get: () => icon }),
  '@/components/brand/vexim-icons': { VeximPlatformSupportIcon: icon },
  '@/components/ui': { cx: (...v) => v.filter(Boolean).join(' ') },
  '@/components/chat/presence': { PRESENCE_LABELS: { en: {}, vi: {} }, PresenceDot: icon, PresenceLine: icon, DeliveryTicks: icon, deliveryStatus: () => 'sent' },
  '@/components/chat/chat-attachments': { ComposerFiles: icon, MessageFiles: icon, chatFileLabels: () => ({ hint: '', attach: '', waitUploads: '', attachmentGone: '', drop: '' }),
    useChatUploads: () => ({ drafts: [], notice: null, addFiles() {}, retry() {}, remove() {}, take: () => [], restore() {}, busy: false, readyCount: 0 }) },
  '@/lib/chat/attachments-core': fileCore,
}, { window, document, CustomEvent: dom.window.CustomEvent, fetch: fetchMock, Set, Map, Number, Math });
const unreadEvents = [];
window.addEventListener('vexim:chat-unread', (e) => unreadEvents.push(e.detail.unread));
const labels = { title: 'Messages', empty: '', emptyHint: '', pick: '', placeholder: 'Type', send: 'Send', back: 'Back', about: 'Product', unread: 'Unread', failed: 'Failed', rateLimited: '', tooLong: '', loadError: 'Load error', enterHint: '', notice: 'Notice', newMessages: 'New messages' };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(ChatWorkspace, { side: 'buyer', labels, locale: 'en-GB', initialId: 'c1' })));
await settle();
const items = () => [...document.querySelectorAll('aside li')].map((li) => li.textContent);
const listUrls = () => urls.filter((u) => u.startsWith('/api/chat?'));
assert.equal(items().length, 2);
assert.ok(!listUrls()[0].includes('since='), 'Lần đầu tải đủ danh sách');
assert.equal(unreadEvents.at(-1), 1);

async function poll() { await act(async () => document.dispatchEvent(new window.Event('visibilitychange'))); await settle(); await settle(); }

// Hỏi lại: mốc = tin mới nhất trong danh sách lùi 10 giây. Máy chủ trả c3 (cuộc mới) và c2 có tin
// mới đủ, c1 gọn (đang mở nên không bật lại chấm đỏ dù máy chủ tính trước lúc đánh dấu đã đọc).
listReply = { partial: true, conversations: [conv('c3', 'Hanoi Rice', 'New hello', 60, { unread: true }), conv('c2', 'Saigon Pepper', 'Price updated', 50, { unread: true }), status('c1', 20, { unread: true, counterpartLastSeen: at(55) })] };
await poll();
const sinceUrl = listUrls().at(-1);
assert.equal(new URL(sinceUrl, 'https://x').searchParams.get('since'), at(10), 'Mốc = tin mới nhất lùi 10 giây');
assert.equal(items().length, 3, 'Cuộc mới hiện ra');
assert.ok(items()[0].includes('Hanoi Rice') && items()[1].includes('Price updated'), 'Theo thứ tự máy chủ, câu xem trước mới');
assert.ok(items()[2].includes('Mekong Agri') && items()[2].includes('Price please'), 'Dòng gọn giữ tên và câu xem trước');
assert.equal(unreadEvents.at(-1), 2, 'Cuộc đang mở không bị tính chưa đọc');

// Một cuộc không còn trong danh sách thì bỏ; dòng gọn của cuộc chưa biết thì tải đủ lại.
listReply = { partial: true, conversations: [status('c3', 60), status('c1', 20), status('c9', 5)] };
fullList = [conv('c3', 'Hanoi Rice', 'New hello', 60), conv('c1', 'Mekong Agri', 'Price please', 20), conv('c9', 'Dak Lak Coffee', 'Older thread', 5)];
await poll();
assert.ok(listUrls().at(-2).includes('since=') && !listUrls().at(-1).includes('since='), 'Gặp cuộc chưa biết thì tải đủ');
assert.deepEqual(items().map((t) => t.match(/Hanoi Rice|Mekong Agri|Dak Lak Coffee|Saigon Pepper/)[0]), ['Hanoi Rice', 'Mekong Agri', 'Dak Lak Coffee']);
await act(async () => root.unmount());

const workspace = read('components/chat/chat-workspace.tsx');
assert.match(workspace, /const LIST_FULL_MS = 5 \* 60_000;/, 'Cứ 5 phút tải đủ một lần để tên đổi cũng hiện');
assert.match(workspace, /Date\.now\(\) - lastFullList\.current < LIST_FULL_MS/);

console.log('✅ Chat list polling: danh sách chỉ trả đủ cuộc có tin mới (?since=), dòng khác gọn, nhớ tên bên kia, cuộc đang mở không bật lại chưa đọc, cuộc lạ thì tải đủ.');
