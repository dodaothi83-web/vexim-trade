// node --experimental-strip-types --no-warnings scripts/check-quantity-editor-data.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as revisionV2 from '../lib/products/quantity-revision-v2.ts';
const product = { id: 'p', name: 'Nhân điều', updated_at: '2026-10-29T00:00:00Z', reviewed_category_slug: 'cashew', price_publicly_visible: true, name_i18n: { en: 'Legacy name' }, ref_price: 7, moq: '100 bags' };
const category = { id: 'c', slug: 'cashew', status: 'published', is_published: true, price_unit: 'kg' };
let prices = [], names = [], fail = false;
const db = { from(table) { const q = { select: () => q, eq: () => q, in: async () => fail ? { data: null, error: { message: 'offline' } } : { data: table.includes('price') ? prices : names, error: null } }; return q; } };
const mocks = { '@/lib/products/quantity-revision-v2': revisionV2, 'server-only': {}, '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: { getCategoryBySlug: async () => category } },
  '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320'] },
  '@/lib/public/price-units': { displayUnitsForCategory: () => ({ primary: 'kg' }) },
  '@/lib/products/quantity-price-config': { readQuantityPricingPolicy: async () => ({ maxTiers: 4, maxPriceRatio: 1.5, maxLastMoqRatio: 100 }) } };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/quantity-editor-data.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const env = {};
vm.runInNewContext(code, { exports, process: { env }, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
let data = await exports.readQuantityEditorData(product);
assert.equal(data.grade, ''); assert.equal(data.tiers[0].minKg, ''); assert.equal(data.tiers[0].priceUsdPerKg, '', 'Legacy bag quantities and prices are never guessed into kg');
assert.equal(data.nameEn, 'Legacy name');
prices = [{ id: 'old', status: 'approved', grade: 'W240', incoterm: 'CIF', tiers: [{ minKg: 1000, priceUsdPerKg: 7 }] },
  { id: 'new', status: 'pending', grade: 'W320', incoterm: 'FOB', tiers: [{ minKg: 2000, priceUsdPerKg: 6 }] }];
names = [{ id: 'name-old', status: 'approved', english_name: 'Approved' }, { id: 'name-new', status: 'pending', english_name: 'Pending' }];
data = await exports.readQuantityEditorData(product);
assert.equal(data.pendingPriceId, 'new'); assert.equal(data.grade, 'W320'); assert.equal(data.tiers[0].minKg, '2000');
assert.equal(data.nameEn, 'Pending'); assert.equal(data.hasApprovedPrice, true); assert.equal(data.hasApprovedName, true);
prices = [prices[0], { id: 'new-v2', status: 'pending', grade: 'Special', incoterm: 'FOB', tiers: [{ version: 2, unit: 'mt', customGrade: true, quantityGrams: 1234567, unitWeightGrams: 1000000, priceCentsPerUnit: 640100 }] }];
data = await exports.readQuantityEditorData(product);
assert.equal(data.pendingPriceId, 'new-v2'); assert.equal(data.hasApprovedPrice, true);
assert.equal(data.v2.unit, 'mt'); assert.equal(data.v2.customGrade, true);
assert.equal(data.v2.tiers[0].quantity, '1.234567'); assert.equal(data.v2.tiers[0].price, '6401');
assert.equal(data.v2EditingEnabled, false);
env.VEXIM_QUANTITY_FORM_STAGING = 'true'; env.VEXIM_QUANTITY_V2_STAGING = 'true';
assert.equal((await exports.readQuantityEditorData(product)).v2EditingEnabled, false);
env.VEXIM_QUANTITY_BUYER_PREVIEW = 'true';
assert.equal((await exports.readQuantityEditorData(product)).v2EditingEnabled, true);
delete env.VEXIM_QUANTITY_FORM_STAGING; delete env.VEXIM_QUANTITY_V2_STAGING; delete env.VEXIM_QUANTITY_BUYER_PREVIEW;
assert.equal(data.tiers.length, 0, 'Never reinterpret per-MT prices as USD/kg');
prices[1].tiers[0].unit = 'bag';
await assert.rejects(exports.readQuantityEditorData(product), /Invalid saved/, 'Unsupported units do not fall back to old price');
prices = [{ ...prices[0], tiers: [] }];
await assert.rejects(exports.readQuantityEditorData(product), /Invalid saved/, 'Malformed revisions are not silently replaced by a blank table');
fail = true; await assert.rejects(exports.readQuantityEditorData(product), /Revision reads failed/);
console.log('Quantity editor data: private revisions, legacy non-conversion and fail-closed reads passed');
