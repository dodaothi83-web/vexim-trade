// node --experimental-strip-types --no-warnings scripts/check-supplier-traffic.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
import { buildTrafficReport } from '../lib/supplier-portal/traffic-report.ts';

const supplierId = '5f6b1b4a-d6ba-4d6b-9222-3a5dbd13f2c9';
const productId = '17f51ecd-725e-48a0-b8f0-f1d6716598b2';
const report = buildTrafficReport([
  { day: '2026-10-15', page_kind: 'profile', resource_id: supplierId, views: 2 },
  { day: '2026-10-15', page_kind: 'product', resource_id: productId, views: 3 },
  { day: '2026-10-16', page_kind: 'product', resource_id: productId, views: 4 },
  { day: '2026-10-16', page_kind: 'profile', resource_id: productId, views: 100 }, // wrong profile ID
  { day: '2026-10-17', page_kind: 'product', resource_id: productId, views: -1 },
  { day: '2026-09-01', page_kind: 'product', resource_id: productId, views: 100 }, // outside period
], supplierId, 7, new Date('2026-10-17T23:00:00Z'));
assert.equal(report.total, 9);
assert.equal(report.profile, 2);
assert.equal(report.product, 7);
assert.equal(report.trend.length, 7);
assert.equal(report.trend.at(-1).day, '2026-10-17');
assert.deepEqual(report.products, [{ id: productId, views: 7 }]);

function load(relative, imports) {
  const exports = {};
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports, require: (id) => {
      if (id in imports) return imports[id];
      throw Error(`Unexpected import: ${id}`);
    }, Buffer, Date, console, URL,
  });
  return exports;
}
const writes = [];
const calls = [];
let paged = false;
const db = {
  rpc: async (name, input) => { writes.push({ name, input }); return { error: null }; },
  from: (table) => {
    assert.equal(table, 'supplier_traffic_daily');
    return { select(columns) { calls.push(columns); return this; }, eq(key, value) {
      assert.equal(key, 'supplier_id'); assert.equal(value, supplierId); return this;
    }, gte(key) { assert.equal(key, 'day'); return this; }, order() { return this; },
    async range(start, end) { assert.equal(end, start + 999);
      return { data: paged ? Array.from({ length: start ? 1 : 1000 }, () => ({ day: '2026-10-17', page_kind: 'profile', resource_id: supplierId, views: 1 })) : [], error: null }; } };
  },
};
const traffic = load('../lib/traffic/server.ts', {
  'server-only': {}, 'node:crypto': crypto,
  '@/lib/auth/secret': { getAuthSecret: () => 'test-secret-is-long-enough' },
  '@/lib/db/supabase': { getSupabaseClient: () => db },
});
const profile = traffic.createTrafficToken({ kind: 'profile', supplierId, resourceId: supplierId, slug: 'supplier-slug' });
assert.equal(traffic.verifyTrafficToken(profile).supplierId, supplierId);
assert.equal(traffic.verifyTrafficToken(profile.slice(0, -2) + 'xx'), null, 'Tampered signatures rejected');
assert.equal(traffic.verifyTrafficToken('garbage'), null);
const product = traffic.createTrafficToken({ kind: 'product', supplierId, resourceId: productId, slug: 'cashew' });
await traffic.recordPageView(traffic.verifyTrafficToken(product));
assert.equal(writes[0].input.p_supplier_id, supplierId);
assert.equal(writes[0].input.p_resource_id, productId);
await traffic.readSupplierTraffic(supplierId, 30);
assert.equal(calls.length, 1, 'Read is always scoped to linked supplier');
paged = true;
assert.equal((await traffic.readSupplierTraffic(supplierId, 90)).length, 1001, 'Reads beyond PostgREST first 1,000 rows');
assert.equal(calls.length, 3);

let session = null;
let currentSupplier = { id: supplierId, is_demo: false, name: 'Real supplier', slug: 'supplier-slug', status: 'published' };
let category = { slug: 'cashew', status: 'published', is_published: true };
let cards = [{ id: productId, supplierId, isDemo: false }];
const route = load('../app/api/public/traffic/route.ts', {
  'next/server': { NextResponse: class { constructor(body, options) { this.status = options.status; } } },
  '@/lib/auth/session': { getSession: async () => session },
  '@/lib/public/supplier-seo': { isSyntheticSupplier: (s) => !!s.is_demo },
  '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => cards },
  '@/lib/db': { getStore: () => ({ getCategoryBySlug: async () => category, getSupplier: async () => currentSupplier }) },
  '@/lib/traffic/server': traffic,
});
const request = (token, origin = 'https://example.com') => ({ headers: { get: (name) => ({
  origin, host: 'example.com', 'content-type': 'application/json', 'content-length': '300',
  'user-agent': 'Mozilla/5.0',
})[name] ?? null }, text: async () => JSON.stringify({ token }) });
assert.equal((await route.POST(request(profile))).status, 204);
assert.equal(writes.length, 2, 'Public profile counted');
assert.equal((await route.POST(request(profile, 'https://evil.com'))).status, 403);
assert.equal(writes.length, 2, 'Cross-origin request not counted');
session = { role: 'supplier' };
assert.equal((await route.POST(request(profile))).status, 204);
assert.equal(writes.length, 2, 'Own/staff session not counted');
session = null;
currentSupplier = { ...currentSupplier, is_demo: true };
assert.equal((await route.POST(request(profile))).status, 204);
assert.equal(writes.length, 2, 'Demo profile not counted');
currentSupplier = { ...currentSupplier, is_demo: false, status: 'draft' };
assert.equal((await route.POST(request(profile))).status, 204);
assert.equal(writes.length, 2, 'Unpublished supplier not counted');
currentSupplier = { ...currentSupplier, status: 'published' };
category = { ...category, status: 'draft' };
assert.equal((await route.POST(request(product))).status, 204);
assert.equal(writes.length, 2, 'Unpublished category not counted');
category = { ...category, status: 'published' };
cards = [{ id: productId, supplierId: 'another-supplier', isDemo: false }];
assert.equal((await route.POST(request(product))).status, 204);
assert.equal(writes.length, 2, 'Product of another supplier not counted');
cards = [{ id: productId, supplierId, isDemo: false }];
assert.equal((await route.POST(request(product))).status, 204);
assert.equal(writes.length, 3, 'Public buyer-ready product counted');
const page = readFileSync(new URL('../app/supplier/portal/traffic/page.tsx', import.meta.url), 'utf8');
assert.match(page, /supplierPortalAccess\(\)/);
assert.match(page, /portalApproved\(access\.supplier\)/);
assert.match(page, /readSupplierTraffic\(supplier\.id, days\)/);
console.log('✅ Supplier traffic: scoped report, signed browser views, public-only gate and portal authorization.');
