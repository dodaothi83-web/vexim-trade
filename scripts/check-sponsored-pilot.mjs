// node scripts/check-sponsored-pilot.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';

const load = (relative, imports, process) => {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (id) => {
    if (id in imports) return imports[id];
    throw Error(`Unexpected dependency ${id}`);
  }, Buffer, Date, URL, console, process });
  return exports;
};
const supplierId = '5f6b1b4a-d6ba-4d6b-9222-3a5dbd13f2c9';
const productId = '17f51ecd-725e-48a0-b8f0-f1d6716598b2';
const campaignId = 'cdf3cb29-76d9-44a8-9d77-6816cf4c392b';
const env = { VEXIM_SPONSORED_PILOT: 'false', VEXIM_DEPLOY_ENV: 'staging', VERCEL_ENV: 'preview' };
const now = new Date();
const campaign = { id: campaignId, supplier_id: supplierId, product_id: productId,
  category_slug: 'cashew', status: 'approved', starts_at: new Date(now.getTime() - 10000).toISOString(),
  ends_at: new Date(now.getTime() + 3600000).toISOString() };
const card = { id: productId, supplierId, isDemo: false, name: 'Real cashew' };
const writes = [];
let reads = 0;
const db = { from(table) {
  assert.equal(table, 'sponsored_pilot_campaigns'); reads++;
  return { select() { return this; }, eq() { return this; }, lte() { return this; }, gt() { return this; },
    async limit() { return { data: [campaign], error: null }; },
    async maybeSingle() { return { data: campaign, error: null }; },
  };
}, async rpc(name, values) { writes.push({ name, values }); return { error: null }; } };
const pilot = load('../lib/sponsored/pilot.ts', {
  'server-only': {}, 'node:crypto': crypto,
  '@/lib/auth/secret': { getAuthSecret: () => 'test-secret-long-enough' },
  '@/lib/db/supabase': { getSupabaseClient: () => db },
}, { env });
assert.equal(pilot.sponsoredPilotEnabled(), false);
assert.equal(await pilot.pilotPlacement('cashew', [card]), null);
assert.equal(reads, 0, 'Off by default: no campaign query');
env.VEXIM_SPONSORED_PILOT = 'true';
env.VERCEL_ENV = 'production';
assert.equal(pilot.sponsoredPilotEnabled(), false);
assert.equal(await pilot.pilotPlacement('cashew', [card]), null);
assert.equal(reads, 0, 'Production is blocked, even with pilot flag');
env.VERCEL_ENV = 'preview';
env.VEXIM_DEPLOY_ENV = 'production';
assert.equal(pilot.sponsoredPilotEnabled(), false, 'Explicit staging environment required');
env.VEXIM_DEPLOY_ENV = 'staging';
assert.equal(pilot.sponsoredPilotEnabled(), true);
assert.equal(pilot.eligiblePilotCampaign(campaign, card, 'cashew'), true);
assert.equal(pilot.eligiblePilotCampaign({ ...campaign, status: 'draft' }, card, 'cashew'), false);
assert.equal(pilot.eligiblePilotCampaign({ ...campaign, status: 'paused' }, card, 'cashew'), false);
assert.equal(pilot.eligiblePilotCampaign({ ...campaign, ends_at: new Date(now.getTime() - 1).toISOString() }, card, 'cashew'), false);
assert.equal(pilot.eligiblePilotCampaign(campaign, { ...card, supplierId: 'other' }, 'cashew'), false);
assert.equal(pilot.eligiblePilotCampaign(campaign, { ...card, isDemo: true }, 'cashew'), false);
assert.equal(pilot.eligiblePilotCampaign(campaign, card, 'rice'), false);
assert.equal(await pilot.pilotPlacement('cashew', [{ ...card, isDemo: true }]), null);
assert.equal(await pilot.pilotPlacement('cashew', [{ ...card, supplierId: 'other' }]), null);
const placement = await pilot.pilotPlacement('cashew', [card]);
assert.equal(placement.product.id, productId);
assert.equal(placement.campaignId, campaignId);
assert.equal(pilot.verifyPilotTicket(placement.ticket).campaignId, campaignId);
assert.equal(pilot.verifyPilotTicket(placement.ticket + 'bad'), null, 'Tampered ticket rejected');

let session = null;
let category = { slug: 'cashew', status: 'published', is_published: true };
let cards = [card];
let supplier = { id: supplierId, status: 'published', is_demo: false };
const route = load('../app/api/public/sponsored-pilot/route.ts', {
  'next/server': { NextResponse: class { constructor(body, opts) { this.status = opts.status; } } },
  '@/lib/auth/session': { getSession: async () => session },
  '@/lib/db': { getStore: () => ({ getCategoryBySlug: async () => category, getSupplier: async () => supplier }) },
  '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => cards },
  '@/lib/public/supplier-seo': { isSyntheticSupplier: (s) => s.is_demo },
  '@/lib/sponsored/pilot': pilot,
}, { env });
const request = (event, origin = 'https://example.com') => ({ headers: { get: (key) => ({
  origin, host: 'example.com', 'content-type': 'application/json', 'content-length': '450', 'user-agent': 'Mozilla/5.0',
})[key] ?? null }, text: async () => JSON.stringify({ ticket: placement.ticket, event }) });
assert.equal((await route.POST(request('impression'))).status, 204);
assert.equal(writes.length, 1);
assert.equal(writes[0].values.p_campaign_id, campaignId);
assert.equal((await route.POST(request('click'))).status, 204);
assert.equal(writes.length, 2);
assert.equal((await route.POST(request('click', 'https://evil.example'))).status, 403);
assert.equal(writes.length, 2, 'No cross-origin metric');
assert.equal((await route.POST(request('purchase'))).status, 400);
session = { role: 'supplier' };
assert.equal((await route.POST(request('click'))).status, 204);
assert.equal(writes.length, 2, 'No supplier/self-views');
session = null;
category = { ...category, status: 'draft' };
assert.equal((await route.POST(request('click'))).status, 204);
assert.equal(writes.length, 2, 'Unpublished category never records');
category = { ...category, status: 'published' };
cards = [{ ...card, supplierId: 'other' }];
assert.equal((await route.POST(request('click'))).status, 204);
assert.equal(writes.length, 2, 'Campaign/product supplier mismatch never records');
cards = [card];
supplier = { ...supplier, is_demo: true };
assert.equal((await route.POST(request('click'))).status, 204);
assert.equal(writes.length, 2, 'Demo supplier never records');
env.VEXIM_SPONSORED_PILOT = 'false';
assert.equal((await route.POST(request('click'))).status, 404);
assert.equal(writes.length, 2, 'Disabled pilot cannot record');
const categoryPage = readFileSync(new URL('../app/(public)/products/[slug]/page.tsx', import.meta.url), 'utf8');
const grid = readFileSync(new URL('../components/category-product-grid.tsx', import.meta.url), 'utf8');
assert.match(categoryPage, /!isPreview \? await pilotPlacement\(cat\.slug, visibleProducts\) : null/);
// Vùng đẩy của gói bán thật đã thay bản thử nghiệm; bản thử nghiệm chỉ còn là
// đường lùi khi danh mục chưa có gói nào, và vẫn phải nằm trên lưới tự nhiên.
assert.match(grid, /!active && \(sponsoredBand\.length > 0[\s\S]*: sponsored && <SponsoredPilotSlot/);
assert.match(grid, /arrangeSupplierProducts\(/, 'Organic listing stays separate');
console.log('✅ Sponsored pilot: staging-only/off by default, approved buyer-ready product, segregated metrics and organic list.');
