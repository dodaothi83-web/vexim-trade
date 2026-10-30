// node --experimental-strip-types --no-warnings scripts/check-search-relevance.mjs
// Pure tests for search-only relevance and supplier rounds; no database or real traffic.
import assert from 'node:assert/strict';
import { compareSearchRelevance, orderSearchProducts, productSearchRelevance } from '../lib/public/search-ranking.ts';

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
const find = (query, { product = '', grade = '', structuredGrade = grade, category = '', keywords = '', supplier = '' }) => productSearchRelevance(
  norm(query).trim().split(/\s+/).filter(Boolean),
  { product: norm(product), grade: norm(grade), structuredGrade: norm(structuredGrade), category: norm(category), keywords: norm(keywords), supplier: norm(supplier) },
);
const compare = (a, b) => b.verificationCount - a.verificationCount || b.quality - a.quality || a.name.localeCompare(b.name);
const entry = (id, supplierId, verificationCount, relevance, extra = {}) => ({
  product: { id, supplierId, verificationCount, quality: 0, name: id, ...extra }, relevance,
});
const order = (entries) => orderSearchProducts(entries, compare).map(({ product }) => product.id);
const exact = find('W320', { product: 'Cashew W320', grade: 'W320' });
const other = find('W320', { product: 'Cashew W240', grade: 'W240', supplier: 'W320 Export' });
const misleading = find('W320', { product: 'Cashew W320', grade: 'W240' });
const partial = find('W320', { product: 'Cashew W3200', grade: '' });
assert.ok(exact && other && misleading && partial, 'Existing name, supplier and partial matches are retained');
assert.ok(compareSearchRelevance(exact, other) < 0, 'Actual W320 beats W240 from supplier W320 Export');
assert.ok(compareSearchRelevance(exact, misleading) < 0, 'A conflicting structured grade beats a misleading title');
assert.deepEqual(find('W320', { product: 'Cashew W240 and W320', grade: 'W240', structuredGrade: '' }), exact,
  'A grade inferred from a multi-grade name is not treated as an authoritative conflict');
assert.ok(compareSearchRelevance(exact, partial) < 0, 'W320 is more exact than W3200');
assert.ok(compareSearchRelevance(partial, other) < 0, 'A product-field partial match beats a supplier-only match');
assert.equal(find('W320', { product: 'Cashew W240', grade: 'W240', supplier: 'Company' }), null);
assert.deepEqual(order([entry('wrong-grade', 'tier-3', 3, other), entry('exact-grade', 'tier-0', 0, exact)]), ['exact-grade', 'wrong-grade'],
  'Relevance comes before even the highest verification tier');
assert.deepEqual(find('W320', { product: 'Cashew WW320' }), exact, 'WW320 is treated like W320 for product relevance');
assert.deepEqual(find('WW320', { product: 'Cashew W320', grade: 'W320' }), exact, 'The W/WW grade alias works in both query directions');
assert.deepEqual(find('WW320', { product: 'W320 lot', grade: 'W320', category: 'Hạt điều' }), exact,
  'A Vietnamese cashew category provides the context for the alias');
assert.equal(find('WW320', { supplier: 'W320 Export', product: 'Cashew W240', grade: 'W240' }), null,
  'The product-grade alias does not invent a supplier-name match');
assert.equal(find('WW320', { product: 'Industrial part W320', category: 'Machinery' }), null,
  'W/WW aliases do not invent matches in an unrelated industry');
assert.ok(compareSearchRelevance(exact, find('W320', { product: 'Industrial part WW320', category: 'Machinery' })) < 0,
  'A W/WW substring remains weak outside a cashew context');
assert.ok(compareSearchRelevance(exact, find('W320', { product: 'Cashew PremiumWW3200' })) < 0, 'A code embedded in another word is not an exact alias');

const categoryMatch = find('hạt điều W320', { product: 'Whole W320', grade: 'W320', category: 'hạt điều' });
const titleMatch = find('hat dieu w320', { product: 'Hạt điều W320', grade: 'W320', category: 'hạt điều' });
const supplierFallback = find('hat dieu w320', { product: 'Hạt điều W240', grade: 'W240', category: 'hạt điều', supplier: 'W320 Export' });
assert.deepEqual(categoryMatch, titleMatch, 'A public category can supply a keyword without penalizing its products');
assert.ok(compareSearchRelevance(categoryMatch, supplierFallback) < 0, 'A grade match outranks more title words plus a supplier-only grade');
assert.ok(find('van phuoc', { supplier: 'Vạn Phước', product: 'Mặt hàng' }), 'Accent-insensitive supplier searches remain available');
assert.equal(find('W320 organic', { product: 'Cashew W320', grade: 'W320', category: 'cashew' }), null, 'All search tokens must match');
assert.ok(find('W320 organic', { product: 'Cashew W320', grade: 'W320', supplier: 'Organic Foods' }), 'Mixed product/supplier tokens remain searchable');
assert.deepEqual(find('', { product: 'Any product' }), { productCodes: 0, coreTokens: 0, wholeCoreTokens: 0 });
// Supplier-authored keywords are searchable, but weaker than the product's own name.
const keywordHit = find('dried fruit', { product: 'Fruit mix', keywords: 'dried fruit' });
assert.ok(keywordHit, 'A keyword supplies a match the name does not');
assert.equal(keywordHit.productCodes, 0, 'A keyword never counts as a product code');
assert.ok(compareSearchRelevance(find('dried fruit', { product: 'Dried fruit mix' }), keywordHit) < 0,
  'A name match still outranks a keyword-only match');
assert.equal(find('dried fruit', { product: 'Fruit mix' }), null, 'Without keywords the same query has no match');

// B: within one relevance group each supplier gets one card before any repeats.
const sample = [
  entry('a1', 'a', 3, exact), entry('a2', 'a', 3, exact), entry('a3', 'a', 3, exact),
  entry('b1', 'b', 1, exact), entry('b2', 'b', 1, exact),
  entry('c1', 'c', 2, exact), entry('c2', 'c', 2, exact),
];
assert.deepEqual(order(sample), ['a1', 'c1', 'b1', 'a2', 'c2', 'b2', 'a3'],
  'Tier is prioritized within a round, not across rounds');
const copy = JSON.stringify(sample); order(sample); assert.equal(JSON.stringify(sample), copy, 'Input is not mutated');

// Same relevance and tier use the existing quality comparison, then stable ID.
const quality = [entry('b', 'b', 2, exact, { quality: 10, name: 'Same' }), entry('a', 'a', 2, exact, { quality: 10, name: 'Same' }),
  entry('c', 'c', 2, exact, { quality: 20, name: 'Same' })];
assert.deepEqual(order(quality), ['c', 'a', 'b']);
assert.deepEqual(order([entry('a-low', 'a', 2, exact, { quality: 1 }), entry('b-mid', 'b', 2, exact, { quality: 5 }),
  entry('a-high', 'a', 2, exact, { quality: 9 })]), ['a-high', 'b-mid', 'a-low'],
  'Each supplier presents its best remaining offer, and existing quality sorts the round');
for (let i = 0; i < 20; i++) {
  const scrambled = [...quality, ...sample].sort((a, b) => ((a.product.id.charCodeAt(0) * (i + 3)) % 13) - ((b.product.id.charCodeAt(0) * (i + 3)) % 13));
  assert.deepEqual(order(scrambled), order([...quality, ...sample]), 'Same inputs give a stable order regardless of source ordering');
}

// A=500, B/C/D=10: the first 24 are 6 per supplier, without removing products.
const uneven = ['a', 'b', 'c', 'd'].flatMap((supplier, index) => Array.from({ length: index === 0 ? 500 : 10 }, (_, n) =>
  entry(`${supplier}-${String(n).padStart(3, '0')}`, supplier, 3 - index, exact)));
const ordered = orderSearchProducts(uneven, compare);
const first24 = ordered.slice(0, 24).reduce((out, item) => { out[item.product.supplierId] = (out[item.product.supplierId] ?? 0) + 1; return out; }, {});
assert.deepEqual(first24, { a: 6, b: 6, c: 6, d: 6 });
assert.equal(ordered.length, 530);
assert.equal(new Set(ordered.map((row) => row.product.id)).size, 530);
assert.deepEqual(ordered.slice(0, 4).map((row) => row.product.supplierId), ['a', 'b', 'c', 'd']);

// Relevance buckets do not let a weak match jump ahead just for diversity.
const separated = order([entry('supplier-only', 'other', 3, other), entry('exact-2', 'same', 0, exact), entry('exact-1', 'same', 0, exact)]);
assert.deepEqual(separated, ['exact-1', 'exact-2', 'supplier-only']);

// Seeded mixed buckets: check the invariants independently of the implementation
// for many uneven supplier stocks and relevance/quality combinations.
let seed = 20261028;
const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
for (let trial = 0; trial < 100; trial++) {
  const generated = [];
  const relevanceLevels = [exact, partial, other];
  const supplierCount = 2 + Math.floor(random() * 10);
  for (let s = 0; s < supplierCount; s++) {
    const tier = Math.floor(random() * 4);
    for (let n = 0, size = Math.floor(random() * 12); n < size; n++) {
      generated.push(entry(`t${trial}-s${s}-p${n}`, `s${s}`, tier, relevanceLevels[Math.floor(random() * 3)],
        { quality: Math.floor(random() * 101) }));
    }
  }
  const output = orderSearchProducts(generated, compare);
  assert.equal(output.length, generated.length);
  assert.equal(new Set(output.map((item) => item.product.id)).size, generated.length);
  for (let i = 1; i < output.length; i++) assert.ok(compareSearchRelevance(output[i - 1].relevance, output[i].relevance) <= 0,
    'Relevance never decreases then increases');
  for (const relevance of relevanceLevels) {
    const bucket = output.filter((item) => compareSearchRelevance(item.relevance, relevance) === 0);
    const remaining = new Map();
    for (const item of bucket) remaining.set(item.product.supplierId, (remaining.get(item.product.supplierId) ?? 0) + 1);
    for (let i = 0; i < bucket.length;) {
      const active = [...remaining].filter(([, n]) => n > 0).map(([supplier]) => supplier);
      const round = bucket.slice(i, i + active.length);
      assert.deepEqual(new Set(round.map((item) => item.product.supplierId)), new Set(active), 'Each active supplier appears once per round');
      for (let j = 1; j < round.length; j++) assert.ok(compare(round[j - 1].product, round[j].product) <= 0,
        'Each round follows tier and existing quality order');
      for (const item of round) remaining.set(item.product.supplierId, remaining.get(item.product.supplierId) - 1);
      i += active.length;
    }
  }
  const shuffled = [...generated].sort(() => random() - 0.5);
  assert.deepEqual(order(shuffled), output.map((item) => item.product.id), 'Shuffled source order does not change results');
}
console.log('✅ Search relevance: W320 vs supplier names/grade conflict/partial codes, W/WW, accents and complete tokens; tier-prioritized supplier rounds (530 offers plus 100 seeded cases, no caps or duplicates).');
