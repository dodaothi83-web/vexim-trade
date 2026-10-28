// node --experimental-strip-types --no-warnings scripts/check-sponsored-phase01-actions.mjs
// Real server actions and board rendered with isolated in-memory adapters. No production writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as admin from '../lib/sponsored/admin.ts';
import { hasPermission } from '../lib/auth/permissions.ts';

const require = createRequire(import.meta.url);
const jsx = require('react/jsx-runtime');
function load(path, mocks, extra = {}) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, { exports, Date, FormData, console, ...extra,
    require: (id) => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id]; },
  }, { filename: path });
  return exports;
}
const NOW = Date.now();
const iso = (offset) => new Date(NOW + offset * 3600000).toISOString();
const makePush = (extra = {}) => ({ id: 'draft-1', surface: 'category', category_slug: 'pepper', supplier_id: 'supplier', product_id: 'product',
  status: 'draft', starts_at: iso(-200), ends_at: iso(-32), price_amount: 100, price_currency: 'VND', approved_by: null, approved_at: null, created_at: iso(-200), ...extra });
let rows = [], eligible = true, role = 'admin', writes = 0, changes = 0;
let gateBarrier = null;
const store = {
  async listAllSponsoredPushes() { return rows.map((row) => ({ ...row })); },
  async createSponsoredPush(input) { writes++; const row = { ...input, id: `new-${writes}`, created_at: new Date().toISOString() }; rows.push(row); return row; },
  async updateSponsoredPushIfStatus(id, expected, patch) {
    const row = rows.find((r) => r.id === id && r.status === expected);
    if (!row) return null;
    Object.assign(row, patch); writes++; return { ...row };
  },
  async deleteSponsoredDraft(id) {
    const index = rows.findIndex((r) => r.id === id && r.status === 'draft');
    if (index < 0) return false;
    rows.splice(index, 1); writes++; return true;
  },
};
const actions = load('app/crm/sponsored/actions.ts', {
  'next/cache': { revalidatePath() { changes++; } },
  'next/navigation': { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { getSession: async () => role ? { uid: `user-${role}`, role } : null },
  '@/lib/auth/permissions': { hasPermission },
  '@/lib/sponsored/eligibility': {
    eligiblePushProducts: async () => eligible ? [{ productId: 'product', supplierId: 'supplier', categorySlug: 'pepper' }] : [],
    isPushProductEligible: async (push) => { if (gateBarrier) await gateBarrier(); return eligible && push.supplier_id === 'supplier' && push.category_slug === 'pepper'; },
  },
  '@/lib/sponsored/admin': admin,
});
const form = (values) => { const fd = new FormData(); for (const [key, value] of Object.entries(values)) fd.set(key, value); return fd; };
async function run(fn, data = {}) {
  try { await fn(form(data)); throw new Error('Expected a redirect'); }
  catch (error) { if (!String(error.message).startsWith('REDIRECT:')) throw error; return error.message.slice(9); }
}
const reset = (list = []) => { rows = list.map((r) => ({ ...r })); writes = 0; changes = 0; eligible = true; role = 'admin'; gateBarrier = null; };

reset();
assert.match(await run(actions.createPushAction, { product: 'product', surface: 'home' }), /err=unsupported/);
assert.match(await run(actions.createPushAction, { product: 'product', surface: 'other' }), /err=unsupported/);
assert.equal(writes, 0, 'Forged surface cannot create a package');
assert.match(await run(actions.createPushAction, { product: 'product', surface: 'category' }), /ok=created/);
assert.equal(rows[0].status, 'draft');
assert.equal(rows[0].surface, 'category');
assert.equal(Date.parse(rows[0].ends_at) - Date.parse(rows[0].starts_at), 168 * 3600000);

reset([makePush()]);
const beforeApproval = Date.now();
assert.match(await run(actions.approvePushAction, { id: 'draft-1' }), /ok=approved/);
assert.ok(Date.parse(rows[0].starts_at) >= beforeApproval, 'An old draft does not start before approval');
assert.equal(Date.parse(rows[0].ends_at) - Date.parse(rows[0].starts_at), 168 * 3600000);
assert.equal(rows[0].approved_at, rows[0].starts_at);
const sold = { ...rows[0] };
assert.match(await run(actions.approvePushAction, { id: 'draft-1' }), /ok=noop/);
assert.deepEqual(rows[0], sold, 'A second approval does not extend an existing sale');
assert.match(await run(actions.cancelDraftAction, { id: 'draft-1' }), /err=changed/);
assert.deepEqual(rows[0], sold, 'A stale delete cannot remove an approved package');
assert.match(await run(actions.pausePushAction, { id: 'draft-1' }), /ok=paused/);
assert.match(await run(actions.resumePushAction, { id: 'draft-1' }), /ok=resumed/);
assert.equal(rows[0].starts_at, sold.starts_at);
assert.equal(rows[0].ends_at, sold.ends_at);
assert.equal(rows[0].approved_at, sold.approved_at);

for (const status of ['draft', 'paused', 'approved']) {
  reset([makePush({ surface: 'home', status, starts_at: iso(-1), ends_at: iso(167) })]);
  const initial = { ...rows[0] };
  if (status === 'draft') assert.match(await run(actions.approvePushAction, { id: 'draft-1' }), /err=unsupported/);
  if (status === 'paused') assert.match(await run(actions.resumePushAction, { id: 'draft-1' }), /err=unsupported/);
  if (status === 'approved') assert.match(await run(actions.approvePushAction, { id: 'draft-1' }), /err=unsupported/);
  assert.deepEqual(rows[0], initial, 'Historical homepage rows are not automatically changed');
  if (status === 'approved') assert.match(await run(actions.pausePushAction, { id: 'draft-1' }), /ok=paused/, 'Staff may pause an old row');
}
reset([makePush()]); eligible = false;
assert.match(await run(actions.approvePushAction, { id: 'draft-1' }), /err=gates/);
assert.equal(writes, 0);
reset([makePush({ supplier_id: 'different-supplier' })]);
assert.match(await run(actions.approvePushAction, { id: 'draft-1' }), /err=gates/);
for (const unauthorized of ['sales', 'ops', 'supplier', null]) {
  reset([makePush()]); role = unauthorized;
  assert.match(await run(actions.approvePushAction, { id: 'draft-1' }), unauthorized ? /err=forbidden/ : /\/login/);
  assert.equal(writes, 0);
}
reset([makePush(), ...Array.from({ length: 12 }, (_, i) => makePush({ id: `sold-${i}`, product_id: `p-${i}`,
  status: i === 0 ? 'paused' : 'approved', starts_at: iso(-1), ends_at: iso(167) }))]);
assert.match(await run(actions.approvePushAction, { id: 'draft-1' }), /err=pool/, 'Paused packages reserve pool capacity');
assert.equal(writes, 0);
reset([makePush(), makePush({ id: 'old-reserved', status: 'paused', surface: 'home', starts_at: iso(-1), ends_at: iso(167) })]);
assert.match(await run(actions.approvePushAction, { id: 'draft-1' }), /err=duplicate/, 'Product is reserved across surfaces');

// Both requests read the same draft, then race the real action's CAS boundary.
reset([makePush()]);
let ready = 0, release;
const barrier = new Promise((resolve) => { release = resolve; });
gateBarrier = async () => { if (++ready === 2) release(); await barrier; };
const approvals = await Promise.all([run(actions.approvePushAction, { id: 'draft-1' }), run(actions.approvePushAction, { id: 'draft-1' })]);
assert.equal(approvals.filter((x) => x.includes('ok=approved')).length, 1);
assert.equal(approvals.filter((x) => x.includes('err=changed')).length, 1);
assert.equal(writes, 1, 'Competing approval cannot reset dates or write the approver twice');

const board = load('app/crm/sponsored/sponsored-board.tsx', {
  'react/jsx-runtime': jsx, react: React, 'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/ui': { EmptyState: ({ title }) => React.createElement('div', null, title), group: (n) => String(n) },
  '@/lib/sponsored/chart-geometry': { buildChartGeometry: () => ({}) },
  '@/lib/sponsored/admin': admin,
  './actions': Object.fromEntries(Object.keys(actions).map((key) => [key, () => {}])),
}).SponsoredBoard;
const boardRow = (extra) => ({ id: 'x', productName: 'X', supplierName: 'S', categoryName: 'Pepper', surface: 'category', status: 'draft', state: 'pending',
  startsLabel: 'Khi duyệt', endsLabel: 'Sau khi duyệt', hoursLeft: 0, impressions: 0, clicks: 0, rate: 0, priceLabel: '—', note: null, ...extra });
const viewRows = [boardRow({ id: 'cat-draft', productName: 'CAT DRAFT' }),
  boardRow({ id: 'home-draft', productName: 'HOME DRAFT', surface: 'home', state: 'unavailable' }),
  boardRow({ id: 'home-paused', productName: 'HOME PAUSED', surface: 'home', status: 'paused', state: 'paused' }),
  boardRow({ id: 'home-live', productName: 'HOME OLD', surface: 'home', status: 'approved', state: 'unavailable' })];
const props = { rows: viewRows, pools: [{ key: 'c', surface: 'category', label: 'Pepper', used: 12, active: 12, cap: 12, slots: 3, free: 0 },
  { key: 'h', surface: 'home', label: 'Trang chủ', used: 1, active: 1, cap: 8, slots: 2, free: 7 }],
  summary: { live: 0, pending: 2, impressions7d: 0, clicks7d: 0, expiring: 0 }, candidates: [], canManage: true, flash: null, series: {},
  metricsAvailable: false, packagesAvailable: true, candidatesAvailable: true };
const html = renderToStaticMarkup(React.createElement(board, props));
assert.match(html, /Chưa tải được số liệu quảng cáo/);
assert.match(html, /không có nghĩa là không có lượt/);
assert.match(html, /chưa có ước tính số vòng theo số ô mới/);
assert.match(html, /chưa áp dụng 4 gói mỗi ô/);
assert.doesNotMatch(html, /252 vòng chọn\/gói/, "A fixed three-slot estimate would be misleading");
assert.match(html, /Trang chủ chưa có vị trí tài trợ/);
assert.doesNotMatch(html, /7\/8 gói/, 'The unavailable home pool is not marketed as available');
const rowFor = (name) => [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((m) => m[0]).find((r) => r.includes(name));
assert.match(rowFor('CAT DRAFT'), />Duyệt</);
assert.doesNotMatch(rowFor('HOME DRAFT'), />Duyệt</);
assert.match(rowFor('HOME DRAFT'), />Xoá</, 'An unavailable homepage draft can still be deleted');
assert.doesNotMatch(rowFor('HOME DRAFT'), />Tạm dừng</, 'A draft cannot be paused');
assert.doesNotMatch(rowFor('HOME PAUSED'), />Chạy lại</);
assert.match(rowFor('HOME OLD'), />Tạm dừng</);
const unavailable = renderToStaticMarkup(React.createElement(board, { ...props, rows: [], pools: [], packagesAvailable: false }));
assert.match(unavailable, /Chưa tải được danh sách gói/);
assert.doesNotMatch(unavailable, />Tạo gói</);

const Services = load('components/service-registration-section.tsx', {
  'react/jsx-runtime': jsx, react: React, 'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/components/form-challenge': { FormChallenge: () => null },
}).ServiceRegistrationSection;
for (const [lang, marker, next] of [['vi', 'DỊCH VỤ 03', 'DỊCH VỤ 04'], ['en', 'SERVICE 03', 'SERVICE 04']]) {
  const serviceHtml = renderToStaticMarkup(React.createElement(Services, { lang }));
  const featured = serviceHtml.slice(serviceHtml.indexOf(marker), serviceHtml.indexOf(next));
  assert.match(featured, /banner/i);
  assert.doesNotMatch(featured, /168 (giờ|hours)|chưa bật bộ lọc|no filters applied|supplier\/portal\/boost/i);
  assert.match(featured, lang === 'vi' ? /khác với gói đẩy sản phẩm/ : /separate service from sponsored product placement/);
}
console.log('✅ Sponsored actions/UI: authorization, stale draft, 168h, no home selling/resume, reserved pool, CAS race, missing metrics and honest rotation estimate (in-memory).');
