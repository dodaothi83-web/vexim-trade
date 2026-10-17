// node --experimental-strip-types --no-warnings scripts/check-public-product-catalog.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { assignProductCategory } from '../lib/public/category-assignment.ts';
const selection = {};
const selectionSource = readFileSync(new URL('../lib/public/product-selection.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(selectionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports: selection, require: (path) => path === '@/lib/public/category-assignment' ? { assignProductCategory } : null, Date });
const { isTestOnlyProduct, productBelongsToCategory, productGrade, publicProductPrice, withoutDirectContacts } = selection;

const cats = [
  { slug: 'cashew', name_i18n: { en: 'Cashew kernels' } },
  { slug: 'rice', name_i18n: { en: 'Rice' } },
];
const cashew = cats[0];
assert.equal(productBelongsToCategory({ name: 'Cashew W320', category: 'cashew' }, cashew, cats), true);
assert.equal(productBelongsToCategory({ name: 'Cashew W240', category: 'Điều' }, cashew, cats), true, 'Legacy cashew alias');
assert.equal(productBelongsToCategory({ name: 'TEST ONLY — Jasmine Rice Sample', category: 'rice' }, cashew, cats), false);
assert.equal(productBelongsToCategory({ name: 'TEST ONLY — Jasmine Rice Sample', category: 'cashew' }, cashew, cats), false, 'Wrongly tagged rice cannot appear in Cashew');
assert.equal(productBelongsToCategory({ name: 'TEST ONLY — Jasmine Rice Sample', category: 'cashew' }, cats[1], cats), true, 'Read-time category inference is Rice');
assert.equal(isTestOnlyProduct('TEST ONLY — Jasmine Rice Sample'), true, 'Test records never appear on public listings');
assert.equal(productBelongsToCategory({ name: 'Jasmine Rice', category: 'Nông sản' }, cashew, cats), false);
assert.equal(productBelongsToCategory({ name: 'Cashew W180', category: null }, cashew, cats), true, 'Name is sufficient for read-time category inference');
assert.equal(productGrade('Cashew LP', null, 'cashew'), 'LP');
assert.equal(productGrade('Cashew splits', null, 'cashew'), 'WS');
assert.equal(productGrade('Rice W320', null, 'rice'), null);
const price = { ref_price: 8.4, currency: 'USD/kg', unit: 'kg', price_valid_until: '2099-01-01' };
const consent = { fob_publicly_visible: true, fob_updated_at: new Date().toISOString() };
assert.equal(publicProductPrice(price, consent), 'USD/kg 8.4');
assert.equal(publicProductPrice(price, { ...consent, fob_publicly_visible: false }), null);
assert.equal(publicProductPrice({ ...price, price_valid_until: '2020-01-01' }, consent), null);
assert.equal(withoutDirectContacts('Email sales@example.com or call +84 987 654 321'), 'Email [contact via Vexim] or call [contact via Vexim]');
const catalog = readFileSync(new URL('../lib/public/product-catalog.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/(public)/products/[slug]/page.tsx', import.meta.url), 'utf8');
const media = readFileSync(new URL('../app/public-media/[...path]/route.ts', import.meta.url), 'utf8');
assert.match(catalog, /p\.ready_for_buyer/);
assert.match(catalog, /m\.audience === "buyer"/);
assert.match(page, /CategoryProductGrid/);
assert.ok(!page.includes('SupplierCard'));
assert.match(media, /asset\.audience !== "buyer"/);
const supabase = readFileSync(new URL('../lib/db/supabase.ts', import.meta.url), 'utf8');
assert.match(supabase, /public_page_ready: visible\.some\(\(p\) =>\s*productBelongsToCategory/);
const home = readFileSync(new URL('../app/(public)/home.tsx', import.meta.url), 'utf8');
assert.match(home, /Browse products →/);
console.log('✅ Category catalog excludes rice, projects buyer-shareable product images and protects prices/contacts.');
