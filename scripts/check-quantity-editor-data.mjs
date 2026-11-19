// node --experimental-strip-types --no-warnings scripts/check-quantity-editor-data.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as revisionV2 from '../lib/products/quantity-revision-v2.ts';
import * as salesUnits from '../lib/products/sales-units.ts';
const product = { id: 'p', name: 'Nhân điều', updated_at: '2026-10-29T00:00:00Z', reviewed_category_slug: 'cashew', price_publicly_visible: true, name_i18n: { en: 'Legacy name' }, ref_price: 7, moq: '100 bags' };
const category = { id: 'c', slug: 'cashew', status: 'published', is_published: true, price_unit: 'kg' };
let prices = [], names = [], fail = false;
const db = { from(table) {
  let statuses = null;
  const result = () => fail ? { data: null, error: { message: 'offline' } }
    : { data: (table.includes('price') ? prices : names).filter((row) => !statuses || statuses.includes(row.status)), error: null };
  const q = { select: () => q, eq: (col, value) => { if (col === 'status') statuses = [value]; return q; },
    in: async (col, values) => { if (col === 'status') statuses = values; return result(); },
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject) };
  return q; } };
const mocks = { '@/lib/products/sales-units': salesUnits, '@/lib/products/quantity-revision-v2': revisionV2, 'server-only': {}, '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: { getCategoryBySlug: async () => category } },
  '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320'] },
  '@/lib/public/price-units': { displayUnitsForCategory: () => ({ primary: 'kg' }) },
  '@/lib/products/quantity-price-config': { readQuantityPricingPolicy: async () => ({ maxTiers: 4, maxPriceRatio: 1.5, maxLastMoqRatio: 100 }) },
  '@/lib/products/quantity-pricing': { normalizePriceCurrency: (raw) => ['USD', 'VND', 'EUR'].includes(String(raw ?? '').trim().toUpperCase())
    ? String(raw ?? '').trim().toUpperCase() : null } };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/quantity-editor-data.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const env = {};
vm.runInNewContext(code, { exports, process: { env }, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
let data = await exports.readQuantityEditorData(product);
assert.equal(data.grade, ''); assert.equal(data.tiers[0].minKg, ''); assert.equal(data.tiers[0].priceUsdPerKg, '', 'Legacy bag quantities and prices are never guessed into kg');
assert.equal(data.nameEn, 'Legacy name');
prices = [{ id: 'old', status: 'superseded', grade: 'W240', incoterm: 'CIF', tiers: [{ minKg: 1000, priceUsdPerKg: 7 }] },
  { id: 'new', status: 'approved', grade: 'W320', incoterm: 'FOB', confirmed_at: '2026-11-19T05:00:00Z', tiers: [{ minKg: 2000, priceUsdPerKg: 6 }] }];
names = [{ id: 'name-old', status: 'approved', english_name: 'Approved' }, { id: 'name-new', status: 'pending', english_name: 'Pending' }];
data = await exports.readQuantityEditorData(product);
assert.equal(data.priceUpdatedAt, '2026-11-19T05:00:00Z'); assert.equal(data.grade, 'W320'); assert.equal(data.tiers[0].minKg, '2000');
assert.equal(data.currency, 'USD', 'Records without a currency are USD');
assert.equal(data.tiers[0].incoterm, 'FOB', 'The saved table Incoterm is used for rows without their own');
assert.equal(data.nameEn, 'Pending'); assert.equal(data.hasApprovedName, true);
assert.equal('pendingPriceId' in data, false, 'There is no pending price');
prices = [prices[0], { id: 'new-v2', status: 'approved', grade: 'Special', incoterm: 'FOB', tiers: [{ version: 2, unit: 'mt', customGrade: true, quantityGrams: 1234567, unitWeightGrams: 1000000, priceCentsPerUnit: 640100 }] }];
data = await exports.readQuantityEditorData(product);
assert.equal(data.v2.unit, 'mt'); assert.equal(data.v2.customGrade, true);
assert.equal(data.v2.tiers[0].quantity, '1.234567'); assert.equal(data.v2.tiers[0].price, '6401');
assert.equal('v2EditingEnabled' in data, false, 'The supplier form never offers to edit a v2 revision');
assert.equal(data.tiers.length, 0, 'Never reinterpret per-MT prices as USD/kg');
prices[1].tiers[0].unit = 'bag';
await assert.rejects(exports.readQuantityEditorData(product), /Invalid saved/, 'Unsupported units do not fall back to old price');
prices = [{ ...prices[1], tiers: [] }];
await assert.rejects(exports.readQuantityEditorData(product), /Invalid saved/, 'Malformed revisions are not silently replaced by a blank table');
fail = true; await assert.rejects(exports.readQuantityEditorData(product), /Revision reads failed/);
console.log('Quantity editor data: live price table, legacy non-conversion and fail-closed reads passed');
