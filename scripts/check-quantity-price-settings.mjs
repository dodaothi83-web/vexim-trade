// node scripts/check-quantity-price-settings.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, mocks = {}) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, FormData, Date, console, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`);
    return mocks[key];
  } });
  return exports;
}
const rules = load('../lib/products/quantity-price-settings.ts');
const data = {
  max_tiers: '4', max_price_ratio: '1.5', max_last_moq_ratio: '100', reminder_days: '30', stale_days: '90',
  offer_max_discount_percent: '30', offer_max_days: '60', offer_cooldown_days: '30', offer_price_lock_days: '30',
};
function form(values) { const fd = new FormData(); for (const [key, value] of Object.entries(values)) fd.set(key, value); return fd; }
assert.equal(rules.parseQuantityPriceSettings(form(data)).max_price_ratio, 1.5);
for (const [field, invalid] of [['max_tiers', '0'], ['max_tiers', '101'], ['max_tiers', '1.5'], ['max_price_ratio', '0.99'],
  ['max_price_ratio', '1e3'], ['max_price_ratio', '1.00001'], ['stale_days', ''], ['offer_max_discount_percent', '101'],
  ['offer_cooldown_days', '-1']]) {
  assert.equal(rules.parseQuantityPriceSettings(form({ ...data, [field]: invalid })), null, `${field}: ${invalid}`);
}
assert.equal(rules.parseGradeBounds(form({ min_usd_per_kg: '', max_usd_per_kg: '' })).bounds, null);
assert.equal(rules.parseGradeBounds(form({ min_usd_per_kg: '1.25', max_usd_per_kg: '3.5' })).bounds.min_usd_per_kg, 1.25);
for (const [min, max] of [['', '3'], ['0', '3'], ['3', '2'], ['1.00001', '4'], ['2', 'NaN']]) {
  assert.equal(rules.parseGradeBounds(form({ min_usd_per_kg: min, max_usd_per_kg: max })).ok, false);
}
assert.equal(rules.settingsToPolicy(rules.parseQuantityPriceSettings(form(data))).maxLastMoqRatio, 100);

const categoryId = '11111111-1111-1111-1111-111111111111';
let session = { uid: 'user', role: 'admin', email: 'admin@example.com' };
let verified = { id: 'user', role: 'admin', email: 'admin@example.com', is_active: true };
let writes = [], audits = [];
const db = { from(table) {
  let operation = 'select', payload;
  const chain = {
    select() { return chain; }, eq() { return chain; },
    update(value) { operation = 'update'; payload = value; return chain; },
    upsert(value) { operation = 'upsert'; payload = value; writes.push({ table, operation, payload }); return Promise.resolve({ error: null }); },
    delete() { operation = 'delete'; return chain; },
    single() { if (operation === 'update') writes.push({ table, operation, payload }); return Promise.resolve({ data: operation === 'select' ? { ...data } : { singleton: true }, error: null }); },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    then(resolve, reject) { if (operation === 'delete') writes.push({ table, operation }); return Promise.resolve({ error: null }).then(resolve, reject); },
  };
  return chain;
} };
const actions = load('../app/crm/settings/quantity-pricing/actions.ts', {
  'next/cache': { revalidatePath: () => {} },
  '@/lib/auth/session': { getSession: async () => session },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: {
    getUser: async () => verified, getCategory: async (id) => id === categoryId ? { slug: 'cashew' } : null,
    addAuditLog: async (entry) => { audits.push(entry); },
  } },
  '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320'], matchStandardGrade: (value, values) => values.includes(value) ? value : null },
  '@/lib/products/quantity-price-settings': rules,
});
let result = await actions.saveQuantityPriceSettings({}, form(data));
assert.equal(result.ok, true);
assert.equal(writes.length, 1);
assert.equal(audits.length, 1);
assert.equal(writes[0].payload.max_tiers, 4);
const validBound = { category_id: categoryId, grade: 'W320', min_usd_per_kg: '5', max_usd_per_kg: '8' };
result = await actions.saveGradePriceBounds({}, form(validBound));
assert.equal(result.ok, true);
assert.equal(writes[1].operation, 'upsert');
assert.equal(writes[1].payload.grade, 'W320');
result = await actions.saveGradePriceBounds({}, form({ ...validBound, min_usd_per_kg: '', max_usd_per_kg: '' }));
assert.equal(result.ok, true);
assert.equal(writes[2].operation, 'delete');
result = await actions.saveGradePriceBounds({}, form({ ...validBound, grade: 'CUSTOM' }));
assert.equal(result.ok, false);
result = await actions.saveQuantityPriceSettings({}, form({ ...data, max_tiers: '101' }));
assert.equal(result.ok, false);
verified = { ...verified, role: 'viewer' };
result = await actions.saveQuantityPriceSettings({}, form(data));
assert.equal(result.ok, false, 'Signed admin session cannot outlive removal of admin role');
verified = { ...verified, role: 'admin', email: 'different@example.com' };
result = await actions.saveGradePriceBounds({}, form(validBound));
assert.equal(result.ok, false);
session = { ...session, role: 'supplier' };
result = await actions.saveQuantityPriceSettings({}, form(data));
assert.equal(result.ok, false);
assert.equal(writes.length, 3, 'Invalid and unauthorized submissions cannot write');
let dbAvailable = true, breakRead = false;
const boundsRows = Array.from({ length: 501 }, (_, index) => ({ category_id: categoryId, grade: `G${index}`, min_usd_per_kg: '1.25', max_usd_per_kg: '5' }));
const readDb = { from(table) {
  let selectedCategory = null;
  const chain = {
    select() { return chain; }, eq(key, value) { if (key === 'category_id') selectedCategory = value; return chain; },
    order() { return chain; },
    single() { return Promise.resolve(breakRead ? { error: { message: 'missing' }, data: null } : { error: null, data }); },
    range(start, end) { return Promise.resolve(breakRead ? { error: { message: 'failed' }, data: null } : { error: null, data: boundsRows.filter((row) => !selectedCategory || row.category_id === selectedCategory).slice(start, end + 1) }); },
  };
  return chain;
} };
const config = load('../lib/products/quantity-price-config.ts', {
  'server-only': {}, '@/lib/db/supabase': { getSupabaseClient: () => dbAvailable ? readDb : null },
  '@/lib/products/quantity-price-settings': rules,
});
assert.equal((await config.readGradePriceBounds(categoryId)).length, 501, 'All bounds are paginated');
const policy = await config.readQuantityPricingPolicy(categoryId);
assert.equal(policy.maxTiers, 4);
assert.equal(policy.gradeBounds.G500.minUsdPerKg, 1.25);
assert.equal(Object.keys(policy.gradeBounds).length, 501);
breakRead = true;
await assert.rejects(config.readQuantityPricingPolicy(categoryId), /unavailable/, 'Never use default policy when database fails');
breakRead = false; dbAvailable = false;
await assert.rejects(config.readQuantityPricingPolicy(categoryId), /unavailable/);
console.log('Quantity pricing settings: parsing, pagination, audit and strict admin checks passed');
