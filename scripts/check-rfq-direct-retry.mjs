// Exercise the real Supabase read adapter and automatic direct retry against a
// capped fake PostgREST endpoint. No network, mail provider or production DB.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function load(file, mocks = {}, globals = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, console, process: { env: {} },
    require: (key) => { assert.ok(Object.hasOwn(mocks, key), `${file}: unexpected import ${key}`); return mocks[key]; },
    ...globals }, { filename: file });
  return mod.exports;
}
const id = (n) => `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
const channel = load('lib/rfq/channel.ts');
const contact = load('lib/rfq/buyer-contact.ts');
const core = load('lib/rfq/portal-core.ts', {
  './channel': channel, './buyer-contact': contact,
  '@/lib/public/product-selection': { withoutDirectContacts: (s) => s },
});
const grant = contact.buyerContactConsentSpec({ company: 'Buyer Co', contact_name: 'Jane',
  email: 'private@example.test', phone: '1234567890', country: 'VN', website: null, business_type: null },
'2026-11-09T00:00:00Z', 'rfq_form');
const marked = { ...grant, direct_delivery_version: 'portal_direct_v2', notes: 'PRIVATE CRM NOTE' };
const rfqs = Array.from({ length: 65 }, (_, i) => ({ id: id(i + 1), code: `RFQ-${i + 1}`, buyer_id: 'buyer',
  status: 'new', spam_score: 0, source_page: '/rfq', source_product_id: null,
  preferred_supplier_ids: ['supplier-a'], specs: { ...marked },
  created_at: new Date(Date.now() - i * 60_000).toISOString() }));
const awaitingPublish = { ...rfqs[0], id: id(66), code: 'RFQ-66', status: 'matching' };
rfqs.push(awaitingPublish,
  { ...rfqs[0], id: id(67), code: 'RFQ-OLD-STAFF-QUOTE', status: 'quoted', specs: { ...grant } },
  { ...rfqs[0], id: id(68), code: 'RFQ-SOURCING', preferred_supplier_ids: [], specs: { ...marked, sourcing_request_id: 'source-1' } },
  { ...rfqs[0], id: id(69), code: 'RFQ-SPAM', spam_score: 60 },
  { ...rfqs[0], id: id(70), code: 'RFQ-QUESTION', source_page: '/rfq?intent=question', specs: { ...marked, inquiry_kind: 'supplier_question' } },
  { ...rfqs[0], id: id(71), code: 'RFQ-NO-DIRECT-GRANT', specs: { direct_delivery_version: 'portal_direct_v2' } });
const stamp = '2026-11-09T00:00:00Z';
const quoted = (n, rfqId) => ({ id: id(n), rfq_id: rfqId, supplier_id: 'supplier-a', status: 'quoted',
  sent_to_supplier_at: stamp, quote_price: 6.25, updated_at: stamp, created_at: stamp });
const matches = [quoted(800, awaitingPublish.id), quoted(801, id(67))];
for (let i = 0; i < 21; i++) matches.push({ id: id(1000 + i), rfq_id: id(1), supplier_id: `other-${i}`,
  status: 'proposed', sent_to_supplier_at: null, created_at: new Date(Date.now() - i * 60_000).toISOString() });
const messages = Array.from({ length: 29 }, (_, i) => ({ id: id(1200 + i), thread_id: i === 28 ? 'another-desk' : 'desk-1',
  sender: 'supplier', body: `Message ${i}`, created_at: new Date(Date.now() - i * 60_000).toISOString() }));
const tables = { rfqs, rfq_matches: matches, rfq_mediated_messages: messages };
let cap = 7;
let failAfterCursor = false;
const requests = [];
const fakeFetch = async (input) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const table = url.pathname.split('/').at(-1);
  const params = url.searchParams;
  assert.ok(table in tables, `Unexpected PostgREST table ${table}`);
  assert.equal(input.method ?? 'GET', 'GET', 'Read adapter must not write to the fake endpoint');
  requests.push({ table, params: new URLSearchParams(params) });
  if (failAfterCursor && table === 'rfqs' && params.get('id')?.startsWith('gt.')) {
    return new Response(JSON.stringify({ message: 'simulated middle-page outage', code: 'XX000' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
  let result = [...tables[table]];
  for (const [key, filter] of params) {
    if (['select', 'order', 'limit'].includes(key)) continue;
    const [op, ...parts] = filter.split('.');
    const operand = parts.join('.');
    result = result.filter((row) => {
      const value = row[key];
      if (op === 'cs') {
        assert.equal(key, 'specs');
        return Object.entries(JSON.parse(operand)).every(([name, v]) => value?.[name] === v);
      }
      if (op === 'in') return operand.slice(1, -1).split(',').includes(String(value));
      if (op === 'eq') return String(value) === operand;
      if (op === 'gt') return String(value) > operand;
      if (op === 'lt') return value < Number(operand);
      if (op === 'neq') return String(value) !== operand;
      if (op === 'not' && operand === 'is.null') return value != null;
      assert.fail(`Unsupported filter: ${key}=${filter}`);
    });
  }
  assert.equal(params.get('order'), 'id.asc', 'All paged reads need a stable UUID keyset');
  assert.ok(!params.has('offset'), 'Offset pagination skips rows under a short server cap');
  const total = result.length;
  result = result.sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(cap, Number(params.get('limit') ?? 500)));
  // Simulate the actual supplier projection, not the private full RFQ row.
  if (table === 'rfq_matches' && params.get('select')?.includes('rfq:rfqs!inner(')) {
    result = result.map((m) => ({ ...m, rfq: { code: rfqs.find((r) => r.id === m.rfq_id)?.code,
      source_page: '/rfq', preferred_supplier_ids: ['supplier-a'], status: 'matching' } }));
  }
  return new Response(JSON.stringify(result), { status: 200, headers: {
    'content-type': 'application/json', 'content-range': `0-${Math.max(0, result.length - 1)}/${total}`,
  } });
};
const supabase = load('lib/db/supabase.ts', {
  '@supabase/supabase-js': { createClient: (url, key, options) => createClient(url, key, { ...options, global: { fetch: fakeFetch } }) },
  '@/lib/public/product-selection': {}, '@/lib/products/product-extras': { PRODUCT_EXTRAS_COLUMNS: [] },
}, { process: { env: { SUPABASE_URL: 'https://rfq.invalid.test', SUPABASE_SERVICE_ROLE_KEY: 'fake-test-key' } } }).supabaseStore;
assert.equal((await supabase.listRetryableDirectRfqs()).length, 69, 'Raw read pages all marked non-spam RFQs, even ones later rejected by the flow');
assert.ok(requests.filter((r) => r.table === 'rfqs').length > 7, 'A short page does not end the scan');
assert.equal((await supabase.listRfqMatches(id(1))).length, 21, 'A direct RFQ may have more matches than the server cap');
assert.equal((await supabase.listRfqMediatedMessages('desk-1')).length, 28, 'Complete the full desk history under a short page cap');
const ordered = await supabase.listRfqMediatedMessages('desk-1');
assert.equal(ordered[0].body, 'Message 27', 'Display order is chronological, not UUID order');
failAfterCursor = true;
await assert.rejects(supabase.listRetryableDirectRfqs(), /simulated middle-page outage/, 'Never treat a partial retry scan as complete');
failAfterCursor = false;

const supplier = { id: 'supplier-a', status: 'published', onboarding_status: 'approved', name: 'Supplier A' };
const account = { email: 'portal@supplier.test', is_active: true, role: 'supplier', supplier_id: supplier.id };
const notice = [];
const outreach = load('lib/rfq/outreach.ts', {
  '@/lib/email/templates': { escapeHtml: (s) => s, wrapPlainEmail: ({ body }) => body },
  '@/lib/email/send': { transport: async (args) => { notice.push(args); return { ok: true, status: 'sent' }; } },
  '@/lib/config': { FROM_ADDRESS: 'Vexim <no-reply@vexim.test>' }, '@/lib/site': { SITE_URL: 'https://vexim.test' },
  '@/lib/db': {}, '@/lib/supplier-portal/onboarding': { canInviteSupplier: async (s, store) =>
    s.status === 'published' && s.onboarding_status === 'approved' && (await store.getUserBySupplierId(s.id))?.is_active },
  './buyer-contact': contact, './channel': channel,
});
const portal = load('lib/rfq/targeted-portal.ts', {
  './outreach': outreach, '@/lib/email/send': { transport: async (args) => { notice.push(args); return { ok: true, status: 'sent' }; } },
  '@/lib/config': { FROM_ADDRESS: 'Vexim <no-reply@vexim.test>' }, '@/lib/site': { SITE_URL: 'https://vexim.test' },
  '@/lib/supplier-portal/onboarding': { canInviteSupplier: async (s, store) =>
    s.status === 'published' && s.onboarding_status === 'approved' && (await store.getUserBySupplierId(s.id))?.is_active },
  './buyer-contact': contact, './channel': channel,
});
const autoMatch = load('lib/rfq/auto-match.ts', { 'node:crypto': crypto });
const retry = load('lib/rfq/retry-direct.ts', {
  'server-only': {}, './auto-match': autoMatch, './targeted-portal': portal,
  './portal-core': core, './channel': channel,
}).retryPendingDirectRfqs;
const published = [];
const inviteLog = [];
const store = {
  listRetryableDirectRfqs: supabase.listRetryableDirectRfqs.bind(supabase),
  listRfqMatches: supabase.listRfqMatches.bind(supabase),
  createRfqMatch: async (input) => { const row = { ...input, sent_to_supplier_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; matches.push(row); return row; },
  getSupplier: async (sid) => sid === supplier.id ? supplier : null,
  getUserBySupplierId: async (sid) => sid === supplier.id ? account : null,
  listSupplierRfqInvitations: async () => [], listSupplierNoticeReads: async () => [],
  addMessage: async (row) => { inviteLog.push(row); return row; },
  updateRfqMatch: async (matchId, patch) => Object.assign(matches.find((m) => m.id === matchId), patch),
  updateRfq: async (rfqId, patch) => Object.assign(rfqs.find((r) => r.id === rfqId), patch),
  publishRfqQuotes: async (rfqId, mids, expected) => mids.flatMap((mid) => {
    const m = matches.find((r) => r.id === mid);
    assert.equal(m?.rfq_id, rfqId);
    if (m.status !== 'quoted' || m.updated_at !== expected[mid]) return [];
    published.push(mid); m.status = 'presented_to_buyer';
    return [{ match_id: mid, version: 1 }];
  }),
};
const first = await retry(store);
assert.equal(first.checked, 66, 'All 65 new direct RFQs and one unpresented quote are retried, including the oldest');
assert.equal(first.released, 65);
assert.equal(first.published, 1);
assert.deepEqual(published, [id(800)], 'Only the marked saved quote may be auto-published');
assert.equal(matches.find((m) => m.id === id(801)).status, 'quoted', 'Historical staff/email quote remains unpublished');
assert.equal(matches.filter((m) => m.supplier_id === supplier.id && m.sent_to_supplier_at && m.rfq_id !== id(67)).length, 66);
assert.equal(notice.length, 65, 'Optional portal notices never retry an already saved invitation');
assert.equal(inviteLog.length, 65, 'Every invitation notice is logged with its outcome');
assert.ok(inviteLog.every((m) => m.kind === 'rfq_outreach' && m.stage === `direct_invite:${m.rfq_match_id}` && m.status === 'sent'));
assert.doesNotMatch(JSON.stringify(inviteLog), /PRIVATE CRM NOTE|private@example\.test|1234567890/);
assert.ok(notice.every((m) => m.to[0] === account.email && m.html.includes('/supplier/portal/rfqs/')));
assert.doesNotMatch(JSON.stringify(notice), /PRIVATE CRM NOTE|private@example\.test|1234567890|replyTo/);
const second = await retry(store);
assert.equal(second.checked, 66);
assert.equal(second.released, 0);
assert.equal(second.published, 0);
assert.equal(notice.length, 65, 'Repeated cron does not create more matches or emails');
assert.equal(published.length, 1, 'Repeated cron cannot publish the historical price');
const invitations = await supabase.listSupplierRfqInvitations(supplier.id);
assert.equal(invitations.length, 67, 'Supplier can see older invited RFQs beyond a short PostgREST page');
assert.ok(invitations.every((m) => m.supplier_id === supplier.id && m.sent_to_supplier_at && m.status !== 'proposed'));
assert.ok(requests.some((r) => r.table === 'rfq_matches' && r.params.get('id')?.startsWith('gt.')),
  'Supplier projection and match reads use a keyset, not a short first page');
console.log('✅ Direct retry: 66 RFQs under a 7-row cap, no historical quote replay, no duplicate invites or mail, complete supplier/desk reads.');
