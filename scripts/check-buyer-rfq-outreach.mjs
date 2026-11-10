// node scripts/check-buyer-rfq-outreach.mjs — CRM buyer column reflects dispatched RFQs,
// without turning them into a CRM assignment or exposing private RFQ/buyer data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function runTs(source, mocks = {}, extras = {}) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, React, Date, Promise, Map, Set, console,
    require(id) { assert.ok(id in mocks, `Unexpected import: ${id}`); return mocks[id]; }, ...extras,
  });
  return mod.exports;
}
const helpers = runTs(read('lib/rfq/buyer-outreach.ts'));
assert.equal(helpers.isDispatchedRfqMatch({ status: 'proposed', sent_to_supplier_at: null }), false);
assert.equal(helpers.isDispatchedRfqMatch({ status: 'proposed', sent_to_supplier_at: '2026-11-10' }), false);
assert.equal(helpers.isDispatchedRfqMatch({ status: 'sent_to_supplier', sent_to_supplier_at: null }), false);
assert.equal(helpers.isDispatchedRfqMatch({ status: 'sent_to_supplier', sent_to_supplier_at: '2026-11-10' }), true);
assert.equal(helpers.isDispatchedRfqMatch({ status: 'declined', sent_to_supplier_at: '2026-11-10' }), true);

// Execute the actual store methods without loading the application's seed DB or connecting to Supabase.
function storeMethod(file, method, extras) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  let found;
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === method) found = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, `Missing ${method} in ${file}`);
  return runTs(`const store = { ${found.getText(source)} }; exports.store = store;`, {}, extras).store;
}
const rfqs = [
  { id: 'r-ira-1', buyer_id: 'ira', code: 'RFQ-20261110-00001', access_token: 'DO-NOT-LEAK' },
  { id: 'r-ira-2', buyer_id: 'ira', code: 'RFQ-20261111-00002', access_token: 'DO-NOT-LEAK' },
  { id: 'r-abc', buyer_id: 'abc', code: 'RFQ-ABC', access_token: 'DO-NOT-LEAK' },
  { id: 'r-other', buyer_id: 'other', code: 'RFQ-OTHER', access_token: 'DO-NOT-LEAK' },
];
const suppliers = [
  { id: 's1', name: 'CÔNG TY TNHH CHÂU Á HÙNG MẠNH', email: 'PRIVATE-SUPPLIER-EMAIL' },
  { id: 's2', name: 'Nhà cung cấp khác' },
];
const matches = [
  { id: 'm01', rfq_id: 'r-ira-1', supplier_id: 's1', status: 'sent_to_supplier', sent_to_supplier_at: '2026-11-10T04:07:12Z', internal_note: 'SECRET' },
  { id: 'm02', rfq_id: 'r-ira-1', supplier_id: 's2', status: 'proposed', sent_to_supplier_at: null },
  { id: 'm03', rfq_id: 'r-ira-2', supplier_id: 's1', status: 'declined', sent_to_supplier_at: '2026-11-11T05:00:00Z' },
  { id: 'm04', rfq_id: 'r-abc', supplier_id: 's1', status: 'proposed', sent_to_supplier_at: null },
  { id: 'm05', rfq_id: 'r-other', supplier_id: 's2', status: 'sent_to_supplier', sent_to_supplier_at: '2026-11-11T06:00:00Z' },
  { id: 'm06', rfq_id: 'r-ira-1', supplier_id: 's2', status: 'no_response', sent_to_supplier_at: null },
  { id: 'm07', rfq_id: 'r-ira-2', supplier_id: 's2', status: 'proposed', sent_to_supplier_at: '2026-11-11T07:00:00Z' },
];
const db = { rfqs, rfq_matches: matches, suppliers };
const local = storeMethod('lib/db/local.ts', 'listBuyerRfqOutreach', {
  load: () => db, isDispatchedRfqMatch: helpers.isDispatchedRfqMatch,
});
assert.equal((await local.listBuyerRfqOutreach([])).length, 0);
const localRows = await local.listBuyerRfqOutreach(['ira', 'abc']);
assert.equal(localRows.length, 2);
assert.equal(localRows[0].rfq_code, 'RFQ-20261111-00002', 'Newest outreach first');
assert.equal(localRows[1].supplier_name, suppliers[0].name);
assert.ok(localRows.every((row) => row.buyer_id === 'ira'));
assert.doesNotMatch(JSON.stringify(localRows), /DO-NOT-LEAK|SECRET|PRIVATE-SUPPLIER-EMAIL/);

let queried = 0;
const rfqMap = new Map(rfqs.map((r) => [r.id, r]));
const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
function must() {
  return { from(table) {
    assert.equal(table, 'rfq_matches');
    const query = {
      fromBuyerIds: [], after: null, limitSize: 500,
      select(columns) {
        assert.match(columns, /rfq:rfqs!inner\(buyer_id,code\)/);
        assert.match(columns, /supplier:suppliers!inner\(name\)/);
        assert.doesNotMatch(columns, /\*|access_token|email|internal_note|quote_price/);
        return this;
      },
      in(column, ids) { assert.equal(column, 'rfq.buyer_id'); this.fromBuyerIds = ids; return this; },
      not(column, op, value) { assert.equal(`${column}:${op}:${value}`, 'sent_to_supplier_at:is:null'); return this; },
      neq(column, value) { assert.equal(`${column}:${value}`, 'status:proposed'); return this; },
      order(column, opts) { assert.equal(column, 'id'); assert.equal(opts.ascending, true); return this; },
      limit(size) { this.limitSize = size; return this; },
      gt(column, value) { assert.equal(column, 'id'); this.after = value; return this; },
      then(resolve) {
        queried += 1;
        const data = matches
          .filter((m) => this.fromBuyerIds.includes(rfqMap.get(m.rfq_id)?.buyer_id))
          .filter((m) => !!m.sent_to_supplier_at && m.status !== 'proposed')
          .filter((m) => !this.after || m.id > this.after)
          .sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(this.limitSize, 1)) // Simulate server cap = 1.
          .map((m) => ({ ...m, rfq: rfqMap.get(m.rfq_id), supplier: supplierMap.get(m.supplier_id) }));
        return resolve({ data, error: null });
      },
    };
    return query;
  } };
}
const supabaseSource = ts.createSourceFile('lib/db/supabase.ts', read('lib/db/supabase.ts'), ts.ScriptTarget.Latest, true);
let pager;
function findPager(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'readAllById') pager = node;
  ts.forEachChild(node, findPager);
}
findPager(supabaseSource);
assert.ok(pager);
const supabaseExtras = {
  must, ID_BATCH_SIZE: 80, READ_PAGE_SIZE: 500,
  failPagedRead(op, reason) { throw Error(`${op}: ${String(reason)}`); },
};
const remoteMethod = (() => {
  let method;
  function find(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(supabaseSource) === 'listBuyerRfqOutreach') method = node;
    ts.forEachChild(node, find);
  }
  find(supabaseSource);
  assert.ok(method);
  return runTs(`${pager.getText(supabaseSource)}\nconst store = { ${method.getText(supabaseSource)} }; exports.store = store;`, {}, supabaseExtras).store;
})();
assert.equal((await remoteMethod.listBuyerRfqOutreach([])).length, 0);
assert.equal(queried, 0);
const remoteRows = await remoteMethod.listBuyerRfqOutreach(['ira', 'abc']);
assert.equal(remoteRows.length, 2, 'Keyset paging must not stop at a short PostgREST page');
assert.equal(queried, 3, 'Two one-row pages plus an empty page');
assert.deepEqual(JSON.parse(JSON.stringify(remoteRows)), JSON.parse(JSON.stringify(localRows)));
assert.doesNotMatch(JSON.stringify(remoteRows), /DO-NOT-LEAK|SECRET|PRIVATE-SUPPLIER-EMAIL/);
const grouped = helpers.groupBuyerRfqOutreach(remoteRows);
assert.equal(helpers.uniqueRfqSuppliers(grouped.get('ira')).length, 1, 'Same supplier in two RFQs is one supplier');
assert.equal(helpers.hasBuyerSupplierRelation({ supplier_id: null }, grouped.get('ira')), true);
assert.equal(helpers.hasBuyerSupplierRelation({ supplier_id: null }, grouped.get('abc') ?? []), false);
assert.equal(helpers.hasBuyerSupplierRelation({ supplier_id: 's2' }, []), true);

// Render the actual client-side Buyer table and exercise both distinct supplier filters.
const dom = new JSDOM('<div id="root"></div>', { url: 'https://www.veximtrade.com/crm/buyers' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Event', 'MouseEvent', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let attaches = 0;
const link = ({ children, ...props }) => React.createElement('a', props, children);
const ui = {
  Badge: ({ children }) => React.createElement('span', null, children),
  Button: ({ children, ...props }) => React.createElement('button', props, children),
  EmptyState: ({ title }) => React.createElement('p', null, title),
  cx: (...values) => values.filter(Boolean).join(' '),
  formatDate: (value) => value ?? '—',
  formatMoney: (value) => String(value ?? 0),
};
const table = runTs(read('components/buyer-table.tsx'), {
  react: React, 'react/jsx-runtime': jsx,
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  'next/link': { default: link },
  'react-dom': { createPortal: () => null },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/app/actions': { attachSupplierAction: () => { attaches++; throw Error('No automatic CRM attachment'); } },
  '@/lib/pipeline': { STAGES: [], getStage: () => ({ color: '#123', terminal: false }) },
  '@/lib/rfq/buyer-outreach': helpers,
  '@/components/stage-select': { StageSelect: () => null },
  '@/components/ui': ui,
  '@/components/toast': { useToast: () => ({ push() {} }) },
  '@/components/auto-send': { useAutoSend: () => ({ value: false }) },
  '@/components/floating-menu-position': { getFloatingMenuPosition: () => null },
}, { window: dom.window, document: dom.window.document });
const buyers = [
  { id: 'ira', company: 'Iraivan Traders', stage: 'lead', supplier_id: null, supplier: null, updated_at: '2026-11-11T10:00:00Z' },
  { id: 'abc', company: 'Công ty ABC', stage: 'lead', supplier_id: null, supplier: null, updated_at: '2026-11-10T10:00:00Z' },
  { id: 'crm', company: 'Có nhà cung cấp CRM', stage: 'lead', supplier_id: 's2', supplier: { id: 's2', name: 'Nhà cung cấp khác' }, updated_at: '2026-11-09T10:00:00Z' },
];
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(React.createElement(table.BuyerTable, {
  buyers, outreach: remoteRows, suppliers, canManage: true,
})));
assert.match(document.body.textContent, /Iraivan Traders[\s\S]*CÔNG TY TNHH CHÂU Á HÙNG MẠNH[\s\S]*RFQ-20261111-00002/);
assert.match(document.body.textContent, /Công ty ABC[\s\S]*Chưa có nhà cung cấp liên quan/);
assert.match(document.body.textContent, /Chưa có nhà cung cấp liên quan:\s*1/);
assert.match(document.body.textContent, /Chưa gắn trong CRM:\s*2/);
assert.equal(document.querySelector('a[href="/crm/rfqs/r-ira-2"]')?.textContent.includes('Đã từ chối'), true);
assert.doesNotMatch(document.body.textContent, /DO-NOT-LEAK|SECRET/);
const filter = document.querySelector('select[aria-label="Lọc theo nhà cung cấp"]');
await act(async () => {
  filter.value = 'unrelated';
  filter.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
});
assert.doesNotMatch(document.querySelector('tbody').textContent, /Iraivan Traders|Có nhà cung cấp CRM/);
assert.match(document.querySelector('tbody').textContent, /Công ty ABC/);
await act(async () => {
  filter.value = 'notAssigned';
  filter.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
});
assert.match(document.querySelector('tbody').textContent, /Iraivan Traders|Công ty ABC/);
assert.doesNotMatch(document.querySelector('tbody').textContent, /Có nhà cung cấp CRM/);
assert.equal(attaches, 0, 'Displaying outreach and filtering must never invoke attachSupplierAction');
await act(async () => root.render(React.createElement(table.BuyerTable, {
  buyers, outreach: remoteRows, suppliers, canManage: false,
})));
assert.match(document.querySelector('tbody').textContent, /CÔNG TY TNHH CHÂU Á HÙNG MẠNH/);
assert.equal(document.querySelector('button[aria-haspopup="listbox"]'), null, 'Read-only staff may see RFQs, not attach suppliers');
await act(async () => root.unmount());

const listPage = read('app/crm/buyers/page.tsx');
assert.match(listPage, /requirePagePermission\("buyers.view"/);
assert.match(listPage, /listBuyersWithSupplier\(ownerScopeOf\(session\)\)/);
assert.match(listPage, /hasPermission\(session.role, "rfq.view"\)/);
assert.match(listPage, /listBuyerRfqOutreach\(shownBuyers.map\(\(b\) => b.id\)\)/);
const detail = read('app/crm/buyers/[id]/page.tsx');
assert.match(detail, /if \(!buyer\) notFound\(\)/);
assert.match(detail, /listBuyerRfqOutreach\(\[buyer.id\]\)/);
assert.match(detail, /Đã gửi RFQ · chưa gắn trong CRM/);
assert.match(detail, /Nhà cung cấp đã được gửi RFQ/);
assert.doesNotMatch(listPage + detail, /updateBuyer\(|attachSupplierAction\(|dispatchRfqToSuppliers\(/);
console.log('✅ CRM buyer: actual dispatched RFQ suppliers appear in the column/detail; unassigned counts/filters stay honest; no leaks, writes or new mail.');
