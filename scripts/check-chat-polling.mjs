// node --experimental-strip-types --no-warnings scripts/check-chat-polling.mjs
// Khung chat hỏi lại nhẹ: chỉ tải tin mới (?after=), bản gọn không tra lại tên bên kia, huy hiệu
// chỉ đếm (?peek=1), không hiện trùng tin đang gửi, không giật cuộn khi người đọc đang xem tin cũ.
import { mediaMocks } from './lib/media-mocks.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as translateCore from '../lib/chat/translate-core.ts';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
import * as core from '../lib/chat/core.ts';
import * as fileCore from '../lib/chat/attachments-core.ts';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

/* ---------- 1. Mốc ?after= ---------- */
assert.equal(core.chatAfterParam('2026-11-21T10:00:00.123456+00:00'), '2026-11-21T10:00:00.123456+00:00', 'Mốc dạng Postgres');
assert.equal(core.chatAfterParam('2026-11-21T10:00:00.123Z'), '2026-11-21T10:00:00.123Z', 'Mốc dạng toISOString');
for (const bad of [null, '', 'yesterday', '2026-11-21', '2026-11-21T10:00:00', "2026-11-21T10:00:00Z' or 1=1", `2026-11-21T10:00:00.${'1'.repeat(40)}Z`, '2026-13-45T99:99:99Z']) {
  assert.equal(core.chatAfterParam(bad), undefined, `Bỏ mốc không hợp lệ: ${bad}`);
}

/* ---------- 2. Máy chủ ---------- */
const route = read('app/api/chat/[id]/route.ts');
assert.match(route, /listChatMessages\(conversation\.id, 500, after\)/, 'Hỏi lại chỉ đọc tin mới hơn mốc');
assert.match(route, /after \? conversationStatus\(/, 'Hỏi lại dùng bản gọn, không tra lại tên bên kia');
assert.match(route, /partial: Boolean\(after\)/);
const list = read('app/api/chat/route.ts');
assert.match(list, /params\.get\("peek"\) === "1"[\s\S]*hasUnread\(c, viewer\.side\)[\s\S]*conversationViews\(/, 'peek trả số chưa đọc trước khi dựng danh sách đầy đủ');
assert.match(list, /touchPresence\(/, 'peek vẫn ghi online');
assert.match(read('lib/db/supabase.ts'), /if \(after\) query = query\.gt\("created_at", after\)/);
assert.match(read('lib/db/local.ts'), /\(!after \|\| m\.created_at > after\)/);
assert.match(read('components/marketplace-rail.tsx'), /\/api\/chat\?side=buyer&peek=1/, 'Huy hiệu thanh công cụ chỉ đếm');
assert.match(read('components/supplier-sidebar.tsx'), /\/api\/chat\?side=supplier&peek=1/, 'Huy hiệu menu cổng chỉ đếm');
for (const f of ['components/marketplace-rail.tsx', 'components/supplier-sidebar.tsx']) assert.match(read(f), /addEventListener\("vexim:chat-unread"/, `${f}: cập nhật huy hiệu khi khung chat đọc xong`);

// conversationStatus: không gọi getSupplier / tên công ty người mua, chỉ đọc online.
function load(file, mocks, extra = {}) {
  const out = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console, Date, Promise, URL, ...extra, require: (id) => {
    assert.ok((id in mocks || id in mediaMocks), `Unexpected ${id} in ${file}`); return id in mocks ? mocks[id] : mediaMocks[id];
  } });
  return module.exports;
}
const calls = [];
const store = new Proxy({ getChatPresence: async (keys) => { calls.push('presence'); return { [keys[0]]: '2026-11-21T09:59:00Z' }; } }, {
  get: (target, key) => target[key] ?? (async () => { calls.push(String(key)); return null; }),
});
const service = load('../lib/chat/service.ts', {
  './attachments': { attachmentsByMessage: async () => new Map(), readyAttachmentsFor: async () => [] }, './attachments-core': fileCore,
  'server-only': {}, '@/lib/public/product-catalog': { getPublicProductRecordsByIds: async () => [] },
  '@/lib/public/supplier-name': { supplierShortName: (s) => s.name }, '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  './core': core, './translate': { translateChatMessage: async () => null }, './translate-core': translateCore, './presence': load('../lib/chat/presence.ts', {}),
});
const status = await service.conversationStatus(store, { id: 'c1', supplier_id: 's1', buyer_email: 'b@x.com', product_name: 'Cashew', last_message_preview: 'Hi',
  last_message_at: '2026-11-21T09:00:00Z', created_at: '2026-11-20T00:00:00Z', last_sender: 'supplier', supplier_last_read_at: '2026-11-21T09:30:00Z', buyer_last_read_at: null }, 'buyer');
assert.deepEqual([...calls], ['presence'], 'Bản gọn chỉ đọc trạng thái online');
assert.equal(status.counterpartReadAt, '2026-11-21T09:30:00Z');
assert.equal(status.counterpartLastSeen, '2026-11-21T09:59:00Z');
assert.equal('counterpart' in status, false, 'Không gửi lại tên bên kia');

/* ---------- 3. Khung chat trong trình duyệt giả ---------- */
const dom = new JSDOM('<div id="root"></div>', { url: 'https://www.veximtrade.com/buyer/account/messages', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'CustomEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true });
window.HTMLElement.prototype.scrollIntoView = function () { scrolls += 1; };
let scrolls = 0;
const { createRoot } = await import('react-dom/client');

const t0 = Date.parse('2026-11-21T10:00:00Z');
const at = (s) => new Date(t0 + s * 1000).toISOString();
const msg = (id, mine, body, s) => ({ id, mine, body, productName: null, product: null, createdAt: at(s) });
const full = { conversation: { id: 'c1', counterpart: 'Mekong Agri', counterpartHref: '/suppliers/mekong', productName: null, preview: 'b', lastMessageAt: at(20), unread: false, counterpartReadAt: null, counterpartLastSeen: null },
  messages: [msg('m1', false, 'Hello buyer', 0), msg('m2', true, 'Price please', 20)] };
let partial = [];
let postResolve = null;
const urls = [];
const reply = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
const fetchMock = (url, init) => {
  urls.push(url);
  if (init?.method === 'POST') return new Promise((resolve) => { postResolve = (m) => resolve(reply({ message: m }, 201)); });
  if (url.startsWith('/api/chat?')) return Promise.resolve(reply({ conversations: [{ ...full.conversation, unread: true }] }));
  if (url.includes('after=')) return Promise.resolve(reply({ conversation: { id: 'c1', counterpartReadAt: at(25), counterpartLastSeen: null, productName: null, preview: 'x', lastMessageAt: at(30) }, messages: partial, partial: true }));
  return Promise.resolve(reply(full));
};
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
}, { window, document, CustomEvent: dom.window.CustomEvent, fetch: fetchMock, Set, Number });
const unreadEvents = [];
window.addEventListener('vexim:chat-unread', (e) => unreadEvents.push(e.detail));
const labels = { title: 'Messages', empty: '', emptyHint: '', pick: '', placeholder: 'Type', send: 'Send', back: 'Back', about: 'Product', unread: 'Unread', failed: 'Failed', rateLimited: '', tooLong: '', loadError: 'Load error', enterHint: '', notice: 'Notice', newMessages: 'New messages' };
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(ChatWorkspace, { side: 'buyer', labels, locale: 'en-GB', initialId: 'c1' })));
await act(async () => {});
const bubbles = (text) => [...document.querySelectorAll('[role="log"] div')].filter((d) => d.children.length === 0 && d.textContent === text).length;
assert.equal(bubbles('Price please'), 1, 'Lần đầu tải đủ cuộc');
assert.ok(!urls.some((u) => u.includes('after=')), 'Lần đầu không gửi mốc');
assert.deepEqual({ ...unreadEvents.at(-1) }, { side: 'buyer', unread: 0 }, 'Đọc xong cuộc thì báo huy hiệu về 0');

async function poll() { await act(async () => document.dispatchEvent(new window.Event('visibilitychange'))); await act(async () => {}); }

// Hỏi lại: chỉ xin tin mới hơn tin cuối (lùi 10 giây), tin trùng bỏ theo id, giữ tên bên kia.
partial = [msg('m2', true, 'Price please', 20), msg('m3', false, 'USD 6.2/kg', 30)];
await poll();
const afterUrl = urls.findLast((u) => u.includes('after='));
assert.equal(new URL(afterUrl, 'https://x').searchParams.get('after'), at(10), 'Mốc = tin cuối lùi 10 giây');
assert.equal(bubbles('USD 6.2/kg'), 1, 'Tin mới được nối vào');
assert.equal(bubbles('Price please'), 1, 'Tin trùng trong khoảng lùi không hiện hai lần');
assert.ok(document.body.textContent.includes('Mekong Agri'), 'Bản gọn không làm mất tên bên kia');

// Người đọc kéo lên xem tin cũ: tin mới không giật cuộn, hiện nút "Tin nhắn mới".
const log = document.querySelector('[role="log"]');
Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true });
Object.defineProperty(log, 'clientHeight', { value: 300, configurable: true });
log.scrollTop = 0;
await act(async () => log.dispatchEvent(new window.Event('scroll')));
const before = scrolls;
partial = [msg('m4', false, 'Samples ready', 40)];
await poll();
assert.equal(bubbles('Samples ready'), 1);
assert.equal(scrolls, before, 'Không cuộn khi người đọc đang ở trên');
const pill = () => document.querySelector('[data-testid="chat-new-messages"]');
assert.ok(pill() && pill().textContent.includes('New messages'));
await act(async () => pill().dispatchEvent(new MouseEvent('click', { bubbles: true })));
assert.equal(pill(), null, 'Bấm nút thì xuống tin mới nhất');
assert.equal(scrolls, before + 1);

// Gửi tin: lượt hỏi lại mang tin đó về trước lời đáp POST thì vẫn chỉ hiện một lần.
const box = document.querySelector('textarea');
await act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(box, 'Book 1 container');
  box.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await act(async () => document.querySelector('button[type="submit"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
assert.equal(bubbles('Book 1 container'), 1, 'Tin đang gửi hiện ngay');
const saved = msg('m5', true, 'Book 1 container', 50);
partial = [saved];
await poll();
assert.equal(bubbles('Book 1 container'), 1, 'Lượt hỏi lại thay bản đang gửi, không nhân đôi');
await act(async () => postResolve(saved));
await act(async () => {});
assert.equal(bubbles('Book 1 container'), 1, 'Lời đáp POST về sau cũng không nhân đôi');
await act(async () => root.unmount());

/* ---------- 4. Chat với Vexim cũng không nhân đôi tin đang gửi ---------- */
const support = read('components/chat/support-chat.tsx');
assert.match(support, /pending\.find\(\(p\) => p\.body === m\.body && Date\.parse\(m\.createdAt\) >= Date\.parse\(p\.createdAt\) - 60_000\)/);
assert.match(support, /some\(\(x\) => x\.id === data\.message\.id\)/);
assert.match(support, /addEventListener\("visibilitychange", tick\)/, 'Quay lại tab thì hỏi ngay');

console.log('✅ Chat polling: chỉ tải tin mới (?after=), bản gọn không tra tên, huy hiệu chỉ đếm, không trùng tin đang gửi, không giật cuộn khi đọc tin cũ.');
