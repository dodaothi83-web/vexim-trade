#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-site-traffic.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { publicSitePageKey } from '../lib/traffic/site-path.ts';
import { buildSiteTrafficReport } from '../lib/traffic/site-report.ts';
import { hasPermission } from '../lib/auth/permissions.ts';

assert.equal(publicSitePageKey('/'), 'home');
assert.equal(publicSitePageKey('/how-it-works'), 'how-it-works');
assert.equal(publicSitePageKey('/products/cashew'), 'category:cashew');
assert.equal(publicSitePageKey('/blog/article-a'), 'article:article-a');
for (const path of ['/crm/traffic', '/supplier/portal/traffic', '/suppliers/abc', '/products/cashew/123',
  '/rfq/status/private-token', '/products/abc?buyer=email', '/blog/../../crm', '/blog/a%2Fb', '/login'])
  assert.equal(publicSitePageKey(path), null, `Never track sensitive/unsupported route ${path}`);
const rows = [
  { day: '2026-10-18', page_key: 'home', views: 2 },
  { day: '2026-10-18', page_key: 'supplier_profile', views: 4 },
  { day: '2026-10-17', page_key: 'product_detail', views: 7 },
  { day: '2026-10-18', page_key: 'category:rice', views: 3 },
  { day: '2026-10-18', page_key: 'rfq', views: 1 },
  { day: '2026-10-18', page_key: 'home', views: -100 },
  { day: '2020-01-01', page_key: 'home', views: 100 },
];
const report = buildSiteTrafficReport(rows, 7, new Date('2026-10-18T23:00:00Z'));
assert.equal(report.total, 17);
assert.equal(report.supplierViews, 11);
assert.deepEqual(report.topCategories, [{ slug: 'rice', views: 3 }]);
const cashew = buildSiteTrafficReport([
  { day: '2026-10-18', page_key: 'category:cashew', views: 2 },
  { day: '2026-10-18', page_key: 'cashew', views: 3 },
], 7, new Date('2026-10-18T23:00:00Z'));
assert.deepEqual(cashew.topCategories, [{ slug: 'cashew', views: 5 }], 'Legacy cashew and category views share one top-page label');
assert.equal(report.trend.length, 7);
assert.equal(report.breakdown.reduce((sum, group) => sum + group.views, 0), report.total);
for (const role of ['sale', 'sourcing', 'viewer', 'supplier']) assert.equal(hasPermission(role, 'traffic.view'), false);
assert.equal(hasPermission('admin', 'traffic.view'), true);

function load(relative, mocks) {
  const exports = {};
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: (id) => {
    if (!(id in mocks)) throw Error(`Unexpected import ${id}`);
    return mocks[id];
  }, console, URL });
  return exports;
}
let configured = true;
const writes = [];
const db = { rpc(name, args) {
  if (name === 'record_vexim_site_page_view') {
    writes.push(args.p_page_key); return Promise.resolve({ error: null });
  }
  assert.equal(name, 'read_vexim_site_traffic');
  assert.ok([7, 30, 90].includes(args.p_days));
  return { order() { return this; }, range() { return Promise.resolve({ data: rows, error: null }); } };
} };
const traffic = load('../lib/traffic/site.ts', {
  'server-only': {}, '@/lib/db/supabase': { getSupabaseClient: () => configured ? db : null },
});
assert.equal((await traffic.readSiteTraffic(7)).length, rows.length);
await traffic.recordSitePage('home');
assert.deepEqual(writes, ['home']);
configured = false;
assert.equal(await traffic.readSiteTraffic(7), null, 'Unavailable DB is not represented as zero');
configured = true;
let session = null;
let category = { status: 'published', is_published: true };
let article = { status: 'published' };
const route = load('../app/api/public/site-traffic/route.ts', {
  'next/server': { NextResponse: class { constructor(body, options) { this.status = options.status; } } },
  '@/lib/auth/session': { getSession: async () => session },
  '@/lib/db': { getStore: () => ({ getCategoryBySlug: async () => category }) },
  '@/lib/blog/queries': { getPublishedNewsBySlug: async () => article },
  '@/lib/traffic/site-path': { publicSitePageKey },
  '@/lib/traffic/site': traffic,
});
const request = (path, origin = 'https://example.com') => ({ headers: { get: (name) => ({
  origin, host: 'example.com', 'content-type': 'application/json', 'content-length': '150',
  'user-agent': 'Mozilla/5.0',
})[name] ?? null }, text: async () => JSON.stringify({ path }) });
assert.equal((await route.POST(request('/'))).status, 204);
assert.equal((await route.POST(request('/products/rice'))).status, 204);
assert.equal(writes.length, 3);
category = { ...category, is_published: false };
assert.equal((await route.POST(request('/products/rice'))).status, 204);
assert.equal(writes.length, 3, 'No draft categories');
article = null;
assert.equal((await route.POST(request('/blog/draft'))).status, 204);
assert.equal(writes.length, 3, 'No draft articles');
assert.equal((await route.POST(request('/rfq/status/buyer-token'))).status, 204);
assert.equal(writes.length, 3, 'Private RFQ status never counted');
assert.equal((await route.POST(request('/', 'https://evil.com'))).status, 403);
assert.equal(writes.length, 3, 'Cross-origin view never counted');
session = { role: 'admin' };
assert.equal((await route.POST(request('/'))).status, 204);
assert.equal(writes.length, 3, 'Staff self-views never counted');
const sql = readFileSync(new URL('../supabase/migrations/20261018_vexim_site_traffic.sql', import.meta.url), 'utf8');
assert.match(sql, /union all[\s\S]*supplier_traffic_daily/, 'Supplier views counted from existing table, not double-written');
assert.match(sql, /revoke all on function public\.read_vexim_site_traffic\(integer\) from public, anon, authenticated/);
const crm = readFileSync(new URL('../app/crm/traffic/page.tsx', import.meta.url), 'utf8');
assert.match(crm, /requirePagePermission\("traffic\.view"/);
assert.match(readFileSync(new URL('../app/(public)/layout.tsx', import.meta.url), 'utf8'), /<SiteTrafficBeacon \/>/);
assert.match(readFileSync(new URL('../app/blog/layout.tsx', import.meta.url), 'utf8'), /<SiteTrafficBeacon \/>/);
assert.match(readFileSync(new URL('../components/site-traffic-beacon.tsx', import.meta.url), 'utf8'), /sessionStorage\.setItem/);
console.log('✅ Admin-only site traffic, route allowlist, privacy gates, aggregation and unavailable state.');
