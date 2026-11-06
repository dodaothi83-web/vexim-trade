// node --experimental-strip-types --no-warnings scripts/check-price-revision-notify.mjs
// Nhà cung cấp cập nhật giá phải báo Vexim: email cho Quản trị và Trưởng kiểm duyệt, và huy hiệu
// cùng chuông CRM đếm cả giá/tên chờ rà soát (trước đây chỉ đếm sản phẩm chờ duyệt nội dung).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const sent = [];
const users = [
  { is_active: true, role: 'admin', email: 'Admin@Vexim.vn' },
  { is_active: true, role: 'reviewer', email: 'review@vexim.vn' },
  { is_active: true, role: 'sale', email: 'sale@vexim.vn' },
  { is_active: false, role: 'reviewer', email: 'old@vexim.vn' },
];
const out = ts.transpileModule(fs.readFileSync(new URL('../lib/supplier-portal/notify.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
const mocks = {
  'server-only': {}, '@/lib/config': { SERVICE_FROM_ADDRESS: 'Vexim <service@veximtrade.com>' },
  '@/lib/db': { getStore: () => ({ listUsers: async () => users }) },
  '@/lib/email/send': { transport: async (m) => { sent.push(m); return { ok: true, status: 'sent' }; } },
  '@/lib/email/templates': { escapeHtml: (s) => String(s).replaceAll('<', '&lt;'), wrapPlainEmail: ({ body }) => body },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
};
vm.runInNewContext(out, { module: mod, exports: mod.exports, console: { ...console, error() {} }, process, URL, require: (id) => { assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id]; } });
const status = await mod.exports.notifyStaffPriceRevision({ name: 'Tinimex <b>' }, { id: 'p-1', name: 'Cashew W180\nnew' });
assert.equal(status, 'sent');
assert.equal(JSON.stringify([...sent[0].to].sort()), JSON.stringify(['admin@vexim.vn', 'review@vexim.vn']), 'Chỉ Quản trị và Trưởng kiểm duyệt đang hoạt động');
assert.match(sent[0].subject, /^Giá mới chờ rà soát: Cashew W180 new$/);
assert.match(sent[0].html, /\/crm\/products\/quantity-review\?product_id=p-1/);
assert.match(sent[0].html, /Tinimex &lt;b>/, 'Tên được thoát HTML');

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const action = read('app/supplier/portal/quantity-revision-actions.ts');
assert.ok(action.indexOf('notifyStaffPriceRevision(') > action.indexOf('submit_quantity_price_revision'), 'Chỉ báo sau khi đã lưu giá');
const layout = read('app/crm/layout.tsx');
assert.match(layout, /countPendingProductRevisions\(\)/);
assert.match(layout, /pendingProducts = pendingProductContent \+ pendingPriceRevisions/, 'Huy hiệu Sản phẩm đếm cả giá chờ rà soát');
assert.match(layout, /href: "\/crm\/products\/quantity-review", label: "Giá hoặc tên nhà cung cấp cập nhật chờ rà soát"/, 'Chuông CRM có mục giá chờ rà soát');
console.log('✅ Giá mới của nhà cung cấp: email cho Quản trị và Trưởng kiểm duyệt, huy hiệu và chuông CRM có đếm.');
