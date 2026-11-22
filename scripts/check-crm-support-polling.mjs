// node --experimental-strip-types --no-warnings scripts/check-crm-support-polling.mjs
// Hộp "Chat với người mua" trong CRM hỏi lại nhẹ: chỉ tải tin mới (?after=), bản gọn không tra lại
// người mua, nhớ nhãn người mua / nhân viên một lúc, không trùng tin đang gửi, không giật cuộn.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
import * as core from '../lib/chat/core.ts';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
function load(file, mocks, extra = {}) {
  const out = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console, Date, Promise, process, URL, ...extra, require: (id) => {
    assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id];
  } });
  return module.exports;
}

/* ---------- 1. Máy chủ ---------- */
const route = read('app/api/crm/support/[id]/route.ts');
assert.match(route, /chatAfterParam\(/, 'Chỉ nhận mốc ISO hợp lệ');
assert.match(route, /listSupportMessages\(id, 500, after\)/, 'Hỏi lại chỉ đọc tin mới hơn mốc');
assert.match(route, /after \? supportConversationStatus\(/, 'Hỏi lại dùng bản gọn');
assert.match(route, /canReply \? markSupportRead\(/, 'Người chỉ xem không làm mất dấu chưa đọc');
assert.match(route, /requirePermission\("support\.view"\)/);
assert.match(read('lib/db/supabase.ts'), /async listSupportMessages\(conversationId, limit = 500, after\)[\s\S]{0,200}query\.gt\("created_at", after\)/);
assert.match(read('lib/db/local.ts'), /support_messages[^\n]*\(!after \|\| m\.created_at > after\)/);

const calls = [];
const store = {
  getChatPresence: async (keys) => { calls.push('presence'); return Object.fromEntries(keys.map((k) => [k, '2026-11-22T06:00:00Z'])); },
  getUser: async (id) => { calls.push(`user:${id}`); return { id, name: 'Nguyễn Văn Dung', email: 'dung@veximtrade.com' }; },
  getBuyerUserByEmail: async (email) => { calls.push(`account:${email}`); return email === 'new@buyer.com' ? null : { company_name: 'Acme GmbH' }; },
  getBuyerByEmail: async (email) => { calls.push(`crm:${email}`); return email === 'new@buyer.com' ? null : { id: 'b-1', company: 'Acme GmbH' }; },
};
const support = load('../lib/chat/support.ts', {
  'server-only': {}, '@/lib/config': { MAIL_DOMAIN: 'veximtrade.com' }, './core': core,
  './presence': load('../lib/chat/presence.ts', {}), './support-core': load('../lib/chat/support-core.ts', { './core': core }),
});
const row = (id, email, assigned = 'u-dung') => ({ id, buyer_email: email, assigned_to: assigned, last_message_at: '2026-11-22T05:00:00Z', last_message_preview: 'Hi',
  last_sender: 'buyer', buyer_last_read_at: '2026-11-22T05:00:00Z', staff_last_read_at: null, created_at: '2026-11-21T00:00:00Z' });
const rows = [row('c1', 'buyer@acme.de'), row('c2', 'new@buyer.com', null)];
const first = await support.supportConversationViews(store, rows);
assert.equal(first[0].buyerLabel, 'Acme GmbH');
assert.equal(first[0].buyerCrmId, 'b-1');
assert.equal(first[0].assignedName, 'Nguyễn Văn Dung');
assert.equal(first[1].buyerLabel, 'new@buyer.com', 'Chưa có công ty thì hiện email');
const lookups = () => calls.filter((c) => !c.startsWith('presence')).length;
const afterFirst = lookups();
await support.supportConversationViews(store, rows);
assert.equal(lookups(), afterFirst, 'Lượt hỏi lại danh sách dùng nhãn đã nhớ, không tra lại người mua / nhân viên');
assert.ok(calls.filter((c) => c === 'presence').length >= 2, 'Trạng thái online vẫn đọc mỗi lượt');
support.forgetSupportLabels();
await support.supportConversationViews(store, rows);
assert.ok(lookups() > afterFirst, 'Quên nhãn thì tra lại');
// Bản gọn: chỉ online và tên phụ trách (đã nhớ), không tra người mua.
calls.length = 0;
const status = await support.supportConversationStatus(store, row('c1', 'buyer@acme.de'));
assert.deepEqual([...calls], ['presence'], 'Bản gọn không tra lại người mua');
assert.equal(status.assignedName, 'Nguyễn Văn Dung');
assert.equal(status.buyerLastSeen, '2026-11-22T06:00:00Z');
assert.equal('buyerLabel' in status, false);

/* ---------- 2. Hộp chat trong trình duyệt giả ---------- */
const dom = new JSDOM('<div id="root"></div>', { url: 'https://www.veximtrade.com/crm/support', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'CustomEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let scrolls = 0;
window.HTMLElement.prototype.scrollIntoView = function () { scrolls += 1; };
const { createRoot } = await import('react-dom/client');

const t0 = Date.parse('2026-11-22T06:00:00Z');
const at = (s) => new Date(t0 + s * 1000).toISOString();
const msg = (id, mine, body, s) => ({ id, mine, body, author: mine ? 'Nguyễn Văn Dung' : null, pagePath: null, createdAt: at(s) });
const conversation = { id: 'c1', buyerEmail: 'buyer@acme.de', buyerLabel: 'Acme GmbH', buyerCompany: 'Acme GmbH', buyerCrmId: 'b-1', assignedTo: null, assignedName: null,
  preview: 'b', lastMessageAt: at(20), lastSender: 'buyer', unread: false, buyerReadAt: null, buyerLastSeen: null };
let partial = [];
let assigned = { assignedTo: null, assignedName: null };
let postResolve = null;
const urls = [];
const reply = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
const fetchMock = (url, init) => {
  urls.push([init?.method ?? 'GET', url, init?.body ?? null]);
  if (init?.method === 'POST') {
    const payload = JSON.parse(init.body);
    if (payload.action === 'claim') { assigned = { assignedTo: 'u-dung', assignedName: 'Nguyễn Văn Dung' }; return Promise.resolve(reply({ ok: true })); }
    return new Promise((resolve) => { postResolve = (m) => resolve(reply({ message: m }, 201)); });
  }
  if (url === '/api/crm/support') return Promise.resolve(reply({ conversations: [{ ...conversation, unread: true }], me: 'u-dung' }));
  if (url.includes('after=')) return Promise.resolve(reply({ conversation: { id: 'c1', ...assigned, preview: 'x', lastMessageAt: at(30), lastSender: 'buyer', buyerReadAt: at(25), buyerLastSeen: null }, messages: partial, canReply: true, partial: true }));
  return Promise.resolve(reply({ conversation, messages: [msg('m1', false, 'Need cashew W320', 0), msg('m2', true, 'Sure, how many tons?', 20)], canReply: true }));
};
const icon = () => null;
const { SupportInbox } = load('../components/crm/support-inbox.tsx', {
  react: React, 'react/jsx-runtime': jsx,
  'next/link': { default: ({ children, ...p }) => React.createElement('a', p, children) },
  'lucide-react': new Proxy({}, { get: () => icon }),
  '@/components/ui': { cx: (...v) => v.filter(Boolean).join(' ') },
  '@/components/chat/presence': { PRESENCE_LABELS: { en: {}, vi: {} }, PresenceDot: icon, PresenceLine: icon, DeliveryTicks: icon, deliveryStatus: () => 'sent' },
}, { window, document, fetch: fetchMock, Set, Number });
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(SupportInbox, { initialId: 'c1' })));
await act(async () => {});
const bubbles = (text) => [...document.querySelectorAll('[role="log"] div')].filter((d) => d.children.length === 0 && d.textContent === text).length;
const threadGets = () => urls.filter(([m, u]) => m === 'GET' && u.startsWith('/api/crm/support/c1'));
assert.equal(bubbles('Sure, how many tons?'), 1, 'Lần đầu tải đủ cuộc');
assert.ok(!threadGets().some(([, u]) => u.includes('after=')));

async function poll() { await act(async () => document.dispatchEvent(new window.Event('visibilitychange'))); await act(async () => {}); }
partial = [msg('m2', true, 'Sure, how many tons?', 20), msg('m3', false, '2 containers', 30)];
await poll();
assert.equal(new URL(threadGets().at(-1)[1], 'https://x').searchParams.get('after'), at(10), 'Mốc = tin cuối lùi 10 giây');
assert.equal(bubbles('2 containers'), 1, 'Tin mới được nối vào');
assert.equal(bubbles('Sure, how many tons?'), 1, 'Tin trùng trong khoảng lùi không hiện hai lần');
assert.ok(document.body.textContent.includes('Acme GmbH') && document.body.textContent.includes('Hồ sơ người mua'), 'Bản gọn không làm mất tên và link hồ sơ người mua');

// Nhận xử lý: hỏi gọn, tên phụ trách hiện từ bản gọn; không tải lại cả cuộc.
const fullBefore = threadGets().filter(([, u]) => !u.includes('after=')).length;
const claim = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Nhận xử lý'));
await act(async () => claim.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await act(async () => {});
assert.ok(document.body.textContent.includes('Phụ trách: Nguyễn Văn Dung'));
assert.equal(threadGets().filter(([, u]) => !u.includes('after=')).length, fullBefore, 'Nhận xử lý không tải lại cả cuộc');

// Đang kéo lên đọc tin cũ: tin mới không giật cuộn, hiện nút "Tin nhắn mới".
const log = document.querySelector('[role="log"]');
Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true });
Object.defineProperty(log, 'clientHeight', { value: 300, configurable: true });
log.scrollTop = 0;
await act(async () => log.dispatchEvent(new window.Event('scroll')));
const before = scrolls;
partial = [msg('m4', false, 'Price FOB?', 40)];
await poll();
assert.equal(bubbles('Price FOB?'), 1);
assert.equal(scrolls, before, 'Không cuộn khi người đọc đang ở trên');
const pill = () => document.querySelector('[data-testid="crm-support-new-messages"]');
assert.ok(pill()?.textContent.includes('Tin nhắn mới'));
await act(async () => pill().dispatchEvent(new MouseEvent('click', { bubbles: true })));
assert.equal(pill(), null);

// Gửi: lượt hỏi lại mang tin về trước lời đáp gửi tin thì vẫn chỉ một bản; không tải lại cả cuộc.
const box = document.querySelector('#crm-support-reply');
await act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(box, 'USD 6.2/kg FOB');
  box.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await act(async () => document.querySelector('button[type="submit"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
assert.equal(bubbles('USD 6.2/kg FOB'), 1, 'Tin đang gửi hiện ngay');
// Máy chủ lưu tin gần như cùng lúc với lúc bấm gửi.
const saved = { ...msg('m5', true, 'USD 6.2/kg FOB', 50), createdAt: new Date().toISOString() };
partial = [saved];
await poll();
assert.equal(bubbles('USD 6.2/kg FOB'), 1, 'Lượt hỏi lại thay bản đang gửi');
await act(async () => postResolve(saved));
await act(async () => {}); await act(async () => {});
assert.equal(bubbles('USD 6.2/kg FOB'), 1, 'Lời đáp gửi tin về sau không nhân đôi');
assert.equal(threadGets().filter(([, u]) => !u.includes('after=')).length, fullBefore, 'Gửi tin không tải lại cả cuộc');
await act(async () => root.unmount());

console.log('✅ CRM support polling: chỉ tải tin mới (?after=), bản gọn không tra người mua, nhớ nhãn, nhận xử lý và gửi tin không tải lại cả cuộc, không trùng, không giật cuộn.');
