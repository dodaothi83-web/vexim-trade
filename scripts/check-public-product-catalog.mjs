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
const { isTestOnlyProduct, pepperGrade, productBelongsToCategory, productGrade, publicProductPrice, productPriceBlockers, withoutDirectContacts } = selection;

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
// The readiness optimization resolves one slug per product. Compare it against
// the previous per-category rule, including legacy inference and reviewed scope.
const oldBelongs = (p, c, known) => {
  if (p.supplier_originated && !p.reviewed_category_slug) return false;
  if (p.reviewed_category_slug) return p.reviewed_category_slug === c.slug && known.some((x) => x.slug === p.reviewed_category_slug);
  const inferred = assignProductCategory({ name: p.name, category: p.category, spec: p.spec ?? null, description: p.description ?? null },
    known.map((x) => ({ ...x, id: x.slug })));
  return inferred?.slug === c.slug;
};
const combinations = [
  { name: 'Cashew W320', category: 'rice' }, { name: 'Jasmine Rice', category: 'cashew' },
  { name: 'Miscellaneous', category: null }, { name: 'Hạt điều', category: 'Điều' },
  { name: 'Cashew', category: 'cashew', supplier_originated: true },
  { name: 'Rice', category: 'rice', reviewed_category_slug: 'cashew', supplier_originated: true },
  { name: 'Rice', category: 'rice', reviewed_category_slug: 'archived', supplier_originated: true },
];
for (const known of [cats, [...cats].reverse(), [cats[0]], []]) {
  for (const p of combinations) for (const c of cats) {
    assert.equal(productBelongsToCategory(p, c, known), oldBelongs(p, c, known), `same category decision for ${p.name}/${c.slug}`);
  }
}
assert.equal(productGrade('Cashew LP', null, 'cashew'), 'LP');
assert.equal(productGrade('Cashew splits', null, 'cashew'), 'WS');
assert.equal(productGrade('Rice W320', null, 'rice'), null);
assert.equal(productGrade('Cashew kernels W320', 'AFI W320', 'cashew-kernels'), 'W320', 'The launch slug for cashew kernels grades too, not only the legacy cashew slug');
assert.equal(productGrade('Cashew white splits', null, 'cashew-kernels'), 'WS');
assert.equal(pepperGrade('Black pepper 550 g/L, machine cleaned', 'moisture 12.5% max'), '550 g/l');
assert.notEqual(pepperGrade('Black pepper 500 g/L, FAQ', null), pepperGrade('Black pepper 550 g/L, FAQ', null), '500 and 550 g/l are separate price grades');
assert.equal(pepperGrade('Cassia split, 4 mm', null), null);
const price = { price_publicly_visible: true, ref_price: 8.4, currency: 'USD/kg', unit: 'kg', price_valid_until: '2099-01-01' };
const consent = { fob_publicly_visible: true, fob_updated_at: new Date().toISOString() };
assert.equal(publicProductPrice(price, consent), 'USD/kg 8.4');
assert.equal(publicProductPrice({ ...price, ref_price: 2, ref_price_max: 2.5, currency: 'USD', unit: 'MT' }, consent), 'USD 2-2.5/MT', 'Optional upper bound renders a per-product range');
assert.equal(publicProductPrice({ ...price, ref_price_max: price.ref_price }, consent), 'USD/kg 8.4', 'Equal bounds render one price');
assert.equal(publicProductPrice({ ...price, ref_price_max: null }, consent), 'USD/kg 8.4', 'Historical single prices remain single');
assert.equal(publicProductPrice({ ...price, ref_price_max: 7 }, consent), null, 'Inverted range is not public');
assert.match(productPriceBlockers({ ...price, ref_price_max: 7 }, consent).join(' '), /Giá tham khảo đến/, 'Invalid range is diagnosed');
assert.equal(publicProductPrice({ ...price, ref_price_max: 9 }, { ...consent, fob_publicly_visible: false }), null, 'Range does not bypass supplier consent');
assert.equal(publicProductPrice({ ...price, ref_price_max: 9, price_publicly_visible: false }, consent), null, 'Range does not bypass product opt-in');
assert.equal(productPriceBlockers(price, consent).length, 0, 'A price with both opt-in and current consent is buyer-visible');
assert.match(productPriceBlockers({ ...price, price_publicly_visible: false }, consent).join(' '), /sản phẩm này/, 'A missing product tick is explained');
assert.match(productPriceBlockers(price, { ...consent, fob_publicly_visible: false }).join(' '), /chưa xác nhận chia sẻ giá/, 'A product tick cannot stand in for supplier consent');
assert.match(productPriceBlockers(price, { ...consent, fob_updated_at: '2020-01-01' }).join(' '), /180 ngày/, 'Expired consent explains On request');
assert.match(productPriceBlockers({ ...price, price_valid_until: '2020-01-01' }, consent).join(' '), /hết hạn/, 'Expired price explains On request');
for (const item of [price, { ...price, price_publicly_visible: false }, { ...price, ref_price: 0 }, { ...price, price_valid_until: '2020-01-01' }]) {
  assert.equal(Boolean(publicProductPrice(item, consent)), productPriceBlockers(item, consent).length === 0,
    'Private price diagnosis and public gate must agree');
}
assert.equal(publicProductPrice({ ...price, price_publicly_visible: false }, consent), null, 'Product opt-out must hide price even with valid supplier consent');
assert.equal(publicProductPrice({ ...price, price_publicly_visible: undefined }, consent), null, 'Legacy record without opt-in fails closed');
assert.equal(publicProductPrice(price, { ...consent, fob_publicly_visible: false }), null);
assert.equal(publicProductPrice(price, { ...consent, fob_updated_at: '2020-01-01' }), null);
assert.equal(publicProductPrice(price, { ...consent, fob_updated_at: '2099-01-01' }), null);
assert.equal(publicProductPrice({ ...price, ref_price: null }, consent), null, 'Never fall back to supplier-wide price');
assert.equal(publicProductPrice({ ...price, price_valid_until: '2020-01-01' }, consent), null);
assert.equal(withoutDirectContacts('Email sales@example.com or call +84 987 654 321'), 'Email [contact via Vexim] or call [contact via Vexim]');
const sql = readFileSync(new URL('../supabase/migrations/20261017_product_only_reference_prices.sql', import.meta.url), 'utf8');
assert.match(sql, /case when false then s\.fob_min end as fob_min/, 'Public supplier view must not expose a legacy range');
assert.match(sql, /sp\.price_valid_until >= current_date/, 'Public product view must hide expired prices');
assert.match(sql, /s\.fob_publicly_visible/, 'Public product view must require consent');
const visibilitySql = readFileSync(new URL('../supabase/migrations/20261017_product_detail_price_visibility.sql', import.meta.url), 'utf8');
assert.match(visibilitySql, /sp\.price_publicly_visible and sp\.ready_for_buyer/, 'SQL view must also enforce product opt-in and readiness');
assert.match(visibilitySql, /and not coalesce\(s\.is_demo, false\)/, 'Anonymous view excludes demo');
assert.match(visibilitySql, /description_detail/, 'Buyer view projects long description only for approved products');
assert.match(visibilitySql, /if not exists \(select 1 from information_schema\.columns/, 'Migration rerun must not re-enable opt-outs');
const rangeSql = readFileSync(new URL('../supabase/migrations/20261017_product_reference_price_range.sql', import.meta.url), 'utf8');
assert.match(rangeSql, /add column if not exists ref_price_max numeric\(14,2\)/);
assert.match(rangeSql, /ref_price_max >= ref_price/, 'DB rejects inverted ranges');
assert.match(rangeSql, /sp\.price_publicly_visible and sp\.ready_for_buyer/, 'SQL projection still checks product opt-in');
assert.match(rangeSql, /s\.fob_updated_at > now\(\) - interval '180 days'/, 'SQL range remains under supplier consent');
assert.match(rangeSql, /then sp\.ref_price_max end as ref_price_max/, 'Public view appends a gated upper bound');
const editPage = readFileSync(new URL('../app/crm/products/[slug]/edit/page.tsx', import.meta.url), 'utf8');
const productForm = readFileSync(new URL('../components/product-form.tsx', import.meta.url), 'utf8');
assert.match(editPage, /savedPrice=\{\{ buyerPrice: visiblePrice, blockers: priceBlockers, publicProduct: canView \}\}/,
  'CRM passes only saved-state price diagnostics into the product form');
assert.doesNotMatch(editPage, /Tình trạng giá tham khảo đã lưu/, 'Do not duplicate the price panel above the form');
assert.match(productForm, /checked=\{form\.price_publicly_visible === true\}/, 'Product-specific price permission remains explicit');
assert.match(productForm, /Giá khách mua · bản đã lưu/, 'Show saved buyer price next to its per-product checkbox');
assert.match(productForm, /savedPrice\.blockers\.map/, 'When On request, keep the exact saved-state blockers');
assert.match(productForm, /supplierPriceConsentCurrent\(supplier\)/, 'Explain the separate supplier consent');
const catalog = readFileSync(new URL('../lib/public/product-catalog.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/(public)/products/[slug]/page.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
const productDescription = readFileSync(new URL('../components/public/product-description.tsx', import.meta.url), 'utf8');
assert.match(detail, /<ProductDescription value=\{enDetail\}[^>]*\/>/, 'Buyer detail uses the shared safe rich-text renderer');
assert.match(productDescription, /withoutDirectContacts\(value \?\? ""\)/, 'Long descriptions still redact direct contacts');
assert.match(productDescription, /sanitizeProductDescriptionHtml\(withoutDirectContacts/, 'Buyer rendering sanitizes again after contact redaction');
assert.match(productDescription, /className=\{`product-description \$\{className\}`\}/, 'Buyer detail keeps dedicated professional spacing');
assert.match(productForm, /<ProductDescriptionEditor/, 'Staff CMS uses the shared rich-text editor');
const media = readFileSync(new URL('../app/public-media/[...path]/route.ts', import.meta.url), 'utf8');
assert.match(catalog, /p\.ready_for_buyer/);
assert.match(catalog, /m\.audience === "buyer"/);
assert.match(catalog, /resolveGrade\(\{/, 'Grade comes from the shared attribute-first resolver, not from the name');
assert.match(catalog, /publicProductTitle\(p\)/, 'Public name is the composed display name, falling back to the supplier name');
assert.match(page, /CategoryProductGrid/);
assert.ok(!page.includes('SupplierCard'));
assert.match(media, /asset\.audience !== "buyer"/);
const supabase = readFileSync(new URL('../lib/db/supabase.ts', import.meta.url), 'utf8');
assert.match(supabase, /publicProductCategorySlug\(p, rows\)/);
assert.match(supabase, /public_page_ready: readySlugs\.has\(c\.slug\)/);
const crmEdit = readFileSync(new URL('../app/crm/products/[slug]/edit/page.tsx', import.meta.url), 'utf8');
assert.match(crmEdit, /commercialSupplier = !isSyntheticSupplier\(supplier\)/, 'CRM checklist flags test profiles');
assert.match(crmEdit, /commercialSupplier &&/, 'CRM cannot show a broken public link for synthetic suppliers');
const home = readFileSync(new URL('../app/(public)/home.tsx', import.meta.url), 'utf8');
assert.match(home, /Browse products →/, 'Desktop category cards keep the browse action');
assert.match(home, /mt-5 hidden border-t border-slate-100 pt-3\.5 sm:block/, 'The browse action is hidden on phones and returns from sm');
assert.match(home, /hidden text-\[13\.5px\] leading-relaxed text-ink-600 sm:line-clamp-3/, 'The short category introduction is hidden on phones and retained on desktop');
console.log('✅ Category catalog excludes rice, projects buyer-shareable product images and protects prices/contacts.');
